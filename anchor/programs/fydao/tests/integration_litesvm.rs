//! On-chain integration tests (H8) run against the compiled fydao program in a
//! LiteSVM in-process cluster.
//!
//! The `.so` produced by `anchor build` is deployed via
//! [`LiteSVM::add_program_from_file`] at the real program ID, so every
//! instruction runs through the actual SBF VM with real SPL Token / ATA
//! programs (loaded via `with_default_programs`). Signatures are disabled
//! (`with_sigverify(false)`), so "signers" are asserted by account presence the
//! same way the runtime does, without needing keypairs on disk.
//!
//! Scope note: `initialize_governance_token` performs a Metaplex
//! `create_metadata_accounts_v3` CPI, which requires deploying the full
//! mpl-token-metadata program (not bundled with anchor). That instruction is
//! exercised in unit tests and devnet deploys; here the `GovernanceTokenState`
//! account is seeded directly so the token-minting path can be tested on-chain.

use anchor_lang::solana_program::program_option::COption;
use anchor_lang::solana_program::pubkey::Pubkey as AnchorPubkey;
use anchor_lang::AnchorDeserialize;

use litesvm::{types::TransactionResult, LiteSVM};
use solana_account::Account;
use solana_address::{address, Address};
use solana_clock::Clock;
use solana_keypair::Keypair;
use solana_program_pack::Pack;
use solana_signer::Signer;
use solana_transaction::{
    AccountMeta, Instruction, Message, Signature, Transaction, TransactionError,
};
use spl_associated_token_account_interface::address::get_associated_token_address;
use spl_token_interface::state::{Account as TokenAccount, AccountState, Mint};

use fydao::state::{Campaign, GovernanceTokenState, Milestone, Proposal, ProposalAction};

const PROGRAM_ID: Address = address!("HwV2YLJscqtHApqHj3Lp6cW4hA3L7areeWe1PH9BUSBb");
const TOKEN_PROGRAM: Address = address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ATA_PROGRAM: Address = address!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const SYSTEM_PROGRAM: Address = address!("11111111111111111111111111111111");
const RENT_SYSVAR: Address = address!("SysvarRent111111111111111111111111111111111");

/// Matches `GENESIS_AUTHORITY` in src/lib.rs (the local dev wallet pubkey).
const GENESIS: Address = address!("HHPM2hamGMj2MNRxv76pJ1Zct4fKZhuDzBEy1tobhNoM");

/// Anchor error codes start at 6000 and follow the variant order of
/// `FydaoError` in src/errors.rs.
const ERROR_CAMPAIGN_NOT_LIVE: u32 = 6000; // CampaignNotLive
const ERROR_NOT_ENOUGH_DEPOSITED: u32 = 6008; // NotEnoughDeposited
const ERROR_INVALID_VERIFIER: u32 = 6030; // InvalidVerifier (31st variant)

const VOTING_PERIOD: i64 = 300;
const QUORUM_BPS: u16 = 400; // 4%
const PROPOSAL_THRESHOLD: u64 = 100;
const MAX_GOVERNANCE_SUPPLY: u64 = 1_000_000;

// ──────────────────────────────────────────────
// Account address derivation (mirrors the program's seeds)
// ──────────────────────────────────────────────

fn pda(seeds: &[&[u8]]) -> Address {
    Address::find_program_address(seeds, &PROGRAM_ID).0
}

fn dao_config_addr() -> Address {
    pda(&[b"dao_config"])
}

fn gov_token_state_addr() -> Address {
    pda(&[b"gov_token"])
}

fn gov_token_state_bump() -> u8 {
    Address::find_program_address(&[b"gov_token"], &PROGRAM_ID).1
}

fn mint_authority_addr() -> Address {
    pda(&[b"mint_authority"])
}

fn campaign_addr(creator: &Address, campaign_id: u64) -> Address {
    pda(&[b"campaign", creator.as_ref(), &campaign_id.to_le_bytes()])
}

fn milestone_addr(campaign: &Address, milestone_id: u64) -> Address {
    pda(&[b"milestone", campaign.as_ref(), &milestone_id.to_le_bytes()])
}

fn proposal_addr(proposal_id: u64) -> Address {
    pda(&[b"proposal", &proposal_id.to_le_bytes()])
}

fn vote_escrow_addr(voter: &Address) -> Address {
    pda(&[b"vote_escrow", voter.as_ref()])
}

fn vote_record_addr(proposal: &Address, voter: &Address) -> Address {
    pda(&[b"vote", proposal.as_ref(), voter.as_ref()])
}

// ──────────────────────────────────────────────
// Instruction + transaction helpers
// ──────────────────────────────────────────────

/// Builds a fydao instruction with the anchor `global:<name>` discriminator
/// followed by the borsh-serialized args.
fn fydao_ix<T: anchor_lang::AnchorSerialize>(
    name: &str,
    args: &T,
    accounts: Vec<AccountMeta>,
) -> Instruction {
    let mut data =
        solana_sha256_hasher::hash(format!("global:{name}").as_bytes()).as_ref()[..8].to_vec();
    data.extend_from_slice(&borsh::to_vec(args).unwrap());
    Instruction {
        program_id: PROGRAM_ID,
        accounts,
        data,
    }
}

fn meta(pubkey: Address, is_signer: bool, is_writable: bool) -> AccountMeta {
    AccountMeta {
        pubkey,
        is_signer,
        is_writable,
    }
}

#[allow(clippy::result_large_err)]
fn send(svm: &mut LiteSVM, payer: &Address, ixs: &[Instruction]) -> TransactionResult {
    let blockhash = svm.latest_blockhash();
    let message = Message::new_with_blockhash(ixs, Some(payer), &blockhash);
    let mut tx = Transaction::new_unsigned(message);
    // Signature verification is disabled on this LiteSVM, so placeholder
    // signatures are sufficient to satisfy the message's required signature count.
    tx.signatures = vec![Signature::default(); tx.message.header.num_required_signatures.into()];
    svm.send_transaction(tx)
}

fn send_ok(svm: &mut LiteSVM, payer: &Address, ixs: &[Instruction]) {
    if let Err(failed) = send(svm, payer, ixs) {
        panic!(
            "transaction failed: {}\nlogs:\n{}",
            failed.err,
            failed.meta.logs.join("\n")
        );
    }
}

fn send_custom_error(svm: &mut LiteSVM, payer: &Address, ixs: &[Instruction], code: u32) {
    match send(svm, payer, ixs) {
        Ok(_) => panic!("expected transaction to fail with custom error {code}"),
        Err(failed) => match failed.err {
            TransactionError::InstructionError(
                _,
                solana_transaction::InstructionError::Custom(c),
            ) => {
                assert_eq!(c, code, "expected custom error {code}, got {c}")
            }
            other => panic!("expected custom error {code}, got {other}"),
        },
    }
}

// ──────────────────────────────────────────────
// Account-writing helpers
// ──────────────────────────────────────────────

fn write_mint(
    svm: &mut LiteSVM,
    mint: Address,
    mint_authority: Option<Address>,
    decimals: u8,
    supply: u64,
) {
    let state = Mint {
        mint_authority: mint_authority.map(COption::Some).unwrap_or(COption::None),
        supply,
        decimals,
        is_initialized: true,
        freeze_authority: COption::None,
    };
    let mut data = [0u8; Mint::LEN];
    Mint::pack(state, &mut data).unwrap();
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(
        mint,
        Account {
            lamports,
            data: data.to_vec(),
            owner: TOKEN_PROGRAM,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

fn write_token_account(
    svm: &mut LiteSVM,
    address: Address,
    mint: Address,
    owner: Address,
    amount: u64,
) {
    let state = TokenAccount {
        mint,
        owner,
        amount,
        delegate: COption::None,
        state: AccountState::Initialized,
        is_native: COption::None,
        delegated_amount: 0,
        close_authority: COption::None,
    };
    let mut data = [0u8; TokenAccount::LEN];
    TokenAccount::pack(state, &mut data).unwrap();
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(
        address,
        Account {
            lamports,
            data: data.to_vec(),
            owner: TOKEN_PROGRAM,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

/// Seeds the `GovernanceTokenState` PDA directly (see module docs).
fn write_gov_token_state(svm: &mut LiteSVM, authority: &Address, governance_mint: &Address) {
    let state = GovernanceTokenState {
        bump: gov_token_state_bump(),
        mint: AnchorPubkey::new_from_array(governance_mint.to_bytes()),
        authority: AnchorPubkey::new_from_array(authority.to_bytes()),
        total_minted: 0,
    };
    let mut data =
        solana_sha256_hasher::hash(b"account:GovernanceTokenState").as_ref()[..8].to_vec();
    data.extend_from_slice(&borsh::to_vec(&state).unwrap());
    let lamports = svm.minimum_balance_for_rent_exemption(data.len());
    svm.set_account(
        gov_token_state_addr(),
        Account {
            lamports,
            data,
            owner: PROGRAM_ID,
            executable: false,
            rent_epoch: 0,
        },
    )
    .unwrap();
}

// ──────────────────────────────────────────────
// State-reading helpers
// ──────────────────────────────────────────────

fn read_campaign(svm: &LiteSVM, address: &Address) -> Campaign {
    let data = svm
        .get_account(address)
        .expect("campaign account missing")
        .data;
    let mut cursor: &[u8] = &data[8..];
    Campaign::deserialize(&mut cursor).expect("campaign deserialize")
}

fn read_milestone(svm: &LiteSVM, address: &Address) -> Milestone {
    let data = svm
        .get_account(address)
        .unwrap_or_else(|| panic!("milestone account missing: {address}"))
        .data;
    let mut cursor: &[u8] = &data[8..];
    Milestone::deserialize(&mut cursor).expect("milestone deserialize")
}

fn read_proposal(svm: &LiteSVM, address: &Address) -> Proposal {
    let data = svm
        .get_account(address)
        .expect("proposal account missing")
        .data;
    let mut cursor: &[u8] = &data[8..];
    Proposal::deserialize(&mut cursor).expect("proposal deserialize")
}

// ──────────────────────────────────────────────
// Test environment
// ──────────────────────────────────────────────

struct Env {
    svm: LiteSVM,
    genesis: Address,
    creator: Address,
    verifier: Address,
    proposer: Address,
    voter: Address,
    donor: Address,
    stablecoin_mint: Address,
    governance_mint: Address,
    treasury: Address,
}

fn setup() -> Env {
    let mut svm = LiteSVM::new().with_sigverify(false).with_default_programs();

    let elf = std::fs::read(format!(
        "{}/../../target/deploy/fydao.so",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("anchor build --ignore-keys must have produced target/deploy/fydao.so");
    svm.add_program(PROGRAM_ID, &elf).unwrap();

    // Pin the Clock so governance timing is fully deterministic.
    let mut clock = svm.get_sysvar::<Clock>();
    clock.unix_timestamp = 1_700_000_000;
    svm.set_sysvar::<Clock>(&clock);

    let genesis = GENESIS;
    let creator = Keypair::new().pubkey();
    let verifier = Keypair::new().pubkey();
    let proposer = Keypair::new().pubkey();
    let voter = Keypair::new().pubkey();
    let donor = Keypair::new().pubkey();
    let stablecoin_mint = Keypair::new().pubkey();
    let governance_mint = Keypair::new().pubkey();
    let treasury = Keypair::new().pubkey();

    for key in [genesis, creator, verifier, proposer, voter, donor] {
        svm.airdrop(&key, 100_000_000_000).unwrap();
    }

    // Stablecoin mint + donor balance + treasury token account (owned by treasury key).
    write_mint(&mut svm, stablecoin_mint, Some(treasury), 6, 1_000_000_000);
    write_token_account(
        &mut svm,
        get_associated_token_address(&donor, &stablecoin_mint),
        stablecoin_mint,
        donor,
        10_000,
    );
    write_token_account(
        &mut svm,
        get_associated_token_address(&treasury, &stablecoin_mint),
        stablecoin_mint,
        treasury,
        0,
    );

    // Creator's stablecoin ATA receives released milestone funds.
    write_token_account(
        &mut svm,
        get_associated_token_address(&creator, &stablecoin_mint),
        stablecoin_mint,
        creator,
        0,
    );

    // Governance mint: authority is the fydao mint_authority PDA (matching what
    // initialize_governance_token would hand over), so mint_governance_tokens works.
    write_mint(&mut svm, governance_mint, Some(mint_authority_addr()), 9, 0);
    write_gov_token_state(&mut svm, &genesis, &governance_mint);

    // Empty governance token accounts that mint_governance_tokens fills.
    write_token_account(
        &mut svm,
        get_associated_token_address(&proposer, &governance_mint),
        governance_mint,
        proposer,
        0,
    );
    write_token_account(
        &mut svm,
        get_associated_token_address(&voter, &governance_mint),
        governance_mint,
        voter,
        0,
    );

    Env {
        svm,
        genesis,
        creator,
        verifier,
        proposer,
        voter,
        donor,
        stablecoin_mint,
        governance_mint,
        treasury,
    }
}

// ──────────────────────────────────────────────
// Instruction builders
// ──────────────────────────────────────────────

fn initialize_dao_ixs(
    env: &Env,
    voting_delay: i64,
    voting_period: i64,
    quorum_bps: u16,
    proposal_threshold: u64,
    max_governance_supply: u64,
    timelock_delay: i64,
) -> Vec<Instruction> {
    let treasury_ata = get_associated_token_address(&env.treasury, &env.stablecoin_mint);
    let accounts = vec![
        meta(env.genesis, true, true),           // authority
        meta(dao_config_addr(), false, true),    // dao_config
        meta(env.governance_mint, false, false), // governance_mint
        meta(env.stablecoin_mint, false, false), // stablecoin_mint
        meta(treasury_ata, false, false),        // treasury_token_account
        meta(SYSTEM_PROGRAM, false, false),
        meta(TOKEN_PROGRAM, false, false),
        meta(RENT_SYSVAR, false, false),
    ];
    vec![fydao_ix(
        "initialize_dao",
        &(
            voting_delay,
            voting_period,
            quorum_bps,
            proposal_threshold,
            max_governance_supply,
            timelock_delay,
        ),
        accounts,
    )]
}

fn mint_governance_tokens_ixs(env: &Env, recipient: &Address, amount: u64) -> Vec<Instruction> {
    let recipient_ata = get_associated_token_address(recipient, &env.governance_mint);
    let accounts = vec![
        meta(env.genesis, true, true),             // authority
        meta(dao_config_addr(), false, true),      // dao_config
        meta(gov_token_state_addr(), false, true), // gov_token_state
        meta(env.governance_mint, false, true),    // governance_mint
        meta(recipient_ata, false, true),          // destination
        meta(mint_authority_addr(), false, false), // mint_authority PDA
        meta(TOKEN_PROGRAM, false, false),
    ];
    vec![fydao_ix("mint_governance_tokens", &amount, accounts)]
}

fn create_campaign_ixs(env: &Env, metadata_cid: &str, trust_score: u64) -> Vec<Instruction> {
    let campaign = campaign_addr(&env.creator, 0);
    let escrow = get_associated_token_address(&campaign, &env.stablecoin_mint);
    let accounts = vec![
        meta(env.creator, true, true),           // creator
        meta(dao_config_addr(), false, true),    // dao_config
        meta(campaign, false, true),             // campaign PDA
        meta(env.stablecoin_mint, false, false), // stablecoin_mint
        meta(escrow, false, true),               // escrow ATA (created via ATA CPI)
        meta(SYSTEM_PROGRAM, false, false),
        meta(TOKEN_PROGRAM, false, false),
        meta(ATA_PROGRAM, false, false),
        meta(RENT_SYSVAR, false, false),
    ];
    vec![fydao_ix(
        "create_campaign",
        &(
            metadata_cid.to_string(),
            trust_score,
            AnchorPubkey::new_from_array(env.verifier.to_bytes()),
        ),
        accounts,
    )]
}

fn propose_milestone_ixs(
    env: &Env,
    proof_cid: &str,
    amount: u64,
    verifier: &Address,
) -> Vec<Instruction> {
    let campaign = campaign_addr(&env.creator, 0);
    let milestone = milestone_addr(&campaign, 0);
    let accounts = vec![
        meta(env.creator, true, true),         // creator
        meta(dao_config_addr(), false, false), // dao_config
        meta(campaign, false, true),           // campaign
        meta(*verifier, true, false),          // verifier (must be campaign.verifier)
        meta(milestone, false, true),          // milestone PDA
        meta(SYSTEM_PROGRAM, false, false),
    ];
    vec![fydao_ix(
        "propose_milestone",
        &(proof_cid.to_string(), amount),
        accounts,
    )]
}

fn donate_ixs(env: &Env, donor: &Address, amount: u64) -> Vec<Instruction> {
    let campaign = campaign_addr(&env.creator, 0);
    let donation_record = pda(&[b"donation", campaign.as_ref(), donor.as_ref()]);
    let escrow = get_associated_token_address(&campaign, &env.stablecoin_mint);
    let donor_ata = get_associated_token_address(donor, &env.stablecoin_mint);
    let accounts = vec![
        meta(*donor, true, true),              // donor
        meta(dao_config_addr(), false, false), // dao_config
        meta(campaign, false, true),           // campaign
        meta(donor_ata, false, true),          // donor_token_account
        meta(donation_record, false, true),    // donation_record PDA
        meta(escrow, false, true),             // escrow_token_account
        meta(TOKEN_PROGRAM, false, false),
        meta(SYSTEM_PROGRAM, false, false),
    ];
    vec![fydao_ix("donate", &amount, accounts)]
}

fn create_proposal_ixs(
    env: &Env,
    proposal_id: u64,
    description: &str,
    action: ProposalAction,
) -> Vec<Instruction> {
    let proposer_ata = get_associated_token_address(&env.proposer, &env.governance_mint);
    let proposal = proposal_addr(proposal_id);
    let accounts = vec![
        meta(env.proposer, true, true),          // proposer
        meta(dao_config_addr(), false, true),    // dao_config
        meta(proposal, false, true),             // proposal PDA
        meta(proposer_ata, false, false),        // proposer_token_account
        meta(env.governance_mint, false, false), // governance_mint
        meta(SYSTEM_PROGRAM, false, false),
    ];
    vec![fydao_ix(
        "create_proposal",
        &(description.to_string(), action),
        accounts,
    )]
}

fn cast_vote_ixs(env: &Env, proposal_id: u64, voter: &Address, support: u8) -> Vec<Instruction> {
    let proposal = proposal_addr(proposal_id);
    let voter_ata = get_associated_token_address(voter, &env.governance_mint);
    let escrow = vote_escrow_addr(voter);
    let escrow_ata = get_associated_token_address(&escrow, &env.governance_mint);
    let record = vote_record_addr(&proposal, voter);
    let accounts = vec![
        meta(*voter, true, true),                // voter
        meta(dao_config_addr(), false, false),   // dao_config
        meta(proposal, false, true),             // proposal
        meta(env.governance_mint, false, false), // governance_mint
        meta(voter_ata, false, true),            // voter_token_account
        meta(escrow, false, false),              // vote_escrow PDA
        meta(escrow_ata, false, true),           // escrow ATA (created via ATA CPI)
        meta(record, false, true),               // vote_record PDA
        meta(SYSTEM_PROGRAM, false, false),
        meta(TOKEN_PROGRAM, false, false),
        meta(ATA_PROGRAM, false, false),
    ];
    vec![fydao_ix("cast_vote", &support, accounts)]
}

fn queue_proposal_ixs(env: &Env, proposal_id: u64) -> Vec<Instruction> {
    let accounts = vec![
        meta(env.proposer, true, false),       // authority (any signer)
        meta(dao_config_addr(), false, false), // dao_config
        meta(proposal_addr(proposal_id), false, true), // proposal
    ];
    vec![fydao_ix("queue_proposal", &(), accounts)]
}

fn approve_and_go_live_ixs(env: &Env, proposal_id: u64) -> Vec<Instruction> {
    let campaign = campaign_addr(&env.creator, 0);
    let accounts = vec![
        meta(dao_config_addr(), false, false),         // dao_config
        meta(proposal_addr(proposal_id), false, true), // proposal
        meta(campaign, false, true),                   // campaign
    ];
    vec![fydao_ix("approve_and_go_live", &(), accounts)]
}

fn unlock_votes_ixs(env: &Env, proposal_id: u64, voter: &Address) -> Vec<Instruction> {
    let proposal = proposal_addr(proposal_id);
    let voter_ata = get_associated_token_address(voter, &env.governance_mint);
    let escrow = vote_escrow_addr(voter);
    let escrow_ata = get_associated_token_address(&escrow, &env.governance_mint);
    let record = vote_record_addr(&proposal, voter);
    let accounts = vec![
        meta(*voter, true, true),                // voter
        meta(dao_config_addr(), false, false),   // dao_config
        meta(proposal, false, true),             // proposal
        meta(env.governance_mint, false, false), // governance_mint
        meta(record, false, true),               // vote_record (closed on unlock)
        meta(escrow, false, false),              // vote_escrow PDA
        meta(escrow_ata, false, true),           // escrow ATA
        meta(voter_ata, false, true),            // voter_token_account
        meta(TOKEN_PROGRAM, false, false),
    ];
    vec![fydao_ix("unlock_votes", &(), accounts)]
}

fn release_milestone_ixs(env: &Env, proposal_id: u64, milestone_id: u64) -> Vec<Instruction> {
    let campaign = campaign_addr(&env.creator, 0);
    let creator_ata = get_associated_token_address(&env.creator, &env.stablecoin_mint);
    let escrow = get_associated_token_address(&campaign, &env.stablecoin_mint);
    let accounts = vec![
        meta(dao_config_addr(), false, false),         // dao_config
        meta(proposal_addr(proposal_id), false, true), // proposal
        meta(campaign, false, true),                   // campaign
        meta(milestone_addr(&campaign, milestone_id), false, true), // milestone
        meta(escrow, false, true),                     // escrow_token_account
        meta(creator_ata, false, true),                // creator_token_account
        meta(TOKEN_PROGRAM, false, false),
    ];
    vec![fydao_ix("release_milestone", &milestone_id, accounts)]
}

// ──────────────────────────────────────────────
// Shared governance helper: pass a proposal via vote → queue → timelock expiry
// ──────────────────────────────────────────────

fn pass_proposal(env: &mut Env, proposal_id: u64) {
    let now = env.svm.get_sysvar::<Clock>().unix_timestamp;
    // Vote within the voting window (delay = 0, period = 300).
    let voter_ixs = cast_vote_ixs(env, proposal_id, &env.proposer, 1);
    send_ok(&mut env.svm, &env.proposer, &voter_ixs);
    let voter_ixs = cast_vote_ixs(env, proposal_id, &env.voter, 1);
    send_ok(&mut env.svm, &env.voter, &voter_ixs);

    // Advance past the voting period, then queue.
    let mut clock = env.svm.get_sysvar::<Clock>();
    clock.unix_timestamp = now + VOTING_PERIOD + 1;
    env.svm.set_sysvar::<Clock>(&clock);
    let queue_ixs = queue_proposal_ixs(env, proposal_id);
    send_ok(&mut env.svm, &env.proposer, &queue_ixs);

    let proposal = read_proposal(&env.svm, &proposal_addr(proposal_id));
    assert_eq!(proposal.state, fydao::state::ProposalState::Queued);
    assert!(proposal.eta > 0);
    // Timelock delay is 0, so eta == queue time; jump just past it.
    clock.unix_timestamp = proposal.eta + 1;
    env.svm.set_sysvar::<Clock>(&clock);
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

#[test]
fn test_full_dao_campaign_lifecycle_with_verifier_attestation() {
    let mut env = setup();

    // 1. Initialize the DAO with the genesis authority.
    let init_ixs = initialize_dao_ixs(
        &env,
        0,
        VOTING_PERIOD,
        QUORUM_BPS,
        PROPOSAL_THRESHOLD,
        MAX_GOVERNANCE_SUPPLY,
        0,
    );
    send_ok(&mut env.svm, &env.genesis, &init_ixs);
    let dao_config_data = &env.svm.get_account(&dao_config_addr()).unwrap().data[8..];
    let mut dao_config_cursor: &[u8] = dao_config_data;
    let dao_config = fydao::state::DaoConfig::deserialize(&mut dao_config_cursor).unwrap();
    assert_eq!(a_from_anchor(&dao_config.authority), env.genesis);
    assert_eq!(
        a_from_anchor(&dao_config.stablecoin_mint),
        env.stablecoin_mint
    );
    assert_eq!(
        a_from_anchor(&dao_config.governance_mint),
        env.governance_mint
    );
    assert_eq!(dao_config.quorum_bps, QUORUM_BPS);

    // 2. Mint governance tokens to the proposer and the voter.
    let mint_ixs = mint_governance_tokens_ixs(&env, &env.proposer, 1_000);
    send_ok(&mut env.svm, &env.genesis, &mint_ixs);
    let mint_ixs = mint_governance_tokens_ixs(&env, &env.voter, 1_000);
    send_ok(&mut env.svm, &env.genesis, &mint_ixs);

    // 3. Create a campaign that names a verifier.
    let create_ixs = create_campaign_ixs(&env, "QmCampaign", 90);
    send_ok(&mut env.svm, &env.creator, &create_ixs);
    let campaign = read_campaign(&env.svm, &campaign_addr(&env.creator, 0));
    assert_eq!(campaign.campaign_id, 0);
    assert_eq!(a_from_anchor(&campaign.creator), env.creator);
    assert_eq!(a_from_anchor(&campaign.verifier), env.verifier);
    assert!(!campaign.is_live);

    // 4. Approve the campaign through governance.
    let approve_ixs = create_proposal_ixs(
        &env,
        0,
        "approve campaign",
        ProposalAction::ApproveCampaign {
            campaign: AnchorPubkey::new_from_array(campaign_addr(&env.creator, 0).to_bytes()),
        },
    );
    send_ok(&mut env.svm, &env.proposer, &approve_ixs);
    pass_proposal(&mut env, 0);
    let go_live_ixs = approve_and_go_live_ixs(&env, 0);
    send_ok(&mut env.svm, &env.proposer, &go_live_ixs);
    assert!(read_campaign(&env.svm, &campaign_addr(&env.creator, 0)).is_live);

    // 5. A foreign verifier cannot attest a milestone (M5 gate).
    let foreign = Keypair::new().pubkey();
    let bad_ixs = propose_milestone_ixs(&env, "QmFakeProof", 50, &foreign);
    send_custom_error(&mut env.svm, &env.creator, &bad_ixs, ERROR_INVALID_VERIFIER);

    // 6. Donate into the live campaign's escrow.
    let donate_ixs = donate_ixs(&env, &env.donor, 100);
    send_ok(&mut env.svm, &env.donor, &donate_ixs);
    let campaign = campaign_addr(&env.creator, 0);
    let escrow = get_associated_token_address(&campaign, &env.stablecoin_mint);
    assert_eq!(
        TokenAccount::unpack(&env.svm.get_account(&escrow).unwrap().data)
            .unwrap()
            .amount,
        100
    );
    assert_eq!(read_campaign(&env.svm, &campaign).total_deposited, 100);

    // 7. The designated verifier's attestation is recorded on-chain.
    let milestone_ixs = propose_milestone_ixs(&env, "QmMilestone0", 50, &env.verifier);
    send_ok(&mut env.svm, &env.creator, &milestone_ixs);
    let milestone = read_milestone(&env.svm, &milestone_addr(&campaign, 0));
    assert_eq!(milestone.milestone_id, 0);
    assert_eq!(a_from_anchor(&milestone.verified_by), env.verifier);
    assert!(milestone.verified_at > 0);
    assert!(!milestone.released);

    // 8. Unlock the proposer's and voter's governance tokens so they can vote
    // on the release proposal.
    let unlock_ixs = unlock_votes_ixs(&env, 0, &env.proposer);
    send_ok(&mut env.svm, &env.proposer, &unlock_ixs);
    let unlock_ixs = unlock_votes_ixs(&env, 0, &env.voter);
    send_ok(&mut env.svm, &env.voter, &unlock_ixs);

    // 9. Release milestone 0 through a governance proposal.
    let release_proposal_id = 1;
    let release_proposal_ixs = create_proposal_ixs(
        &env,
        release_proposal_id,
        "release milestone 0",
        ProposalAction::ReleaseMilestone {
            campaign: AnchorPubkey::new_from_array(campaign.to_bytes()),
            milestone_id: 0,
        },
    );
    send_ok(&mut env.svm, &env.proposer, &release_proposal_ixs);
    pass_proposal(&mut env, release_proposal_id);
    let release_ixs = release_milestone_ixs(&env, release_proposal_id, 0);
    send_ok(&mut env.svm, &env.proposer, &release_ixs);

    // The milestone account is closed on release (`close = campaign`), so the
    // release is verified via the campaign and token balances.
    let creator_ata = get_associated_token_address(&env.creator, &env.stablecoin_mint);
    assert_eq!(
        TokenAccount::unpack(&env.svm.get_account(&creator_ata).unwrap().data)
            .unwrap()
            .amount,
        50
    );
    assert_eq!(read_campaign(&env.svm, &campaign).total_released, 50);
    assert_eq!(
        TokenAccount::unpack(&env.svm.get_account(&escrow).unwrap().data)
            .unwrap()
            .amount,
        50
    );
}

#[test]
fn test_donation_gate_and_milestone_funding() {
    let mut env = setup();
    let init_ixs = initialize_dao_ixs(
        &env,
        0,
        VOTING_PERIOD,
        QUORUM_BPS,
        PROPOSAL_THRESHOLD,
        MAX_GOVERNANCE_SUPPLY,
        0,
    );
    send_ok(&mut env.svm, &env.genesis, &init_ixs);
    let mint_ixs = mint_governance_tokens_ixs(&env, &env.proposer, 1_000);
    send_ok(&mut env.svm, &env.genesis, &mint_ixs);
    let mint_ixs = mint_governance_tokens_ixs(&env, &env.voter, 1_000);
    send_ok(&mut env.svm, &env.genesis, &mint_ixs);
    let create_ixs = create_campaign_ixs(&env, "QmCampaign", 80);
    send_ok(&mut env.svm, &env.creator, &create_ixs);

    // Donating to a campaign that is not yet live must fail.
    let donate_before_live_ixs = donate_ixs(&env, &env.donor, 100);
    send_custom_error(
        &mut env.svm,
        &env.donor,
        &donate_before_live_ixs,
        ERROR_CAMPAIGN_NOT_LIVE,
    );

    // Approve the campaign through governance so it becomes live.
    let approve_ixs = create_proposal_ixs(
        &env,
        0,
        "approve campaign",
        ProposalAction::ApproveCampaign {
            campaign: AnchorPubkey::new_from_array(campaign_addr(&env.creator, 0).to_bytes()),
        },
    );
    send_ok(&mut env.svm, &env.proposer, &approve_ixs);
    pass_proposal(&mut env, 0);
    let go_live_ixs = approve_and_go_live_ixs(&env, 0);
    send_ok(&mut env.svm, &env.proposer, &go_live_ixs);

    // Proposing a milestone larger than the (empty) escrow must fail.
    let too_big_ixs = propose_milestone_ixs(&env, "QmTooBig", 1_000, &env.verifier);
    send_custom_error(
        &mut env.svm,
        &env.creator,
        &too_big_ixs,
        ERROR_NOT_ENOUGH_DEPOSITED,
    );

    // Funds land, then the milestone can be proposed.
    let donate_after_live_ixs = donate_ixs(&env, &env.donor, 1_000);
    send_ok(&mut env.svm, &env.donor, &donate_after_live_ixs);
    let milestone_ixs = propose_milestone_ixs(&env, "QmMilestone0", 400, &env.verifier);
    send_ok(&mut env.svm, &env.creator, &milestone_ixs);
    assert_eq!(
        read_milestone(
            &env.svm,
            &milestone_addr(&campaign_addr(&env.creator, 0), 0)
        )
        .amount,
        400
    );
}

fn a_from_anchor(pk: &AnchorPubkey) -> Address {
    Address::new_from_array(pk.to_bytes())
}

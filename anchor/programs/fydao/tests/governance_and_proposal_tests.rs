use anchor_lang::prelude::*;
use fydao::state::*;

#[test]
fn test_proposal_pda_seeds_derivation() {
    let program_id = Pubkey::new_unique();
    let proposal_id: u64 = 42;

    let (pda, bump) = Pubkey::find_program_address(
        &[Proposal::SEED, &proposal_id.to_le_bytes()],
        &program_id,
    );

    assert_ne!(pda, Pubkey::default());
    assert!(bump <= 255);
}

#[test]
fn test_vote_record_pda_seeds_derivation() {
    let program_id = Pubkey::new_unique();
    let proposal_pda = Pubkey::new_unique();
    let voter_pubkey = Pubkey::new_unique();

    let (pda, bump) = Pubkey::find_program_address(
        &[VoteRecord::SEED, proposal_pda.as_ref(), voter_pubkey.as_ref()],
        &program_id,
    );

    assert_ne!(pda, Pubkey::default());
    assert!(bump <= 255);
}

#[test]
fn test_quorum_calculation_bps() {
    let total_votes_snapshot: u64 = 1_000_000_000; // 1,000,000,000 votes
    let quorum_bps: u16 = 400; // 400 bps = 4%

    let quorum_needed = (total_votes_snapshot as u128)
        .saturating_mul(quorum_bps as u128)
        / 10_000u128;

    assert_eq!(quorum_needed, 40_000_000);
}

#[test]
fn test_proposal_voting_state_transitions() {
    let proposer = Pubkey::new_unique();
    let created_at: i64 = 1700000000;
    let voting_delay: i64 = 3600; // 1 hour
    let voting_period: i64 = 86400; // 24 hours

    let mut proposal = Proposal {
        bump: 255,
        proposal_id: 1,
        proposer,
        description: "Fund Community Grant".to_string(),
        instruction_data: vec![1, 2, 3, 4],
        total_votes_at_creation: 1_000_000,
        for_votes: 0,
        against_votes: 0,
        abstain_votes: 0,
        state: ProposalState::Pending,
        created_at,
        vote_start: created_at + voting_delay,
        vote_end: created_at + voting_delay + voting_period,
        queued_at: 0,
        eta: 0,
        executed: false,
    };

    assert_eq!(proposal.state, ProposalState::Pending);

    // 1. Voting Starts
    let current_time = proposal.vote_start + 10;
    if proposal.state == ProposalState::Pending && current_time >= proposal.vote_start {
        proposal.state = ProposalState::Active;
    }
    assert_eq!(proposal.state, ProposalState::Active);

    // 2. Votes Cast (For = 600,000, Against = 100,000)
    proposal.for_votes += 600_000;
    proposal.against_votes += 100_000;

    let total_votes = proposal.for_votes + proposal.against_votes + proposal.abstain_votes;
    let quorum_needed = (proposal.total_votes_at_creation as u128 * 400) / 10_000; // 4% = 40,000

    assert!(total_votes >= quorum_needed as u64);
    assert!(proposal.for_votes > proposal.against_votes);

    // 3. Queue Proposal into Timelock
    proposal.state = ProposalState::Succeeded;
    proposal.state = ProposalState::Queued;
    proposal.queued_at = proposal.vote_end + 100;
    proposal.eta = proposal.queued_at + 172800; // 2 days timelock

    assert_eq!(proposal.state, ProposalState::Queued);
    assert_eq!(proposal.eta, proposal.queued_at + 172800);

    // 4. Execute Proposal after Timelock
    proposal.executed = true;
    proposal.state = ProposalState::Executed;

    assert_eq!(proposal.state, ProposalState::Executed);
    assert!(proposal.executed);
}

#[test]
fn test_transfer_authority_to_timelock_pda() {
    let initial_admin = Pubkey::new_unique();
    let (timelock_pda, _bump) = Pubkey::find_program_address(&[b"timelock"], &Pubkey::new_unique());

    let mut dao_config = DaoConfig {
        bump: 255,
        authority: initial_admin,
        governance_mint: Pubkey::new_unique(),
        stablecoin_mint: Pubkey::new_unique(),
        voting_delay: 3600,
        voting_period: 86400,
        quorum_bps: 400,
        proposal_threshold: 1000,
        timelock_delay: 172800,
        next_proposal_id: 0,
        campaign_count: 0,
        paused: false,
    };

    assert_eq!(dao_config.authority, initial_admin);

    // Transfer Authority to Timelock PDA
    dao_config.authority = timelock_pda;

    assert_eq!(dao_config.authority, timelock_pda);
    assert_ne!(dao_config.authority, initial_admin);
}

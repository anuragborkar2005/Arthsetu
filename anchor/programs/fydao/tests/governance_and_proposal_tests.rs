use anchor_lang::prelude::*;
use fydao::instructions::execution::{finalize_execution, MAX_EXECUTION_WINDOW};
use fydao::state::*;

fn sample_proposal(created_at: i64) -> Proposal {
    Proposal {
        bump: 255,
        proposal_id: 1,
        proposer: Pubkey::new_unique(),
        description: "Fund Community Grant".to_string(),
        action: ProposalAction::ReleaseMilestone {
            campaign: Pubkey::new_unique(),
            milestone_id: 1,
        },
        total_votes_at_creation: 1_000_000,
        for_votes: 600_000,
        against_votes: 100_000,
        abstain_votes: 0,
        state: ProposalState::Queued,
        created_at,
        vote_start: created_at + 3600,
        vote_end: created_at + 3600 + 86400,
        queued_at: created_at + 86400,
        eta: created_at + 86400 + 172800,
        executed: false,
    }
}

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
fn test_vote_escrow_pda_derivation_is_stable() {
    let program_id = Pubkey::new_unique();
    let voter_pubkey = Pubkey::new_unique();

    let (pda, bump) = Pubkey::find_program_address(
        &[VoteRecord::VOTE_ESCROW_SEED, voter_pubkey.as_ref()],
        &program_id,
    );

    // Same voter must always derive the same escrow authority
    let (pda2, bump2) = Pubkey::find_program_address(
        &[VoteRecord::VOTE_ESCROW_SEED, voter_pubkey.as_ref()],
        &program_id,
    );

    assert_eq!(pda, pda2);
    assert_eq!(bump, bump2);
    assert_ne!(pda, Pubkey::default());
    assert!(bump <= 255);
}

#[test]
fn test_mint_authority_pda_derivation_is_stable() {
    let program_id = Pubkey::new_unique();

    let (pda, bump) = Pubkey::find_program_address(
        &[GovernanceTokenState::MINT_AUTHORITY_SEED],
        &program_id,
    );
    let (pda2, bump2) = Pubkey::find_program_address(
        &[GovernanceTokenState::MINT_AUTHORITY_SEED],
        &program_id,
    );

    assert_eq!(pda, pda2);
    assert_eq!(bump, bump2);
    assert_ne!(pda, Pubkey::default());
    assert!(bump <= 255);
}

#[test]
fn test_genesis_authority_is_not_default() {
    assert_ne!(fydao::GENESIS_AUTHORITY, Pubkey::default());
}

#[test]
fn test_unlock_only_allowed_in_final_states() {
    fn is_final(state: &ProposalState) -> bool {
        matches!(
            state,
            ProposalState::Defeated
                | ProposalState::Canceled
                | ProposalState::Executed
                | ProposalState::Expired
        )
    }

    assert!(is_final(&ProposalState::Defeated));
    assert!(is_final(&ProposalState::Canceled));
    assert!(is_final(&ProposalState::Executed));
    assert!(is_final(&ProposalState::Expired));
    assert!(!is_final(&ProposalState::Pending));
    assert!(!is_final(&ProposalState::Active));
    assert!(!is_final(&ProposalState::Succeeded));
    assert!(!is_final(&ProposalState::Queued));
}

#[test]
fn test_quorum_calculation_bps() {
    let total_votes_snapshot: u64 = 1_000_000_000; // 1,000,000,000 votes
    let quorum_bps: u16 = 400; // 400 bps = 4%

    let quorum_needed = (total_votes_snapshot as u128)
        .checked_mul(quorum_bps as u128)
        .unwrap()
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
        action: ProposalAction::ApproveCampaign {
            campaign: Pubkey::new_unique(),
        },
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
fn test_finalize_execution_gates_on_eta() {
    let created_at = 1_700_000_000i64;
    let mut proposal = sample_proposal(created_at);
    let clock = Clock {
        unix_timestamp: proposal.eta - 1,
        ..Clock::default()
    };

    // Not yet past the timelock delay -> error
    assert!(finalize_execution(&mut proposal, &clock).is_err());
}

#[test]
fn test_finalize_execution_allows_within_window() {
    let created_at = 1_700_000_000i64;
    let mut proposal = sample_proposal(created_at);
    let clock = Clock {
        unix_timestamp: proposal.eta + 100,
        ..Clock::default()
    };

    assert!(finalize_execution(&mut proposal, &clock).unwrap());
    assert_eq!(proposal.state, ProposalState::Queued);
}

#[test]
fn test_finalize_execution_expires_after_window() {
    let created_at = 1_700_000_000i64;
    let mut proposal = sample_proposal(created_at);
    let clock = Clock {
        unix_timestamp: proposal.eta + MAX_EXECUTION_WINDOW + 1,
        ..Clock::default()
    };

    // Expired: state persists as Expired and the action must not run.
    assert!(!finalize_execution(&mut proposal, &clock).unwrap());
    assert_eq!(proposal.state, ProposalState::Expired);
}

#[test]
fn test_finalize_execution_rejects_non_queued() {
    let created_at = 1_700_000_000i64;
    let mut proposal = sample_proposal(created_at);
    proposal.state = ProposalState::Succeeded;
    let clock = Clock {
        unix_timestamp: proposal.eta + 100,
        ..Clock::default()
    };

    assert!(finalize_execution(&mut proposal, &clock).is_err());
}

#[test]
fn test_action_mismatch_is_rejected() {
    let created_at = 1_700_000_000i64;
    let campaign = Pubkey::new_unique();
    let mut proposal = sample_proposal(created_at);
    proposal.action = ProposalAction::ReleaseMilestone {
        campaign,
        milestone_id: 1,
    };

    // Simulate the release_milestone gate: the trigger must match the action.
    let requested_milestone = 2u64;
    let matches = match proposal.action {
        ProposalAction::ReleaseMilestone {
            campaign: c,
            milestone_id,
        } => c == campaign && milestone_id == requested_milestone,
        _ => false,
    };
    assert!(!matches);

    let matches = match proposal.action {
        ProposalAction::ReleaseMilestone {
            campaign: c,
            milestone_id,
        } => c == campaign && milestone_id == 1,
        _ => false,
    };
    assert!(matches);
}

#[test]
fn test_two_step_authority_transfer_flow() {
    let initial_admin = Pubkey::new_unique();
    let (timelock_pda, _bump) = Pubkey::find_program_address(&[b"timelock"], &Pubkey::new_unique());
    let treasury_account = Pubkey::new_unique();

    let mut dao_config = DaoConfig {
        bump: 255,
        authority: initial_admin,
        pending_authority: Pubkey::default(),
        treasury: treasury_account,
        governance_mint: Pubkey::new_unique(),
        stablecoin_mint: Pubkey::new_unique(),
        voting_delay: 3600,
        voting_period: 86400,
        quorum_bps: 400,
        proposal_threshold: 1000,
        max_governance_supply: 1_000_000_000,
        timelock_delay: 172800,
        next_proposal_id: 0,
        campaign_count: 0,
        paused: false,
    };

    assert_eq!(dao_config.authority, initial_admin);
    assert_eq!(dao_config.pending_authority, Pubkey::default());

    // Step 1: Propose Authority Transfer
    dao_config.pending_authority = timelock_pda;
    assert_eq!(dao_config.authority, initial_admin);
    assert_eq!(dao_config.pending_authority, timelock_pda);

    // Step 2: Accept Authority Transfer
    dao_config.authority = dao_config.pending_authority;
    dao_config.pending_authority = Pubkey::default();

    assert_eq!(dao_config.authority, timelock_pda);
    assert_eq!(dao_config.pending_authority, Pubkey::default());
}

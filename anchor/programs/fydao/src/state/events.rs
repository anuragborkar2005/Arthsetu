use anchor_lang::prelude::*;

use super::ProposalAction;

/// Structured events (L3): emitted via `emit!` so off-chain indexers can
/// subscribe to typed logs instead of parsing `msg!` output.
///
/// Every state-changing handler emits exactly one event carrying the mutated
/// identity (campaign/proposal/voter) and the new authoritative totals.

#[event]
pub struct DaoInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub governance_mint: Pubkey,
    pub stablecoin_mint: Pubkey,
    pub voting_delay: i64,
    pub voting_period: i64,
    pub quorum_bps: u16,
    pub proposal_threshold: u64,
    pub max_governance_supply: u64,
    pub timelock_delay: i64,
}

#[event]
pub struct GovernanceTokenInitialized {
    pub mint: Pubkey,
    pub mint_authority: Pubkey,
}

#[event]
pub struct GovernanceTokensMinted {
    pub to: Pubkey,
    pub amount: u64,
    pub supply: u64,
    pub max_supply: u64,
}

#[event]
pub struct CampaignCreated {
    pub campaign_id: u64,
    pub creator: Pubkey,
    pub verifier: Pubkey,
    pub metadata_cid: String,
    pub trust_score: u64,
}

#[event]
pub struct CampaignApproved {
    pub campaign_id: u64,
    pub proposal_id: u64,
}

#[event]
pub struct Donated {
    pub campaign_id: u64,
    pub donor: Pubkey,
    pub amount: u64,
    pub total_deposited: u64,
}

#[event]
pub struct MilestoneProposed {
    pub campaign_id: u64,
    pub milestone_id: u64,
    pub amount: u64,
    pub proof_cid: String,
    pub verified_by: Pubkey,
}

#[event]
pub struct MilestoneReleased {
    pub campaign_id: u64,
    pub milestone_id: u64,
    pub amount: u64,
    pub proposal_id: u64,
}

#[event]
pub struct EmergencyWithdrawn {
    pub campaign_id: u64,
    pub amount: u64,
    pub treasury: Pubkey,
    pub proposal_id: u64,
}

#[event]
pub struct RefundClaimed {
    pub campaign_id: u64,
    pub donor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ProposalCreated {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub description: String,
    pub action: ProposalAction,
}

#[event]
pub struct VoteCast {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub support: u8,
    pub weight: u64,
}

#[event]
pub struct VotesUnlocked {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ProposalQueued {
    pub proposal_id: u64,
    pub eta: i64,
}

#[event]
pub struct ProposalCanceled {
    pub proposal_id: u64,
}

#[event]
pub struct ProposalExpired {
    pub proposal_id: u64,
}

#[event]
pub struct ProposalExecuted {
    pub proposal_id: u64,
}

#[event]
pub struct AuthorityNominated {
    pub new_authority: Pubkey,
}

#[event]
pub struct AuthorityTransferred {
    pub new_authority: Pubkey,
}

#[event]
pub struct DaoPaused {
    pub paused: bool,
}

use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ProposalAction {
    /// Approve a created campaign and set it live
    ApproveCampaign { campaign: Pubkey },
    /// Release a campaign milestone to the creator
    ReleaseMilestone { campaign: Pubkey, milestone_id: u64 },
    /// Drain a campaign escrow to the DAO treasury
    EmergencyWithdraw { campaign: Pubkey, amount: u64 },
    /// Propose a new DAO authority (step 1 of the two-step transfer)
    TransferAuthority { new_authority: Pubkey },
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum ProposalState {
    Pending, // created, waiting for voting delay
    Active,  // voting in progress
    Canceled,
    Defeated,
    Succeeded,
    Queued,
    Expired,
    Executed,
}

// Governance proposal PDA
// Seeds: ["proposal", proposal_id.to_le_bytes()]
#[account]
#[derive(InitSpace)]
pub struct Proposal {
    // Bump
    pub bump: u8,
    // Unique id
    pub proposal_id: u64,
    // Proposer
    pub proposer: Pubkey,
    // Human readable description
    #[max_len(512)]
    pub description: String,
    // Typed action that will be performed once the proposal passes
    pub action: ProposalAction,
    // Voting power snapshot at proposal creation (for quorum calc)
    pub total_votes_at_creation: u64,
    // Votes for
    pub for_votes: u64,
    // Votes against
    pub against_votes: u64,
    // Abstain votes
    pub abstain_votes: u64,
    // Current state
    pub state: ProposalState,
    // Timestamp when proposal was created
    pub created_at: i64,
    // Timestamp when voting starts (created_at + voting_delay)
    pub vote_start: i64,
    // Timestamp when voting ends
    pub vote_end: i64,
    // Timestamp when queued into timelock
    pub queued_at: i64,
    // Earliest execution timestamp (queued_at + timelock_delay)
    pub eta: i64,
    // Whether executed
    pub executed: bool,
}

impl Proposal {
    pub const SEED: &'static [u8] = b"proposal";
}

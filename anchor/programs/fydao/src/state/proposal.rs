use anchor_lang::prelude::*;

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
    // Instruction data that will be executed if the proposal passes
    // (targets are remaining accounts at execution time)
    #[max_len(1024)]
    pub instruction_data: Vec<u8>,
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

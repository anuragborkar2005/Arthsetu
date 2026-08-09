use anchor_lang::prelude::*;

// Individual milestone PDA
// Seeds: ["milestone", campaign.key(), milestone_id]
#[account]
#[derive(InitSpace)]
pub struct Milestone {
    // Bump
    pub bump: u8,
    // Parent campaign
    pub campaign: Pubkey,
    // Milestone index
    pub milestone_id: u64,
    // IPFS proof CID
    #[max_len(128)]
    pub proof_cid: String,
    // Amount to release (in stablecoin smallest units)
    pub amount: u64,
    // Whether funds have been released
    pub released: bool,
    // Timestamp when proposed
    pub proposed_at: i64,
    // Timestamp when released (0 if not yet)
    pub released_at: i64,
}

impl Milestone {
    pub const SEED: &'static [u8] = b"milestone";
}

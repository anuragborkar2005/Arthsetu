use anchor_lang::prelude::*;

/// Tracks that a voter has already voted on a proposal
/// Seeds: ["vote", proposal.key(), voter.key()]
#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub bump: u8,
    pub proposal: Pubkey,
    pub voter: Pubkey,
    /// 0 = Against, 1 = For, 2 = Abstain
    pub support: u8,
    /// Voting power used
    pub weight: u64,
    pub voted_at: i64,
}

impl VoteRecord {
    pub const SEED: &'static [u8] = b"vote";
}

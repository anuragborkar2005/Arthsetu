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
    /// Whether the locked voting power has been returned to the voter
    pub unlocked: bool,
}

impl VoteRecord {
    pub const SEED: &'static [u8] = b"vote";
    /// Seed prefix for the per-voter vote escrow PDA that owns locked voting tokens
    pub const VOTE_ESCROW_SEED: &'static [u8] = b"vote_escrow";
}

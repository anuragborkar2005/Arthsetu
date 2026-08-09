use anchor_lang::prelude::*;

/// Optional extra state for governance token if needed beyond the mint.
/// Most logic lives in the SPL Token + Token-2022 or just plain Token mint
/// controlled by the DAO authority.
#[account]
#[derive(InitSpace)]
pub struct GovernanceTokenState {
    pub bump: u8,
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub total_minted: u64,
}

impl GovernanceTokenState {
    pub const SEED: &'static [u8] = b"gov_token";
}

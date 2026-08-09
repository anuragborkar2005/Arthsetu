use anchor_lang::prelude::*;

// Global DAO configuration PDA
// Seeds: ["dao_config"]
#[account]
#[derive(InitSpace)]
pub struct DaoConfig {
    // Bump for the PDA
    pub bump: u8,
    // Current active authority (EOA or Timelock PDA)
    pub authority: Pubkey,
    // Pending authority for 2-step transfer
    pub pending_authority: Pubkey,
    // Canonical DAO treasury token account
    pub treasury: Pubkey,
    // Governance token mint
    pub governance_mint: Pubkey,
    // Stablecoin mint used for donations (e.g. USDC)
    pub stablecoin_mint: Pubkey,
    // Voting delay in seconds (time between proposal creation and voting start)
    pub voting_delay: i64,
    // Voting period in seconds
    pub voting_period: i64,
    // Quorum in basis points (e.g. 400 = 4%)
    pub quorum_bps: u16,
    // Minimum governance token balance required to create a proposal
    pub proposal_threshold: u64,
    // Maximum supply cap for governance tokens
    pub max_governance_supply: u64,
    // Timelock delay in seconds before a passed proposal can be executed
    pub timelock_delay: i64,
    // Next proposal id (auto-increment)
    pub next_proposal_id: u64,
    // Total number of campaigns created
    pub campaign_count: u64,
    // Whether the DAO is paused
    pub paused: bool,
}

impl DaoConfig {
    pub const SEED: &'static [u8] = b"dao_config";
    pub const TIMELOCK_SEED: &'static [u8] = b"timelock";
}

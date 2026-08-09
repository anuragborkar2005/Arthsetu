use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeDao<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + DaoConfig::INIT_SPACE,
        seeds = [DaoConfig::SEED],
        bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    /// Governance token mint
    pub governance_mint: Account<'info, Mint>,

    /// Stablecoin mint (USDC etc.)
    pub stablecoin_mint: Account<'info, Mint>,

    /// Canonical DAO treasury token account
    #[account(
        constraint = treasury_token_account.mint == stablecoin_mint.key()
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeDao>,
    voting_delay: i64,
    voting_period: i64,
    quorum_bps: u16,
    proposal_threshold: u64,
    max_governance_supply: u64,
    timelock_delay: i64,
) -> Result<()> {
    require!(
        ctx.accounts.authority.key() == crate::GENESIS_AUTHORITY,
        FydaoError::OnlyGenesis
    );
    require!(quorum_bps > 0 && quorum_bps <= 10_000, FydaoError::InvalidAmount);
    require!(voting_delay >= 0, FydaoError::InvalidAmount);
    require!(voting_period > 0, FydaoError::InvalidAmount);
    require!(timelock_delay >= 0, FydaoError::InvalidAmount);
    require!(max_governance_supply > 0, FydaoError::InvalidAmount);

    let config = &mut ctx.accounts.dao_config;
    config.bump = ctx.bumps.dao_config;
    config.authority = ctx.accounts.authority.key();
    config.pending_authority = Pubkey::default();
    config.treasury = ctx.accounts.treasury_token_account.key();
    config.governance_mint = ctx.accounts.governance_mint.key();
    config.stablecoin_mint = ctx.accounts.stablecoin_mint.key();
    config.voting_delay = voting_delay;
    config.voting_period = voting_period;
    config.quorum_bps = quorum_bps;
    config.proposal_threshold = proposal_threshold;
    config.max_governance_supply = max_governance_supply;
    config.timelock_delay = timelock_delay;
    config.next_proposal_id = 0;
    config.campaign_count = 0;
    config.paused = false;

    msg!("DAO initialized by {}, treasury: {}", config.authority, config.treasury);
    Ok(())
}

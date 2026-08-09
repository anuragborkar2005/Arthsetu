use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::state::*;

#[derive(Accounts)]
pub struct InitializeGovernanceToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        has_one = authority
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + GovernanceTokenState::INIT_SPACE,
        seeds = [GovernanceTokenState::SEED],
        bump
    )]
    pub gov_token_state: Account<'info, GovernanceTokenState>,

    /// The mint that will be used as governance token
    /// Authority of the mint should be the DAO or a PDA
    pub governance_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeGovernanceToken>,
    _name: String,
    _symbol: String,
    _uri: String,
) -> Result<()> {
    let state = &mut ctx.accounts.gov_token_state;
    state.bump = ctx.bumps.gov_token_state;
    state.mint = ctx.accounts.governance_mint.key();
    state.authority = ctx.accounts.authority.key();
    state.total_minted = 0;

    msg!("Governance token state initialized");
    Ok(())
}

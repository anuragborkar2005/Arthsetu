use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct MintGovernanceTokens<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        has_one = authority
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        mut,
        seeds = [GovernanceTokenState::SEED],
        bump = gov_token_state.bump
    )]
    pub gov_token_state: Account<'info, GovernanceTokenState>,

    #[account(
        mut,
        address = dao_config.governance_mint
    )]
    pub governance_mint: Account<'info, Mint>,

    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,

    #[account(
        constraint = mint_authority.key() == dao_config.authority @ FydaoError::OnlyAuthority
    )]
    pub mint_authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<MintGovernanceTokens>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(amount > 0, FydaoError::InvalidAmount);

    let new_total_minted = ctx
        .accounts
        .gov_token_state
        .total_minted
        .checked_add(amount)
        .ok_or(FydaoError::Overflow)?;

    require!(
        new_total_minted <= ctx.accounts.dao_config.max_governance_supply,
        FydaoError::Overflow
    );

    let cpi_accounts = MintTo {
        mint: ctx.accounts.governance_mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.mint_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.key();
    token::mint_to(CpiContext::new(cpi_program, cpi_accounts), amount)?;

    ctx.accounts.gov_token_state.total_minted = new_total_minted;

    msg!("Minted {} governance tokens. Total supply: {} / {}", amount, new_total_minted, ctx.accounts.dao_config.max_governance_supply);
    Ok(())
}

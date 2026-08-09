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

    /// Program PDA that is the governance mint's MintTo authority (set at
    /// `initialize_governance_token`). Minting is only possible via this
    /// instruction, so the supply cap cannot be bypassed (C5/M10).
    #[account(
        seeds = [GovernanceTokenState::MINT_AUTHORITY_SEED],
        bump
    )]
    /// CHECK: used only as the signer of the mint_to CPI
    pub mint_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<MintGovernanceTokens>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(amount > 0, FydaoError::InvalidAmount);

    // Enforce the cap against the REAL mint supply (authoritative, maintained
    // by the token program), not just the program's own bookkeeping.
    let new_supply = ctx
        .accounts
        .governance_mint
        .supply
        .checked_add(amount)
        .ok_or(FydaoError::Overflow)?;

    require!(
        new_supply <= ctx.accounts.dao_config.max_governance_supply,
        FydaoError::Overflow
    );

    let mint_authority_seeds = &[
        GovernanceTokenState::MINT_AUTHORITY_SEED,
        &[ctx.bumps.mint_authority],
    ];
    let signer = &[&mint_authority_seeds[..]];

    let cpi_accounts = MintTo {
        mint: ctx.accounts.governance_mint.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.mint_authority.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.key();
    token::mint_to(
        CpiContext::new_with_signer(cpi_program, cpi_accounts, signer),
        amount,
    )?;

    let new_total_minted = ctx
        .accounts
        .gov_token_state
        .total_minted
        .checked_add(amount)
        .ok_or(FydaoError::Overflow)?;
    ctx.accounts.gov_token_state.total_minted = new_total_minted;

    msg!(
        "Minted {} governance tokens. Total supply: {} / {}",
        amount,
        new_supply,
        ctx.accounts.dao_config.max_governance_supply
    );
    Ok(())
}

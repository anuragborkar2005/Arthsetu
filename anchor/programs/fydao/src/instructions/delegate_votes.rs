use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::errors::FydaoError;
use crate::state::*;

/// Simple delegation record.
/// In production you would snapshot balances at proposal creation.
/// Here we just record current balance as voting power for simplicity.
#[derive(Accounts)]
pub struct DelegateVotes<'info> {
    pub voter: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        constraint = voter_token_account.owner == voter.key(),
        constraint = voter_token_account.mint == dao_config.governance_mint
    )]
    pub voter_token_account: Account<'info, TokenAccount>,

    /// CHECK: optional delegatee (can be self)
    pub delegatee: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<DelegateVotes>, amount: u64) -> Result<()> {
    require!(
        ctx.accounts.voter_token_account.amount >= amount,
        FydaoError::InsufficientFunds
    );

    // In a full implementation we would store a Delegation account.
    // For this conversion we emit an event / log.
    msg!(
        "Delegated {} votes from {} to {}",
        amount,
        ctx.accounts.voter.key(),
        ctx.accounts.delegatee.key()
    );
    Ok(())
}

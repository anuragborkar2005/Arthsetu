use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        constraint = authority.key() == dao_config.authority @ FydaoError::OnlyDao
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        address = campaign.escrow_token_account
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Destination (usually a DAO treasury ATA)
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, FydaoError::InvalidAmount);
    require!(
        ctx.accounts.escrow_token_account.amount >= amount,
        FydaoError::InsufficientFunds
    );

    let campaign_id_bytes = ctx.accounts.campaign.campaign_id.to_le_bytes();
    let seeds = &[
        Campaign::SEED,
        ctx.accounts.campaign.creator.as_ref(),
        campaign_id_bytes.as_ref(),
        &[ctx.accounts.campaign.bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.escrow_token_account.to_account_info(),
        to: ctx.accounts.destination.to_account_info(),
        authority: ctx.accounts.campaign.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer,
        ),
        amount,
    )?;

    ctx.accounts.campaign.emergency_withdrawn = true;

    msg!("Emergency withdraw of {} from campaign", amount);
    Ok(())
}

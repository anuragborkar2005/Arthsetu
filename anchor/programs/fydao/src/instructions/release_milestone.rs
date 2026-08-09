use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct ReleaseMilestone<'info> {
    /// Must be the DAO authority (timelock equivalent)
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
        constraint = milestone.campaign == campaign.key() @ FydaoError::InvalidMilestoneId,
        constraint = !milestone.released @ FydaoError::MilestoneAlreadyReleased
    )]
    pub milestone: Account<'info, Milestone>,

    /// Escrow ATA (owned by campaign PDA)
    #[account(
        mut,
        address = campaign.escrow_token_account
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Creator's token account to receive funds
    #[account(
        mut,
        constraint = creator_token_account.owner == campaign.creator,
        constraint = creator_token_account.mint == dao_config.stablecoin_mint
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ReleaseMilestone>, _milestone_id: u64) -> Result<()> {
    let amount = ctx.accounts.milestone.amount;

    require!(
        ctx.accounts.escrow_token_account.amount >= amount,
        FydaoError::InsufficientFunds
    );

    // Transfer from escrow (PDA signer) → creator
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
        to: ctx.accounts.creator_token_account.to_account_info(),
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

    // Update state
    let milestone = &mut ctx.accounts.milestone;
    milestone.released = true;
    milestone.released_at = Clock::get()?.unix_timestamp;

    let campaign = &mut ctx.accounts.campaign;
    campaign.total_released = campaign
        .total_released
        .checked_add(amount)
        .ok_or(FydaoError::Overflow)?;

    msg!(
        "Released milestone {} amount {} to creator",
        milestone.milestone_id,
        amount
    );
    Ok(())
}

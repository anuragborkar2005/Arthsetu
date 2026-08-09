use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FydaoError;
use crate::state::*;
use crate::instructions::execution::finalize_execution;

#[derive(Accounts)]
pub struct ReleaseMilestone<'info> {
    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    /// The passed proposal that authorizes this milestone release
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,

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
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(!ctx.accounts.campaign.emergency_withdrawn, FydaoError::EmergencyWithdrawn);
    let clock = Clock::get()?;

    let proposal = &mut ctx.accounts.proposal;
    if !finalize_execution(proposal, &clock)? {
        return Ok(());
    }

    // The proposal must exactly authorize releasing this milestone.
    require!(
        proposal.action
            == ProposalAction::ReleaseMilestone {
                campaign: ctx.accounts.campaign.key(),
                milestone_id: ctx.accounts.milestone.milestone_id,
            },
        FydaoError::ActionMismatch
    );

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
    proposal.state = ProposalState::Executed;
    proposal.executed = true;

    let milestone = &mut ctx.accounts.milestone;
    milestone.released = true;
    milestone.released_at = clock.unix_timestamp;

    let campaign = &mut ctx.accounts.campaign;
    campaign.total_released = campaign
        .total_released
        .checked_add(amount)
        .ok_or(FydaoError::Overflow)?;

    msg!(
        "Released milestone {} amount {} to creator via proposal {}",
        milestone.milestone_id,
        amount,
        proposal.proposal_id
    );
    Ok(())
}

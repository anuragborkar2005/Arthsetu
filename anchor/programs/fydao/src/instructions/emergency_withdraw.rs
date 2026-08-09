use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FydaoError;
use crate::state::*;
use crate::instructions::execution::finalize_execution;

#[derive(Accounts)]
pub struct EmergencyWithdraw<'info> {
    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    /// The passed proposal that authorizes this drain
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,

    #[account(mut)]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        address = campaign.escrow_token_account
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    /// Destination must be the canonical DAO treasury token account
    #[account(
        mut,
        constraint = destination.key() == dao_config.treasury @ FydaoError::InvalidAmount
    )]
    pub destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<EmergencyWithdraw>, _amount: u64) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    let clock = Clock::get()?;

    let proposal = &mut ctx.accounts.proposal;
    if !finalize_execution(proposal, &clock)? {
        return Ok(());
    }

    // The proposal must exactly authorize draining this campaign for the voted amount.
    let amount = match proposal.action {
        ProposalAction::EmergencyWithdraw { campaign, amount } => {
            require!(
                campaign == ctx.accounts.campaign.key(),
                FydaoError::ActionMismatch
            );
            amount
        }
        _ => return Err(FydaoError::ActionMismatch.into()),
    };
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

    proposal.state = ProposalState::Executed;
    proposal.executed = true;

    let campaign = &mut ctx.accounts.campaign;
    campaign.emergency_withdrawn = true;
    // M6 residual: keep bookkeeping consistent with the escrow so off-chain
    // displays show the net remaining funds after a partial drain.
    campaign.total_deposited = campaign.total_deposited.saturating_sub(amount);

    emit!(ProposalExecuted {
        proposal_id: proposal.proposal_id,
    });
    emit!(EmergencyWithdrawn {
        campaign_id: campaign.campaign_id,
        amount,
        treasury: ctx.accounts.dao_config.treasury,
        proposal_id: proposal.proposal_id,
    });

    msg!(
        "Emergency withdraw of {} from campaign {} to treasury {} via proposal {}",
        amount,
        campaign.campaign_id,
        ctx.accounts.dao_config.treasury,
        proposal.proposal_id
    );
    Ok(())
}

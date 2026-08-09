use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FydaoError;
use crate::state::*;

/// M4: donor clawback after a governance-approved emergency withdrawal.
///
/// A donor can claim their recorded share of a drained campaign's escrow.
/// The refund is capped at the escrow's remaining balance, so if the drain
/// took everything there is nothing to claim (and the donation record stays
/// intact so a future claim is impossible once `amount == 0`).
#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        mut,
        constraint = campaign.emergency_withdrawn @ FydaoError::RefundNotAvailable
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        seeds = [
            DonationRecord::SEED,
            campaign.key().as_ref(),
            donor.key().as_ref()
        ],
        bump = donation_record.bump,
        constraint = donation_record.campaign == campaign.key() @ FydaoError::ActionMismatch,
        constraint = donation_record.donor == donor.key() @ FydaoError::OnlyAuthority
    )]
    pub donation_record: Account<'info, DonationRecord>,

    #[account(
        mut,
        address = campaign.escrow_token_account,
        constraint = escrow_token_account.mint == dao_config.stablecoin_mint
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = donor_token_account.owner == donor.key(),
        constraint = donor_token_account.mint == dao_config.stablecoin_mint
    )]
    pub donor_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimRefund>) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(
        ctx.accounts.donation_record.amount > 0,
        FydaoError::InvalidAmount
    );

    // Refund is capped by whatever remains in the escrow after the drain.
    let refund = std::cmp::min(
        ctx.accounts.donation_record.amount,
        ctx.accounts.escrow_token_account.amount,
    );
    require!(refund > 0, FydaoError::InsufficientFunds);

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
        to: ctx.accounts.donor_token_account.to_account_info(),
        authority: ctx.accounts.campaign.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer,
        ),
        refund,
    )?;

    let record = &mut ctx.accounts.donation_record;
    record.amount = record
        .amount
        .checked_sub(refund)
        .ok_or(FydaoError::Overflow)?;

    let campaign = &mut ctx.accounts.campaign;
    campaign.total_deposited = campaign.total_deposited.saturating_sub(refund);

    emit!(RefundClaimed {
        campaign_id: campaign.campaign_id,
        donor: ctx.accounts.donor.key(),
        amount: refund,
    });

    msg!(
        "Refunded {} stablecoins to donor {} from drained campaign {}",
        refund,
        ctx.accounts.donor.key(),
        campaign.campaign_id
    );
    Ok(())
}

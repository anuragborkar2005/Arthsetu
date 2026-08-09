use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct Donate<'info> {
    #[account(mut)]
    pub donor: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        mut,
        constraint = campaign.is_live @ FydaoError::CampaignNotLive
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        mut,
        constraint = donor_token_account.owner == donor.key(),
        constraint = donor_token_account.mint == dao_config.stablecoin_mint
    )]
    pub donor_token_account: Account<'info, TokenAccount>,

    /// Per-donor contribution record, used to claw back funds after a drain
    #[account(
        init_if_needed,
        payer = donor,
        space = 8 + DonationRecord::INIT_SPACE,
        seeds = [
            DonationRecord::SEED,
            campaign.key().as_ref(),
            donor.key().as_ref()
        ],
        bump
    )]
    pub donation_record: Account<'info, DonationRecord>,

    #[account(
        mut,
        address = campaign.escrow_token_account,
        constraint = escrow_token_account.mint == dao_config.stablecoin_mint
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Donate>, amount: u64) -> Result<()> {
    require!(amount > 0, FydaoError::InvalidAmount);
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(!ctx.accounts.campaign.emergency_withdrawn, FydaoError::EmergencyWithdrawn);

    // Transfer stablecoin from donor → escrow
    let cpi_accounts = Transfer {
        from: ctx.accounts.donor_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.donor.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        amount,
    )?;

    // Track the donor's lifetime contribution for post-drain clawbacks (M4)
    let record = &mut ctx.accounts.donation_record;
    record.bump = ctx.bumps.donation_record;
    record.campaign = ctx.accounts.campaign.key();
    record.donor = ctx.accounts.donor.key();
    record.amount = record
        .amount
        .checked_add(amount)
        .ok_or(FydaoError::Overflow)?;

    // Update campaign totals
    let campaign = &mut ctx.accounts.campaign;
    campaign.total_deposited = campaign
        .total_deposited
        .checked_add(amount)
        .ok_or(FydaoError::Overflow)?;

    emit!(Donated {
        campaign_id: campaign.campaign_id,
        donor: ctx.accounts.donor.key(),
        amount,
        total_deposited: campaign.total_deposited,
    });

    msg!(
        "Donated {} to campaign {}. Total raised: {}",
        amount,
        campaign.campaign_id,
        campaign.total_deposited
    );
    Ok(())
}

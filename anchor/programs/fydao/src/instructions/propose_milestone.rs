use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(proof_cid: String, amount: u64)]
pub struct ProposeMilestone<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        mut,
        constraint = campaign.creator == creator.key() @ FydaoError::OnlyCreator,
        constraint = campaign.is_live @ FydaoError::CampaignNotLive
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        init,
        payer = creator,
        space = 8 + Milestone::INIT_SPACE,
        seeds = [
            Milestone::SEED,
            campaign.key().as_ref(),
            &campaign.milestone_count.to_le_bytes()
        ],
        bump
    )]
    pub milestone: Account<'info, Milestone>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<ProposeMilestone>,
    proof_cid: String,
    amount: u64,
) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(!ctx.accounts.campaign.emergency_withdrawn, FydaoError::EmergencyWithdrawn);
    require!(amount > 0, FydaoError::InvalidAmount);
    require!(
        proof_cid.len() <= 128,
        FydaoError::InvalidStringLength
    );

    let campaign = &ctx.accounts.campaign;
    let available = campaign
        .total_deposited
        .checked_sub(campaign.total_released)
        .ok_or(FydaoError::Overflow)?;
    require!(available >= amount, FydaoError::NotEnoughDeposited);

    let clock = Clock::get()?;
    let milestone_id = campaign.milestone_count;

    let milestone = &mut ctx.accounts.milestone;
    milestone.bump = ctx.bumps.milestone;
    milestone.campaign = campaign.key();
    milestone.milestone_id = milestone_id;
    milestone.proof_cid = proof_cid;
    milestone.amount = amount;
    milestone.released = false;
    milestone.proposed_at = clock.unix_timestamp;
    milestone.released_at = 0;

    // Increment counter
    let campaign = &mut ctx.accounts.campaign;
    campaign.milestone_count = campaign
        .milestone_count
        .checked_add(1)
        .ok_or(FydaoError::Overflow)?;

    emit!(MilestoneProposed {
        campaign_id: campaign.campaign_id,
        milestone_id,
        amount,
        proof_cid: milestone.proof_cid.clone(),
    });

    msg!(
        "Milestone {} proposed for campaign {} amount {}",
        milestone_id,
        campaign.campaign_id,
        amount
    );
    Ok(())
}

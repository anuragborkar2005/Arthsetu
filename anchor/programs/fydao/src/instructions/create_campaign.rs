use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(metadata_cid: String, trust_score: u64)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        init,
        payer = creator,
        space = 8 + Campaign::INIT_SPACE,
        seeds = [
            Campaign::SEED,
            creator.key().as_ref(),
            &dao_config.campaign_count.to_le_bytes()
        ],
        bump
    )]
    pub campaign: Account<'info, Campaign>,

    /// Stablecoin mint (must match DAO config)
    #[account(address = dao_config.stablecoin_mint)]
    pub stablecoin_mint: Account<'info, Mint>,

    /// Escrow ATA owned by the campaign PDA
    #[account(
        init,
        payer = creator,
        associated_token::mint = stablecoin_mint,
        associated_token::authority = campaign
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<CreateCampaign>, metadata_cid: String, trust_score: u64) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(metadata_cid.len() <= 128, FydaoError::InvalidStringLength);

    let campaign_id = ctx.accounts.dao_config.campaign_count;
    let clock = Clock::get()?;

    let campaign = &mut ctx.accounts.campaign;
    campaign.bump = ctx.bumps.campaign;
    campaign.campaign_id = campaign_id;
    campaign.creator = ctx.accounts.creator.key();
    campaign.escrow_token_account = ctx.accounts.escrow_token_account.key();
    campaign.metadata_cid = metadata_cid;
    campaign.trust_score = trust_score;
    campaign.is_live = false; // requires DAO approval
    campaign.total_deposited = 0;
    campaign.total_released = 0;
    campaign.milestone_count = 0;
    campaign.created_at = clock.unix_timestamp;
    campaign.emergency_withdrawn = false;

    // Increment global counter
    ctx.accounts.dao_config.campaign_count = ctx
        .accounts
        .dao_config
        .campaign_count
        .checked_add(1)
        .ok_or(FydaoError::Overflow)?;

    msg!("Campaign {} created by {}", campaign_id, campaign.creator);
    Ok(())
}

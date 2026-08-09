use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct ApproveAndGoLive<'info> {
    /// The DAO authority or a PDA that represents the Timelock / Governor
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        constraint = authority.key() == dao_config.authority @ FydaoError::OnlyDao
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        mut,
        constraint = !campaign.is_live @ FydaoError::CampaignAlreadyLive
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn handler(ctx: Context<ApproveAndGoLive>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    campaign.is_live = true;

    msg!("Campaign {} is now LIVE", campaign.campaign_id);
    Ok(())
}

use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;
use crate::instructions::execution::finalize_execution;

#[derive(Accounts)]
pub struct ApproveAndGoLive<'info> {
    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    /// The passed proposal that authorizes this campaign approval
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        constraint = !campaign.is_live @ FydaoError::CampaignAlreadyLive
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn handler(ctx: Context<ApproveAndGoLive>) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    let clock = Clock::get()?;

    let proposal = &mut ctx.accounts.proposal;
    if !finalize_execution(proposal, &clock)? {
        return Ok(());
    }

    // The proposal must exactly authorize approving this campaign.
    require!(
        proposal.action
            == ProposalAction::ApproveCampaign {
                campaign: ctx.accounts.campaign.key()
            },
        FydaoError::ActionMismatch
    );

    proposal.state = ProposalState::Executed;
    proposal.executed = true;

    let campaign = &mut ctx.accounts.campaign;
    campaign.is_live = true;

    msg!("Campaign {} is now LIVE via proposal {}", campaign.campaign_id, proposal.proposal_id);
    Ok(())
}

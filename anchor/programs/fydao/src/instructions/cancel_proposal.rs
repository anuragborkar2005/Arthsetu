use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct CancelProposal<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

pub fn handler(ctx: Context<CancelProposal>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;

    // Only proposer or DAO authority can cancel
    require!(
        ctx.accounts.authority.key() == proposal.proposer
            || ctx.accounts.authority.key() == ctx.accounts.dao_config.authority,
        FydaoError::OnlyAuthority
    );

    require!(
        matches!(
            proposal.state,
            ProposalState::Pending | ProposalState::Active | ProposalState::Succeeded | ProposalState::Queued
        ),
        FydaoError::InvalidProposalState
    );

    proposal.state = ProposalState::Canceled;

    msg!("Proposal {} canceled", proposal.proposal_id);
    Ok(())
}

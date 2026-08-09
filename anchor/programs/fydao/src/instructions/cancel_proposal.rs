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
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);

    let proposal = &mut ctx.accounts.proposal;

    // Only proposer or DAO authority can cancel
    require!(
        ctx.accounts.authority.key() == proposal.proposer
            || ctx.accounts.authority.key() == ctx.accounts.dao_config.authority,
        FydaoError::OnlyAuthority
    );

    // Proposer can cancel in Pending/Active state; only DAO authority/guardian can cancel in Succeeded/Queued state
    if matches!(proposal.state, ProposalState::Succeeded | ProposalState::Queued) {
        require!(
            ctx.accounts.authority.key() == ctx.accounts.dao_config.authority,
            FydaoError::OnlyAuthority
        );
    }

    proposal.state = ProposalState::Canceled;

    emit!(ProposalCanceled {
        proposal_id: proposal.proposal_id,
    });

    msg!("Proposal {} canceled", proposal.proposal_id);
    Ok(())
}

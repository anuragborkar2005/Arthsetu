use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;
use crate::instructions::execution::finalize_execution;

/// Step 1 of the two-step authority transfer, gated by a passed proposal:
/// the DAO votes to nominate a new authority, which is recorded as
/// `pending_authority`. Step 2 is `accept_authority` (signed by the new key).
#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(
        mut,
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    /// The passed proposal that authorizes this authority transfer
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

pub fn handler(ctx: Context<TransferAuthority>) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    let clock = Clock::get()?;

    let proposal = &mut ctx.accounts.proposal;
    if !finalize_execution(proposal, &clock)? {
        return Ok(());
    }

    let new_authority = match proposal.action {
        ProposalAction::TransferAuthority { new_authority } => new_authority,
        _ => return Err(FydaoError::ActionMismatch.into()),
    };

    require!(
        new_authority != Pubkey::default(),
        FydaoError::InvalidAmount
    );
    require!(
        new_authority != ctx.accounts.dao_config.authority,
        FydaoError::InvalidAmount
    );

    proposal.state = ProposalState::Executed;
    proposal.executed = true;

    let dao_config = &mut ctx.accounts.dao_config;
    dao_config.pending_authority = new_authority;

    emit!(ProposalExecuted {
        proposal_id: proposal.proposal_id,
    });
    emit!(AuthorityNominated { new_authority });

    msg!(
        "DAO Authority transfer proposed by the DAO: pending authority set to {} via proposal {}",
        new_authority,
        proposal.proposal_id
    );
    Ok(())
}

use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

/// Execution is simplified: the caller (authority) must also pass the
/// accounts required by the underlying instruction and the program will
/// perform a limited set of known actions based on instruction_data.
/// A production system would use a more sophisticated executor or
/// remaining_accounts + CPI.
#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        constraint = authority.key() == dao_config.authority @ FydaoError::OnlyDao
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

pub fn handler(ctx: Context<ExecuteProposal>) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    require!(
        proposal.state == ProposalState::Queued,
        FydaoError::InvalidProposalState
    );
    require!(
        clock.unix_timestamp >= proposal.eta,
        FydaoError::TimelockNotExpired
    );
    require!(!proposal.executed, FydaoError::InvalidProposalState);

    // Expire proposals if 14 days have passed after ETA
    let max_expiry_window: i64 = 14 * 86400; // 14 days
    if clock.unix_timestamp > proposal.eta.saturating_add(max_expiry_window) {
        proposal.state = ProposalState::Expired;
        msg!("Proposal {} expired after timelock window", proposal.proposal_id);
        return err!(FydaoError::TimelockNotExpired);
    }

    // In a full implementation the instruction_data would be decoded
    // and the corresponding CPI / internal call would be made.
    // For this conversion we mark the proposal as executed and emit a log.
    // Real integrations (approve_and_go_live, release_milestone, etc.)
    // are expected to be called by the same authority after the proposal
    // passes, or wired via remaining_accounts.

    proposal.state = ProposalState::Executed;
    proposal.executed = true;

    msg!(
        "Proposal {} executed. Instruction data len = {}",
        proposal.proposal_id,
        proposal.instruction_data.len()
    );
    Ok(())
}

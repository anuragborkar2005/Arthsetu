use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

/// Maximum window (seconds) after `eta` during which a queued proposal can be
/// executed. After this the proposal expires and its action can no longer run.
pub const MAX_EXECUTION_WINDOW: i64 = 14 * 86400; // 14 days

/// Shared gate for executing a queued proposal's action.
///
/// Transitions the proposal from `Queued` to `Executed` once the timelock
/// delay has elapsed and the execution window is still open. If the window
/// has passed, the proposal is transitioned to `Expired` and `Ok(false)` is
/// returned so the caller can persist the state without performing the action.
///
/// Returns `Ok(true)` when the action may proceed.
pub fn finalize_execution(proposal: &mut Proposal, clock: &Clock) -> Result<bool> {
    require!(
        proposal.state == ProposalState::Queued,
        FydaoError::InvalidProposalState
    );
    require!(
        clock.unix_timestamp >= proposal.eta,
        FydaoError::TimelockNotExpired
    );
    require!(!proposal.executed, FydaoError::InvalidProposalState);

    if clock.unix_timestamp > proposal.eta.saturating_add(MAX_EXECUTION_WINDOW) {
        proposal.state = ProposalState::Expired;
        emit!(ProposalExpired {
            proposal_id: proposal.proposal_id,
        });
        msg!(
            "Proposal {} expired after the timelock execution window",
            proposal.proposal_id
        );
        return Ok(false);
    }

    Ok(true)
}

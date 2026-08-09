use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct QueueProposal<'info> {
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
}

pub fn handler(ctx: Context<QueueProposal>) -> Result<()> {
    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;
    let config = &ctx.accounts.dao_config;

    // Ensure voting has ended
    require!(
        clock.unix_timestamp >= proposal.vote_end,
        FydaoError::VotingStillActive
    );

    // Finalize state if still Active
    if proposal.state == ProposalState::Active || proposal.state == ProposalState::Pending {
        let total_votes = proposal
            .for_votes
            .checked_add(proposal.against_votes)
            .ok_or(FydaoError::Overflow)?
            .checked_add(proposal.abstain_votes)
            .ok_or(FydaoError::Overflow)?;

        // Quorum check against total_votes_at_creation snapshot
        let quorum_needed = (proposal.total_votes_at_creation as u128)
            .checked_mul(config.quorum_bps as u128)
            .ok_or(FydaoError::Overflow)?
            / 10_000u128;

        if total_votes < quorum_needed as u64 {
            proposal.state = ProposalState::Defeated;
            msg!("Proposal {} defeated: Quorum not reached", proposal.proposal_id);
            return Ok(());
        }

        if proposal.for_votes > proposal.against_votes {
            proposal.state = ProposalState::Succeeded;
        } else {
            proposal.state = ProposalState::Defeated;
            msg!("Proposal {} defeated: Against votes exceeded For votes", proposal.proposal_id);
            return Ok(());
        }
    }

    require!(
        proposal.state == ProposalState::Succeeded,
        FydaoError::InvalidProposalState
    );

    proposal.state = ProposalState::Queued;
    proposal.queued_at = clock.unix_timestamp;
    proposal.eta = clock
        .unix_timestamp
        .saturating_add(config.timelock_delay);

    msg!(
        "Proposal {} queued. ETA = {}",
        proposal.proposal_id,
        proposal.eta
    );
    Ok(())
}

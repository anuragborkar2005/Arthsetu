use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, TokenAccount};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
#[instruction(description: String, action: ProposalAction)]
pub struct CreateProposal<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,

    #[account(
        mut,
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        init,
        payer = proposer,
        space = 8 + Proposal::INIT_SPACE,
        seeds = [
            Proposal::SEED,
            &dao_config.next_proposal_id.to_le_bytes()
        ],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        constraint = proposer_token_account.owner == proposer.key(),
        constraint = proposer_token_account.mint == dao_config.governance_mint
    )]
    pub proposer_token_account: Account<'info, TokenAccount>,

    #[account(
        constraint = governance_mint.key() == dao_config.governance_mint
    )]
    pub governance_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateProposal>,
    description: String,
    action: ProposalAction,
) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(
        description.len() <= 512,
        FydaoError::InvalidStringLength
    );

    // Check proposal threshold
    require!(
        ctx.accounts.proposer_token_account.amount >= ctx.accounts.dao_config.proposal_threshold,
        FydaoError::ProposalThresholdNotMet
    );

    let clock = Clock::get()?;
    let proposal_id = ctx.accounts.dao_config.next_proposal_id;
    let voting_delay = ctx.accounts.dao_config.voting_delay;
    let voting_period = ctx.accounts.dao_config.voting_period;

    // Snapshot total supply from governance mint for accurate quorum calculation
    let total_votes_snapshot = ctx.accounts.governance_mint.supply;

    let proposal = &mut ctx.accounts.proposal;
    proposal.bump = ctx.bumps.proposal;
    proposal.proposal_id = proposal_id;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.description = description;
    proposal.action = action;
    proposal.total_votes_at_creation = total_votes_snapshot;
    proposal.for_votes = 0;
    proposal.against_votes = 0;
    proposal.abstain_votes = 0;
    proposal.state = ProposalState::Pending;
    proposal.created_at = clock.unix_timestamp;
    proposal.vote_start = clock.unix_timestamp.saturating_add(voting_delay);
    proposal.vote_end = proposal.vote_start.saturating_add(voting_period);
    proposal.queued_at = 0;
    proposal.eta = 0;
    proposal.executed = false;

    // Increment next id
    ctx.accounts.dao_config.next_proposal_id = ctx
        .accounts
        .dao_config
        .next_proposal_id
        .checked_add(1)
        .ok_or(FydaoError::Overflow)?;

    msg!("Proposal {} created", proposal_id);
    Ok(())
}

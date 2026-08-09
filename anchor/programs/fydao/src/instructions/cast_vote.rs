use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(mut)]
    pub proposal: Account<'info, Proposal>,

    #[account(
        constraint = voter_token_account.owner == voter.key(),
        constraint = voter_token_account.mint == dao_config.governance_mint
    )]
    pub voter_token_account: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = voter,
        space = 8 + VoteRecord::INIT_SPACE,
        seeds = [
            VoteRecord::SEED,
            proposal.key().as_ref(),
            voter.key().as_ref()
        ],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CastVote>, support: u8) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(support <= 2, FydaoError::InvalidSupport);

    let clock = Clock::get()?;
    let proposal = &mut ctx.accounts.proposal;

    // Update state based on time
    if proposal.state == ProposalState::Pending && clock.unix_timestamp >= proposal.vote_start {
        proposal.state = ProposalState::Active;
    }

    require!(
        proposal.state == ProposalState::Active,
        FydaoError::InvalidProposalState
    );
    require!(
        clock.unix_timestamp >= proposal.vote_start,
        FydaoError::VotingNotStarted
    );
    require!(
        clock.unix_timestamp < proposal.vote_end,
        FydaoError::VotingEnded
    );

    let weight = ctx.accounts.voter_token_account.amount;
    require!(weight > 0, FydaoError::InvalidAmount);

    match support {
        0 => {
            proposal.against_votes = proposal
                .against_votes
                .checked_add(weight)
                .ok_or(FydaoError::Overflow)?;
        }
        1 => {
            proposal.for_votes = proposal
                .for_votes
                .checked_add(weight)
                .ok_or(FydaoError::Overflow)?;
        }
        _ => {
            proposal.abstain_votes = proposal
                .abstain_votes
                .checked_add(weight)
                .ok_or(FydaoError::Overflow)?;
        }
    }

    let record = &mut ctx.accounts.vote_record;
    record.bump = ctx.bumps.vote_record;
    record.proposal = proposal.key();
    record.voter = ctx.accounts.voter.key();
    record.support = support;
    record.weight = weight;
    record.voted_at = clock.unix_timestamp;

    msg!(
        "Vote cast: support={} weight={} on proposal {}",
        support,
        weight,
        proposal.proposal_id
    );
    Ok(())
}

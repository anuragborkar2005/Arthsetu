use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

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

    /// Governance token mint (must match the DAO config)
    #[account(address = dao_config.governance_mint)]
    pub governance_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = voter_token_account.owner == voter.key() @ FydaoError::OnlyAuthority,
        constraint = voter_token_account.mint == dao_config.governance_mint @ FydaoError::InvalidAmount
    )]
    pub voter_token_account: Account<'info, TokenAccount>,

    /// Per-voter vote escrow PDA; owns the locked governance tokens
    /// Seeds: ["vote_escrow", voter]
    #[account(
        seeds = [VoteRecord::VOTE_ESCROW_SEED, voter.key().as_ref()],
        bump
    )]
    /// CHECK: used only as the authority of `escrow_token_account`
    pub vote_escrow: UncheckedAccount<'info>,

    /// Escrow ATA that receives (locks) the voter's governance tokens while voting
    #[account(
        init_if_needed,
        payer = voter,
        associated_token::mint = governance_mint,
        associated_token::authority = vote_escrow
    )]
    pub escrow_token_account: Account<'info, TokenAccount>,

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
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
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

    // Lock the voter's governance tokens in the per-voter escrow so vote weight
    // cannot be sold/transferred while the proposal is live (buy-vote-dump).
    let lock_cpi_accounts = Transfer {
        from: ctx.accounts.voter_token_account.to_account_info(),
        to: ctx.accounts.escrow_token_account.to_account_info(),
        authority: ctx.accounts.voter.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.key(), lock_cpi_accounts),
        weight,
    )?;

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
    record.unlocked = false;

    msg!(
        "Vote cast: support={} weight={} locked in escrow on proposal {}",
        support,
        weight,
        proposal.proposal_id
    );
    Ok(())
}

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct UnlockVotes<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump
    )]
    pub dao_config: Box<Account<'info, DaoConfig>>,

    #[account(mut)]
    pub proposal: Box<Account<'info, Proposal>>,

    /// Governance token mint (must match the DAO config)
    #[account(address = dao_config.governance_mint)]
    pub governance_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        close = voter,
        seeds = [
            VoteRecord::SEED,
            proposal.key().as_ref(),
            voter.key().as_ref()
        ],
        bump = vote_record.bump,
        constraint = vote_record.voter == voter.key() @ FydaoError::OnlyAuthority,
        constraint = !vote_record.unlocked @ FydaoError::AlreadyUnlocked
    )]
    pub vote_record: Box<Account<'info, VoteRecord>>,

    /// Per-voter vote escrow PDA; owns the locked governance tokens
    #[account(
        seeds = [VoteRecord::VOTE_ESCROW_SEED, voter.key().as_ref()],
        bump
    )]
    /// CHECK: used only as the authority of `escrow_token_account`
    pub vote_escrow: UncheckedAccount<'info>,

    /// Escrow ATA holding the locked governance tokens
    #[account(
        mut,
        associated_token::mint = governance_mint,
        associated_token::authority = vote_escrow
    )]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,

    /// Voter's own token account that receives the unlocked tokens
    #[account(
        mut,
        constraint = voter_token_account.owner == voter.key() @ FydaoError::OnlyAuthority,
        constraint = voter_token_account.mint == dao_config.governance_mint @ FydaoError::InvalidAmount
    )]
    pub voter_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<UnlockVotes>) -> Result<()> {
    let proposal = &ctx.accounts.proposal;

    require!(
        matches!(
            proposal.state,
            ProposalState::Defeated
                | ProposalState::Canceled
                | ProposalState::Executed
                | ProposalState::Expired
        ),
        FydaoError::VotesStillLocked
    );

    let amount = ctx.accounts.vote_record.weight;
    require!(amount > 0, FydaoError::InvalidAmount);

    let voter_key = ctx.accounts.voter.key();
    let escrow_seeds = &[
        VoteRecord::VOTE_ESCROW_SEED,
        voter_key.as_ref(),
        &[ctx.bumps.vote_escrow],
    ];
    let signer = &[&escrow_seeds[..]];

    let unlock_cpi_accounts = Transfer {
        from: ctx.accounts.escrow_token_account.to_account_info(),
        to: ctx.accounts.voter_token_account.to_account_info(),
        authority: ctx.accounts.vote_escrow.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            unlock_cpi_accounts,
            signer,
        ),
        amount,
    )?;

    ctx.accounts.vote_record.unlocked = true;

    emit!(VotesUnlocked {
        proposal_id: proposal.proposal_id,
        voter: ctx.accounts.voter.key(),
        amount,
    });

    msg!(
        "Unlocked {} governance tokens for voter {} from proposal {}",
        amount,
        ctx.accounts.voter.key(),
        proposal.proposal_id
    );
    Ok(())
}

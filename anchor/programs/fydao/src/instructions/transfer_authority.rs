use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        constraint = authority.key() == dao_config.authority @ FydaoError::OnlyAuthority
    )]
    pub dao_config: Account<'info, DaoConfig>,
}

pub fn handler(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    require!(new_authority != Pubkey::default(), FydaoError::InvalidAmount);
    let dao_config = &mut ctx.accounts.dao_config;
    dao_config.pending_authority = new_authority;

    msg!(
        "DAO Authority transfer proposed by {} to pending authority {}",
        dao_config.authority,
        new_authority
    );
    Ok(())
}

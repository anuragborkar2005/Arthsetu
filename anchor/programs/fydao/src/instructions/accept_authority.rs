use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub pending_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        constraint = dao_config.pending_authority != Pubkey::default() @ FydaoError::OnlyAuthority,
        constraint = pending_authority.key() == dao_config.pending_authority @ FydaoError::OnlyAuthority
    )]
    pub dao_config: Account<'info, DaoConfig>,
}

pub fn handler(ctx: Context<AcceptAuthority>) -> Result<()> {
    require!(!ctx.accounts.dao_config.paused, FydaoError::DaoPaused);
    let dao_config = &mut ctx.accounts.dao_config;
    let old_authority = dao_config.authority;
    dao_config.authority = dao_config.pending_authority;
    dao_config.pending_authority = Pubkey::default();

    msg!(
        "DAO Authority transfer accepted. Authority updated from {} to {}",
        old_authority,
        dao_config.authority
    );
    Ok(())
}

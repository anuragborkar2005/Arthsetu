use anchor_lang::prelude::*;

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct SetPaused<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        constraint = authority.key() == dao_config.authority @ FydaoError::OnlyAuthority
    )]
    pub dao_config: Account<'info, DaoConfig>,
}

pub fn handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    let dao_config = &mut ctx.accounts.dao_config;
    dao_config.paused = paused;

    emit!(DaoPaused { paused });

    msg!("DAO pause state updated to: {}", paused);
    Ok(())
}

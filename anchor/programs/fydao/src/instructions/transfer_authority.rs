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
    require!(new_authority != Pubkey::default(), FydaoError::InvalidAmount);
    let dao_config = &mut ctx.accounts.dao_config;
    let old_authority = dao_config.authority;
    dao_config.authority = new_authority;

    msg!(
        "DAO Authority transferred from {} to Timelock/Governor PDA {}",
        old_authority,
        new_authority
    );
    Ok(())
}

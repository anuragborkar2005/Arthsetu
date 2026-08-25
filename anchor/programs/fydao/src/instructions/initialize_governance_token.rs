use anchor_lang::prelude::*;
use anchor_spl::metadata;
use anchor_spl::token::{self, Mint, SetAuthority, Token};

use crate::errors::FydaoError;
use crate::state::*;

#[derive(Accounts)]
pub struct InitializeGovernanceToken<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [DaoConfig::SEED],
        bump = dao_config.bump,
        has_one = authority
    )]
    pub dao_config: Account<'info, DaoConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + GovernanceTokenState::INIT_SPACE,
        seeds = [GovernanceTokenState::SEED],
        bump
    )]
    pub gov_token_state: Account<'info, GovernanceTokenState>,

    /// The mint that will be used as governance token
    #[account(mut)]
    pub governance_mint: Account<'info, Mint>,

    /// Program PDA that becomes the governance mint's sole MintTo authority,
    /// so minting can only happen through the program (C5/M10).
    #[account(
        seeds = [GovernanceTokenState::MINT_AUTHORITY_SEED],
        bump
    )]
    /// CHECK: used only as the target of the SetAuthority CPI and as the
    /// metadata update authority (address validated in the handler)
    pub mint_authority_pda: UncheckedAccount<'info>,

    /// Current mint authority of `governance_mint`; must transfer it to the PDA
    pub current_mint_authority: Signer<'info>,

    /// Metaplex Token Metadata program (M1): gives the governance token a real
    /// on-chain metadata record, honoring the `name`/`symbol`/`uri` args.
    pub token_metadata_program: Program<'info, anchor_spl::metadata::Metadata>,

    /// Metaplex metadata PDA for the governance mint
    /// Seeds: ["metadata", MPL_TOKEN_METADATA, mint]
    #[account(mut)]
    /// CHECK: address validated in the handler via `find_program_address`
    pub metadata: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitializeGovernanceToken>,
    name: String,
    symbol: String,
    uri: String,
) -> Result<()> {
    require!(
        ctx.accounts.governance_mint.mint_authority.is_some()
            && ctx.accounts.governance_mint.mint_authority.unwrap()
                == ctx.accounts.current_mint_authority.key(),
        FydaoError::InvalidMintAuthority
    );

    // The metadata account must be the canonical Metaplex PDA for this mint.
    let (derived_metadata, _) = Pubkey::find_program_address(
        &[
            b"metadata",
            metadata::ID.as_ref(),
            ctx.accounts.governance_mint.key().as_ref(),
        ],
        &metadata::ID,
    );
    require!(
        ctx.accounts.metadata.key() == derived_metadata,
        FydaoError::ActionMismatch
    );

    // Create the metadata record BEFORE handing over the mint authority, while
    // `current_mint_authority` is still the mint's authority (required by the
    // Metaplex create instruction). The update authority is the program PDA,
    // so the program keeps the ability to update the record and no EOA does.
    let metadata_cpi_accounts = metadata::CreateMetadataAccountsV3 {
        metadata: ctx.accounts.metadata.to_account_info(),
        mint: ctx.accounts.governance_mint.to_account_info(),
        mint_authority: ctx.accounts.current_mint_authority.to_account_info(),
        payer: ctx.accounts.authority.to_account_info(),
        update_authority: ctx.accounts.mint_authority_pda.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };
    let data = metadata::mpl_token_metadata::types::DataV2 {
        name,
        symbol,
        uri,
        seller_fee_basis_points: 0,
        creators: None,
        collection: None,
        uses: None,
    };
    metadata::create_metadata_accounts_v3(
        CpiContext::new(
            ctx.accounts.token_metadata_program.key(),
            metadata_cpi_accounts,
        ),
        data,
        true,  // is_mutable
        false, // update_authority_is_signer (PDA, not signing)
        None,  // collection_details
    )?;

    let pda_key = ctx.accounts.mint_authority_pda.key();

    // Hand the governance mint's MintTo authority to the program PDA. From
    // here on, only `mint_governance_tokens` (which caps the supply) can mint.
    token::set_authority(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            SetAuthority {
                account_or_mint: ctx.accounts.governance_mint.to_account_info(),
                current_authority: ctx.accounts.current_mint_authority.to_account_info(),
            },
        ),
        anchor_spl::token::spl_token::instruction::AuthorityType::MintTokens,
        Some(pda_key),
    )?;

    let state = &mut ctx.accounts.gov_token_state;
    state.bump = ctx.bumps.gov_token_state;
    state.mint = ctx.accounts.governance_mint.key();
    state.authority = ctx.accounts.authority.key();
    state.total_minted = 0;

    emit!(GovernanceTokenInitialized {
        mint: state.mint,
        mint_authority: pda_key,
    });

    msg!("Governance token state initialized; mint authority = {}", pda_key);
    Ok(())
}

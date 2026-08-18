use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::*;

declare_id!("HwV2YLJscqtHApqHj3Lp6cW4hA3L7areeWe1PH9BUSBb");

/// Genesis key allowed to bootstrap the DAO (`initialize_dao`). Fixes H1:
/// `initialize_dao` can no longer be front-run, because only this key can
/// create the single global `DaoConfig` PDA.
///
/// Set this to the deployer's key before a real deployment; the local dev
/// wallet pubkey (the `[provider] wallet` in `Anchor.toml`) is pinned for the
/// prototype.
pub const GENESIS_AUTHORITY: Pubkey = Pubkey::new_from_array([
    241, 237, 140, 186, 35, 65, 20, 111, 173, 109, 40, 111, 52, 255, 123, 27, 206, 153, 73, 219, 223,
    59, 79, 120, 6, 13, 28, 4, 241, 231, 108, 84,
]);

#[program]
pub mod fydao {
    use super::*;

    // ──────────────────────────────────────────────
    // Protocol initialization
    // ──────────────────────────────────────────────

    /// Initialize the global DAO config (one-time)
    pub fn initialize_dao(
        ctx: Context<InitializeDao>,
        voting_delay: i64,
        voting_period: i64,
        quorum_bps: u16, // basis points, e.g. 400 = 4%
        proposal_threshold: u64,
        max_governance_supply: u64,
        timelock_delay: i64,
    ) -> Result<()> {
        instructions::initialize_dao::handler(
            ctx,
            voting_delay,
            voting_period,
            quorum_bps,
            proposal_threshold,
            max_governance_supply,
            timelock_delay,
        )
    }

    // ──────────────────────────────────────────────
    // Governance Token
    // ──────────────────────────────────────────────

    /// Initialize the governance token mint + metadata
    pub fn initialize_governance_token(
        ctx: Context<InitializeGovernanceToken>,
        name: String,
        symbol: String,
        uri: String,
    ) -> Result<()> {
        instructions::initialize_governance_token::handler(ctx, name, symbol, uri)
    }

    /// Mint governance tokens (only DAO authority / owner)
    pub fn mint_governance_tokens(ctx: Context<MintGovernanceTokens>, amount: u64) -> Result<()> {
        instructions::mint_governance_tokens::handler(ctx, amount)
    }

    // ──────────────────────────────────────────────
    // Campaign Factory
    // ──────────────────────────────────────────────

    /// Create a new fundraising campaign + its escrow vault.
    /// `verifier` names the key that must attest each milestone's `proof_cid`;
    /// the DAO implicitly endorses this choice when it approves the campaign.
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        metadata_cid: String,
        trust_score: u64,
        verifier: Pubkey,
    ) -> Result<()> {
        instructions::create_campaign::handler(ctx, metadata_cid, trust_score, verifier)
    }

    /// DAO / Timelock approves campaign → sets is_live = true
    pub fn approve_and_go_live(ctx: Context<ApproveAndGoLive>) -> Result<()> {
        instructions::approve_and_go_live::handler(ctx)
    }

    // ──────────────────────────────────────────────
    // Donations & Milestones
    // ──────────────────────────────────────────────

    /// Donor transfers stablecoin into the campaign escrow
    pub fn donate(ctx: Context<Donate>, amount: u64) -> Result<()> {
        instructions::donate::handler(ctx, amount)
    }

    /// Campaign creator proposes a milestone with proof CID.
    /// The campaign's designated verifier must co-sign, attesting the proof (M5).
    pub fn propose_milestone(
        ctx: Context<ProposeMilestone>,
        proof_cid: String,
        amount: u64,
    ) -> Result<()> {
        instructions::propose_milestone::handler(ctx, proof_cid, amount)
    }

    /// Release a milestone after a successful governance proposal (permissionless trigger)
    pub fn release_milestone(ctx: Context<ReleaseMilestone>, milestone_id: u64) -> Result<()> {
        instructions::release_milestone::handler(ctx, milestone_id)
    }

    /// Emergency withdraw remaining funds (governance only)
    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
        instructions::emergency_withdraw::handler(ctx, amount)
    }

    /// Donor clawback of their share of a drained campaign's escrow (M4)
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        instructions::claim_refund::handler(ctx)
    }

    // ──────────────────────────────────────────────
    // Governance (custom Governor)
    // ──────────────────────────────────────────────

    /// Create a proposal (any holder above threshold) with a typed action
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        description: String,
        // typed action performed once the proposal passes:
        // ApproveCampaign | ReleaseMilestone | EmergencyWithdraw | TransferAuthority
        action: ProposalAction,
    ) -> Result<()> {
        instructions::create_proposal::handler(ctx, description, action)
    }

    /// Cast a vote on an active proposal
    pub fn cast_vote(ctx: Context<CastVote>, support: u8) -> Result<()> {
        // support: 0 = Against, 1 = For, 2 = Abstain
        instructions::cast_vote::handler(ctx, support)
    }

    /// Unlock a voter's governance tokens once the proposal reaches a final state
    pub fn unlock_votes(ctx: Context<UnlockVotes>) -> Result<()> {
        instructions::unlock_votes::handler(ctx)
    }

    /// Queue a successful proposal into the timelock
    pub fn queue_proposal(ctx: Context<QueueProposal>) -> Result<()> {
        instructions::queue_proposal::handler(ctx)
    }

    /// Cancel a proposal (proposer or guardian)
    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        instructions::cancel_proposal::handler(ctx)
    }

    /// Transfer DAO authority (step 1: DAO votes to nominate; see accept_authority for step 2)
    pub fn transfer_authority(ctx: Context<TransferAuthority>) -> Result<()> {
        instructions::transfer_authority::handler(ctx)
    }

    /// Accept DAO authority transfer (step 2: claim)
    pub fn accept_authority(ctx: Context<AcceptAuthority>) -> Result<()> {
        instructions::accept_authority::handler(ctx)
    }

    /// Pause or unpause the DAO
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::set_paused::handler(ctx, paused)
    }
}

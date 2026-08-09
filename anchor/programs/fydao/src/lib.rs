use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

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
        timelock_delay: i64,
    ) -> Result<()> {
        instructions::initialize_dao::handler(
            ctx,
            voting_delay,
            voting_period,
            quorum_bps,
            proposal_threshold,
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

    /// Delegate voting power
    pub fn delegate_votes(ctx: Context<DelegateVotes>, amount: u64) -> Result<()> {
        instructions::delegate_votes::handler(ctx, amount)
    }

    // ──────────────────────────────────────────────
    // Campaign Factory
    // ──────────────────────────────────────────────

    /// Create a new fundraising campaign + its escrow vault
    pub fn create_campaign(
        ctx: Context<CreateCampaign>,
        metadata_cid: String,
        trust_score: u64,
    ) -> Result<()> {
        instructions::create_campaign::handler(ctx, metadata_cid, trust_score)
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

    /// Campaign creator proposes a milestone with proof CID
    pub fn propose_milestone(
        ctx: Context<ProposeMilestone>,
        proof_cid: String,
        amount: u64,
    ) -> Result<()> {
        instructions::propose_milestone::handler(ctx, proof_cid, amount)
    }

    /// Release a milestone after successful governance vote (called by timelock)
    pub fn release_milestone(ctx: Context<ReleaseMilestone>, milestone_id: u64) -> Result<()> {
        instructions::release_milestone::handler(ctx, milestone_id)
    }

    /// Emergency withdraw remaining funds (governance only)
    pub fn emergency_withdraw(ctx: Context<EmergencyWithdraw>, amount: u64) -> Result<()> {
        instructions::emergency_withdraw::handler(ctx, amount)
    }

    // ──────────────────────────────────────────────
    // Governance (custom Governor)
    // ──────────────────────────────────────────────

    /// Create a proposal (any holder above threshold)
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        description: String,
        // serialized instruction data that will be executed if proposal passes
        // For simplicity we store targets as remaining accounts + instruction data
        instruction_data: Vec<u8>,
    ) -> Result<()> {
        instructions::create_proposal::handler(ctx, description, instruction_data)
    }

    /// Cast a vote on an active proposal
    pub fn cast_vote(ctx: Context<CastVote>, support: u8) -> Result<()> {
        // support: 0 = Against, 1 = For, 2 = Abstain
        instructions::cast_vote::handler(ctx, support)
    }

    /// Queue a successful proposal into the timelock
    pub fn queue_proposal(ctx: Context<QueueProposal>) -> Result<()> {
        instructions::queue_proposal::handler(ctx)
    }

    /// Execute a queued proposal after timelock delay
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        instructions::execute_proposal::handler(ctx)
    }

    /// Cancel a proposal (proposer or guardian)
    pub fn cancel_proposal(ctx: Context<CancelProposal>) -> Result<()> {
        instructions::cancel_proposal::handler(ctx)
    }
}

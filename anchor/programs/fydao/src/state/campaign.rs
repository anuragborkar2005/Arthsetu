use anchor_lang::prelude::*;

// Campaign account
// Seeds: ["campaign", creator, campaign_id]
#[account]
#[derive(InitSpace)]
pub struct Campaign {
    // Bump
    pub bump: u8,
    // Unique campaign id (from DaoConfig.campaign_count)
    pub campaign_id: u64,
    // Creator of the campaign
    pub creator: Pubkey,
    // Designated verifier who must attest each milestone's proof_cid (M5).
    // Nominated by the creator at `create_campaign`; implicitly endorsed by
    // the DAO when it approves the campaign via `approve_and_go_live`.
    pub verifier: Pubkey,
    // Escrow token account (ATA holding stablecoins) - authority is the campaign PDA
    pub escrow_token_account: Pubkey,
    // IPFS / Arweave metadata CID
    #[max_len(128)]
    pub metadata_cid: String,
    // Trust score assigned at creation
    pub trust_score: u64,
    // Whether the campaign has been approved by DAO and is accepting donations
    pub is_live: bool,
    // Total amount donated (stablecoin)
    pub total_deposited: u64,
    // Total amount released to creator
    pub total_released: u64,
    // Number of milestones proposed
    pub milestone_count: u64,
    // Timestamp of creation
    pub created_at: i64,
    // Whether emergency withdrawn
    pub emergency_withdrawn: bool,
}

impl Campaign {
    pub const SEED: &'static [u8] = b"campaign";
}

use anchor_lang::prelude::*;

/// Tracks a donor's total contributions to a campaign (M4).
/// Seeds: ["donation", campaign.key(), donor.key()]
///
/// After a governance-approved emergency withdrawal, the donor can call
/// `claim_refund` to claw back their share of whatever is left in the escrow.
#[account]
#[derive(InitSpace)]
pub struct DonationRecord {
    pub bump: u8,
    pub campaign: Pubkey,
    pub donor: Pubkey,
    /// Total amount this donor has deposited into the campaign escrow
    pub amount: u64,
}

impl DonationRecord {
    pub const SEED: &'static [u8] = b"donation";
}

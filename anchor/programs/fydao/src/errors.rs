use anchor_lang::prelude::*;

#[error_code]
pub enum FydaoError {
    #[msg("Campaign is not live")]
    CampaignNotLive,

    #[msg("Only the campaign creator can call this")]
    OnlyCreator,

    #[msg("Only the DAO / Timelock can call this")]
    OnlyDao,

    #[msg("Only the protocol authority can call this")]
    OnlyAuthority,

    #[msg("Amount must be greater than zero")]
    InvalidAmount,

    #[msg("Insufficient funds in escrow")]
    InsufficientFunds,

    #[msg("Milestone already released")]
    MilestoneAlreadyReleased,

    #[msg("Invalid milestone id")]
    InvalidMilestoneId,

    #[msg("Not enough deposited funds for this milestone")]
    NotEnoughDeposited,

    #[msg("Proposal threshold not met")]
    ProposalThresholdNotMet,

    #[msg("Voting has not started yet")]
    VotingNotStarted,

    #[msg("Voting period has ended")]
    VotingEnded,

    #[msg("Voting is still active")]
    VotingStillActive,

    #[msg("Already voted on this proposal")]
    AlreadyVoted,

    #[msg("Invalid vote support value (must be 0, 1 or 2)")]
    InvalidSupport,

    #[msg("Proposal is not in the expected state")]
    InvalidProposalState,

    #[msg("Quorum not reached")]
    QuorumNotReached,

    #[msg("Proposal did not pass")]
    ProposalDidNotPass,

    #[msg("Timelock delay has not passed yet")]
    TimelockNotExpired,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("DAO is paused")]
    DaoPaused,

    #[msg("Invalid string length")]
    InvalidStringLength,

    #[msg("Campaign already live")]
    CampaignAlreadyLive,

    #[msg("Campaign has been emergency withdrawn")]
    EmergencyWithdrawn,
}

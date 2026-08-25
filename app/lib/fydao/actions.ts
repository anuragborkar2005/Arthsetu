import type {
  Address,
  Instruction,
  TransactionSigner,
} from "@solana/kit";
import {
  getAcceptAuthorityInstructionAsync,
  getApproveAndGoLiveInstructionAsync,
  getCancelProposalInstructionAsync,
  getCastVoteInstructionAsync,
  getClaimRefundInstructionAsync,
  getCreateCampaignInstructionAsync,
  getCreateProposalInstructionAsync,
  getDonateInstructionAsync,
  getEmergencyWithdrawInstructionAsync,
  getInitializeDaoInstructionAsync,
  getInitializeGovernanceTokenInstructionAsync,
  getMintGovernanceTokensInstructionAsync,
  getProposeMilestoneInstructionAsync,
  getQueueProposalInstructionAsync,
  getReleaseMilestoneInstructionAsync,
  getSetPausedInstructionAsync,
  getTransferAuthorityInstructionAsync,
  getUnlockVotesInstructionAsync,
} from "../../generated/fydao/instructions";
import {
  findCampaignPda,
  findMetadataPda,
  findMilestonePda,
  findProposalPda,
} from "./pdas";
import type { ProposalActionArgs } from "../../generated/fydao/types";
import type { SolanaClient } from "../solana-client";

/**
 * Returns an idempotent ATA-create instruction when `owner` has no associated
 * token account on `mint` yet, otherwise an empty list.
 */
export async function ensureAta(
  rpc: SolanaClient["rpc"],
  payer: TransactionSigner,
  owner: Address,
  mint: Address,
): Promise<Instruction[]> {
  const mintInfo = await rpc.getAccountInfo(mint).send().catch(() => ({ value: null }));
  if (!mintInfo.value) {
    throw new Error(
      `Token mint ${mint} is not initialized on this cluster. If you are on Localnet or Devnet, please initialize or select a valid mint in the Admin panel (/admin).`
    );
  }
  const tokenProgram = (mintInfo.value.owner as Address) || TOKEN_PROGRAM_ADDRESS;
  const { findAta } = await import("./pdas");
  const [ata] = await findAta(owner, mint, tokenProgram);
  const info = await rpc.getAccountInfo(ata).send().catch(() => ({ value: null }));
  if (info.value) return [];
  const { createAtaInstruction } = await import("./mints");
  return [await createAtaInstruction(payer, owner, mint, tokenProgram)];
}
import {
  MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
  RENT_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "./constants";

export async function initializeDaoActions(params: {
  authority: TransactionSigner;
  governanceMint: Address;
  stablecoinMint: Address;
  treasuryTokenAccount: Address;
  votingDelay: bigint;
  votingPeriod: bigint;
  quorumBps: number;
  proposalThreshold: bigint;
  maxGovernanceSupply: bigint;
  timelockDelay: bigint;
}): Promise<Instruction[]> {
  return [
    await getInitializeDaoInstructionAsync({
      authority: params.authority,
      governanceMint: params.governanceMint,
      stablecoinMint: params.stablecoinMint,
      treasuryTokenAccount: params.treasuryTokenAccount,
      votingDelay: params.votingDelay,
      votingPeriod: params.votingPeriod,
      quorumBps: params.quorumBps,
      proposalThreshold: params.proposalThreshold,
      maxGovernanceSupply: params.maxGovernanceSupply,
      timelockDelay: params.timelockDelay,
    }),
  ];
}

export async function initializeGovernanceTokenActions(params: {
  authority: TransactionSigner;
  currentMintAuthority: TransactionSigner;
  governanceMint: Address;
  name: string;
  symbol: string;
  uri: string;
}): Promise<Instruction[]> {
  const [metadata] = await findMetadataPda(params.governanceMint);
  return [
    await getInitializeGovernanceTokenInstructionAsync({
      authority: params.authority,
      governanceMint: params.governanceMint,
      currentMintAuthority: params.currentMintAuthority,
      tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
      metadata,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
    }),
  ];
}

export async function mintGovernanceTokensActions(params: {
  authority: TransactionSigner;
  governanceMint: Address;
  amount: bigint;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [destination] = await findAta(params.authority.address, params.governanceMint);
  return [
    await getMintGovernanceTokensInstructionAsync({
      authority: params.authority,
      governanceMint: params.governanceMint,
      destination,
      amount: params.amount,
    }),
  ];
}

export async function createCampaignActions(params: {
  creator: TransactionSigner;
  stablecoinMint: Address;
  campaignId: bigint;
  metadataCid: string;
  trustScore: bigint;
  verifier: Address;
}): Promise<Instruction[]> {
  const [campaign] = await findCampaignPda(params.creator.address, params.campaignId);
  return [
    await getCreateCampaignInstructionAsync({
      creator: params.creator,
      campaign,
      stablecoinMint: params.stablecoinMint,
      metadataCid: params.metadataCid,
      trustScore: params.trustScore,
      verifier: params.verifier,
    }),
  ];
}

export async function donateActions(params: {
  rpc: SolanaClient["rpc"];
  donor: TransactionSigner;
  campaign: Address;
  stablecoinMint: Address;
  amount: bigint;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [donorTokenAccount] = await findAta(params.donor.address, params.stablecoinMint);
  const [escrowTokenAccount] = await findAta(params.campaign, params.stablecoinMint);
  return [
    ...(await ensureAta(params.rpc, params.donor, params.donor.address, params.stablecoinMint)),
    await getDonateInstructionAsync({
      donor: params.donor,
      campaign: params.campaign,
      donorTokenAccount,
      escrowTokenAccount,
      amount: params.amount,
    }),
  ];
}

export async function createProposalActions(params: {
  rpc: SolanaClient["rpc"];
  proposer: TransactionSigner;
  governanceMint: Address;
  proposalId: bigint;
  description: string;
  action: ProposalActionArgs;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [proposal] = await findProposalPda(params.proposalId);
  const [proposerTokenAccount] = await findAta(
    params.proposer.address,
    params.governanceMint,
  );
  return [
    ...(await ensureAta(params.rpc, params.proposer, params.proposer.address, params.governanceMint)),
    await getCreateProposalInstructionAsync({
      proposer: params.proposer,
      proposal,
      proposerTokenAccount,
      governanceMint: params.governanceMint,
      description: params.description,
      action: params.action,
    }),
  ];
}

export async function castVoteActions(params: {
  rpc: SolanaClient["rpc"];
  voter: TransactionSigner;
  governanceMint: Address;
  proposal: Address;
  support: number;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [voterTokenAccount] = await findAta(params.voter.address, params.governanceMint);
  return [
    ...(await ensureAta(params.rpc, params.voter, params.voter.address, params.governanceMint)),
    await getCastVoteInstructionAsync({
      voter: params.voter,
      governanceMint: params.governanceMint,
      proposal: params.proposal,
      voterTokenAccount,
      support: params.support,
    }),
  ];
}

export async function queueProposalActions(params: {
  authority: TransactionSigner;
  proposal: Address;
}): Promise<Instruction[]> {
  return [
    await getQueueProposalInstructionAsync({
      authority: params.authority,
      proposal: params.proposal,
    }),
  ];
}

export async function approveCampaignActions(params: {
  proposal: Address;
  campaign: Address;
}): Promise<Instruction[]> {
  return [
    await getApproveAndGoLiveInstructionAsync({
      proposal: params.proposal,
      campaign: params.campaign,
    }),
  ];
}

export async function releaseMilestoneActions(params: {
  proposal: Address;
  campaign: Address;
  campaignCreator: Address;
  stablecoinMint: Address;
  milestone: Address;
  milestoneId: bigint;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [escrowTokenAccount] = await findAta(params.campaign, params.stablecoinMint);
  const [creatorTokenAccount] = await findAta(
    params.campaignCreator,
    params.stablecoinMint,
  );
  return [
    await getReleaseMilestoneInstructionAsync({
      proposal: params.proposal,
      campaign: params.campaign,
      milestone: params.milestone,
      escrowTokenAccount,
      creatorTokenAccount,
      milestoneId: params.milestoneId,
    }),
  ];
}

export async function emergencyWithdrawActions(params: {
  proposal: Address;
  campaign: Address;
  treasury: Address;
  stablecoinMint: Address;
  amount: bigint;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [escrowTokenAccount] = await findAta(params.campaign, params.stablecoinMint);
  return [
    await getEmergencyWithdrawInstructionAsync({
      proposal: params.proposal,
      campaign: params.campaign,
      escrowTokenAccount,
      destination: params.treasury,
      amount: params.amount,
    }),
  ];
}

export async function transferAuthorityActions(params: {
  proposal: Address;
}): Promise<Instruction[]> {
  return [
    await getTransferAuthorityInstructionAsync({
      proposal: params.proposal,
    }),
  ];
}

export async function acceptAuthorityActions(params: {
  pendingAuthority: TransactionSigner;
}): Promise<Instruction[]> {
  return [
    await getAcceptAuthorityInstructionAsync({
      pendingAuthority: params.pendingAuthority,
    }),
  ];
}

export async function cancelProposalActions(params: {
  authority: TransactionSigner;
  proposal: Address;
}): Promise<Instruction[]> {
  return [
    await getCancelProposalInstructionAsync({
      authority: params.authority,
      proposal: params.proposal,
    }),
  ];
}

export async function claimRefundActions(params: {
  donor: TransactionSigner;
  campaign: Address;
  stablecoinMint: Address;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [escrowTokenAccount] = await findAta(params.campaign, params.stablecoinMint);
  const [donorTokenAccount] = await findAta(params.donor.address, params.stablecoinMint);
  return [
    await getClaimRefundInstructionAsync({
      donor: params.donor,
      campaign: params.campaign,
      escrowTokenAccount,
      donorTokenAccount,
    }),
  ];
}

export async function unlockVotesActions(params: {
  rpc: SolanaClient["rpc"];
  voter: TransactionSigner;
  governanceMint: Address;
  proposal: Address;
}): Promise<Instruction[]> {
  const { findAta } = await import("./pdas");
  const [voterTokenAccount] = await findAta(params.voter.address, params.governanceMint);
  return [
    ...(await ensureAta(params.rpc, params.voter, params.voter.address, params.governanceMint)),
    await getUnlockVotesInstructionAsync({
      voter: params.voter,
      governanceMint: params.governanceMint,
      proposal: params.proposal,
      voterTokenAccount,
    }),
  ];
}

export async function setPausedActions(params: {
  authority: TransactionSigner;
  paused: boolean;
}): Promise<Instruction[]> {
  return [
    await getSetPausedInstructionAsync({
      authority: params.authority,
      paused: params.paused,
    }),
  ];
}

export async function proposeMilestoneActions(params: {
  creator: TransactionSigner;
  verifier: TransactionSigner;
  campaign: Address;
  milestoneId: bigint;
  proofCid: string;
  amount: bigint;
}): Promise<Instruction[]> {
  const [milestone] = await findMilestonePda(params.campaign, params.milestoneId);
  return [
    await getProposeMilestoneInstructionAsync({
      creator: params.creator,
      verifier: params.verifier,
      campaign: params.campaign,
      milestone,
      proofCid: params.proofCid,
      amount: params.amount,
    }),
  ];
}

export { RENT_ADDRESS, SYSTEM_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS };

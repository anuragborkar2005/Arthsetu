import {
  getAddressEncoder,
  getBytesEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
  type Address,
  type ProgramDerivedAddress,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  FYDAO_PROGRAM_ADDRESS,
  MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "./constants";

function bytes(seed: string) {
  return getBytesEncoder().encode(new TextEncoder().encode(seed));
}

function u64(value: bigint) {
  return getU64Encoder().encode(value);
}

/** PDA: ["campaign", creator, campaign_id] */
export async function findCampaignPda(
  creator: Address,
  campaignId: bigint,
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: FYDAO_PROGRAM_ADDRESS,
    seeds: [bytes("campaign"), getAddressEncoder().encode(creator), u64(campaignId)],
  });
}

/** PDA: ["proposal", proposal_id] */
export async function findProposalPda(
  proposalId: bigint,
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: FYDAO_PROGRAM_ADDRESS,
    seeds: [bytes("proposal"), u64(proposalId)],
  });
}

/** PDA: ["milestone", campaign, milestone_id] */
export async function findMilestonePda(
  campaign: Address,
  milestoneId: bigint,
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: FYDAO_PROGRAM_ADDRESS,
    seeds: [bytes("milestone"), getAddressEncoder().encode(campaign), u64(milestoneId)],
  });
}

/** Metaplex metadata PDA: ["metadata", MPL, mint] */
export async function findMetadataPda(
  mint: Address,
): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: MPL_TOKEN_METADATA_PROGRAM_ADDRESS,
    seeds: [
      bytes("metadata"),
      getAddressEncoder().encode(MPL_TOKEN_METADATA_PROGRAM_ADDRESS),
      getAddressEncoder().encode(mint),
    ],
  });
}

/** Associated token account for `owner` on `mint`. */
export async function findAta(
  owner: Address,
  mint: Address,
): Promise<ProgramDerivedAddress> {
  return findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
}

export {
  findDaoConfigPda,
  findDonationRecordPda,
  findGovTokenStatePda,
  findMintAuthorityPdaPda,
  findVoteEscrowPda,
  findVoteRecordPda,
} from "../../generated/fydao/pdas";

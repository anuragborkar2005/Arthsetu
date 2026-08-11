import type {
  Address,
  Account,
  Base64EncodedBytes,
  EncodedAccount,
  Lamports,
} from "@solana/kit";
import {
  decodeCampaign,
  decodeDonationRecord,
  decodeMilestone,
  decodeProposal,
  decodeVoteRecord,
  fetchMaybeCampaign,
  fetchMaybeDaoConfig,
  fetchMaybeDonationRecord,
  fetchMaybeGovernanceTokenState,
  fetchMaybeProposal,
  fetchMaybeVoteRecord,
  type Campaign,
  type DaoConfig,
  type DonationRecord,
  type GovernanceTokenState,
  type Milestone,
  type Proposal,
  type VoteRecord,
} from "../../generated/fydao/accounts";
import {
  CAMPAIGN_DISCRIMINATOR,
  DONATION_RECORD_DISCRIMINATOR,
  MILESTONE_DISCRIMINATOR,
  PROPOSAL_DISCRIMINATOR,
  VOTE_RECORD_DISCRIMINATOR,
} from "../../generated/fydao/accounts";
import { FYDAO_PROGRAM_ADDRESS } from "../../generated/fydao/programs";
import type { SolanaClient } from "../solana-client";

type Rpc = SolanaClient["rpc"];

function base64ToBytes(data: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(data, "base64"));
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function memcmpFilter(discriminator: Uint8Array) {
  const base64 = (typeof Buffer !== "undefined"
    ? Buffer.from(discriminator).toString("base64")
    : btoa(String.fromCharCode(...discriminator))) as Base64EncodedBytes;
  return {
    memcmp: { offset: 0n, bytes: base64, encoding: "base64" as const },
  };
}

async function listAccounts<TData extends object>(
  rpc: Rpc,
  discriminator: Uint8Array,
  decode: (account: EncodedAccount) => Account<TData>,
): Promise<Array<{ address: Address; account: TData }>> {
  const accounts = await rpc
    .getProgramAccounts(FYDAO_PROGRAM_ADDRESS, {
      encoding: "base64",
      dataSlice: { offset: 0, length: 2048 },
      filters: [memcmpFilter(discriminator)],
    })
    .send();
  return accounts.map(({ pubkey, account }) => {
    const data = base64ToBytes(account.data[0]);
    const decoded = decode({
      address: pubkey as Address,
      data,
      executable: account.executable,
      lamports: account.lamports as Lamports,
      programAddress: FYDAO_PROGRAM_ADDRESS,
      space: BigInt(data.length),
    });
    return { address: pubkey as Address, account: decoded.data };
  });
}

export async function fetchDaoConfig(rpc: Rpc) {
  const { findDaoConfigPda } = await import("./pdas");
  const [address] = await findDaoConfigPda();
  const result = await fetchMaybeDaoConfig(rpc, address);
  return result && result.exists ? result.data : null;
}

export async function fetchGovernanceTokenState(rpc: Rpc) {
  const { findGovTokenStatePda } = await import("./pdas");
  const [address] = await findGovTokenStatePda();
  const result = await fetchMaybeGovernanceTokenState(rpc, address);
  return result && result.exists ? result.data : null;
}

export async function fetchCampaign(rpc: Rpc, address: Address) {
  const result = await fetchMaybeCampaign(rpc, address);
  return result && result.exists ? result.data : null;
}

export async function fetchProposal(rpc: Rpc, address: Address) {
  const result = await fetchMaybeProposal(rpc, address);
  return result && result.exists ? result.data : null;
}

export async function listCampaigns(rpc: Rpc) {
  return listAccounts<Campaign>(rpc, CAMPAIGN_DISCRIMINATOR, decodeCampaign);
}

export async function listProposals(rpc: Rpc) {
  return listAccounts<Proposal>(rpc, PROPOSAL_DISCRIMINATOR, decodeProposal);
}

export async function listMilestones(rpc: Rpc) {
  return listAccounts<Milestone>(rpc, MILESTONE_DISCRIMINATOR, decodeMilestone);
}

export async function listDonationRecords(rpc: Rpc) {
  return listAccounts<DonationRecord>(
    rpc,
    DONATION_RECORD_DISCRIMINATOR,
    decodeDonationRecord,
  );
}

export async function listVoteRecords(rpc: Rpc) {
  return listAccounts<VoteRecord>(rpc, VOTE_RECORD_DISCRIMINATOR, decodeVoteRecord);
}

export async function fetchDonationRecord(rpc: Rpc, address: Address) {
  const result = await fetchMaybeDonationRecord(rpc, address);
  return result && result.exists ? result.data : null;
}

export async function fetchVoteRecord(rpc: Rpc, address: Address) {
  const result = await fetchMaybeVoteRecord(rpc, address);
  return result && result.exists ? result.data : null;
}

export type DaoConfigAccount = NonNullable<Awaited<ReturnType<typeof fetchDaoConfig>>>;
export type GovernanceTokenStateAccount = NonNullable<
  Awaited<ReturnType<typeof fetchGovernanceTokenState>>
>;
export { type DaoConfig, type GovernanceTokenState, type Proposal };

"use client";

import useSWR, { useSWRConfig } from "swr";
import { useCallback } from "react";
import { toast } from "sonner";
import type { Address, Instruction } from "@solana/kit";
import { useCluster } from "../../components/cluster-context";
import { useSolanaClient } from "../solana-client-context";
import { useWallet } from "../wallet/context";
import { useSendTransaction } from "./use-send-transaction";
import {
  fetchDaoConfig,
  fetchGovernanceTokenState,
  fetchVoteRecord,
  listCampaigns,
  listDonationRecords,
  listMilestones,
  listProposals,
  listVoteRecords,
} from "../fydao/accounts";
import { getMintInfo, getTokenAccountBalance, getTokenAccountBalanceByAddress } from "../fydao/mints";
import { friendlyError } from "../fydao/errors";

const HOUR = 60 * 60 * 1000;

export function useDaoConfig() {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    ["fydao", cluster, "daoConfig"] as const,
    () => fetchDaoConfig(rpc),
    { refreshInterval: HOUR, revalidateOnFocus: true },
  );
}

export function useGovernanceTokenState() {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    ["fydao", cluster, "govTokenState"] as const,
    () => fetchGovernanceTokenState(rpc),
    { refreshInterval: HOUR, revalidateOnFocus: true },
  );
}

export function useCampaigns() {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    ["fydao", cluster, "campaigns"] as const,
    () => listCampaigns(rpc),
    { refreshInterval: HOUR, revalidateOnFocus: true },
  );
}

export function useProposals() {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    ["fydao", cluster, "proposals"] as const,
    () => listProposals(rpc),
    { refreshInterval: HOUR, revalidateOnFocus: true },
  );
}

export function useMilestones() {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    ["fydao", cluster, "milestones"] as const,
    () => listMilestones(rpc),
    { refreshInterval: HOUR, revalidateOnFocus: true },
  );
}

export function useDonationRecords() {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    ["fydao", cluster, "donations"] as const,
    () => listDonationRecords(rpc),
    { refreshInterval: HOUR, revalidateOnFocus: true },
  );
}

export function useVoteRecords() {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    ["fydao", cluster, "votes"] as const,
    () => listVoteRecords(rpc),
    { refreshInterval: HOUR, revalidateOnFocus: true },
  );
}

export function useVoteRecord(
  proposal?: Address | null,
  voter?: Address | null,
) {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  const key =
    proposal && voter
      ? (["fydao", cluster, "voteRecord", proposal, voter] as const)
      : null;
  return useSWR(
    key,
    async () => {
      const { findVoteRecordPda } = await import("../fydao/pdas");
      const [address] = await findVoteRecordPda({
        proposal: proposal as Address,
        voter: voter as Address,
      });
      return fetchVoteRecord(rpc, address);
    },
    { refreshInterval: 30_000 },
  );
}

export function useMintInfo(mint?: Address | null) {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  return useSWR(
    mint ? (["fydao", cluster, "mint", mint] as const) : null,
    () => getMintInfo(rpc, mint as Address),
    { refreshInterval: HOUR },
  );
}

export function useAccountBalance(account?: Address | null) {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  const key = account ? (["fydao", cluster, "accountBalance", account] as const) : null;
  return useSWR(key, () => getTokenAccountBalanceByAddress(rpc, account as Address), {
    refreshInterval: 30_000,
  });
}

export function useTokenBalance(owner?: Address | null, mint?: Address | null) {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  const key = owner && mint ? (["fydao", cluster, "balance", owner, mint] as const) : null;
  return useSWR(key, () => getTokenAccountBalance(rpc, owner as Address, mint as Address), {
    refreshInterval: 30_000,
  });
}

/** Combined DAO data used by the overview + admin panels. */
export function useDaoData() {
  const { data: daoConfig, isLoading: daoConfigLoading } = useDaoConfig();
  const { data: govTokenState, isLoading: govTokenStateLoading } =
    useGovernanceTokenState();
  const mint = daoConfig?.governanceMint;
  const { data: governanceMint } = useMintInfo(mint);

  const treasuryBalance = useAccountBalance(daoConfig?.treasury);

  return {
    daoConfig,
    govTokenState,
    governanceMint,
    treasuryBalance: treasuryBalance.data,
    daoConfigLoading,
    govTokenStateLoading,
  };
}

/** Wraps the transaction sender with toasts and reloads fydao data. */
export function useFydaoTx() {
  const { send, isSending } = useSendTransaction();
  const { mutate } = useSWRConfig();

  const run = useCallback(
    async (name: string, build: () => Promise<Instruction[]>): Promise<string> => {
      const loading = toast.loading(name);
      try {
        const instructions = await build();
        const signature = await send({ instructions });
        toast.success(`${name} confirmed`, {
          id: loading,
          description: signature.slice(0, 8) + "...",
        });
        mutate((key) => Array.isArray(key) && key[0] === "fydao");
        return signature;
      } catch (err) {
        toast.error(friendlyError(err), { id: loading });
        throw err;
      }
    },
    [send, mutate],
  );

  return { run, isSending };
}

export function useFydaoWallet() {
  const { wallet, signer, status } = useWallet();
  return {
    address: wallet?.account.address,
    signer,
    status,
  };
}

export function useSolBalance(address?: Address | null) {
  const { cluster } = useCluster();
  const { rpc } = useSolanaClient();
  const key = address ? (["solana", cluster, "solBalance", address] as const) : null;
  return useSWR(
    key,
    async () => {
      try {
        const { value } = await rpc.getBalance(address as Address).send();
        return value;
      } catch {
        return 0n;
      }
    },
    { refreshInterval: 10_000 }
  );
}

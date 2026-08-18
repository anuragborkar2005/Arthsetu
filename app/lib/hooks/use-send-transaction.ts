"use client";

import { useState, useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  appendTransactionMessageInstructions,
  type Instruction,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { createClient } from "@solana/kit-client-rpc";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

/**
 * Fixed compute unit limit attached to every transaction. Deliberately set
 * below `MAX_COMPUTE_UNIT_LIMIT` so the RPC executor keeps it as-is (a value
 * of 0 or the max is treated as "needs estimation" and gets replaced), while
 * leaving ample headroom for governance instructions. Preflight validates it.
 */
const COMPUTE_UNIT_LIMIT = 1_000_000;

export function useSendTransaction() {
  const { signer } = useWallet();
  const { cluster } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);

  const txClient = useMemo(
    () =>
      signer
        ? createClient({
            url: getClusterUrl(cluster),
            rpcSubscriptionsConfig: getClusterWsConfig(cluster),
            payer: signer,
          })
        : null,
    [cluster, signer]
  );

  const send = useCallback(
    async ({ instructions }: { instructions: readonly Instruction[] }) => {
      if (!txClient || !signer) throw new Error("Wallet not connected");

      setIsSending(true);
      try {
        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (tx) => setTransactionMessageFeePayerSigner(signer, tx),
          (tx) =>
            appendTransactionMessageInstructions(
              [
                getSetComputeUnitLimitInstruction({
                  units: COMPUTE_UNIT_LIMIT,
                }),
                ...instructions,
              ],
              tx
            )
        );
        const result = await txClient.sendTransaction(message);
        mutate((key: unknown) => Array.isArray(key) && key[0] === "balance");
        return result.context.signature;
      } finally {
        setIsSending(false);
      }
    },
    [txClient, signer, mutate]
  );

  return { send, isSending };
}

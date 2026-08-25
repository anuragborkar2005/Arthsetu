"use client";

import useSWR from "swr";
import { fetchMetadataByCid, type CampaignMetadata } from "../ipfs";

export function useCampaignMetadata(cid?: string | null) {
  const cleanCid = cid?.replace(/^ipfs:\/\//, "").trim();

  return useSWR(
    cleanCid ? ["arthasetu", "ipfs", cleanCid] as const : null,
    () => fetchMetadataByCid<CampaignMetadata>(cleanCid!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    }
  );
}

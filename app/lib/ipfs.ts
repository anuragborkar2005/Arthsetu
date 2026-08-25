/**
 * IPFS & Pinata Decentralized Metadata Service for Arthasetu (fydao)
 * Handles uploading raw documents and structured JSON metadata to Pinata IPFS
 * with deterministic offline fallback and multi-gateway resolution.
 */

import type { AiAuditReport, DocumentAttachment } from "./ai-audit";

export interface CampaignMilestonePlan {
  id: number;
  title: string;
  description: string;
  targetAmountUsdc: string;
  estimatedDurationDays?: number;
  deliverableCriteria?: string[];
}

export interface CampaignMetadata {
  version: "1.0.0" | "1.1.0";
  title: string;
  tagline: string;
  category: string;
  description: string; // Markdown story
  logoUrl?: string;
  bannerUrl?: string;
  websiteUrl?: string;
  twitterUrl?: string;
  githubUrl?: string;
  contactEmail?: string;
  targetFundingUsdc: string;
  plannedMilestones: CampaignMilestonePlan[];
  documents?: DocumentAttachment[];
  aiAudit?: AiAuditReport;
  createdAt: number;
  creatorAddress: string;
  verifierAddress: string;
}

export interface MilestoneProofMetadata {
  version: "1.0.0" | "1.1.0";
  campaignId: string;
  milestoneId: string;
  title: string;
  description: string;
  evidenceLinks: Array<{ label: string; url: string }>;
  gitCommit?: string;
  liveUrl?: string;
  testReportUrl?: string;
  deliverableFiles?: Array<{ filename: string; size: number; sha256: string; ipfsCid?: string; ipfsUrl?: string }>;
  submittedAt: number;
  submittedBy: string;
}

const IPFS_GATEWAYS = [
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
];

const LOCAL_STORAGE_PREFIX = "arthasetu:ipfs:";
const MEMORY_CACHE = new Map<string, unknown>();

/**
 * Encodes a byte array to base32 (RFC 4648, lower case) for standard CIDv1 simulation
 */
function toBase32(bytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Computes a deterministic mock CIDv1 (bafy...) from string payload using browser WebCrypto
 */
export async function computeContentCid(jsonString: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonString);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);
    const header = new Uint8Array([0x01, 0x55, 0x12, 0x20]);
    const combined = new Uint8Array(header.length + hashArray.length);
    combined.set(header, 0);
    combined.set(hashArray, header.length);
    return "bafy" + toBase32(combined);
  }
  // Fallback simple hash
  let hash = 0;
  for (let i = 0; i < jsonString.length; i++) {
    hash = (hash << 5) - hash + jsonString.charCodeAt(i);
    hash |= 0;
  }
  return `bafykbzace${Math.abs(hash).toString(36)}${Date.now().toString(36)}`;
}

/**
 * Uploads a raw document file (PDF, DOCX, CSV, Image) to Pinata IPFS.
 */
export async function uploadDocumentToPinata(
  file: File | Blob,
  fileName?: string,
  category?: string
): Promise<{ cid: string; uri: string; gatewayUrl: string; isRealPinata: boolean }> {
  const resolvedName = fileName || (file instanceof File ? file.name : "document");

  try {
    const formData = new FormData();
    formData.append("file", file, resolvedName);
    if (category) formData.append("type", category);
    formData.append("name", resolvedName);

    const res = await fetch("/api/pinata/upload", {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return {
        cid: data.cid,
        uri: data.uri || `ipfs://${data.cid}`,
        gatewayUrl: data.gatewayUrl || `https://gateway.pinata.cloud/ipfs/${data.cid}`,
        isRealPinata: Boolean(data.isRealPinata),
      };
    }
  } catch (err) {
    console.warn("Pinata upload route failed, falling back to local content addressing:", err);
  }

  // Fallback client-side content addressing
  const arrayBuffer = await file.arrayBuffer();
  let hashStr = "";
  if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
    const digest = await window.crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = new Uint8Array(digest);
    const header = new Uint8Array([0x01, 0x55, 0x12, 0x20]);
    const combined = new Uint8Array(header.length + hashArray.length);
    combined.set(header, 0);
    combined.set(hashArray, header.length);
    hashStr = "bafy" + toBase32(combined);
  } else {
    hashStr = "bafykbzace" + Date.now().toString(36);
  }

  return {
    cid: hashStr,
    uri: `ipfs://${hashStr}`,
    gatewayUrl: `https://ipfs.io/ipfs/${hashStr}`,
    isRealPinata: false,
  };
}

/**
 * Uploads structured Campaign Metadata to Pinata IPFS.
 */
export async function uploadCampaignMetadata(
  metadata: CampaignMetadata
): Promise<{ cid: string; uri: string; gatewayUrl: string; isRealPinata: boolean }> {
  const jsonString = JSON.stringify(metadata, null, 2);

  try {
    const res = await fetch("/api/pinata/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: metadata,
        name: `campaign-${metadata.title.toLowerCase().replace(/\s+/g, "-")}.json`,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const cid = data.cid;
      MEMORY_CACHE.set(cid, metadata);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, jsonString);
        } catch {
          // ignore
        }
      }
      return {
        cid,
        uri: `ipfs://${cid}`,
        gatewayUrl: data.gatewayUrl || `https://gateway.pinata.cloud/ipfs/${cid}`,
        isRealPinata: Boolean(data.isRealPinata),
      };
    }
  } catch (err) {
    console.warn("Pinata JSON upload failed, using fallback:", err);
  }

  // Fallback
  const cid = await computeContentCid(jsonString);
  MEMORY_CACHE.set(cid, metadata);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, jsonString);
    } catch {
      // ignore
    }
  }

  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    isRealPinata: false,
  };
}

/**
 * Uploads structured Milestone Proof Metadata to Pinata IPFS.
 */
export async function uploadMilestoneProofMetadata(
  metadata: MilestoneProofMetadata
): Promise<{ cid: string; uri: string; gatewayUrl: string; isRealPinata: boolean }> {
  const jsonString = JSON.stringify(metadata, null, 2);

  try {
    const res = await fetch("/api/pinata/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: metadata,
        name: `milestone-proof-c${metadata.campaignId}-m${metadata.milestoneId}.json`,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const cid = data.cid;
      MEMORY_CACHE.set(cid, metadata);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, jsonString);
        } catch {
          // ignore
        }
      }
      return {
        cid,
        uri: `ipfs://${cid}`,
        gatewayUrl: data.gatewayUrl || `https://gateway.pinata.cloud/ipfs/${cid}`,
        isRealPinata: Boolean(data.isRealPinata),
      };
    }
  } catch (err) {
    console.warn("Pinata milestone upload failed, using fallback:", err);
  }

  const cid = await computeContentCid(jsonString);
  MEMORY_CACHE.set(cid, metadata);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, jsonString);
    } catch {
      // ignore
    }
  }
  return {
    cid,
    uri: `ipfs://${cid}`,
    gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
    isRealPinata: false,
  };
}

/**
 * Fetches and parses metadata from IPFS or local cache by CID or ipfs:// URI
 */
export async function fetchMetadataByCid<T = CampaignMetadata>(
  cidOrUri: string,
  timeoutMs = 4000
): Promise<T | null> {
  if (!cidOrUri || typeof cidOrUri !== "string") return null;

  const cid = cidOrUri.replace(/^ipfs:\/\//, "").trim();
  if (!cid) return null;

  // 1. Check in-memory cache
  if (MEMORY_CACHE.has(cid)) {
    return MEMORY_CACHE.get(cid) as T;
  }

  // 2. Check local storage
  if (typeof window !== "undefined") {
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_PREFIX + cid);
      if (local) {
        const parsed = JSON.parse(local);
        MEMORY_CACHE.set(cid, parsed);
        return parsed as T;
      }
    } catch {
      // ignore JSON parse error
    }
  }

  // 3. Multi-gateway fetch
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const normalizedGateway = gateway.endsWith("/") ? gateway : `${gateway}/`;
      const url = `${normalizedGateway}${cid}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as T;
        MEMORY_CACHE.set(cid, data);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, JSON.stringify(data));
          } catch {
            // ignore
          }
        }
        return data;
      }
    } catch {
      // try next gateway
    }
  }

  return null;
}

/**
 * Resolves an ipfs:// or http:// URL to an HTTPS gateway URL for images and documents.
 */
export function resolveIpfsUrl(urlOrCid?: string | null): string {
  if (!urlOrCid) return "";
  if (urlOrCid.startsWith("http://") || urlOrCid.startsWith("https://") || urlOrCid.startsWith("data:")) {
    return urlOrCid;
  }
  const cleanCid = urlOrCid.replace(/^ipfs:\/\//, "").trim();
  const gatewayBase = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
  const normalizedGateway = gatewayBase.endsWith("/") ? gatewayBase : `${gatewayBase}/`;
  return `${normalizedGateway}${cleanCid}`;
}

export const CAMPAIGN_CATEGORIES = [
  { id: "technology", label: "Technology & Software" },
  { id: "defi", label: "DeFi & Financial Infrastructure" },
  { id: "community", label: "Community & Education" },
  { id: "climate", label: "Climate & Public Goods" },
  { id: "gaming", label: "Gaming & Metaverse" },
  { id: "arts", label: "Art & Media" },
] as const;

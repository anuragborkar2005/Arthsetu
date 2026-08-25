/**
 * IPFS & Decentralized Metadata Service for Arthasetu (fydao)
 * Handles uploading and resolving structured Campaign & Milestone Proof metadata
 * with multi-gateway fallback and local cache.
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
  deliverableFileHashes?: Array<{ filename: string; sha256: string; ipfsCid?: string }>;
  submittedAt: number;
  submittedBy: string;
}

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
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
    // CIDv1 prefix simulation: 0x01 (CIDv1), 0x70 (dag-pb/json), 0x12 (sha2-256), 0x20 (32 bytes)
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
 * Uploads campaign metadata.
 * Uses Pinata API if NEXT_PUBLIC_PINATA_JWT is present in environment,
 * otherwise stores in localStorage + memory cache and returns a content-addressed CIDv1.
 */
export async function uploadCampaignMetadata(
  metadata: CampaignMetadata
): Promise<{ cid: string; uri: string }> {
  const jsonString = JSON.stringify(metadata, null, 2);
  const pinataJwt = process.env.NEXT_PUBLIC_PINATA_JWT;

  if (pinataJwt) {
    try {
      const blob = new Blob([jsonString], { type: "application/json" });
      const formData = new FormData();
      formData.append("file", blob, `campaign-${metadata.title.toLowerCase().replace(/\s+/g, "-")}.json`);

      const pinataMetadata = JSON.stringify({
        name: `arthasetu-campaign-${metadata.title}`,
        keyvalues: {
          type: "campaign_metadata",
          creator: metadata.creatorAddress,
        },
      });
      formData.append("pinataMetadata", pinataMetadata);

      const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${pinataJwt}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const cid = data.IpfsHash;
        MEMORY_CACHE.set(cid, metadata);
        if (typeof window !== "undefined") {
          localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, jsonString);
        }
        return { cid, uri: `ipfs://${cid}` };
      }
    } catch (err) {
      console.warn("Pinata upload failed, falling back to local content addressing:", err);
    }
  }

  // Fallback to local content addressing
  const cid = await computeContentCid(jsonString);
  MEMORY_CACHE.set(cid, metadata);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, jsonString);
    } catch {
      // quota exceeded fallback
    }
  }

  return { cid, uri: `ipfs://${cid}` };
}

/**
 * Uploads milestone proof metadata.
 */
export async function uploadMilestoneProofMetadata(
  metadata: MilestoneProofMetadata
): Promise<{ cid: string; uri: string }> {
  const jsonString = JSON.stringify(metadata, null, 2);
  const cid = await computeContentCid(jsonString);
  MEMORY_CACHE.set(cid, metadata);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, jsonString);
    } catch {
      // ignore
    }
  }
  return { cid, uri: `ipfs://${cid}` };
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
      // ignore
    }
  }

  // 3. Query public IPFS gateways with timeout race
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${gateway}${cid}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      clearTimeout(timer);

      if (res.ok) {
        const parsed = await res.json();
        MEMORY_CACHE.set(cid, parsed);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, JSON.stringify(parsed));
          } catch {
            // ignore
          }
        }
        return parsed as T;
      }
    } catch {
      // try next gateway
    }
  }

  return null;
}

/**
 * Resolves IPFS protocol links to HTTP gateway URLs for images and media
 */
export function resolveIpfsUrl(urlOrCid?: string | null): string {
  if (!urlOrCid) return "";
  if (urlOrCid.startsWith("http://") || urlOrCid.startsWith("https://") || urlOrCid.startsWith("data:")) {
    return urlOrCid;
  }
  const cleanCid = urlOrCid.replace(/^ipfs:\/\//, "");
  return `https://cloudflare-ipfs.com/ipfs/${cleanCid}`;
}

export const CAMPAIGN_CATEGORIES = [
  { id: "technology", label: "Technology & Software", icon: "Code" },
  { id: "defi", label: "DeFi & Web3 Protocols", icon: "Coins" },
  { id: "climate", label: "Climate & Public Goods", icon: "Leaf" },
  { id: "education", label: "Education & Research", icon: "GraduationCap" },
  { id: "community", label: "Community & Social Impact", icon: "Users" },
  { id: "arts", label: "Arts, Media & Culture", icon: "Palette" },
  { id: "other", label: "Other Initiatives", icon: "Sparkles" },
] as const;

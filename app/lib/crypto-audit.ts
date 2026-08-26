/**
 * Cryptographic Audit Binding & Merkle Root Engine
 * Computes deterministic SHA-256 Merkle roots and canonical audit hashes for Arthasetu.
 */

// Helper to compute SHA-256 via browser WebCrypto (or Node.js crypto in server environment)
export async function sha256Bytes(
  data: Uint8Array | string
): Promise<Uint8Array> {
  const buffer =
    typeof data === "string" ? new TextEncoder().encode(data) : data;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      buffer as unknown as BufferSource
    );
    return new Uint8Array(digest);
  }

  // Node.js fallback for tests/server runtime
  try {
    const nodeCrypto = await import("crypto");
    const hash = nodeCrypto
      .createHash("sha256")
      .update(Buffer.from(buffer))
      .digest();
    return new Uint8Array(hash);
  } catch {
    throw new Error("SHA-256 crypto implementation unavailable.");
  }
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Computes a standard 32-byte Merkle Root over an array of document SHA-256 hex strings.
 * Deterministic and sorted so document upload ordering doesn't alter the root.
 */
export async function computeDocumentMerkleRoot(
  docHashes: string[]
): Promise<string> {
  if (!docHashes || docHashes.length === 0) {
    return "00".repeat(32);
  }

  // Convert hex strings to byte arrays
  let currentLevel: Uint8Array[] = docHashes.map((hex) => {
    const clean = hex.replace(/^0x/, "");
    const match = clean.match(/.{1,2}/g) || [];
    return new Uint8Array(match.map((byte) => parseInt(byte, 16)));
  });

  // Sort hashes for canonical deterministic tree construction
  currentLevel.sort((a, b) => {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  });

  while (currentLevel.length > 1) {
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Concatenate left and right nodes
        const combined = new Uint8Array(
          currentLevel[i].length + currentLevel[i + 1].length
        );
        combined.set(currentLevel[i], 0);
        combined.set(currentLevel[i + 1], currentLevel[i].length);
        nextLevel.push(await sha256Bytes(combined));
      } else {
        // Odd node is hashed with itself
        const combined = new Uint8Array(currentLevel[i].length * 2);
        combined.set(currentLevel[i], 0);
        combined.set(currentLevel[i], currentLevel[i].length);
        nextLevel.push(await sha256Bytes(combined));
      }
    }
    currentLevel = nextLevel;
  }

  return toHex(currentLevel[0]);
}

/**
 * Computes the Canonical SHA-256 Audit Binding Hash over deterministic report keys.
 * Binds Trust Score, Sub-Scores, Document Merkle Root, and Target Funding.
 */
export async function computeCanonicalAuditHash(params: {
  creatorPubkey?: string;
  targetFundingUsdc: string;
  trustScore: number;
  subScores: {
    authenticityScore: number;
    storyDocumentAlignmentScore: number;
    feasibilityScore: number;
    verifiabilityScore: number;
    aiContentScore: number;
  };
  docMerkleRoot: string;
  analyzedAt: number;
}): Promise<string> {
  // Deterministic JSON key ordering
  const canonicalPayload = JSON.stringify({
    creator: params.creatorPubkey || "unspecified",
    docMerkleRoot: params.docMerkleRoot,
    fundingUsdc: params.targetFundingUsdc,
    subScores: {
      ai: params.subScores.aiContentScore,
      auth: params.subScores.authenticityScore,
      feas: params.subScores.feasibilityScore,
      story: params.subScores.storyDocumentAlignmentScore,
      verif: params.subScores.verifiabilityScore,
    },
    timestamp: params.analyzedAt,
    trustScore: params.trustScore,
  });

  const hashBytes = await sha256Bytes(canonicalPayload);
  return `0x${toHex(hashBytes)}`;
}

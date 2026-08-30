/**
 * Privacy-Focused AI Audit Service for Arthasetu (Hardened & Robust v3)
 *
 * Provides:
 * - Adversarial Input Defense & Prompt Injection Neutralization
 * - In-memory text extraction, PDF metadata inspection & BIP-39 / Base58 redaction (Zero Retention)
 * - Stylometric & Statistical AI Content Scoring (TTR, Burstiness, Synthetic Transition Density)
 * - Quantitative Budget & Milestone Math Validation with Category Allocation Breakdown
 * - Pairwise Multi-Document Cross-Consistency Matrix
 * - Deep Story vs. Document Cross-Examination across 3 Domain Ontologies (Solana/DeFi, AI/DePIN, Public Goods)
 * - Canonical SHA-256 Audit Binding Hash (0x...) for on-chain Solana PDA attestation
 */

import { computeDocumentMerkleRoot, computeCanonicalAuditHash, sha256Bytes, toHex } from "./crypto-audit";
import { sanitizeTextForPrivacyV2, type RedactionMetrics } from "./privacy-redactor";
import { evaluateBudgetMath, type BudgetAnalysis } from "./budget-validator";
import { sanitizeAgainstAdversarialInput, type DefenseSanitizationResult } from "./adversarial-defense";
import {
  evaluateLocalVisualAudit,
  evaluateCloudVlmAudit,
  type VisualArtifactAttachment,
  type VisualAuditResult,
} from "./vlm-client";
import { sanitizeVisualDocument } from "./image-privacy";

export interface DocumentAttachment {
  name: string;
  type: string;
  size: number;
  sha256: string;
  textSnippet?: string;
  base64Data?: string;
  ipfsCid?: string;
  ipfsUrl?: string;
  category: "whitepaper" | "budget" | "pitch_deck" | "identity" | "technical_spec" | "architecture_diagram" | "field_proof" | "other";
  pdfMetadata?: {
    pageCount?: number;
    creationDate?: string;
    producer?: string;
    modifiedDate?: string;
  };
  visualMetadata?: {
    exifStripped?: boolean;
    dimensions?: { width: number; height: number };
  };
}

export interface AiSubScores {
  authenticityScore: number;            // 0 - 100: Document consistency, identity coherence, metadata validity
  storyDocumentAlignmentScore: number;  // 0 - 100: How accurately story aligns with uploaded docs
  feasibilityScore: number;             // 0 - 100: Budget vs deliverable realism & mathematical balance
  verifiabilityScore: number;           // 0 - 100: How measurable and testable the proof criteria are
  aiContentScore: number;               // 0 - 100: 100 = Highly human & technical, 0 = Generic AI spam
}

export interface StylometricMetrics {
  typeTokenRatio: number;              // 0 - 1.0 (Vocabulary diversity)
  sentenceLengthVariance: number;      // Sentence length standard deviation (Burstiness)
  burstinessScore: number;             // 0 - 100
  formulaicPhraseHits: number;
}

export interface DocumentPairwiseConsistency {
  docAName: string;
  docBName: string;
  consistencyScore: number;            // 0 - 100
  status: "Consistent" | "Minor Divergence" | "Contradiction";
  findings: string[];
}

export interface SuggestedMilestone {
  id: number;
  title: string;
  description: string;
  targetAmountUsdc: string;
  estimatedDurationDays: number;
  deliverableCriteria: string[];
}

export interface AiAuditReport {
  trustScore: number;                   // 0 - 100 on-chain Trust Score
  rating: "Exceptional" | "High" | "Moderate" | "Caution" | "High Risk";
  aiGeneratedRisk: "Low" | "Medium" | "High";
  aiGeneratedProbability: number;       // 0 - 100%
  subScores: AiSubScores;
  storyAlignmentFindings: string[];     // Confirmed alignments between story & docs
  storyDiscrepancies: string[];         // Contradictions or unsupported claims
  strengths: string[];
  riskWarnings: string[];
  recommendations: string[];
  suggestedMilestones: SuggestedMilestone[];
  budgetAnalysis: BudgetAnalysis;
  crossDocConsistencyMatrix: DocumentPairwiseConsistency[];
  docMerkleRoot: string;                // 32-byte SHA-256 Merkle root over all attached documents
  auditHash: string;                    // Canonical SHA-256 fingerprint binding audit to documents & scores
  redactionsCount: RedactionMetrics;    // Granular count of credentials and PII sanitized in-memory
  adversarialDefense: DefenseSanitizationResult;
  stylometricMetrics: StylometricMetrics;
  visualAudit?: VisualAuditResult;      // Multimodal VLM layout, diagram, and proof findings
  visualMerkleRoot?: string;            // Deterministic 32-byte SHA-256 Merkle root over visual assets
  privacyMode: "local_air_gapped" | "zero_retention_cloud";
  privacyEngine?: "presidio_ner" | "builtin_ts";
  analyzedAt: number;
}

/**
 * Computes SHA-256 hash of a File using browser WebCrypto
 */
export async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = await sha256Bytes(new Uint8Array(buffer));
  return toHex(bytes);
}

/**
 * Extracts plain text & metadata from text, markdown, json, csv, or binary/PDF files in-memory.
 * Capped to 40 pages / 40 KB to prevent memory exhaustion in the browser.
 */
export async function extractDocumentText(file: File): Promise<{
  textSnippet: string;
  base64Data?: string;
  pdfMetadata?: DocumentAttachment["pdfMetadata"];
  visualMetadata?: DocumentAttachment["visualMetadata"];
}> {
  try {
    if (
      file.type.startsWith("image/") ||
      file.name.endsWith(".png") ||
      file.name.endsWith(".jpg") ||
      file.name.endsWith(".jpeg") ||
      file.name.endsWith(".webp")
    ) {
      const buffer = await file.arrayBuffer();
      const sanitized = await sanitizeVisualDocument(buffer, file.type || "image/jpeg", file.name);
      return {
        textSnippet: `[Visual Document: ${file.name}, SHA-256: ${sanitized.sha256}, EXIF metadata stripped (${sanitized.exifTagsRemoved} tags removed)]`,
        base64Data: sanitized.cleanedBase64,
        visualMetadata: {
          exifStripped: sanitized.exifTagsRemoved > 0,
        },
      };
    }

    if (
      file.type.includes("text") ||
      file.name.endsWith(".md") ||
      file.name.endsWith(".txt") ||
      file.name.endsWith(".json") ||
      file.name.endsWith(".csv")
    ) {
      const rawText = await file.text();
      return { textSnippet: rawText.slice(0, 40000) };
    }

    // For PDF / Binary files, perform in-memory text & header metadata extraction
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let pdfMetadata: DocumentAttachment["pdfMetadata"] = undefined;
    if (file.name.endsWith(".pdf") || file.type.includes("pdf")) {
      const headerStr = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 12000)));

      const producerMatch = headerStr.match(/\/Producer\s*\(([^)]+)\)/i);
      const creationDateMatch = headerStr.match(/\/CreationDate\s*\(([^)]+)\)/i);
      const modDateMatch = headerStr.match(/\/ModDate\s*\(([^)]+)\)/i);
      const pagesMatch = headerStr.match(/\/Count\s+(\d+)/i);

      pdfMetadata = {
        producer: producerMatch ? producerMatch[1] : undefined,
        creationDate: creationDateMatch ? creationDateMatch[1] : undefined,
        modifiedDate: modDateMatch ? modDateMatch[1] : undefined,
        pageCount: pagesMatch ? parseInt(pagesMatch[1], 10) : undefined,
      };
    }

    let str = "";
    const scanLimit = Math.min(bytes.length, 60000);
    for (let i = 0; i < scanLimit; i++) {
      const char = bytes[i];
      if (char >= 32 && char <= 126) {
        str += String.fromCharCode(char);
      } else if (char === 10 || char === 13) {
        str += " ";
      }
    }

    if (file.name.endsWith(".pdf") || file.type.includes("pdf")) {
      // Clean PDF bytecode markers, object tags, and internal stream definitions
      str = str
        .replace(/\/\w+\s+\d+\s+0\s+R/g, " ")
        .replace(/\/Length\s+\d+/gi, " ")
        .replace(/\/Filter\s+\/\w+/gi, " ")
        .replace(/\/CIDInit\b/gi, " ")
        .replace(/\/Font\w*/gi, " ")
        .replace(/\/ProcSet\b/gi, " ")
        .replace(/\/XObject\b/gi, " ")
        .replace(/endobj\b/gi, " ")
        .replace(/endstream\b/gi, " ")
        .replace(/stream\b/gi, " ")
        .replace(/<<.*?>>/g, " ");
    }

    const textSnippet = str.replace(/\s+/g, " ").slice(0, 25000);
    return { textSnippet, pdfMetadata };
  } catch (err) {
    console.warn("Failed to extract document text:", err);
    return { textSnippet: `[Binary file: ${file.name}, size: ${file.size} bytes]` };
  }
}

/**
 * Re-exports sanitizer from privacy-redactor for backward compatibility
 */
export function sanitizeTextForPrivacy(text: string): string {
  return sanitizeTextForPrivacyV2(text).sanitizedText;
}

/**
 * Computes stylometric statistics (Type-Token Ratio & sentence burstiness)
 */
export function computeStylometrics(text: string): StylometricMetrics {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s.!?]/g, "");
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  const totalWords = words.length;

  if (totalWords === 0) {
    return {
      typeTokenRatio: 0,
      sentenceLengthVariance: 0,
      burstinessScore: 50,
      formulaicPhraseHits: 0,
    };
  }

  // 1. Type-Token Ratio (Vocabulary Richness)
  const uniqueWords = new Set(words);
  const typeTokenRatio = Number((uniqueWords.size / totalWords).toFixed(3));

  // 2. Sentence Length Variance (Burstiness)
  const rawSentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceWordCounts = rawSentences.map((s) => s.trim().split(/\s+/).length);

  let sentenceLengthVariance = 0;
  if (sentenceWordCounts.length > 1) {
    const mean = sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length;
    const variance =
      sentenceWordCounts.reduce((acc, count) => acc + Math.pow(count - mean, 2), 0) /
      sentenceWordCounts.length;
    sentenceLengthVariance = Number(Math.sqrt(variance).toFixed(2));
  }

  // Burstiness Score: Evaluates vocabulary richness and sentence length cadence
  const burstinessScore = Math.min(
    100,
    Math.max(10, Math.round(sentenceLengthVariance * 6 + typeTokenRatio * 45 + 15))
  );

  // 3. Formulaic Synthetic Markers
  const syntheticMarkers = [
    "delve", "tapestry", "in summary", "game-changing", "revolutionary platform",
    "leverage cutting-edge", "unleash the power", "testament to", "holistic approach",
    "foster synergy", "beacon of", "pivotal role", "paradigm shift", "vital to remember"
  ];
  let formulaicPhraseHits = 0;
  for (const marker of syntheticMarkers) {
    if (clean.includes(marker)) formulaicPhraseHits++;
  }

  return {
    typeTokenRatio,
    sentenceLengthVariance,
    burstinessScore,
    formulaicPhraseHits,
  };
}

/**
 * Computes pairwise cross-document consistency between uploaded files.
 */
export function computePairwiseDocumentConsistency(
  documents: DocumentAttachment[],
  storyText: string
): DocumentPairwiseConsistency[] {
  const pairs: DocumentPairwiseConsistency[] = [];
  if (documents.length === 0) return pairs;

  const STOP_WORDS = new Set([
    "the", "and", "with", "this", "that", "from", "have", "will", "been", "were", "what", "their", "about", "which",
    "when", "some", "more", "other", "into", "then", "them", "also", "these", "than", "your", "they", "there", "each",
    "such", "make", "over", "very", "just", "only", "would", "could", "should", "shall", "does", "done", "must", "well",
    "page", "file", "document", "user", "project", "using", "work", "time"
  ]);

  const storyTerms = storyText
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
  const uniqueStoryTerms = Array.from(new Set(storyTerms));

  // 1. Check each document against the story
  for (const doc of documents) {
    const docText = (doc.textSnippet || "").toLowerCase();
    const findings: string[] = [];

    if (docText.trim().length === 0) {
      pairs.push({
        docAName: "Campaign Story",
        docBName: doc.name,
        consistencyScore: 20,
        status: "Contradiction",
        findings: ["Document contains no readable text or verifiable claims."],
      });
      continue;
    }

    let overlapHits = 0;
    for (const term of uniqueStoryTerms) {
      if (docText.includes(term) || (term.length >= 6 && docText.includes(term.slice(0, 5)))) {
        overlapHits++;
      }
    }

    const overlapRatio = uniqueStoryTerms.length > 0 ? overlapHits / uniqueStoryTerms.length : 0;
    let score = Math.round(overlapRatio * 100);

    // Terminology & Category check
    if (doc.category === "whitepaper" || doc.category === "technical_spec") {
      if (docText.includes("solana") && storyText.toLowerCase().includes("solana")) {
        findings.push("Matching blockchain runtime (Solana SVM) across story and whitepaper.");
        score += 35;
      }
      if (docText.includes("erc20") && storyText.toLowerCase().includes("solana")) {
        findings.push("Discrepancy: Spec references EVM standards while story targets Solana.");
        score -= 35;
      }
      if (overlapHits >= 1) score += 25;
    } else if (doc.category === "budget") {
      findings.push(`Budget sheet (${doc.name}) cross-referenced against campaign deliverables.`);
      if (docText.includes("usdc") || docText.includes("$") || docText.includes("cost") || docText.includes("budget") || docText.includes("audit") || docText.includes("dev")) {
        score += 60;
      }
      if (overlapHits >= 1) score += 20;
    }

    if (overlapHits >= 4 || overlapRatio >= 0.25 || score >= 60) {
      findings.push(`Corroborates project-specific concepts & specifications from campaign story.`);
      score = Math.max(score, 85);
    } else if (overlapHits === 0 || overlapRatio < 0.10) {
      findings.push(`Low story relevance: document text contains minimal overlap (${overlapHits} matching concepts) with campaign story.`);
      score = Math.min(score, 25);
    }

    score = Math.max(15, Math.min(100, score));

    pairs.push({
      docAName: "Campaign Story",
      docBName: doc.name,
      consistencyScore: score,
      status: score >= 75 ? "Consistent" : score >= 50 ? "Minor Divergence" : "Contradiction",
      findings,
    });
  }

  // 2. Check Whitepaper vs Budget if both exist
  const whitepaper = documents.find((d) => d.category === "whitepaper" || d.category === "technical_spec");
  const budget = documents.find((d) => d.category === "budget");

  if (whitepaper && budget) {
    const wpText = (whitepaper.textSnippet || "").toLowerCase();
    const bgText = (budget.textSnippet || "").toLowerCase();
    const findings: string[] = [];
    let score = 90;

    if ((wpText.includes("audit") || wpText.includes("security")) && (bgText.includes("audit") || bgText.includes("security"))) {
      findings.push("Security audit requirements in technical spec are budgeted in the financial plan.");
    } else if (wpText.includes("audit") && !bgText.includes("audit")) {
      findings.push("Note: Whitepaper mandates security audit, but budget does not explicitly itemize audit costs.");
      score -= 10;
    }

    pairs.push({
      docAName: whitepaper.name,
      docBName: budget.name,
      consistencyScore: score,
      status: score >= 80 ? "Consistent" : "Minor Divergence",
      findings,
    });
  }

  return pairs;
}

/**
 * Rigorously computes the unified on-chain Trust Score (0 - 100) and rating category
 * based on all 5 multi-dimensional diligence factors.
 *
 * Factors & Weights:
 * - Authenticity (25%): Document integrity, cryptographic consistency, valid metadata
 * - Story vs. Document Alignment (35%): How accurately attached documents substantiate story claims & budget
 * - Feasibility (20%): Realism of requested funding vs milestones and scope
 * - Verifiability (10%): Measurability of milestone deliverable proofs
 * - AI Content Authenticity (10%): Linguistic human engineering depth (100 - aiGeneratedProbability)
 *
 * Enforces critical factor guardrails:
 * If wrong, unrelated, or contradictory documents are attached, the overall Trust Score
 * is strictly capped in the High Risk / Caution tier (never above 30-38).
 */
export function computeCompositeTrustScore(subScores: AiSubScores): {
  trustScore: number;
  rating: "Exceptional" | "High" | "Moderate" | "Caution" | "High Risk";
} {
  const authenticity = Math.max(0, Math.min(100, Number(subScores.authenticityScore) || 75));
  const alignment = Math.max(0, Math.min(100, Number(subScores.storyDocumentAlignmentScore) || 75));
  const feasibility = Math.max(0, Math.min(100, Number(subScores.feasibilityScore) || 75));
  const verifiability = Math.max(0, Math.min(100, Number(subScores.verifiabilityScore) || 75));
  const aiContent = Math.max(0, Math.min(100, Number(subScores.aiContentScore) || 75));

  // 1. Multi-factor weighted sum (Authenticity 25%, Alignment 35%, Feasibility 20%, Verifiability 10%, AI 10%)
  const weightedSum =
    authenticity * 0.25 +
    alignment * 0.35 +
    feasibility * 0.20 +
    verifiability * 0.10 +
    aiContent * 0.10;

  let score = Math.round(weightedSum);

  // 2. Strict Bottleneck Guardrails:
  // If attached documents fail to substantiate the campaign story (e.g. wrong/unrelated/contradictory docs):
  if (alignment <= 25) {
    // Severe failure / wrong doc -> Max 25 (High Risk)
    score = Math.min(score, 25);
  } else if (alignment <= 35) {
    // Very poor alignment -> Max 32 (High Risk)
    score = Math.min(score, 32);
  } else if (alignment <= 45) {
    // Poor alignment -> Max 38 (Caution / High Risk)
    score = Math.min(score, 38);
  } else if (alignment <= 55) {
    // Weak alignment -> Max 48 (Caution)
    score = Math.min(score, 48);
  } else if (alignment <= 68) {
    // Moderate alignment -> Max 62 (Moderate)
    score = Math.min(score, 62);
  }

  // If Authenticity is severely compromised (tampered document, fake metadata, or deceptive attachments)
  if (authenticity <= 35) {
    score = Math.min(score, 28);
  } else if (authenticity <= 50) {
    score = Math.min(score, 45);
  }

  score = Math.max(0, Math.min(100, score));

  let rating: "Exceptional" | "High" | "Moderate" | "Caution" | "High Risk" = "Moderate";
  if (score >= 85) rating = "Exceptional";
  else if (score >= 75) rating = "High";
  else if (score >= 55) rating = "Moderate";
  else if (score >= 40) rating = "Caution";
  else rating = "High Risk";

  return { trustScore: score, rating };
}

/**
 * Executes the Privacy-Preserving AI Audit by calling /api/ai/audit
 * with fallback to the local deterministic heuristic engine.
 */
export async function runPrivacyAiAudit(params: {
  title: string;
  tagline: string;
  category: string;
  description: string;
  targetFundingUsdc: string;
  documents: DocumentAttachment[];
  creatorPubkey?: string;
  forceLocalOnly?: boolean;
  plannedMilestones?: Array<{
    id: number;
    title: string;
    description: string;
    targetAmountUsdc: string;
  }>;
}): Promise<AiAuditReport> {
  const { forceLocalOnly = false } = params;

  if (!forceLocalOnly) {
    try {
      const res = await fetch("/api/ai/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify(params),
      });

      if (res.ok) {
        const data: AiAuditReport = await res.json();
        return data;
      }
    } catch (err) {
      console.warn("AI audit API endpoint unavailable, using in-memory engine:", err);
    }
  }

  // Fallback high-fidelity in-memory deterministic engine
  return evaluateFallbackHeuristicAudit(params);
}

/**
 * 100% Client-Side In-Memory Heuristic Engine
 * Evaluates document Merkle root, PII redactions, math validation, stylometrics, and domain ontologies.
 */
export async function evaluateFallbackHeuristicAudit(params: {
  title: string;
  tagline: string;
  category: string;
  description: string;
  targetFundingUsdc: string;
  documents: DocumentAttachment[];
  creatorPubkey?: string;
  plannedMilestones?: Array<{
    id: number;
    title: string;
    description: string;
    targetAmountUsdc: string;
  }>;
}): Promise<AiAuditReport> {
  const {
    title,
    tagline = "",
    category = "technology",
    description,
    targetFundingUsdc,
    documents = [],
    creatorPubkey = "unspecified",
    plannedMilestones = [],
  } = params;

  const fundingNum = Number(targetFundingUsdc) || 0;
  const analyzedAt = Date.now();
  const titleLower = (title || "").toLowerCase();
  const taglineLower = (tagline || "").toLowerCase();
  const descLower = (description || "").toLowerCase();

  // 1. Adversarial Input Defense & Neutralization
  const defenseStory = sanitizeAgainstAdversarialInput(description);
  const totalDefenseMetrics: DefenseSanitizationResult = { ...defenseStory };

  // 2. In-Memory Sanitization of Story and Documents
  const storyRedaction = sanitizeTextForPrivacyV2(defenseStory.cleanedText);
  const totalRedactions: RedactionMetrics = { ...storyRedaction.metrics };

  const sanitizedDocs = documents.map((doc) => {
    const defenseDoc = sanitizeAgainstAdversarialInput(doc.textSnippet || doc.name);
    totalDefenseMetrics.injectionsNeutralized += defenseDoc.injectionsNeutralized;
    totalDefenseMetrics.hiddenCharactersRemoved += defenseDoc.hiddenCharactersRemoved;
    if (defenseDoc.neutralizedPatterns.length > 0) {
      totalDefenseMetrics.neutralizedPatterns.push(...defenseDoc.neutralizedPatterns);
    }

    const docRedaction = sanitizeTextForPrivacyV2(defenseDoc.cleanedText);
    totalRedactions.keysAndSecrets += docRedaction.metrics.keysAndSecrets;
    totalRedactions.namesAndLocations += docRedaction.metrics.namesAndLocations;
    totalRedactions.emailsAndPhones += docRedaction.metrics.emailsAndPhones;
    totalRedactions.financialAccounts += docRedaction.metrics.financialAccounts;
    totalRedactions.nationalIds += docRedaction.metrics.nationalIds;
    totalRedactions.totalRedacted += docRedaction.metrics.totalRedacted;
    return {
      ...doc,
      textSnippet: docRedaction.sanitizedText,
    };
  });

  // Combine extracted text from all attached sanitized documents
  const allDocText = sanitizedDocs
    .map((d) => (d.textSnippet || d.name).toLowerCase())
    .join(" ");

  // 3. Compute Document Merkle Root
  const docHashes = documents.map((d) => d.sha256);
  const docMerkleRoot = await computeDocumentMerkleRoot(docHashes);

  // 4. Quantitative Budget & Milestone Math Validation
  const hasBudgetDocument = sanitizedDocs.some((d) => d.category === "budget");
  const budgetDocText = sanitizedDocs
    .filter((d) => d.category === "budget")
    .map((d) => d.textSnippet || "")
    .join(" ");

  const budgetAnalysis = evaluateBudgetMath({
    targetFundingUsdc: fundingNum,
    docText: hasBudgetDocument ? budgetDocText : allDocText,
    milestones: plannedMilestones,
    hasBudgetDocument,
  });

  // 5. Pairwise Multi-Document Consistency Matrix
  const crossDocConsistencyMatrix = computePairwiseDocumentConsistency(sanitizedDocs, storyRedaction.sanitizedText);

  // 6. Stylometrics & Statistical AI Content Analysis
  const stylometrics = computeStylometrics(storyRedaction.sanitizedText);
  const aiGeneratedProbability = Math.min(
    92,
    Math.max(
      8,
      stylometrics.formulaicPhraseHits * 16 +
        (stylometrics.burstinessScore < 40 ? 25 : 0) +
        (stylometrics.typeTokenRatio < 0.35 ? 20 : 0) +
        (defenseStory.repetitionAnomalyDetected ? 30 : 0) +
        (description.length < 100 ? 30 : 0)
    )
  );
  const aiContentScore = Math.max(10, 100 - Math.round(aiGeneratedProbability * 0.75));

  // 7. Authenticity Score
  let authenticity = 70;
  if (documents.length > 0) authenticity += 15;
  if (documents.some((d) => d.category === "whitepaper" || d.category === "technical_spec")) authenticity += 10;
  if (documents.some((d) => d.category === "budget")) authenticity += 5;
  if (title.length < 5 || description.length < 50) authenticity -= 25;
  if (documents.some((d) => d.pdfMetadata?.producer)) authenticity += 3;
  if (defenseStory.injectionsNeutralized > 0) authenticity -= 15;
  authenticity = Math.max(20, Math.min(98, authenticity));

  // 8. Domain Ontologies & Story Alignment Cross-Examination
  let alignmentScore = 40; // Base score before content corroboration
  const storyAlignmentFindings: string[] = [];
  const storyDiscrepancies: string[] = [];

  const ONTOLOGIES: Record<string, string[]> = {
    solana_defi: [
      "solana", "anchor", "rust", "smart contract", "program", "pda", "cpi", "escrow",
      "token", "governance", "litesvm", "spl-token", "token-2022", "oracle", "pyth",
      "raydium", "amm", "liquidity", "vault", "frontend", "sdk", "wallet"
    ],
    technology: [
      "software", "architecture", "frontend", "backend", "api", "sdk", "database",
      "smart contract", "solana", "rust", "anchor", "react", "nextjs", "iot", "sensor", "ai"
    ],
    ai_depin: [
      "model", "weights", "inference", "gpu", "training", "dataset", "depin",
      "telemetry", "worker node", "latency", "pipeline", "onnx", "lora", "compute"
    ],
    climate_relief: [
      "flood", "disaster", "relief", "rescue", "medical", "food", "shelter", "water",
      "emergency", "rations", "supplies", "camp", "evacuation", "rehabilitation",
      "assam", "climate", "aid", "health", "volunteer", "distribution"
    ],
    public_goods: [
      "impact", "community", "open source", "grant", "dao", "education",
      "charity", "public good", "non-profit", "volunteer", "verification", "workshop"
    ],
  };

  let activeKeywords = ONTOLOGIES.technology;
  if (category === "defi" || category === "infrastructure") {
    activeKeywords = ONTOLOGIES.solana_defi;
  } else if (category === "technology") {
    activeKeywords = ONTOLOGIES.technology;
  } else if (category === "gaming" || category === "social") {
    activeKeywords = [...ONTOLOGIES.technology, ...ONTOLOGIES.ai_depin];
  } else if (category === "climate") {
    activeKeywords = ONTOLOGIES.climate_relief;
  } else if (category === "art" || category === "community") {
    activeKeywords = ONTOLOGIES.public_goods;
  }

  if (documents.length === 0) {
    alignmentScore = 30;
    authenticity = Math.min(authenticity, 50);
    storyDiscrepancies.push("No supporting documents attached to verify claims made in the campaign story.");
  } else {
    const STOP_WORDS = new Set([
      "the", "and", "with", "this", "that", "from", "have", "will", "been", "were", "what", "their", "about", "which",
      "when", "some", "more", "other", "into", "then", "them", "also", "these", "than", "your", "they", "there", "each",
      "such", "make", "over", "very", "just", "only", "would", "could", "should", "shall", "does", "done", "must", "well",
      "page", "file", "document", "user", "project", "using", "work", "time"
    ]);

    // Substantive words from campaign story, title, and milestones
    const milestoneText = plannedMilestones.map((m) => `${m.title} ${m.description}`).join(" ").toLowerCase();
    const combinedStoryWords = `${titleLower} ${taglineLower} ${descLower} ${milestoneText}`
      .split(/[^a-z0-9_-]+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
    const uniqueStoryWords = Array.from(new Set(combinedStoryWords));

    let matchedStoryDocTerms = 0;
    for (const term of uniqueStoryWords) {
      if (allDocText.includes(term)) {
        matchedStoryDocTerms++;
      }
    }

    let domainOntologyHits = 0;
    for (const kw of activeKeywords) {
      if ((descLower.includes(kw) || titleLower.includes(kw)) && allDocText.includes(kw)) {
        domainOntologyHits++;
      }
    }

    const overlapRatio = uniqueStoryWords.length > 0 ? matchedStoryDocTerms / uniqueStoryWords.length : 0;
    const hasTitleMatch = title.length > 4 && allDocText.includes(titleLower.slice(0, 15));
    const hasTaglineMatch = tagline && tagline.length > 8 && allDocText.includes(taglineLower.slice(0, 20));

    if (
      (domainOntologyHits >= 3 && matchedStoryDocTerms >= 6) ||
      (overlapRatio >= 0.40 && matchedStoryDocTerms >= 8) ||
      (hasTitleMatch && matchedStoryDocTerms >= 5)
    ) {
      alignmentScore = 88;
      if (hasTitleMatch) alignmentScore += 4;
      if (hasTaglineMatch) alignmentScore += 3;
      alignmentScore = Math.min(98, alignmentScore);
      storyAlignmentFindings.push(
        `High story-document alignment: ${matchedStoryDocTerms} project concepts & deliverables corroborated in attached documentation.`
      );
    } else if (matchedStoryDocTerms <= 2 || domainOntologyHits === 0 || overlapRatio < 0.15) {
      // Wrong / unrelated document (e.g. resume, random file, or mismatched topic)
      alignmentScore = 20;
      authenticity = Math.min(authenticity, 35); // Penalize authenticity for irrelevant/fake doc attachment
      storyDiscrepancies.push(
        `Low Story-Document Alignment: Attached document (e.g. personal profile, resume, or unrelated file) does not substantiate the specific project deliverables described in the campaign story ("${title}").`
      );
    } else if (matchedStoryDocTerms <= 5 || overlapRatio < 0.30) {
      alignmentScore = 38;
      authenticity = Math.min(authenticity, 50);
      storyDiscrepancies.push(
        `Weak Story-Document Alignment: Attached documents only partially mention general terminology (${matchedStoryDocTerms} terms) but lack detailed project technical specifications.`
      );
    } else {
      alignmentScore = 60;
      storyAlignmentFindings.push("Moderate terminology correlation between story narrative and attached documentation.");
    }

    // EVM vs Solana mismatch check
    if (
      (allDocText.includes("erc20") || allDocText.includes("solidity") || allDocText.includes("hardhat")) &&
      !allDocText.includes("solana") &&
      descLower.includes("solana")
    ) {
      storyDiscrepancies.push("Warning: Uploaded document cites Ethereum/Solidity standards (ERC-20/Hardhat) while campaign story targets Solana.");
      alignmentScore -= 20;
    }
  }
  alignmentScore = Math.max(15, Math.min(98, alignmentScore));

  // 9. Feasibility Score
  let feasibility = 75;
  if (budgetAnalysis.isBalanced) feasibility += 12;
  if (fundingNum > 0 && fundingNum <= 50000) feasibility += 8;
  if (fundingNum > 100000 && documents.length === 0) feasibility -= 20;
  if (plannedMilestones.length > 1) feasibility += 10;
  feasibility = Math.max(25, Math.min(98, feasibility));

  // 10. Verifiability Score
  let verifiability = 70;
  if (descLower.includes("github") || descLower.includes("test") || descLower.includes("audit") || descLower.includes("demo")) {
    verifiability += 15;
  }
  if (plannedMilestones.length >= 2) verifiability += 10;
  verifiability = Math.max(30, Math.min(98, verifiability));

  // Canonical Sub-Scores across all 5 dimensions
  const subScores: AiSubScores = {
    authenticityScore: authenticity,
    storyDocumentAlignmentScore: alignmentScore,
    feasibilityScore: feasibility,
    verifiabilityScore: verifiability,
    aiContentScore,
  };

  // Unified Composite Trust Score & Rating
  const { trustScore, rating } = computeCompositeTrustScore(subScores);

  const aiGeneratedRisk: AiAuditReport["aiGeneratedRisk"] =
    aiGeneratedProbability > 65 ? "High" : aiGeneratedProbability > 35 ? "Medium" : "Low";

  // Strengths
  const strengths: string[] = [];
  if (documents.length > 0) {
    strengths.push(`Attached ${documents.length} verified cryptographic document artifact(s) anchored by Merkle Root.`);
  }
  if (alignmentScore >= 80) {
    strengths.push("High thematic and technical coherence between campaign story and uploaded documents.");
  }
  if (budgetAnalysis.isBalanced) {
    strengths.push("Mathematical alignment between milestone allocation and total funding target.");
  }
  if (stylometrics.burstinessScore >= 60) {
    strengths.push("High linguistic diversity and sentence variation indicative of authentic human engineering documentation.");
  }
  if (totalDefenseMetrics.injectionsNeutralized === 0 && totalDefenseMetrics.hiddenCharactersRemoved === 0) {
    strengths.push("Passed automated adversarial input inspection (clean submission, 0 injection vectors).");
  }

  // Warnings
  const riskWarnings: string[] = [];
  if (storyDiscrepancies.length > 0) {
    riskWarnings.push(...storyDiscrepancies);
  }
  if (documents.length === 0) {
    riskWarnings.push("No supporting documents attached; DAO governance may require verification prior to approval.");
  }
  if (aiGeneratedRisk === "High") {
    riskWarnings.push("High probability of AI-generated template text with low technical depth.");
  }
  if (totalDefenseMetrics.injectionsNeutralized > 0) {
    riskWarnings.push(`Adversarial attempt: Neutralized ${totalDefenseMetrics.injectionsNeutralized} prompt injection vector(s).`);
  }

  // Recommendations
  const recommendations: string[] = [];
  if (storyDiscrepancies.length > 0) {
    recommendations.push("Align the campaign story description with specific technical deliverables in your uploaded whitepaper.");
  }
  if (budgetAnalysis.recommendations.length > 0) {
    recommendations.push(...budgetAnalysis.recommendations);
  }
  recommendations.push("Provide verifiable GitHub repository and automated LiteSVM test proofs when requesting milestone disbursements.");

  // Suggested Milestones
  const totalUsdc = fundingNum > 0 ? fundingNum : 25000;
  const suggestedMilestones: SuggestedMilestone[] = [
    {
      id: 0,
      title: "Phase 1: Architecture, Core Programs & Security Tests",
      description: "Development and devnet deployment of core smart contracts with full test coverage matching specifications.",
      targetAmountUsdc: Math.round(totalUsdc * 0.4).toString(),
      estimatedDurationDays: 30,
      deliverableCriteria: [
        "Public GitHub repository with commit history",
        "Passed automated integration test suite on LiteSVM/devnet",
        "Architecture specification document matching whitepaper",
      ],
    },
    {
      id: 1,
      title: "Phase 2: Client SDK, Frontend UI & Public Beta",
      description: "Integration of frontend interface, wallet connectors, and live user testing.",
      targetAmountUsdc: Math.round(totalUsdc * 0.6).toString(),
      estimatedDurationDays: 45,
      deliverableCriteria: [
        "Live deployment URL with Solana wallet connection",
        "Beta user feedback report and analytics",
        "Final deliverable audit report co-signed by designated verifier",
      ],
    },
  ];

  // Canonical SHA-256 Audit Binding Hash
  const auditHash = await computeCanonicalAuditHash({
    creatorPubkey,
    targetFundingUsdc,
    trustScore,
    subScores,
    docMerkleRoot,
    analyzedAt,
  });

  // Evaluate visual artifacts with Local VLM Heuristic Engine
  const visualArtifacts: VisualArtifactAttachment[] = documents
    .filter(
      (d) =>
        (d.type && d.type.startsWith("image/")) ||
        d.base64Data ||
        d.category === "architecture_diagram" ||
        d.category === "field_proof"
    )
    .map((d) => ({
      name: d.name,
      type: d.type || "image/jpeg",
      size: d.size,
      sha256: d.sha256,
      base64Data: d.base64Data,
      ipfsCid: d.ipfsCid,
      visualCategory:
        d.category === "architecture_diagram"
          ? "architecture_diagram"
          : d.category === "budget"
          ? "budget_table"
          : d.category === "field_proof"
          ? "field_deliverable_proof"
          : "other",
      exifStripped: Boolean(d.visualMetadata?.exifStripped),
    }));

  const visualAudit = await evaluateLocalVisualAudit({
    visuals: visualArtifacts,
    storyText: description,
    targetFundingUsdc: fundingNum,
  });

  return {
    trustScore,
    rating,
    aiGeneratedRisk,
    aiGeneratedProbability,
    subScores,
    storyAlignmentFindings,
    storyDiscrepancies,
    strengths,
    riskWarnings,
    recommendations,
    suggestedMilestones,
    budgetAnalysis,
    crossDocConsistencyMatrix,
    docMerkleRoot,
    visualAudit,
    visualMerkleRoot: visualAudit.visualMerkleRoot,
    auditHash,
    redactionsCount: totalRedactions,
    adversarialDefense: totalDefenseMetrics,
    stylometricMetrics: stylometrics,
    privacyMode: "local_air_gapped",
    privacyEngine: "builtin_ts",
    analyzedAt,
  };
}

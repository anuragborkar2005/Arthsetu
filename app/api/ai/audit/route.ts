import { NextResponse } from "next/server";
import {
  evaluateFallbackHeuristicAudit,
  computeCompositeTrustScore,
  computeStylometrics,
  computePairwiseDocumentConsistency,
  type AiAuditReport,
  type AiSubScores,
  type DocumentAttachment,
} from "@/app/lib/ai-audit";
import { sanitizeTextForPrivacyPresidio, type RedactionResult } from "@/app/lib/privacy-redactor";
import { computeDocumentMerkleRoot, computeCanonicalAuditHash } from "@/app/lib/crypto-audit";
import { evaluateBudgetMath } from "@/app/lib/budget-validator";
import { sanitizeAgainstAdversarialInput, type DefenseSanitizationResult } from "@/app/lib/adversarial-defense";
import {
  evaluateCloudVlmAudit,
  evaluateLocalVisualAudit,
  type VisualArtifactAttachment,
  type VisualAuditResult,
} from "@/app/lib/vlm-client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      tagline,
      category = "technology",
      description,
      targetFundingUsdc,
      documents = [],
      creatorPubkey = "unspecified",
      plannedMilestones = [],
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required for AI audit." },
        { status: 400 }
      );
    }

    const fundingNum = Number(targetFundingUsdc) || 0;
    const analyzedAt = Date.now();

    // 1. Adversarial Input Defense
    const defenseStory = sanitizeAgainstAdversarialInput(description.slice(0, 5000));
    const totalDefenseMetrics: DefenseSanitizationResult = { ...defenseStory };

    // 2. Perform in-memory multi-layer PII & secret redaction (Presidio NLP + Web3 Crypto Recognizers)
    const storyRedaction: RedactionResult = await sanitizeTextForPrivacyPresidio(defenseStory.cleanedText);
    const totalRedactions = { ...storyRedaction.metrics };
    let activePrivacyEngine: "presidio_ner" | "builtin_ts" = storyRedaction.engine || "builtin_ts";

    const sanitizedDocs = await Promise.all(
      (documents as DocumentAttachment[]).map(async (d) => {
        const defenseDoc = sanitizeAgainstAdversarialInput(d.textSnippet ? d.textSnippet.slice(0, 3500) : "");
        totalDefenseMetrics.injectionsNeutralized += defenseDoc.injectionsNeutralized;
        totalDefenseMetrics.hiddenCharactersRemoved += defenseDoc.hiddenCharactersRemoved;
        if (defenseDoc.neutralizedPatterns.length > 0) {
          totalDefenseMetrics.neutralizedPatterns.push(...defenseDoc.neutralizedPatterns);
        }

        const docRedaction = await sanitizeTextForPrivacyPresidio(defenseDoc.cleanedText);
        if (docRedaction.engine === "presidio_ner") {
          activePrivacyEngine = "presidio_ner";
        }
        totalRedactions.keysAndSecrets += docRedaction.metrics.keysAndSecrets;
        totalRedactions.namesAndLocations += docRedaction.metrics.namesAndLocations;
        totalRedactions.emailsAndPhones += docRedaction.metrics.emailsAndPhones;
        totalRedactions.financialAccounts += docRedaction.metrics.financialAccounts;
        totalRedactions.nationalIds += docRedaction.metrics.nationalIds;
        totalRedactions.totalRedacted += docRedaction.metrics.totalRedacted;
        return {
          name: d.name,
          category: d.category,
          size: d.size,
          sha256: d.sha256 || "",
          hash: d.sha256 || "",
          contentSample: docRedaction.sanitizedText || "[Binary / Visual Content]",
          textSnippet: docRedaction.sanitizedText,
          type: d.type || "application/octet-stream",
          base64Data: d.base64Data,
          visualMetadata: d.visualMetadata,
        };
      })
    );

    // 3. Compute Document Merkle Root
    const docHashes = (documents as DocumentAttachment[]).map((d) => d.sha256 || "");
    const docMerkleRoot = await computeDocumentMerkleRoot(docHashes);

    // 4. Quantitative Budget & Milestone Validation
    const hasBudgetDocument = (documents as DocumentAttachment[]).some((d) => d.category === "budget");
    const budgetDocText = sanitizedDocs
      .filter((d) => d.category === "budget")
      .map((d) => d.contentSample || "")
      .join(" ");
    const combinedSanitizedText = sanitizedDocs.map((d) => d.contentSample).join(" ");

    const budgetAnalysis = evaluateBudgetMath({
      targetFundingUsdc: fundingNum,
      docText: hasBudgetDocument ? budgetDocText : combinedSanitizedText,
      milestones: plannedMilestones,
      hasBudgetDocument,
    });

    // 5. Cross-Document Consistency Matrix
    const crossDocConsistencyMatrix = computePairwiseDocumentConsistency(
      sanitizedDocs as DocumentAttachment[],
      storyRedaction.sanitizedText
    );

    // 6. Stylometric Metrics
    const stylometrics = computeStylometrics(storyRedaction.sanitizedText);

    // 7. Visual Artifact Diligence (VLM)
    const visualArtifacts: VisualArtifactAttachment[] = (documents as DocumentAttachment[])
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

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    let visualAudit: VisualAuditResult | undefined = undefined;
    if (visualArtifacts.length > 0) {
      if (geminiApiKey) {
        visualAudit = await evaluateCloudVlmAudit({
          visuals: visualArtifacts,
          storyText: storyRedaction.sanitizedText,
          targetFundingUsdc: fundingNum,
          geminiApiKey,
        });
      } else {
        visualAudit = await evaluateLocalVisualAudit({
          visuals: visualArtifacts,
          storyText: storyRedaction.sanitizedText,
          targetFundingUsdc: fundingNum,
        });
      }
    }

    if (geminiApiKey) {
      try {
        const prompt = `You are a strict, adversarial Web3 & Solana security auditor for Arthasetu DAO.
Your primary objective is to cross-examine whether the Attached Supporting Documents genuinely corroborate the Campaign Story, technical architecture, and milestones.

CRITICAL CROSS-EXAMINATION RULES:
1. storyDocumentAlignmentScore (0-100):
   - You MUST cross-check the claims, architecture, and deliverables in the Campaign Story against the uploaded documents.
   - If ANY attached document is WRONG, IRRELEVANT, UNRELATED, or INSUFFICIENT (e.g. uploading a personal resume/CV, random coursework/PDF from another domain, or boilerplate text that does not describe the specific deliverables and budget of THIS campaign):
     * You MUST assign storyDocumentAlignmentScore between 10 and 25 (NEVER above 25).
     * You MUST assign authenticityScore between 20 and 40 (submitting unrelated files is an unverified/misleading submission).
     * You MUST add a clear finding to storyDiscrepancies explaining the exact misalignment (e.g. "Low Story-Document Alignment: Attached document (e.g. personal profile) does not substantiate the specific project scope...").
   - ONLY award a high score (80-100) if the uploaded documents explicitly corroborate the exact project architecture, budget math, and deliverables described in the story.
2. authenticityScore (0-100): Document credibility and genuine relevance to the campaign.
3. feasibilityScore (0-100): Realistic funding target vs deliverables and budget scope.
4. verifiabilityScore (0-100): Clear on-chain testable criteria (git commits, test reports, live URLs).
5. aiContentScore (0-100): 100 = authentic human technical depth and diverse vocabulary, 0 = pure generic AI template spam.

Campaign Details:
- Title: ${title}
- Tagline: ${tagline}
- Category: ${category}
- Funding Target (USDC): ${targetFundingUsdc}
- Campaign Story / Description:
"""
${storyRedaction.sanitizedText}
"""

- Attached Supporting Documents:
${JSON.stringify(sanitizedDocs, null, 2)}

- Planned Milestones:
${JSON.stringify(plannedMilestones, null, 2)}

Respond ONLY with a valid JSON object matching this exact schema:
{
  "aiGeneratedRisk": "Low" | "Medium" | "High",
  "aiGeneratedProbability": number (0-100),
  "subScores": {
    "authenticityScore": number (0-100),
    "storyDocumentAlignmentScore": number (0-100),
    "feasibilityScore": number (0-100),
    "verifiabilityScore": number (0-100),
    "aiContentScore": number (0-100)
  },
  "storyAlignmentFindings": string[],
  "storyDiscrepancies": string[],
  "strengths": string[],
  "riskWarnings": string[],
  "recommendations": string[],
  "suggestedMilestones": [
    {
      "id": number,
      "title": string,
      "description": string,
      "targetAmountUsdc": string,
      "estimatedDurationDays": number,
      "deliverableCriteria": string[]
    }
  ]
}`;

        const imageParts = visualArtifacts
          .filter((v) => v.base64Data)
          .slice(0, 3)
          .map((v) => ({
            inlineData: {
              mimeType: v.type || "image/jpeg",
              data: v.base64Data!.replace(/^data:[^;]+;base64,/, ""),
            },
          }));

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }, ...imageParts] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const rawJson = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJson) {
            const parsed = JSON.parse(rawJson);

            const subScores: AiSubScores = {
              authenticityScore: Math.min(100, Math.max(0, Number(parsed.subScores?.authenticityScore) || 75)),
              storyDocumentAlignmentScore: Math.min(100, Math.max(0, Number(parsed.subScores?.storyDocumentAlignmentScore) || 75)),
              feasibilityScore: Math.min(100, Math.max(0, Number(parsed.subScores?.feasibilityScore) || 75)),
              verifiabilityScore: Math.min(100, Math.max(0, Number(parsed.subScores?.verifiabilityScore) || 75)),
              aiContentScore: Math.min(100, Math.max(0, Number(parsed.subScores?.aiContentScore) || 75)),
            };

            // Mathematically synthesize Trust Score & Rating from all 5 combined factors
            const { trustScore, rating } = computeCompositeTrustScore(subScores);

            const auditHash = await computeCanonicalAuditHash({
              creatorPubkey,
              targetFundingUsdc,
              trustScore,
              subScores,
              docMerkleRoot,
              analyzedAt,
            });

            const report: AiAuditReport = {
              trustScore,
              rating,
              aiGeneratedRisk: parsed.aiGeneratedRisk || (parsed.aiGeneratedProbability > 65 ? "High" : parsed.aiGeneratedProbability > 35 ? "Medium" : "Low"),
              aiGeneratedProbability: Number(parsed.aiGeneratedProbability) || 20,
              subScores,
              storyAlignmentFindings: Array.isArray(parsed.storyAlignmentFindings) ? parsed.storyAlignmentFindings : [],
              storyDiscrepancies: Array.isArray(parsed.storyDiscrepancies) ? parsed.storyDiscrepancies : [],
              strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
              riskWarnings: Array.isArray(parsed.riskWarnings) ? parsed.riskWarnings : [],
              recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
              suggestedMilestones: Array.isArray(parsed.suggestedMilestones) ? parsed.suggestedMilestones : [],
              budgetAnalysis,
              crossDocConsistencyMatrix,
              docMerkleRoot,
              visualAudit,
              visualMerkleRoot: visualAudit?.visualMerkleRoot,
              auditHash,
              redactionsCount: totalRedactions,
              adversarialDefense: totalDefenseMetrics,
              stylometricMetrics: stylometrics,
              privacyMode: "zero_retention_cloud",
              privacyEngine: activePrivacyEngine,
              analyzedAt,
            };

            return NextResponse.json(report, {
              headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, private",
                Pragma: "no-cache",
              },
            });
          }
        }
      } catch (geminiErr: unknown) {
        const errorMsg = geminiErr instanceof Error ? geminiErr.message : "Unknown Gemini error";
        console.warn("Gemini AI API call failed, falling back to heuristic engine:", errorMsg);
      }
    }

    // Fallback in-memory heuristic audit
    const fallbackReport = await evaluateFallbackHeuristicAudit({
      title,
      tagline: tagline || "",
      category: category || "technology",
      description,
      targetFundingUsdc: targetFundingUsdc || "25000",
      documents,
      creatorPubkey,
      plannedMilestones,
    });

    return NextResponse.json(fallbackReport, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
      },
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Failed to process AI audit";
    console.error("AI audit route error:", err);
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    );
  }
}

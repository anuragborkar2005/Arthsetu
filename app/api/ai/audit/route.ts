import { NextResponse } from "next/server";
import {
  evaluateFallbackHeuristicAudit,
  computeStylometrics,
  computePairwiseDocumentConsistency,
  type AiAuditReport,
  type AiSubScores,
  type DocumentAttachment,
} from "@/app/lib/ai-audit";
import { sanitizeTextForPrivacyV2 } from "@/app/lib/privacy-redactor";
import { computeDocumentMerkleRoot, computeCanonicalAuditHash } from "@/app/lib/crypto-audit";
import { evaluateBudgetMath } from "@/app/lib/budget-validator";
import { sanitizeAgainstAdversarialInput, type DefenseSanitizationResult } from "@/app/lib/adversarial-defense";

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

    // 2. Perform in-memory multi-layer PII & secret redaction
    const storyRedaction = sanitizeTextForPrivacyV2(defenseStory.cleanedText);
    const totalRedactions = { ...storyRedaction.metrics };

    const sanitizedDocs = (documents as DocumentAttachment[]).map((d) => {
      const defenseDoc = sanitizeAgainstAdversarialInput(d.textSnippet ? d.textSnippet.slice(0, 3500) : "");
      totalDefenseMetrics.injectionsNeutralized += defenseDoc.injectionsNeutralized;
      totalDefenseMetrics.hiddenCharactersRemoved += defenseDoc.hiddenCharactersRemoved;
      if (defenseDoc.neutralizedPatterns.length > 0) {
        totalDefenseMetrics.neutralizedPatterns.push(...defenseDoc.neutralizedPatterns);
      }

      const docRedaction = sanitizeTextForPrivacyV2(defenseDoc.cleanedText);
      totalRedactions.keysAndSecrets += docRedaction.metrics.keysAndSecrets;
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
        contentSample: docRedaction.sanitizedText || "[Binary / Encrypted Content]",
        textSnippet: docRedaction.sanitizedText,
        type: d.type || "application/octet-stream",
      };
    });

    // 3. Compute Document Merkle Root
    const docHashes = (documents as DocumentAttachment[]).map((d) => d.sha256 || "");
    const docMerkleRoot = await computeDocumentMerkleRoot(docHashes);

    // 4. Quantitative Budget & Milestone Validation
    const combinedSanitizedText = sanitizedDocs.map((d) => d.contentSample).join(" ");
    const budgetAnalysis = evaluateBudgetMath({
      targetFundingUsdc: fundingNum,
      docText: combinedSanitizedText,
      milestones: plannedMilestones,
    });

    // 5. Cross-Document Consistency Matrix
    const crossDocConsistencyMatrix = computePairwiseDocumentConsistency(
      sanitizedDocs as DocumentAttachment[],
      storyRedaction.sanitizedText
    );

    // 6. Stylometric Metrics
    const stylometrics = computeStylometrics(storyRedaction.sanitizedText);

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (geminiApiKey) {
      try {
        const prompt = `You are a strict, privacy-focused Web3 & Solana security auditor for Arthasetu DAO.
Your primary objective is to cross-examine the Campaign Story against the Attached Supporting Documents.

Evaluate the submission on:
1. Story & Document Cross-Alignment:
   - Does the written Campaign Story actually match the technical claims, budget numbers, and architecture in the attached documents?
   - Identify contradictions or discrepancies (e.g. story claims $100k budget but budget sheet lists $25k; story promises zk-proofs on Solana but whitepaper discusses EVM ERC-20 token; story claims deliverables not present in whitepaper).
2. Document Authenticity & Consistency.
3. AI-Generated Content Probability (generic AI template spam vs real technical engineering depth).
4. Budget Plausibility (does the requested USDC amount match realistic market dev costs for the deliverables).
5. Deliverable Verifiability (are milestones measurable on-chain with git commits/test reports).

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
  "trustScore": number (0-100),
  "rating": "Exceptional" | "High" | "Moderate" | "Caution" | "High Risk",
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

        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const rawJson = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawJson) {
            const parsed = JSON.parse(rawJson);

            const trustScore = Math.min(100, Math.max(0, Number(parsed.trustScore) || 75));
            const subScores: AiSubScores = {
              authenticityScore: Number(parsed.subScores?.authenticityScore) || 80,
              storyDocumentAlignmentScore: Number(parsed.subScores?.storyDocumentAlignmentScore) || 85,
              feasibilityScore: Number(parsed.subScores?.feasibilityScore) || 80,
              verifiabilityScore: Number(parsed.subScores?.verifiabilityScore) || 80,
              aiContentScore: Number(parsed.subScores?.aiContentScore) || 85,
            };

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
              rating: parsed.rating || "High",
              aiGeneratedRisk: parsed.aiGeneratedRisk || "Low",
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
              auditHash,
              redactionsCount: totalRedactions,
              adversarialDefense: totalDefenseMetrics,
              stylometricMetrics: stylometrics,
              privacyMode: "zero_retention_cloud",
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

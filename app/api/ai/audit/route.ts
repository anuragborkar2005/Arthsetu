import { NextResponse } from "next/server";
import { evaluateFallbackHeuristicAudit, sanitizeTextForPrivacy, type AiAuditReport } from "@/app/lib/ai-audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      title,
      tagline,
      category,
      description,
      targetFundingUsdc,
      documents = [],
      plannedMilestones = [],
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: "Title and description are required for AI audit." },
        { status: 400 }
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (geminiApiKey) {
      try {
        const sanitizedStory = sanitizeTextForPrivacy(description.slice(0, 4000));
        const sanitizedDocs = documents.map((d: any) => ({
          name: d.name,
          category: d.category,
          size: d.size,
          hash: d.sha256,
          contentSample: d.textSnippet ? sanitizeTextForPrivacy(d.textSnippet.slice(0, 3000)) : "[Binary / Encrypted Content]",
        }));

        const prompt = `You are a strict, privacy-focused Web3 & Solana security and diligence auditor for Arthasetu DAO.
Your primary objective is to cross-examine the Campaign Story / Description against the Attached Supporting Documents.

Evaluate the submission on:
1. Story & Document Cross-Alignment:
   - Does the written Campaign Story actually match the technical claims, budget numbers, and architecture described in the attached documents?
   - Identify any contradictions or discrepancies (e.g. story claims $100k budget but budget sheet lists $25k; story promises zk-proofs on Solana but whitepaper discusses EVM ERC-20 token; story claims deliverables not present in whitepaper).
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
${sanitizedStory}
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
            const auditHash =
              "0x" +
              Math.random().toString(16).slice(2, 10) +
              Date.now().toString(16).slice(4);
            const report: AiAuditReport = {
              trustScore: Math.min(100, Math.max(0, Number(parsed.trustScore) || 75)),
              rating: parsed.rating || "High",
              aiGeneratedRisk: parsed.aiGeneratedRisk || "Low",
              aiGeneratedProbability: Number(parsed.aiGeneratedProbability) || 20,
              subScores: {
                authenticityScore: Number(parsed.subScores?.authenticityScore) || 80,
                storyDocumentAlignmentScore: Number(parsed.subScores?.storyDocumentAlignmentScore) || 85,
                feasibilityScore: Number(parsed.subScores?.feasibilityScore) || 80,
                verifiabilityScore: Number(parsed.subScores?.verifiabilityScore) || 80,
                aiContentScore: Number(parsed.subScores?.aiContentScore) || 85,
              },
              storyAlignmentFindings: Array.isArray(parsed.storyAlignmentFindings) ? parsed.storyAlignmentFindings : [],
              storyDiscrepancies: Array.isArray(parsed.storyDiscrepancies) ? parsed.storyDiscrepancies : [],
              strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
              riskWarnings: Array.isArray(parsed.riskWarnings) ? parsed.riskWarnings : [],
              recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
              suggestedMilestones: Array.isArray(parsed.suggestedMilestones) ? parsed.suggestedMilestones : [],
              auditHash,
              analyzedAt: Date.now(),
            };

            return NextResponse.json(report);
          }
        }
      } catch (geminiErr: any) {
        console.warn("Gemini AI API call failed, falling back to heuristic engine:", geminiErr.message);
      }
    }

    // Fallback in-memory heuristic audit
    const fallbackReport = evaluateFallbackHeuristicAudit({
      title,
      tagline: tagline || "",
      category: category || "technology",
      description,
      targetFundingUsdc: targetFundingUsdc || "25000",
      documents,
      plannedMilestones,
    });

    return NextResponse.json(fallbackReport);
  } catch (err: any) {
    console.error("AI audit route error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process AI audit" },
      { status: 500 }
    );
  }
}

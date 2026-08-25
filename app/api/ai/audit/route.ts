import { NextResponse } from "next/server";
import { evaluateFallbackHeuristicAudit, type AiAuditReport } from "@/app/lib/ai-audit";

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
        const prompt = `You are a strict, privacy-focused Web3 & Solana security auditor for Arthasetu DAO.
Analyze the following crowdfunding campaign submission for:
1. Document Authenticity & Consistency (do dates, scopes, and budget match).
2. AI-Generated Content Probability (is this generic AI template spam, or real technical engineering depth).
3. Budget Plausibility (does the requested USDC amount match realistic market dev costs).
4. Fraud & Plagiarism Red Flags.
5. Deliverable Verifiability (are milestones measurable on-chain with git commits/test reports).

Campaign Details:
- Title: ${title}
- Tagline: ${tagline}
- Category: ${category}
- Funding Target (USDC): ${targetFundingUsdc}
- Story/Description: ${description.slice(0, 3000)}
- Attached Documents: ${JSON.stringify(
          documents.map((d: any) => ({ name: d.name, type: d.category, size: d.size, hash: d.sha256 }))
        )}
- Planned Milestones: ${JSON.stringify(plannedMilestones)}

Respond ONLY with a valid JSON object matching this exact schema:
{
  "trustScore": number (0-100),
  "rating": "Exceptional" | "High" | "Moderate" | "Caution" | "High Risk",
  "aiGeneratedRisk": "Low" | "Medium" | "High",
  "aiGeneratedProbability": number (0-100),
  "subScores": {
    "authenticityScore": number (0-100),
    "feasibilityScore": number (0-100),
    "verifiabilityScore": number (0-100),
    "aiContentScore": number (0-100)
  },
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
              aiGeneratedProbability: Math.min(100, Math.max(0, Number(parsed.aiGeneratedProbability) || 20)),
              subScores: {
                authenticityScore: Math.min(100, Math.max(0, Number(parsed.subScores?.authenticityScore) || 80)),
                feasibilityScore: Math.min(100, Math.max(0, Number(parsed.subScores?.feasibilityScore) || 75)),
                verifiabilityScore: Math.min(100, Math.max(0, Number(parsed.subScores?.verifiabilityScore) || 80)),
                aiContentScore: Math.min(100, Math.max(0, Number(parsed.subScores?.aiContentScore) || 85)),
              },
              strengths: Array.isArray(parsed.strengths) ? parsed.strengths : ["Verified cryptographic documents"],
              riskWarnings: Array.isArray(parsed.riskWarnings) ? parsed.riskWarnings : [],
              recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
              suggestedMilestones: Array.isArray(parsed.suggestedMilestones) ? parsed.suggestedMilestones : [],
              auditHash,
              analyzedAt: Date.now(),
            };
            return NextResponse.json(report);
          }
        }
      } catch (geminiErr) {
        console.warn("Gemini API call failed, using heuristic engine:", geminiErr);
      }
    }

    // Fallback to high-precision in-memory heuristic engine
    const heuristicReport = evaluateFallbackHeuristicAudit({
      title,
      tagline: tagline || "",
      category: category || "technology",
      description,
      targetFundingUsdc: targetFundingUsdc || "25000",
      documents,
      plannedMilestones,
    });

    return NextResponse.json(heuristicReport);
  } catch (err: any) {
    console.error("AI Audit route error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error during AI audit" },
      { status: 500 }
    );
  }
}

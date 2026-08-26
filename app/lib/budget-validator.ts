/**
 * Quantitative Budget & Milestone Math Validator
 * Performs mathematical verification of budget claims, milestone tranches, line-item allocations,
 * and category balance (Dev, Security, Infra, Ops, Marketing).
 */

export interface BudgetCategoryAllocation {
  category: "engineering" | "security_audits" | "infrastructure" | "operations_legal" | "marketing_growth" | "other";
  amountUsdc: number;
  percentage: number;
}

export interface BudgetAnalysis {
  targetFundingUsdc: number;
  milestoneAllocatedSumUsdc: number;
  extractedDocBudgetUsdc: number;
  variancePercentage: number;
  isBalanced: boolean;
  categoryBreakdown: BudgetCategoryAllocation[];
  findings: string[];
  warnings: string[];
  recommendations: string[];
}

export function evaluateBudgetMath(params: {
  targetFundingUsdc: number;
  docText: string;
  milestones: Array<{ targetAmountUsdc: string; title: string }>;
  hasBudgetDocument?: boolean;
}): BudgetAnalysis {
  const { targetFundingUsdc, docText, milestones = [], hasBudgetDocument = false } = params;
  const findings: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  // 1. Calculate milestone allocation sum
  const milestoneAllocatedSumUsdc = milestones.reduce(
    (sum, m) => sum + (parseFloat(m.targetAmountUsdc) || 0),
    0
  );

  const milestoneVariance = Math.abs(milestoneAllocatedSumUsdc - targetFundingUsdc);

  if (milestones.length === 0) {
    warnings.push("No milestone tranches configured. Funds should be phased into tranches.");
  } else if (milestoneVariance > 1) {
    const diff = (milestoneAllocatedSumUsdc - targetFundingUsdc).toFixed(2);
    warnings.push(
      `Milestone allocation sum ($${milestoneAllocatedSumUsdc.toLocaleString()} USDC) does not match the campaign goal ($${targetFundingUsdc.toLocaleString()} USDC), differing by ${diff} USDC.`
    );
    recommendations.push("Adjust milestone target amounts so their sum precisely equals the total campaign target.");
  } else {
    findings.push(
      `Milestone tranches perfectly match the campaign funding target ($${targetFundingUsdc.toLocaleString()} USDC across ${milestones.length} phase(s)).`
    );
  }

  // 2. Check if the text or documents contain genuine budget context
  const lowerDoc = docText.toLowerCase();
  const hasExplicitBudgetContext =
    hasBudgetDocument ||
    lowerDoc.includes("budget") ||
    lowerDoc.includes("cost breakdown") ||
    lowerDoc.includes("itemized") ||
    lowerDoc.includes("expenditure") ||
    lowerDoc.includes("financials") ||
    lowerDoc.includes("pricing") ||
    lowerDoc.includes("allocation") ||
    lowerDoc.includes("line item");

  let extractedDocBudgetUsdc = 0;
  let variancePercentage = 0;
  const categoryBreakdown: BudgetCategoryAllocation[] = [];

  if (hasExplicitBudgetContext) {
    // 2.1 Extract monetary amounts from budget document texts
    const numberRegex = /(?:\$|USDC\s*|USD\s*)(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+)(?:\s*(k|m|million|thousand))?/gi;
    const extractedAmounts: number[] = [];

    let match;
    while ((match = numberRegex.exec(docText)) !== null) {
      let val = parseFloat(match[1].replace(/,/g, ""));
      const unit = (match[2] || "").toLowerCase();
      if (unit === "k" || unit === "thousand") val *= 1000;
      if (unit === "m" || unit === "million") val *= 1000000;

      if (val >= 100 && val <= Math.max(targetFundingUsdc * 5, 500000)) {
        extractedAmounts.push(val);
      }
    }

    // 2.2 Line-Item Category Classification
    const lines = docText.split(/[;\n\r]+/);
    const categories: Record<BudgetCategoryAllocation["category"], number> = {
      engineering: 0,
      security_audits: 0,
      infrastructure: 0,
      operations_legal: 0,
      marketing_growth: 0,
      other: 0,
    };

    for (const line of lines) {
      const lineLower = line.toLowerCase();
      const lineMatch = line.match(/(?:\$|USDC\s*|USD\s*)(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+)(?:\s*(k|m|million|thousand))?/i);
      if (!lineMatch) continue;

      let amt = parseFloat(lineMatch[1].replace(/,/g, ""));
      const unit = (lineMatch[2] || "").toLowerCase();
      if (unit === "k" || unit === "thousand") amt *= 1000;
      if (unit === "m" || unit === "million") amt *= 1000000;

      if (amt <= 0 || amt > targetFundingUsdc * 2) continue;

      if (lineLower.includes("dev") || lineLower.includes("engineer") || lineLower.includes("frontend") || lineLower.includes("smart contract") || lineLower.includes("rust") || lineLower.includes("backend")) {
        categories.engineering += amt;
      } else if (lineLower.includes("audit") || lineLower.includes("security") || lineLower.includes("bounty") || lineLower.includes("pentest")) {
        categories.security_audits += amt;
      } else if (lineLower.includes("server") || lineLower.includes("rpc") || lineLower.includes("node") || lineLower.includes("hosting") || lineLower.includes("infra") || lineLower.includes("cloud")) {
        categories.infrastructure += amt;
      } else if (lineLower.includes("legal") || lineLower.includes("entity") || lineLower.includes("incorporation") || lineLower.includes("compliance") || lineLower.includes("ops")) {
        categories.operations_legal += amt;
      } else if (lineLower.includes("market") || lineLower.includes("growth") || lineLower.includes("community") || lineLower.includes("event") || lineLower.includes("pr")) {
        categories.marketing_growth += amt;
      } else {
        categories.other += amt;
      }
    }

    const categorySum = Object.values(categories).reduce((a, b) => a + b, 0);
    const parsedBreakdown = (Object.keys(categories) as Array<BudgetCategoryAllocation["category"]>).map((cat) => ({
      category: cat,
      amountUsdc: categories[cat],
      percentage: categorySum > 0 ? Math.round((categories[cat] / categorySum) * 100) : 0,
    })).filter((c) => c.amountUsdc > 0);

    categoryBreakdown.push(...parsedBreakdown);

    // Identify closest or largest budget total in docs
    if (extractedAmounts.length > 0) {
      const closest = extractedAmounts.reduce((prev, curr) =>
        Math.abs(curr - targetFundingUsdc) < Math.abs(prev - targetFundingUsdc) ? curr : prev
      );
      extractedDocBudgetUsdc = closest;

      variancePercentage =
        targetFundingUsdc > 0
          ? Math.round((Math.abs(extractedDocBudgetUsdc - targetFundingUsdc) / targetFundingUsdc) * 100)
          : 0;

      if (variancePercentage <= 10) {
        findings.push(
          `Budget document figures (~$${extractedDocBudgetUsdc.toLocaleString()} USDC) align closely with the requested funding target (${variancePercentage}% variance).`
        );
      } else if (variancePercentage > 35 && targetFundingUsdc > 20000) {
        warnings.push(
          `Budget document figures ($${extractedDocBudgetUsdc.toLocaleString()} USDC) exhibit a ${variancePercentage}% variance from the requested goal ($${targetFundingUsdc.toLocaleString()} USDC).`
        );
        recommendations.push("Ensure uploaded budget spreadsheet line items add up to the requested USDC target.");
      }
    }

    // Budget Category Sanity Rules
    const marketingAlloc = categoryBreakdown.find((c) => c.category === "marketing_growth");
    if (marketingAlloc && marketingAlloc.percentage > 50 && targetFundingUsdc > 25000) {
      warnings.push(`Marketing allocation (${marketingAlloc.percentage}%) exceeds 50% of total budget on a technical initiative.`);
      recommendations.push("Prioritize engineering and security audit allocations for technical protocol funding.");
    }
  } else {
    findings.push(
      `Funding disbursement will be governed according to configured milestone tranches ($${targetFundingUsdc.toLocaleString()} USDC).`
    );
  }

  // 3. Single tranche risk check
  if (milestones.length === 1 && targetFundingUsdc > 15000) {
    warnings.push("100% single-tranche release on a large budget increases backer risk.");
    recommendations.push("Split into 2-3 deliverable tranches (e.g., Alpha dev 40%, Beta UI 60%) to accelerate DAO approval.");
  }

  const isBalanced = warnings.length === 0;

  return {
    targetFundingUsdc,
    milestoneAllocatedSumUsdc,
    extractedDocBudgetUsdc,
    variancePercentage,
    isBalanced,
    categoryBreakdown,
    findings,
    warnings,
    recommendations,
  };
}

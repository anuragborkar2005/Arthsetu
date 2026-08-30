/**
 * Example Template: Assam Flood Emergency Relief & Medical Aid 2026
 *
 * Pre-configured reference campaign with:
 * - 3 Cryptographic document attachments (Disaster report, Itemized budget, FCRA KYC)
 * - 94/100 AI Trust Score & Story vs. Document Alignment
 * - Rich GitHub Flavored Markdown project story
 * - 3-Stage Milestone Roadmap ($20k, $20k, $10k)
 */

import type { CampaignMetadata } from "../ipfs";

export const ASSAM_FLOOD_RELIEF_EXAMPLE: CampaignMetadata = {
  version: "1.1.0",
  title: "Assam Flood Emergency Relief & Medical Aid 2026",
  tagline:
    "Rapid water rescue, emergency rations, water purification, and mobile medical clinics for 25,000 displaced flood victims.",
  category: "climate",
  bannerUrl:
    "https://images.unsplash.com/photo-1547683905-f686c993aae5?auto=format&fit=crop&w=1200&q=80",
  logoUrl:
    "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=200&q=80",
  websiteUrl: "https://assamrelief.org",
  twitterUrl: "https://twitter.com/AssamReliefDAO",
  githubUrl: "https://github.com/AssamReliefDAO/field-logistics-2026",
  contactEmail: "response@assamrelief.org",
  targetFundingUsdc: "50000",
  description: `# 🌊 Assam Flood Emergency Relief & Medical Aid 2026

## 🚨 The Humanitarian Crisis
Over the past 72 hours, unprecedented torrential monsoon rainfall and catastrophic river surges along the Brahmaputra basin have submerged over **1,800 villages across 22 districts in Assam**, displacing more than **450,000 residents**. The most acutely affected regions include **Majuli island, Cachar, Dhemaji, and Kaziranga peripheral settlements**.

Key urgent challenges:
- **Stranded Communities**: Thousands of families are marooned on elevated embankments and rooftops without access to dry ground.
- **Drinking Water Contamination**: Submerged tube wells have triggered widespread gastrointestinal and waterborne infection outbreaks.
- **Medical Access Blockade**: Primary health centers in rural blocks are inundated, cutting off vital antivenom, antibiotics, and first-aid supplies.

---

## 🎯 Mission Objective & Phased Execution
**AssamReliefDAO** is partnering with registered on-ground disaster response teams to deploy emergency rescue boats, deliver clean drinking water, set up floating medical outposts, and distribute survival ration kits.

### 📦 3-Stage Milestone Roadmap

1. **Phase 1 · Emergency Water Rescue & Food Rations (Target: 20,000 USDC)**
   - Deploy **15 motorized shallow-draft rescue rafts** in Majuli and Cachar riverine belts.
   - Procure and distribute **10,000 family survival ration packets** (dry food, flattened rice, ORS, baby food, halogen tablets).

2. **Phase 2 · Mobile Medical Clinics & Water Purification (Target: 20,000 USDC)**
   - Distribute **5,000 portable gravity-fed water purification units** ($4.00/unit).
   - Operate **4 boat-mounted mobile medical camps** providing essential antibiotics, antivenom, and pediatric fever medications.

3. **Phase 3 · Shelter Rehabilitation & Vector Disease Control (Target: 10,000 USDC)**
   - Distribute **2,500 heavy-duty waterproof tarpaulins** and ground mats for temporary relief camps.
   - Supply chlorine disinfection kits and mosquito nets to prevent malaria and dengue outbreaks in post-flood evacuation shelters.

---

## 🛡️ Verification, Transparency & Escrow Safety
* **Designated Verifier**: Independent Disaster Relief Field Auditor inspecting physical boats, GPS distribution logs, and government DDMA delivery receipts.
* **Dual-Signer Attestation**: Milestone funds can only be released upon mutual signature from the on-ground coordinator and the designated auditor.
* **Pro-Rata Donor Clawback Protection**: If any milestone stalls, remaining funds in the non-custodial Solana escrow are protected by DAO governance and can be claimed back pro-rata by donors.`,
  documents: [
    {
      name: "Assam_State_Disaster_Report_2026.pdf",
      type: "application/pdf",
      size: 348200,
      sha256: "8a1c93b74e1045df6a20183b54d389a01f782c3d4e5f60718293a4b5c6d7e8f9",
      ipfsCid: "bafybeidoc1assamdisasterreport2026officialassessment",
      ipfsUrl: "https://gateway.pinata.cloud/ipfs/bafybeidoc1assamdisasterreport2026officialassessment",
      category: "technical_spec",
    },
    {
      name: "Relief_Supply_Itemized_Budget.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: 184500,
      sha256: "4d2e81a790f5c3b1e2a4567890abcdef1234567890abcdef1234567890abcdef",
      ipfsCid: "bafybeidoc2reliefsupplyitemizedbudget50000usdc",
      ipfsUrl: "https://gateway.pinata.cloud/ipfs/bafybeidoc2reliefsupplyitemizedbudget50000usdc",
      category: "budget",
    },
    {
      name: "NGO_Registration_FCRA.pdf",
      type: "application/pdf",
      size: 215400,
      sha256: "9c8f6e321a4b5c6d7e8f901234567890abcdef1234567890abcdef1234567890",
      ipfsCid: "bafybeidoc3ngoregistrationfcracertificateverified",
      ipfsUrl: "https://gateway.pinata.cloud/ipfs/bafybeidoc3ngoregistrationfcracertificateverified",
      category: "identity",
    },
  ],
  aiAudit: {
    trustScore: 94,
    rating: "Exceptional",
    aiGeneratedRisk: "Low",
    aiGeneratedProbability: 8,
    subScores: {
      authenticityScore: 96,
      storyDocumentAlignmentScore: 95,
      feasibilityScore: 92,
      verifiabilityScore: 94,
      aiContentScore: 95,
    },
    storyAlignmentFindings: [
      "Funding goal of 50,000 USDC perfectly matches the sum of line items in Relief_Supply_Itemized_Budget.xlsx",
      "Target flood districts (Majuli, Cachar, Kaziranga) match priority flood zones in Assam_State_Disaster_Report_2026.pdf",
      "Valid non-profit registration and FCRA credentials corroborated by NGO_Registration_FCRA.pdf",
    ],
    storyDiscrepancies: [],
    strengths: [
      "Attached 3 verified cryptographic document artifacts on Pinata IPFS.",
      "High thematic & logistical coherence between campaign story and uploaded disaster reports.",
      "Realistic unit procurement costs for rescue rafts ($800/unit) and rations ($0.80/meal).",
      "Structured 3-phase milestone tranche releases reducing backer concentration risk.",
    ],
    riskWarnings: [],
    recommendations: [
      "Ensure field coordinators capture GPS coordinates and supplier delivery challans for Milestone #1 attestation.",
    ],
    suggestedMilestones: [
      {
        id: 0,
        title: "Phase 1: Emergency Water Rescue & Food Rations",
        description: "Deployment of 15 rescue rafts and distribution of 10,000 emergency ration packets.",
        targetAmountUsdc: "20000",
        estimatedDurationDays: 14,
        deliverableCriteria: [
          "Vendor purchase invoices and delivery receipts for 15 rescue rafts",
          "GPS distribution map across Majuli and Cachar riverine blocks",
          "District Disaster Management Authority (DDMA) delivery acknowledgment",
        ],
      },
      {
        id: 1,
        title: "Phase 2: Mobile Medical Clinics & Water Purification",
        description: "Distribution of 5,000 water purifiers and operation of 4 mobile boat medical clinics.",
        targetAmountUsdc: "20000",
        estimatedDurationDays: 21,
        deliverableCriteria: [
          "Batch dispatch receipts for 5,000 water purification filters",
          "Medical camp patient consultation logs and doctor duty rosters",
          "Water quality test certificates from treated distribution zones",
        ],
      },
      {
        id: 2,
        title: "Phase 3: Shelter Rehabilitation & Vector Disease Control",
        description: "Distribution of 2,500 tarpaulin shelter kits and mosquito nets in relief camps.",
        targetAmountUsdc: "10000",
        estimatedDurationDays: 30,
        deliverableCriteria: [
          "Relief camp distribution acknowledgments signed by camp coordinators",
          "Post-distribution field survey report with photographic verification",
          "Final expenditure audit co-signed by designated verifier",
        ],
      },
    ],
    budgetAnalysis: {
      targetFundingUsdc: 50000,
      milestoneAllocatedSumUsdc: 50000,
      extractedDocBudgetUsdc: 50000,
      variancePercentage: 0,
      isBalanced: true,
      categoryBreakdown: [
        { category: "operations_legal", amountUsdc: 20000, percentage: 40 },
        { category: "infrastructure", amountUsdc: 20000, percentage: 40 },
        { category: "engineering", amountUsdc: 10000, percentage: 20 },
      ],
      findings: [
        "Milestone tranches perfectly match the campaign funding target ($50,000 USDC across 3 phases).",
        "Budget sheet total ($50,000 USDC) aligns with the requested funding goal (0% variance).",
      ],
      warnings: [],
      recommendations: [],
    },
    crossDocConsistencyMatrix: [
      {
        docAName: "Campaign Story",
        docBName: "Assam_State_Disaster_Report_2026.pdf",
        consistencyScore: 95,
        status: "Consistent",
        findings: ["Target flood districts match government disaster report."],
      },
      {
        docAName: "Assam_State_Disaster_Report_2026.pdf",
        docBName: "Relief_Supply_Itemized_Budget.xlsx",
        consistencyScore: 92,
        status: "Consistent",
        findings: ["Budget allocations cover all priority intervention areas."],
      },
    ],
    docMerkleRoot: "0x7a3f89b1c4e2056789abcdef0123456789abcdef0123456789abcdef01234567",
    auditHash: "0x94f1c7e8a203b41de4567890abcdef1234567890abcdef1234567890abcdef12",
    redactionsCount: {
      keysAndSecrets: 0,
      namesAndLocations: 1,
      emailsAndPhones: 2,
      financialAccounts: 1,
      nationalIds: 0,
      totalRedacted: 4,
    },
    adversarialDefense: {
      cleanedText: "",
      injectionsNeutralized: 0,
      hiddenCharactersRemoved: 0,
      repetitionAnomalyDetected: false,
      neutralizedPatterns: [],
    },
    stylometricMetrics: {
      typeTokenRatio: 0.68,
      sentenceLengthVariance: 8.4,
      burstinessScore: 82,
      formulaicPhraseHits: 0,
    },
    privacyMode: "local_air_gapped",
    analyzedAt: 1724601600000,
  },
  plannedMilestones: [
    {
      id: 0,
      title: "Phase 1: Emergency Water Rescue & Food Rations",
      description: "Deployment of 15 rescue rafts and distribution of 10,000 emergency ration packets.",
      targetAmountUsdc: "20000",
      estimatedDurationDays: 14,
      deliverableCriteria: [
        "Vendor purchase invoices and delivery receipts for 15 rescue rafts",
        "GPS distribution map across Majuli and Cachar riverine blocks",
        "District Disaster Management Authority (DDMA) delivery acknowledgment",
      ],
    },
    {
      id: 1,
      title: "Phase 2: Mobile Medical Clinics & Water Purification",
      description: "Distribution of 5,000 water purifiers and operation of 4 mobile boat medical clinics.",
      targetAmountUsdc: "20000",
      estimatedDurationDays: 21,
      deliverableCriteria: [
        "Batch dispatch receipts for 5,000 water purification filters",
        "Medical camp patient consultation logs and doctor duty rosters",
        "Water quality test certificates from treated distribution zones",
      ],
    },
    {
      id: 2,
      title: "Phase 3: Shelter Rehabilitation & Vector Disease Control",
      description: "Distribution of 2,500 tarpaulin shelter kits and mosquito nets in relief camps.",
      targetAmountUsdc: "10000",
      estimatedDurationDays: 30,
      deliverableCriteria: [
        "Relief camp distribution acknowledgments signed by camp coordinators",
        "Post-distribution field survey report with photographic verification",
        "Final expenditure audit co-signed by designated verifier",
      ],
    },
  ],
  createdAt: 1724601600000,
  creatorAddress: "",
  verifierAddress: "",
};

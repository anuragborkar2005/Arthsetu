# 📚 Arthasetu (`अर्थसेतु`) Protocol Documentation Hub

Welcome to the centralized documentation hub for the **Arthasetu Protocol**, a decentralized, privacy-verified milestone crowdfunding DAO on **Solana**.

---

## 🧭 Documentation Map

| Document | Description |
| :--- | :--- |
| **[🌍 UN SDG Alignment](./SDG_ALIGNMENT.md)** | Deep dive into how Arthasetu advances **SDG 16 (Peace, Justice & Strong Institutions)**, **SDG 9 (Innovation & Infrastructure)**, **SDG 13 (Climate Action)**, **SDG 10 (Reduced Inequalities)**, and **SDG 17 (Partnerships)**. |
| **[🏛️ System Architecture](./ARCHITECTURE.md)** | Complete smart contract architecture, Solana PDA account map, governance timelock loop, and Pinata IPFS schemas. |
| **[📖 Operational Runbook](./RUNBOOK.md)** | End-to-end operational guide: local validator setup, contract deployment, campaign launch, and milestone releases. |
| **[🛡️ Security Analysis](./SECURITY.md)** | Security guarantees, audit findings resolution log (C1–C5, H1–H8, M1–M11, L1–L5), and trust model. |
| **[🧠 Privacy AI & Pinata IPFS](./AI_AND_IPFS.md)** | Technical deep dive on in-memory zero-retention text parsing, PII sanitization, story-document cross-examination, and IPFS gateways. |

---

## 🌟 Key Architecture Highlights

```
+─────────────────────────────────────────────────────────────────────────────────────────+
| 1. CREATOR STUDIO & AI VERIFICATION (/campaigns/new)                                    |
|    • Upload Whitepapers, Pitch Decks, & Itemized Budget Sheets (Pinned to Pinata IPFS)  |
|    • Client-side WebCrypto SHA-256 Hashing + PII Sanitization (Zero Data Retention)    |
|    • Deep Story vs. Document Cross-Examination (Alignment Scoring & Discrepancy Check)  |
|    • AI-Crafted Milestone Roadmap Tranches + Designated Verifier Assignment             |
|    • On-Chain Registration on Solana (create_campaign with Trust Score 0-100)           |
+──────────────────────────────────────────┬──────────────────────────────────────────────+
                                           │
                                           ▼
+─────────────────────────────────────────────────────────────────────────────────────────+
| 2. DAO REVIEW & GO-LIVE GOVERNANCE (/governance)                                        |
|    • Assigned Verifiers & DAO Members Inspect Document Hashes & AI Trust Audit          |
|    • Sponsoring Member Creates On-Chain ApproveCampaign Proposal                        |
|    • Token Holders Vote (cast_vote with Voting Tokens Locked in Vote-Escrow ATAs)       |
|    • Timelocked Permissionless Execution: approve_and_go_live Activates Public Donations  |
+──────────────────────────────────────────┬──────────────────────────────────────────────+
                                           │
                                           ▼
+─────────────────────────────────────────────────────────────────────────────────────────+
| 3. PUBLIC ESCROW FUNDING (/campaigns/[id])                                              |
|    • Donors Deposit USDC Directly into Non-Custodial Campaign Escrow PDA (donate)       |
|    • Creates On-Chain DonationRecord PDA Tracking Lifetime Contributions for Clawbacks  |
+──────────────────────────────────────────┬──────────────────────────────────────────────+
                                           │
                                           ▼
+─────────────────────────────────────────────────────────────────────────────────────────+
| 4. TRANSPARENT MILESTONE PROOFS & DUAL-SIGNER RELEASE (/verifier)                       |
|    • Creator Submits Verifiable Deliverable Proofs (Git Commits, Test Reports, Demos)   |
|    • Evidence Files Pinned to Pinata IPFS (proof_cid)                                   |
|    • Designated Verifier Audits Deliverables & Co-Signs propose_milestone on Solana     |
|    • DAO Votes on ReleaseMilestone Proposal; Funds Disbursed & Milestone PDA Closed     |
+──────────────────────────────────────────┬──────────────────────────────────────────────+
                                           │
                                           ▼
+─────────────────────────────────────────────────────────────────────────────────────────+
| 5. EMERGENCY RESCUE & DONOR CLAWBACK (/portfolio)                                       |
|    • DAO Passes EmergencyWithdraw if Campaign Stalls (Funds Drained to DAO Treasury)    |
|    • Donors Claim Pro-Rata Refunds (claim_refund) Directly from Remaining Escrow Balance|
+─────────────────────────────────────────────────────────────────────────────────────────+
```

---

*Arthasetu Protocol Documentation Hub · Built on Solana SVM & Anchor 0.30.1.*

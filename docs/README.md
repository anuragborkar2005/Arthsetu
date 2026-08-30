# 📚 Arthasetu (`अर्थसेतु`) Protocol Documentation Hub

Welcome to the centralized documentation hub for the **Arthasetu Protocol**, a decentralized, privacy-verified milestone crowdfunding DAO on **Solana**.

---

## 🧭 Documentation Map

| Document | Description |
| :--- | :--- |
| **[📊 Technical Comparison & Rationale](./COMPARISON_AND_EXPERIMENTS.md)** | Deep-dive EVM vs. Solana comparison, engineering rationale for all chosen technologies, and 8 verified empirical benchmarks. |
| **[🌍 UN SDG Alignment](./SDG_ALIGNMENT.md)** | Deep dive into how Arthasetu advances **SDG 16 (Peace, Justice & Strong Institutions)**, **SDG 9 (Innovation & Infrastructure)**, **SDG 13 (Climate Action)**, **SDG 10 (Reduced Inequalities)**, and **SDG 17 (Partnerships)**. |
| **[🏛️ System Architecture](./ARCHITECTURE.md)** | Complete smart contract architecture, Solana PDA account map, governance timelock loop, and Pinata IPFS schemas. |
| **[📖 Operational Runbook](./RUNBOOK.md)** | End-to-end operational guide: local validator setup, contract deployment, campaign launch, and milestone releases. |
| **[🛡️ Security Analysis](./SECURITY.md)** | Security guarantees, audit findings resolution log (C1–C5, H1–H8, M1–M11, L1–L5), and trust model. |
| **[🧠 Privacy AI & Pinata IPFS](./AI_AND_IPFS.md)** | Technical deep dive on in-memory zero-retention text parsing, PII sanitization, story-document cross-examination, and IPFS gateways. |

---

## 🌟 Key Architecture Highlights

```mermaid
flowchart TD
    subgraph S1["1. Creator Studio & Privacy AI (/campaigns/new)"]
        A1["1. Project Basics (Goal & Category)"] --> A2["2. Campaign Story Specifications"]
        A2 --> A3["3. Upload Supporting Documents & Evidence"]
        A3 --> A4["In-Memory Presidio NLP & Web3 Keys Redaction"]
        A4 --> A5["Story vs. Doc Jaccard Consistency Matrix"]
        A5 --> A6["Compute Trust Score (0-100) & Merkle Root"]
        A6 --> A7["Pin to Pinata IPFS v3 (CIDv1)"]
        A7 --> A8["create_campaign on Solana<br/>(is_live = false, trust_score, verifier)"]
    end

    subgraph S2["2. DAO Review & Go-Live Governance (/governance)"]
        B1["DAO & Verifier Audit Docs, Merkle Root & Trust Score"] --> B2["Sponsor ApproveCampaign Proposal"]
        B2 --> B3["Token Holders Cast Votes<br/>(Locked in Vote-Escrow ATAs)"]
        B3 --> B4["Quorum Met & Timelock Elapses"]
        B4 --> B5["approve_and_go_live<br/>(is_live = true)"]
    end

    subgraph S3["3. Public Escrow Donations (/campaigns/[id])"]
        C1["Donors Deposit USDC into Escrow PDA"] --> C2["donate CPI Transfer"]
        C2 --> C3["Initialize DonationRecord PDA<br/>(Tracks Lifetime Backer Share)"]
    end

    subgraph S4["4. Transparent Milestone Release (/verifier)"]
        D1["Creator Packages Proofs (Git, Demos, Invoices)"] --> D2["Pin Evidence to Pinata IPFS v3"]
        D2 --> D3["propose_milestone<br/>(Dual-Signed: Creator + Verifier)"]
        D3 --> D4["DAO ReleaseMilestone Vote & Timelock"]
        D4 --> D5["release_milestone<br/>(Escrow Pays Creator & PDA Closes)"]
    end

    subgraph S5["5. Emergency Protection & Donor Clawback (/portfolio)"]
        E1["Campaign Stalls or Malicious Action"] --> E2["DAO EmergencyWithdraw Proposal"]
        E2 --> E3["Drain Escrow to DAO Treasury"]
        E3 --> E4["Donors Claim Pro-Rata Refund<br/>(claim_refund via DonationRecord)"]
    end

    A8 --> B1
    B5 --> C1
    C3 --> D1
    D3 -.->|If Stalled / Disputed| E1
```

---

*Arthasetu Protocol Documentation Hub · Built on Solana SVM & Anchor 0.30.1.*

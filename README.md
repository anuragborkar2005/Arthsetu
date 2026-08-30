# arthasetu (अर्थसेतु)

A decentralized, privacy-verified milestone crowdfunding DAO on **Solana**. Creators launch campaigns backed by non-custodial stablecoin escrows; an in-memory, privacy-preserving AI diligence engine evaluates supporting documents, cross-examines the project story against technical whitepapers and budget spreadsheets, and produces a cryptographically bound on-chain **Trust Score**; an on-chain DAO approves campaigns, releases milestone tranches upon dual-signer deliverable verification, and enforces donor clawback protections.

Built with [Anchor](https://www.anchor-lang.com/) (Rust), Next.js 16 (React 19), `@solana/kit`, Pinata IPFS, Google Gemini, and a [Codama](https://github.com/codama-idl/codama)-generated TypeScript client.

---

## 🏛️ How It Works

```mermaid
flowchart TD
    subgraph S1["1. Creator Studio & Privacy AI (/campaigns/new)"]
        A1["1. Project Basics (Title, Tagline, Funding Target)"] --> A2["2. Campaign Story & Markdown Specifications"]
        A2 --> A3["3. Upload Supporting Documents & Verification"]
        A3 --> A4["Microsoft Presidio NLP (PERSON, LOCATION, PAN, SSN) + Web3 BIP-39 & Keys Redaction"]
        A4 --> A5["Pairwise Story-Document Jaccard Consistency Matrix"]
        A5 --> A6["Quantitative Budget Math & Category Allocation"]
        A6 --> A7["Generate Trust Score (0-100) & Canonical SHA-256 Audit Hash"]
        A7 --> A8["Pin to Pinata IPFS v3 (CIDv1 via dedicated gateway)"]
        A8 --> A9["create_campaign on Solana<br/>(is_live = false, trust_score, verifier)"]
    end

    subgraph S2["2. DAO Review & Go-Live Governance (/governance)"]
        B1["DAO & Verifier Audit Docs, Merkle Root & Trust Score"] --> B2["Sponsor ApproveCampaign Proposal"]
        B2 --> B3["Token Holders Cast Votes<br/>(Locked in Vote-Escrow ATAs)"]
        B3 --> B4["Quorum Met & Timelock Elapses"]
        B4 --> B5["approve_and_go_live<br/>(is_live = true)"]
    end

    subgraph S3["3. Public Escrow Donations (/campaigns/[id])"]
        C1["Donors Inspect Cryptographic Merkle Root & Audit Hash"] --> C2["Deposit USDC into Escrow PDA"]
        C2 --> C3["donate CPI Transfer"]
        C3 --> C4["Initialize DonationRecord PDA<br/>(Tracks Lifetime Backer Share)"]
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

    A9 --> B1
    B5 --> C1
    C4 --> D1
    D3 -.->|If Stalled / Disputed| E1
```

---

## 🌟 Key Capabilities

### 🛡️ Hybrid Privacy-Focused AI & Diligence Engine
* **Microsoft Presidio NLP De-Identification**: Integrated with `presidio-analyzer` (spaCy Named Entity Recognition for `PERSON`, `LOCATION`, `ORGANIZATION`, `IN_PAN`, `US_SSN`, `EMAIL_ADDRESS`, `PHONE_NUMBER`) and `presidio-anonymizer`, with local Docker sidecar support.
* **Web3-Native Privacy Redaction**: Validates 12/18/24-word seed phrases against the canonical 2,048-word BIP-39 English dictionary before redacting. Verifies Solana Base58 private keys, EVM 64-hex keys, and API secrets in-memory with automatic Tier 1 zero-dependency fallback.
* **Rigorous Multi-Factor Trust Score Synthesizer**: Computes on-chain Trust Scores (0–100) using a strict mathematical formulation:
  $$\text{Trust Score} = 0.25(\text{Auth}) + 0.35(\text{Align}) + 0.20(\text{Feas}) + 0.10(\text{Verif}) + 0.10(\text{AI})$$
  * **Strict Anti-Fraud Ceilings**: If attached documents fail to substantiate the campaign story (e.g. uploading a resume for a flood relief campaign), `storyDocumentAlignmentScore` drops to $\le 20\%$, capping the overall Trust Score at $\le 25/100$ (**High Risk**).
* **Cryptographic Document Merkle Trees**: Computes a deterministic 32-byte SHA-256 Merkle root across all uploaded documents, independent of upload order.
* **Canonical SHA-256 Audit Binding Hash**: Produces a tamper-proof digest (`0x...`) binding creator pubkey, document Merkle root, funding goal, Trust Score, and sub-scores.
* **Quantitative Budget & Category Allocation Engine**: Parses tabular cost entries into **Engineering**, **Security & Audits**, **Infrastructure**, **Operations/Legal**, and **Marketing**, computing percentage distributions and flagging category imbalances.
* **Pairwise Multi-Document Consistency Matrix**: Computes substantive Jaccard term overlap between the campaign story and uploaded files to detect discrepancies or unbudgeted deliverables.
* **Dual Privacy Modes**:
  * **100% Air-Gapped Local Mode**: Performs all diligence client-side using deterministic stylometrics, domain ontologies, and heuristic rules with 0 outbound network requests.
  * **Stateless Zero-Retention Cloud Mode**: Calls ephemeral LLM auditing with strict `Cache-Control: no-store` headers and immediate in-memory purging.

### 📌 Pinata v3 Files API & Dedicated Gateway Resolution
* **Pinata v3 Files API**: Uses modern `https://uploads.pinata.cloud/v3/files` multipart stream for instant uploads (`<100ms`).
* **Dedicated Gateway Resolution**: Resolves IPFS hashes directly via custom dedicated Pinata gateways (e.g. `https://bronze-changing-silverfish-206.mypinata.cloud/ipfs/`).
* **Deterministic Offline Engine**: In-memory SHA-256 base32 IPFS v1 CID generator fallback when operating offline.

### ⚡ Performance & Image LCP Optimization
* **Next.js Image Architecture**: All campaign cards, exploration grids, creator previews, and hero banners use `<Image />` with `priority` on above-the-fold elements and responsive `sizes` to maximize Largest Contentful Paint (LCP) performance.
* **Remote Patterns Whitelist**: Pre-configured remote patterns for Unsplash, Pinata gateways, and IPFS endpoints.

### 📝 Rich GitHub Flavored Markdown (GFM)
* Full markdown story rendering with custom typography, code blocks, task lists (`- [x]`), blockquotes, and tables.
* Live **"Write (Markdown)"** vs. **"Preview"** tab toggle in Step 2 of the Campaign Creation Studio.
* Public **Deliverable Proof Inspector** modal rendering verified test reports and evidence links in rich markdown.

---

## 🌍 UN Sustainable Development Goals (SDGs)

Arthasetu is engineered to advance the **United Nations 2030 Sustainable Development Agenda**:

* **[SDG 16: Peace, Justice, & Strong Institutions](docs/SDG_ALIGNMENT.md#sdg-16-peace-justice-and-strong-institutions-primary)** (*Target 16.5 & 16.6*): Eliminates charity embezzlement and fund diversion through non-custodial smart contract escrows and decentralized governance voting.
* **[SDG 9: Industry, Innovation, & Infrastructure](docs/SDG_ALIGNMENT.md#sdg-9-industry-innovation-and-infrastructure-primary)** (*Target 9.1 & 9.c*): High-speed, decentralized public goods funding on Solana with privacy-preserving AI document diligence.
* **[SDG 13: Climate Action & Disaster Relief](docs/SDG_ALIGNMENT.md#sdg-13-climate-action--disaster-resilience-primary)** (*Target 13.1*): Rapid, borderless stablecoin mobilization for climate crises (e.g. Assam Flood Relief) with cryptographic field delivery verification.
* **[SDG 10: Reduced Inequalities](docs/SDG_ALIGNMENT.md#sdg-10-reduced-inequalities--remittance-friction-primary)** (*Target 10.c*): Reduces cross-border donation and remittance friction from 5–15% down to sub-cent Solana transaction costs (<$0.0005).
* **[SDG 17: Partnerships for the Goals](docs/SDG_ALIGNMENT.md#sdg-17-partnerships-for-the-goals-primary)** (*Target 17.17*): Fosters collaborative partnerships between grassroots NGOs, independent field auditors, and global DAO governance.

👉 **Read the full [UN SDG Alignment Analysis](docs/SDG_ALIGNMENT.md)** for detailed target breakdowns, KPIs, and impact matrices.

---

## 📚 Centralized Documentation Hub

All comprehensive architecture, security, operational, and technical guides are centralized in the **[`docs/`](docs/)** directory:

| Guide | Description |
| :--- | :--- |
| **[📊 Technical Comparison & Rationale](docs/COMPARISON_AND_EXPERIMENTS.md)** | Full EVM vs. Solana architectural comparison, engineering rationale for all chosen subsystems, and 8 verified empirical benchmarks. |
| **[🌍 UN SDG Alignment](docs/SDG_ALIGNMENT.md)** | Deep dive into how Arthasetu advances UN SDGs 16, 9, 13, 10, and 17. |
| **[🏛️ System Architecture](docs/ARCHITECTURE.md)** | Full smart contract architecture, Solana PDA account map, and Pinata IPFS schemas. |
| **[📖 Operational Runbook](docs/RUNBOOK.md)** | End-to-end operational guide, local validator setup, and deployment walkthrough. |
| **[🛡️ Security Analysis](docs/SECURITY.md)** | Security guarantees, audit findings resolution log (C1–C5, H1–H8, M1–M11, L1–L5). |
| **[🧠 Privacy AI & Diligence Engine](docs/AI_AND_IPFS.md)** | In-memory text parsing, Merkle trees, BIP-39 redaction, budget math, and IPFS gateways. |

---

## 📁 Project Structure

```
├── app/
│   ├── admin/                # Protocol bootstrap, tokenomics, faucet & pause controls
│   ├── api/
│   │   ├── ai/audit/         # Next.js API route for Privacy AI Trust Scoring (Gemini & In-Memory)
│   │   └── pinata/upload/    # Next.js API route for Pinata file & JSON metadata pinning
│   ├── campaigns/
│   │   ├── [id]/             # Campaign details, donor cryptographic inspector, deliverable proofs
│   │   └── new/              # 5-step wizard with document dropzone, privacy mode switch & AI engine
│   ├── components/           # UI components, navbar, providers, cluster & wallet context
│   │   ├── fydao/            # Campaign cards, proposal cards, milestone dialogs, badges
│   │   └── markdown-content.tsx # GitHub Flavored Markdown renderer (headings, code, tables)
│   ├── explore/              # Public escrow discovery, category filtering, search & stats
│   │   └── fydao/            # Codama-generated typed program client (@solana/kit)
│   ├── governance/           # Governor hub: proposals, voting, timelock queue & token unlock
│   ├── lib/                  # AI audit service, Merkle trees, PII redactor, budget validator
│   ├── portfolio/            # Backer portfolio, donation receipts & emergency refund claimer
│   └── verifier/             # Designated verifier portal & deliverable proof builder
├── anchor/
│   ├── programs/fydao/       # The fydao Anchor governance & escrow program (Rust)
│   │   ├── src/instructions/ # 20 Anchor instruction handlers & execution gate
│   │   └── tests/            # Rust unit & LiteSVM on-chain integration tests
│   ├── Architecture.md       # Full smart contract architecture, state PDAs, trust model
│   └── Security.md           # Security audit findings & resolution log
├── scripts/
│   └── test-privacy-ai.ts    # 43-test automated unit and regression test suite for Privacy AI & Presidio
├── codama.json               # Codama client generation config
└── package.json
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```shell
npm install --legacy-peer-deps
```

### 2. Configure Environment Variables (Optional)
Copy `.env.example` to `.env.local` and add your API keys:
```bash
cp .env.example .env.local
```

```env
# Pinata IPFS API
PINATA_JWT="your_pinata_jwt_token_here"
NEXT_PUBLIC_PINATA_GATEWAY="https://gateway.pinata.cloud/ipfs/"

# Google Gemini API for AI Trust Scoring
GEMINI_API_KEY="your_gemini_api_key_here"
```

### 3. Build Smart Contract & Generate Client
```shell
npm run setup
```

### 4. Start Next.js Development Server
```shell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to explore the dApp.

---

## 🛠️ Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Next Image Optimization |
| **Styling & UI** | Tailwind CSS v4, shadcn/ui, Lucide Icons |
| **Markdown Engine** | `react-markdown`, `remark-gfm` (GitHub Flavored Markdown) |
| **Solana SDK** | `@solana/kit`, `@wallet-standard/app`, `@wallet-standard/features` |
| **Program Client** | Codama-generated typed client (`@codama/cli`) |
| **Smart Contract** | Anchor 0.30.1 (Rust) on Solana Virtual Machine (SVM) |
| **Privacy AI Diligence**| Zero-Retention In-Memory Engine, Merkle Trees, BIP-39 Redactor, Gemini 1.5 Flash |
| **Storage & Proofs** | Pinata Cloud IPFS API + Multi-Gateway Resolution |

---

## 🧪 Testing

### 1. Automated Privacy AI & Diligence Test Suite
Run the 32-test TypeScript verification suite:
```bash
npx tsx scripts/test-privacy-ai.ts
```

### 2. On-Chain Smart Contract Tests
Rust unit and **on-chain LiteSVM integration tests** verify the smart contracts against a real in-process Solana Virtual Machine:
```bash
cargo test --manifest-path anchor/Cargo.toml
```

---

## 📜 Deployment Checklist

1. Set your Solana CLI to the target cluster (`solana config set --url devnet`).
2. Sync program keypair:
   ```bash
   cd anchor
   anchor keys sync
   anchor build
   anchor deploy
   cd ..
   npm run setup
   ```
3. Set `GENESIS_AUTHORITY` in `anchor/programs/fydao/src/lib.rs` to the deployer key before production bootstrap.

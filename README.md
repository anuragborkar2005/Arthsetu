# arthasetu (अर्थसेतु)

A decentralized, privacy-verified milestone crowdfunding DAO on **Solana**. Creators launch campaigns backed by non-custodial stablecoin escrows; an in-memory, privacy-preserving AI engine evaluates supporting documents, cross-examines the project story against technical whitepapers and budget spreadsheets, and binds an on-chain **Trust Score**; an on-chain DAO approves campaigns, releases milestone tranches upon dual-signer deliverable verification, and enforces donor clawback protections.

Built with [Anchor](https://www.anchor-lang.com/) (Rust), Next.js 16 (React 19), `@solana/kit`, Pinata IPFS, Google Gemini, and a [Codama](https://github.com/codama-idl/codama)-generated TypeScript client.

---

## 🏛️ How It Works

```mermaid
flowchart TD
    subgraph S1["1. Creator Studio & Privacy AI (/campaigns/new)"]
        A1["Upload Docs & Whitepapers"] --> A2["Client-side SHA-256 Hashing"]
        A2 --> A3["In-Memory PII Sanitization"]
        A3 --> A4["Story vs. Doc Cross-Examination"]
        A4 --> A5["Generate Trust Score (0-100)"]
        A5 --> A6["Pin to Pinata IPFS (CIDv1)"]
        A6 --> A7["create_campaign on Solana<br/>(is_live = false)"]
    end

    subgraph S2["2. DAO Review & Go-Live Governance (/governance)"]
        B1["DAO & Verifier Audit Docs & Trust Score"] --> B2["Sponsor ApproveCampaign Proposal"]
        B2 --> B3["Token Holders Cast Votes<br/>(Locked in Vote-Escrow ATAs)"]
        B3 --> B4["Quorum Met & Timelock Elapses"]
        B4 --> B5["approve_and_go_live<br/>(is_live = true)"]
    end

    subgraph S3["3. Public Escrow Donations (/campaigns/[id])"]
        C1["Donors Deposit USDC into Escrow PDA"] --> C2["donate CPI Transfer"]
        C2 --> C3["Initialize DonationRecord PDA<br/>(Tracks Lifetime Backer Share)"]
    end

    subgraph S4["4. Transparent Milestone Release (/verifier)"]
        D1["Creator Packages Proofs (Git, Demos, Invoices)"] --> D2["Pin Evidence to Pinata IPFS"]
        D2 --> D3["propose_milestone<br/>(Dual-Signed: Creator + Verifier)"]
        D3 --> D4["DAO ReleaseMilestone Vote & Timelock"]
        D4 --> D5["release_milestone<br/>(Escrow Pays Creator & PDA Closes)"]
    end

    subgraph S5["5. Emergency Protection & Donor Clawback (/portfolio)"]
        E1["Campaign Stalls or Malicious Action"] --> E2["DAO EmergencyWithdraw Proposal"]
        E2 --> E3["Drain Escrow to DAO Treasury"]
        E3 --> E4["Donors Claim Pro-Rata Refund<br/>(claim_refund via DonationRecord)"]
    end

    A7 --> B1
    B5 --> C1
    C3 --> D1
    D3 -.->|If Stalled / Disputed| E1
```

---

## 🌟 Key Capabilities

### 🛡️ Privacy-Focused AI Verification & Diligence
* **Client-Side SHA-256 Fingerprinting**: Computes cryptographic hashes in the browser before documents are uploaded.
* **In-Memory Zero-Retention Processing**: Extracts text ephemerally without persisting private files to centralized disks or databases.
* **PII Sanitization Shield**: Redacts emails, phone numbers, crypto private keys, and sensitive identifiers.
* **Story vs. Document Cross-Examination**: Compares the campaign description against technical whitepapers and budget spreadsheets to catch contradictory claims, missing deliverables, or inflated numbers.
* **5-Pillar Trust Scoring**: Generates an on-chain integer (`0–100`) based on:
  1. *Document Authenticity & Consistency*
  2. *Story & Document Cross-Alignment*
  3. *Budget Feasibility & Market Dev Cost Scope*
  4. *Deliverable Verifiability*
  5. *AI Content & Spam Risk Probability*

### 📌 Pinata Cloud IPFS & Multi-Gateway Resolution
* **Automatic Document Pinning**: Whitepapers, pitch decks, budget sheets, and deliverable evidence files are pinned to Pinata IPFS.
* **Multi-Gateway Fallback**: Resolves content seamlessly across Dedicated Pinata Gateways, Cloudflare IPFS, and `ipfs.io`.
* **Deterministic Offline Engine**: Falls back to deterministic SHA-256 base32 CIDv1 addressing if no Pinata API keys are supplied.

### 📝 Rich GitHub Flavored Markdown (GFM)
* Full markdown story rendering with custom typography, code blocks, task lists (`- [x]`), blockquotes, and tables.
* Live **"Write (Markdown)"** vs. **"Preview"** tab toggle in the Campaign Creation Studio.
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
| **[🌍 UN SDG Alignment](docs/SDG_ALIGNMENT.md)** | Deep dive into how Arthasetu advances UN SDGs 16, 9, 13, 10, and 17. |
| **[🏛️ System Architecture](docs/ARCHITECTURE.md)** | Full smart contract architecture, Solana PDA account map, and Pinata IPFS schemas. |
| **[📖 Operational Runbook](docs/RUNBOOK.md)** | End-to-end operational guide, local validator setup, and deployment walkthrough. |
| **[🛡️ Security Analysis](docs/SECURITY.md)** | Security guarantees, audit findings resolution log (C1–C5, H1–H8, M1–M11, L1–L5). |
| **[🧠 Privacy AI & Pinata IPFS](docs/AI_AND_IPFS.md)** | In-memory text parsing, PII sanitization, story-document cross-examination, and IPFS gateways. |

---

## 📁 Project Structure

```
├── app/
│   ├── admin/                # Protocol bootstrap, tokenomics, faucet & pause controls
│   ├── api/
│   │   ├── ai/audit/         # Next.js API route for Privacy-Preserving AI Trust Scoring (Gemini)
│   │   └── pinata/upload/    # Next.js API route for Pinata file & JSON metadata pinning
│   ├── campaigns/
│   │   ├── [id]/             # Campaign details, AI audit breakdown, deliverable proof inspector
│   │   └── new/              # 5-step wizard with document dropzone, live GFM preview & AI engine
│   ├── components/           # UI components, navbar, providers, cluster & wallet context
│   │   ├── fydao/            # Campaign cards, proposal cards, milestone dialogs, badges
│   │   └── markdown-content.tsx # GitHub Flavored Markdown renderer (headings, code, tables)
│   ├── explore/              # Public escrow discovery, category filtering, search & stats
│   │   └── fydao/            # Codama-generated typed program client (@solana/kit)
│   ├── governance/           # Governor hub: proposals, voting, timelock queue & token unlock
│   ├── lib/                  # AI audit service, IPFS engine, PDA helpers, wallet connection
│   ├── portfolio/            # Backer portfolio, donation receipts & emergency refund claimer
│   └── verifier/             # Designated verifier portal & deliverable proof builder
├── anchor/
│   ├── programs/fydao/       # The fydao Anchor governance & escrow program (Rust)
│   │   ├── src/instructions/ # 20 Anchor instruction handlers & execution gate
│   │   └── tests/            # Rust unit & LiteSVM on-chain integration tests
│   ├── Architecture.md       # Full smart contract architecture, state PDAs, trust model
│   └── Security.md           # Security audit findings & resolution log
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
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling & UI** | Tailwind CSS v4, shadcn/ui, Lucide Icons |
| **Markdown Engine** | `react-markdown`, `remark-gfm` (GitHub Flavored Markdown) |
| **Solana SDK** | `@solana/kit`, `@wallet-standard/app`, `@wallet-standard/features` |
| **Program Client** | Codama-generated typed client (`@codama/cli`) |
| **Smart Contract** | Anchor 0.30.1 (Rust) on Solana Virtual Machine (SVM) |
| **AI Verification** | In-Memory Privacy Engine + Google Gemini 1.5 Flash (zero retention) |
| **Storage & Proofs** | Pinata Cloud IPFS API + Multi-Gateway Resolution |

---

## 🧪 Testing

Rust unit and **on-chain LiteSVM integration tests** verify the smart contracts against a real in-process Solana Virtual Machine:

```bash
cargo test --manifest-path anchor/Cargo.toml
```

The test suite covers:
* DAO initialization & genesis authority protection (H1)
* Program-controlled governance token minting with hard supply cap (C5/H5)
* Campaign creation with AI Trust Scores & designated verifier assignment (M5)
* Foreign-verifier rejection assertion
* Anti-flash-loan vote locking into per-voter escrow ATAs & token unlock (C2)
* Timelocked permissionless execution triggers (`approve_and_go_live`, `release_milestone`, `emergency_withdraw`)
* Donor refund clawbacks post-emergency drain (M4)

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

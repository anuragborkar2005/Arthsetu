# arthasetu (अर्थसेतु)

A decentralized, privacy-verified milestone crowdfunding DAO on **Solana**. Creators launch campaigns backed by non-custodial stablecoin escrows; an in-memory, privacy-preserving AI engine evaluates supporting documents, cross-examines the project story against technical whitepapers and budget spreadsheets, and binds an on-chain **Trust Score**; an on-chain DAO approves campaigns, releases milestone tranches upon dual-signer deliverable verification, and enforces donor clawback protections.

Built with [Anchor](https://www.anchor-lang.com/) (Rust), Next.js 16 (React 19), `@solana/kit`, Pinata IPFS, Google Gemini, and a [Codama](https://github.com/codama-idl/codama)-generated TypeScript client.

---

## 🏛️ How It Works

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

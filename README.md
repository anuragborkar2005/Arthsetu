# arthasetu (अर्थसेतु)

A decentralized, privacy-verified milestone crowdfunding DAO on **Solana**. Creators launch campaigns backed by non-custodial stablecoin escrows; an in-memory, privacy-preserving AI service evaluates supporting documents and binds an on-chain **Trust Score**; an on-chain DAO approves campaigns, releases milestone tranches upon dual-signer verification, and enforces donor clawback protections.

Built with [Anchor](https://www.anchor-lang.com/) (Rust), Next.js 16 (React 19), `@solana/kit`, and a [Codama](https://github.com/codama-idl/codama)-generated TypeScript client.

---

## 🏛️ How It Works

1. **Campaign Launch & Privacy AI Verification (`/campaigns/new`)**:
   - Creators submit their vision, funding target in USDC, and upload supporting documents (pitch deck, whitepaper, budget sheets).
   - An in-memory, zero-retention **Privacy AI Engine** extracts text, hashes documents with client-side SHA-256, checks for authenticity & AI-generated content probability, and algorithmically computes an on-chain **Trust Score (0–100)**.
   - The creator defines 1 to N milestone roadmap tranches (with 1-click AI auto-generation from uploaded budget sheets) and assigns a **Designated Verifier** (M5).
   - Campaign is registered on Solana with `is_live = false` and metadata pinned to IPFS.

2. **DAO Review & Governance Go-Live (`/governance`)**:
   - The campaign enters the DAO review stage. Assigned verifiers and DAO members inspect the documents and AI Trust Audit report.
   - Sponsoring members propose an on-chain `ApproveCampaign` vote.
   - Token holders vote (`cast_vote`) with voting tokens locked in voter-escrow ATAs (preventing flash-loan voting and buy-vote-dump).
   - Once passed and timelocked, a permissionless trigger executes `approve_and_go_live`, activating public donations.

3. **Public Escrow Funding (`/campaigns/[id]`)**:
   - Donors transfer USDC directly into the campaign's non-custodial Escrow PDA (`donate`).
   - Every donation creates an on-chain `DonationRecord` PDA tracking lifetime contributions for donor clawback protection.

4. **Transparent Deliverable Proofs & Dual-Signer Release (`/verifier`)**:
   - For each milestone tranche, the creator submits verifiable deliverable proofs (git commit hashes, test suite reports, live demo URLs, invoices) pinned to IPFS (`proof_cid`).
   - The **Designated Verifier** audits deliverables and co-signs `propose_milestone` on Solana.
   - The DAO votes on a `ReleaseMilestone` proposal. Upon timelock execution, funds are atomically disbursed to the creator, the milestone PDA closes (returning rent), and donors can inspect the deliverable proof in the public inspector modal.

5. **Emergency Rescue & Donor Clawback (`/portfolio`)**:
   - If a campaign stalls or acts maliciously, the DAO passes `EmergencyWithdraw` to drain remaining escrow to the canonical DAO treasury.
   - Donors can immediately claim their pro-rata refund (`claim_refund`) from remaining escrow funds.

---

## 📁 Project Structure

```
├── app/
│   ├── admin/                # Protocol bootstrap, tokenomics, faucet & pause controls
│   ├── api/ai/audit/         # Next.js API route for Privacy-Preserving AI Trust Scoring
│   ├── campaigns/
│   │   ├── [id]/             # Campaign details, AI audit breakdown, deliverable proof inspector
│   │   └── new/              # 5-step wizard with document upload & AI milestone generator
│   ├── components/           # UI components, navbar, providers, cluster & wallet context
│   │   └── fydao/            # Campaign cards, proposal cards, milestone dialogs, badges
│   ├── explore/              # Public escrow discovery, category filtering, search & stats
│   ├── generated/fydao/      # Codama-generated typed program client (@solana/kit)
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

```shell
# 1. Install dependencies
npm install

# 2. Build Anchor smart contract & generate Codama TypeScript client
npm run setup

# 3. Start Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to explore the dApp.

---

## 🛠️ Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript |
| **Styling & UI** | Tailwind CSS v4, shadcn/ui, Lucide Icons |
| **Solana SDK** | `@solana/kit`, `@wallet-standard/app`, `@wallet-standard/features` |
| **Program Client** | Codama-generated typed client (`@codama/cli`) |
| **Smart Contract** | Anchor 0.30.1 (Rust) on Solana Virtual Machine (SVM) |
| **AI Verification** | In-Memory Privacy Engine + Google Gemini API (zero retention) |
| **Storage & Proofs** | IPFS (deterministic CIDv1 with multi-gateway resolution) |

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

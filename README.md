# arthasetu

A Solana fundraising DAO prototype. Creators launch on-chain campaigns backed by a
stablecoin escrow; a custom governance DAO (running on-chain, not just a multisig)
approves campaigns, releases milestones, handles emergencies, and can change its own
configuration — all through voted, timelocked proposals.

Built with [Anchor](https://www.anchor-lang.com/) (Rust), `@solana/kit`, and a
[Codama](https://github.com/codama-idl/codama)-generated TypeScript client.

## How it works

- **Campaigns.** A creator registers a campaign with metadata, a `trust_score`, and a
  **designated verifier** (M5). Donors transfer a stablecoin into the campaign's escrow
  PDA. Nothing is released until the DAO votes for it.
- **Governance.** A minted governance token is the vote weight. Proposals carry a typed
  `ProposalAction` (`ApproveCampaign | ReleaseMilestone | EmergencyWithdraw |
  TransferAuthority`); votes lock the voter's tokens into escrow (no buy-vote-dump);
  passed proposals queue into a real timelock (`eta` + 14-day window) and are performed
  atomically by permissionless triggers — no single key can move funds.
- **Milestones.** The creator proposes a milestone with an off-chain `proof_cid`; the
  campaign's designated verifier must co-sign it. The DAO votes to release funds from
  escrow to the creator.
- **Safety.** Emergency withdrawal goes only to the DAO treasury, donors get a pro-rata
  clawback, the governance mint is capped against real `mint.supply`, and every
  fund-moving path is proposal-gated.

See `anchor/Architecture.md` and `anchor/Security.md` for the full design and the audit
trail.

## Project Structure

```
├── app/
│   ├── components/           # Wallet/cluster/theme UI (template) + shadcn/ui
│   ├── generated/fydao/      # Codama-generated program client (@solana/kit)
│   ├── lib/                  # Wallet connection, RPC client, hooks, helpers
│   ├── globals.css           # Tailwind v4 + shadcn/ui theme tokens
│   └── page.tsx              # Demo page (template vault card; governance UI not yet built)
├── anchor/
│   ├── programs/fydao/       # The fydao governance program (Rust)
│   │   └── tests/            # Rust unit + LiteSVM on-chain integration tests
│   ├── Architecture.md       # Program architecture, trust model, data flows
│   └── Security.md           # Security audit findings + resolution status
├── components.json           # shadcn/ui config
├── codama.json               # Codama client generation config
└── lib/utils.ts              # cn() helper (shadcn/ui)
```

## Getting Started

```shell
npm install
npm run setup   # Builds the Anchor program and generates the TypeScript client
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect your wallet, and switch
clusters from the header. The demo page is currently the starter-template vault card —
the fydao governance UI (campaigns, proposals, voting) is not built yet; the generated
client in `app/generated/fydao/` is ready to consume.

## Stack

| Layer          | Technology                       |
| -------------- | -------------------------------- |
| Frontend       | Next.js 16, React 19, TypeScript |
| Styling        | Tailwind CSS v4 + shadcn/ui      |
| Solana Client  | `@solana/kit`, wallet-standard   |
| Program Client | Codama-generated, `@solana/kit`  |
| Program        | Anchor (Rust), `fydao`           |

## Testing

Rust tests are the source of truth — unit/PDA tests plus **on-chain integration tests**
that submit real transactions to a real SVM via [LiteSVM](https://github.com/LiteSVM/litesvm).

```bash
npm run anchor-build   # Build the program first (or: cd anchor && anchor build)
npm run anchor-test    # Build + run all cargo tests
```

The integration suite (`anchor/programs/fydao/tests/integration_litesvm.rs`) covers the
full flow: DAO init → governance minting → campaign create → DAO go-live →
foreign-verifier rejection → donation → escrow funding cap → milestone attestation →
vote unlock → governance release.

## Regenerating the Client

If you modify the program, regenerate the TypeScript client:

```bash
npm run setup   # Or: npm run anchor-build && npm run codama:js
```

This uses [Codama](https://github.com/codama-idl/codama) to generate a type-safe client
into `app/generated/fydao/` from the Anchor IDL.

## Deployment

The program ships with the Anchor placeholder ID (`Fg6PaFpo...`) pinned via
`anchor build --ignore-keys`. Before a real deployment:

1. Configure Solana CLI for your cluster (`solana config set --url devnet`).
2. Create/fund a wallet (`solana-keygen new`, `solana airdrop 2`).
3. Build and sync keys:
   ```bash
   cd anchor
   anchor keys sync   # Updates the program ID in source
   anchor build       # Rebuild with the real ID
   anchor deploy
   cd ..
   npm run setup
   ```
4. Set `GENESIS_AUTHORITY` in `anchor/programs/fydao/src/lib.rs` to the deployer key —
   only that key can call `initialize_dao` (H1).

## Learn More

- [Solana Docs](https://solana.com/docs) — core concepts and guides
- [Anchor Docs](https://www.anchor-lang.com/docs/introduction) — program development framework
- [@solana/kit](https://github.com/anza-xyz/kit) — Solana JavaScript SDK
- [Codama](https://github.com/codama-idl/codama) — client generation from IDL
- [LiteSVM](https://github.com/LiteSVM/litesvm) — fast Solana VM for integration tests

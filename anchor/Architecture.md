# fydao — Program Architecture

## 1. Overview

`fydao` is a Solana program written with the Anchor framework (Rust). It combines two subsystems in a single program:

1. **Fundraising / donations** — creators open a *Campaign*, an in-memory Privacy AI engine hashes supporting documents with SHA-256, cross-examines the project story against technical whitepapers/budgets, and records an immutable *Trust Score* (0–100) and designated *Verifier* on Solana. Donors deposit a stablecoin into a PDA-owned escrow, and funds are released to the creator in *Milestones* upon dual-signer verification.
2. **Governance (Governor-style)** — governance-token holders create *Proposals* carrying a typed `ProposalAction`, vote (locking tokens), and the action is performed by a permissionless trigger once the proposal passes, is queued, and its timelock delay elapses.

All source lives under `anchor/programs/fydao/src/`:

```
src/
├── lib.rs                    # declare_id! + top-level instruction dispatch
├── errors.rs                 # FydaoError
├── state/                    # all on-chain account structs + events
│   ├── dao_config.rs         # global protocol config (PDA)
│   ├── governance_token.rs   # governance token meta-state (PDA)
│   ├── campaign.rs           # campaign account (PDA)
│   ├── milestone.rs          # milestone account (PDA, closed on release)
│   ├── proposal.rs           # proposal account + ProposalState/ProposalAction enums (PDA)
│   ├── vote_record.rs        # per-voter vote receipt (PDA, closed on unlock)
│   ├── donation_record.rs    # per-donor contribution record (PDA)
│   └── events.rs             # Anchor #[event] structs (20 events)
└── instructions/             # one file per instruction + shared execution gate
    ├── initialize_dao.rs
    ├── initialize_governance_token.rs
    ├── mint_governance_tokens.rs
    ├── create_campaign.rs
    ├── approve_and_go_live.rs   # proposal-gated trigger
    ├── donate.rs
    ├── propose_milestone.rs
    ├── release_milestone.rs     # proposal-gated trigger; closes Milestone
    ├── emergency_withdraw.rs    # proposal-gated trigger
    ├── claim_refund.rs          # donor clawback after a drain (M4)
    ├── execution.rs             # finalize_execution (timelock + 14-day window gate)
    ├── create_proposal.rs
    ├── cast_vote.rs
    ├── unlock_votes.rs          # returns locked weight; closes VoteRecord
    ├── queue_proposal.rs
    ├── cancel_proposal.rs
    ├── transfer_authority.rs    # proposal-gated trigger (step 1)
    ├── accept_authority.rs      # step 2, signed by the new authority
    └── set_paused.rs            # emergency circuit breaker (authority-gated)
```

## 2. Program ID & Deployment Config

- `declare_id!("HwV2YLJscqtHApqHj3Lp6cW4hA3L7areeWe1PH9BUSBb")` in `lib.rs:9`.
- `anchor/Anchor.toml` declares `[programs.devnet] fydao = "HwV2YLJscqtHApqHj3Lp6cW4hA3L7areeWe1PH9BUSBb"` (also `[programs.localnet]`).
- `initialize_dao` is guarded by the pinned `GENESIS_AUTHORITY` constant (`lib.rs`) — set to the local dev wallet pubkey (the `[provider] wallet`) for the prototype; set it to the real deployer key before a production deployment (H1).

## 3. Account Model

All accounts are PDAs. `Milestone` and `VoteRecord` are **closed** (rent reclaimed) after their final use — on `release_milestone` and `unlock_votes` respectively; the rest remain open for the lifetime of the protocol.

| Account             | Seeds                                                                   | Key fields                                             | Written by                                                      |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `DaoConfig`         | `["dao_config"]`                                                        | authority, pending_authority, treasury, governance_mint, stablecoin_mint, voting params (voting_delay, voting_period, quorum_bps, proposal_threshold, timelock_delay), max_governance_supply, next_proposal_id, campaign_count, paused | `initialize_dao`, `create_campaign`, `create_proposal`, `transfer_authority`, `accept_authority` |
| `GovernanceTokenState` | `["gov_token"]`                                                      | bump, mint, authority, total_minted                     | `initialize_governance_token`, `mint_governance_tokens`          |
| `Campaign`          | `["campaign", creator, campaign_id]`                                    | creator, escrow_token_account, metadata_cid, trust_score, verifier, is_live, total_deposited, total_released, milestone_count, created_at, emergency_withdrawn | `create_campaign`, `approve_and_go_live`, `donate`, `propose_milestone`, `release_milestone`, `emergency_withdraw`, `claim_refund` |
| `Milestone`         | `["milestone", campaign, milestone_id]`                                 | campaign, milestone_id, proof_cid, amount, verified_by, released, proposed_at, released_at | `propose_milestone`, `release_milestone` (**closes**)            |
| `Proposal`          | `["proposal", proposal_id]`                                             | proposer, description, action (`ProposalAction`), total_votes_at_creation, for/against/abstain_votes, state, created_at, vote_start, vote_end, queued_at, eta, executed | `create_proposal`, `cast_vote`, `queue_proposal`, `cancel_proposal`, action triggers (`execution.rs`), `unlock_votes` |
| `VoteRecord`        | `["vote", proposal, voter]`                                             | proposal, voter, support, weight, voted_at, unlocked    | `cast_vote`, `unlock_votes` (**closes**)                         |
| `DonationRecord`    | `["donation", campaign, donor]`                                         | campaign, donor, amount (lifetime contributions)        | `donate`, `claim_refund`                                         |

**Escrow**: a classic SPL Token associated token account (`associated_token::authority = campaign`), i.e. the **Campaign PDA is the token authority** of the escrow. Transfers out of escrow use `CpiContext::new_with_signer(...)` with the campaign PDA seeds (`campaign` + creator + campaign_id + bump).

**Governance mint authority**: the program PDA `["mint_authority"]` (`GovernanceTokenState::MINT_AUTHORITY_SEED`) is granted the governance mint's `MintTo` authority at `initialize_governance_token`. It is a pure signer PDA (no data); it exists so the supply cap cannot be bypassed by a raw SPL `MintTo` (C5/H5).

## 4. Off-Chain Pinata IPFS & Cryptographic Document Model

Campaign and milestone deliverable evidence are pinned to **Pinata Cloud IPFS** and bound immutably to on-chain accounts via content identifiers (CIDs):

### 4.1 Campaign Metadata Schema (`CampaignMetadata`)
Stored at `campaign.metadata_cid`:
```json
{
  "version": "1.1.0",
  "title": "Quantum Solana Oracle",
  "tagline": "Decentralized high-frequency price feeds",
  "category": "defi",
  "description": "# Project Story\n...",
  "targetFundingUsdc": "50000",
  "documents": [
    {
      "name": "Whitepaper-v1.pdf",
      "type": "application/pdf",
      "size": 245800,
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "ipfsCid": "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      "category": "whitepaper"
    }
  ],
  "aiAudit": {
    "trustScore": 92,
    "rating": "Exceptional",
    "aiGeneratedRisk": "Low",
    "aiGeneratedProbability": 12,
    "subScores": {
      "authenticityScore": 95,
      "storyDocumentAlignmentScore": 94,
      "feasibilityScore": 90,
      "verifiabilityScore": 92,
      "aiContentScore": 90
    },
    "storyAlignmentFindings": [
      "Technical architecture in story matches specifications in Whitepaper-v1.pdf",
      "Budget target aligned with itemized infrastructure line items"
    ],
    "storyDiscrepancies": [],
    "auditHash": "0x7a3f91c0e81b2a9d"
  },
  "plannedMilestones": [
    {
      "id": 0,
      "title": "Phase 1: Core Engine & Devnet Deployment",
      "description": "Smart contract deployment on LiteSVM and Solana Devnet",
      "targetAmountUsdc": "20000",
      "estimatedDurationDays": 30
    }
  ],
  "creatorAddress": "7f9a...",
  "verifierAddress": "4u5b..."
}
```

### 4.2 Milestone Proof Metadata Schema (`MilestoneProofMetadata`)
Stored at `milestone.proof_cid`:
```json
{
  "version": "1.1.0",
  "campaignId": "0",
  "milestoneId": "0",
  "title": "Phase 1: Core Engine Deployed to Solana Devnet",
  "description": "Smart contracts compiled with Anchor 0.30.1 and tested against LiteSVM suite.",
  "gitCommit": "7f9a2c3b8a104",
  "liveUrl": "https://devnet.solana.com/address/HwV2YLJscqtHApqHj3Lp6cW4hA3L7areeWe1PH9BUSBb",
  "evidenceLinks": [
    { "label": "Security Audit Report", "url": "https://gateway.pinata.cloud/ipfs/bafy..." }
  ],
  "submittedAt": 1724601600000,
  "submittedBy": "7f9a..."
}
```

## 5. Instruction Groups

### 5.1 Protocol initialization & authority
| Instruction | Signer required | Effect |
|---|---|---|
| `initialize_dao` | `GENESIS_AUTHORITY` only | Creates global `DaoConfig`; sets authority = caller, mint addresses, treasury, voting parameters, `max_governance_supply`. One-time and **front-run-proof** (caller must equal the pinned `GENESIS_AUTHORITY` in `lib.rs`; see Security H1). |
| `initialize_governance_token` | `dao_config.authority` (`has_one`) + current mint authority | Creates `GovernanceTokenState`, **creates the Metaplex metadata record** for the mint (`create_metadata_accounts_v3` CPI honoring `name/symbol/uri`; metadata PDA validated; update authority = program PDA), then **transfers the mint's `MintTo` authority to the program PDA `["mint_authority"]`** (`SetAuthority` CPI), making the program the sole minter. |
| `mint_governance_tokens` | `dao_config.authority` | CPI `mint_to` using the program PDA as signer; cap enforced against the **real `mint.supply`**, not just `total_minted`. |
| `transfer_authority` | none (permissionless) | Proposal-gated trigger (step 1): after a `TransferAuthority` proposal passes + timelock elapses, sets `pending_authority` from `proposal.action` (rejects `Pubkey::default()` and the current authority). |
| `accept_authority` | pending `dao_config.authority` | Step 2: promotes `pending_authority` → `authority`, clears `pending_authority`. |
| `set_paused` | current `dao_config.authority` | Toggles `paused`; enforced on every fund-moving and governance-admin path. |

### 5.2 Campaign lifecycle
```
creator ──create_campaign(metadata_cid, trust_score, verifier)──▶ Campaign(is_live=false, escrow ATA)
[ApproveCampaign proposal passes + queued] ──approve_and_go_live──▶ is_live=true
donor ──donate──▶ stablecoin → escrow ATA, total_deposited += n, DonationRecord[donor] += n
creator + verifier ──propose_milestone(proof_cid, amount)──▶ Milestone(amount, proof_cid)   [requires is_live]
[ReleaseMilestone proposal passes + queued] ──release_milestone──▶ escrow → creator ATA, total_released += n, Milestone closed
[EmergencyWithdraw proposal passes + queued] ──emergency_withdraw──▶ escrow → dao_config.treasury (pinned), emergency_withdrawn=true, total_deposited -= n
donor ──claim_refund──▶ (only after drain) min(DonationRecord[donor], escrow balance) → donor ATA
```

### 5.3 Governance lifecycle
```
holder ──create_proposal(action)──▶ Proposal(Pending, vote_start, vote_end, action)
holder ──cast_vote──▶ VoteRecord created; governance tokens LOCKED into per-voter escrow; for/against/abstain += weight
anyone ──queue_proposal──▶ quorum+result check → Queued(eta = now + timelock_delay)
anyone ──<action trigger>──▶ finalize_execution: now >= eta, within 14-day window → perform action atomically → Executed
proposer | any holder ──cancel_proposal──▶ Canceled
voter ──unlock_votes──▶ returns locked weight once final (Defeated/Canceled/Executed/Expired)
```

## 6. Trust Model

- **DAO-governed fund movement (C3).** `approve_and_go_live`, `release_milestone`, `emergency_withdraw`, and `transfer_authority` are **permissionless triggers** that only act when the proposal they reference has *passed, been queued, and its timelock delay has elapsed* (`execution.rs::finalize_execution`). No single key — not even `dao_config.authority` — can move funds directly.
- **Privacy AI Diligence & Trust Score Binding.** Campaign creation binds an on-chain `trust_score` (0–100) computed from client-side SHA-256 hashed documents, zero-retention text parsing, and deep story-document cross-examination.
- **Governance token holders** vote with a *locked* token balance: `cast_vote` transfers the voted weight into a per-voter escrow ATA (owned by the `["vote_escrow", voter]` PDA) and `unlock_votes` returns it once the proposal reaches a final state.
- **Donors** have a clawback path: `donate` records contributions in a `DonationRecord`, and after a governance-approved `emergency_withdraw` the donor can `claim_refund` up to `min(record, escrow_remaining)`.
- **Dual-Signer Milestone Attestation.** `propose_milestone` requires explicit signatures from both Creator and Designated Verifier (`campaign.verifier`), ensuring deliverables are verified before DAO voting.

## 7. Reference — Data-Flow of a Stablecoin

1. `create_campaign` initializes the escrow ATA owned by the Campaign PDA.
2. `donate` transfers donor → escrow (token program CPI), increments `total_deposited`, and records the contribution in the donor's `DonationRecord`.
3. `release_milestone` (proposal-gated) transfers escrow → creator ATA via campaign PDA signer seeds, increments `total_released`, and closes the `Milestone` account.
4. `emergency_withdraw` (proposal-gated) transfers escrow → `dao_config.treasury` (pinned, never caller-supplied) via the same campaign PDA signer seeds, sets `emergency_withdrawn = true`, and decrements `total_deposited`.
5. `claim_refund` (post-drain) transfers `min(DonationRecord.amount, escrow_remaining)` from the escrow back to the donor via the campaign PDA signer seeds, and decrements both the record and `total_deposited`.

## 8. Governance ↔ Campaigns Actions

- `ApproveCampaign { campaign }` → `approve_and_go_live` flips `campaign.is_live = true`.
- `ReleaseMilestone { campaign, milestone_id }` → `release_milestone` pays the milestone from escrow to the creator.
- `EmergencyWithdraw { campaign, amount }` → `emergency_withdraw` sends up to `amount` from escrow to the treasury.
- `TransferAuthority { new_authority }` → `transfer_authority` sets `pending_authority` (then `accept_authority` completes it).

---

*Arthasetu Smart Contract Architecture · Solana SVM & Anchor 0.30.1.*

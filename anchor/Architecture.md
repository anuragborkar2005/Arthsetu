# fydao — Program Architecture

## 1. Overview

`fydao` is a Solana program written with the Anchor framework (Rust). It combines two subsystems in a single program:

1. **Fundraising / donations** — creators open a *Campaign*, donors deposit a stablecoin into a PDA-owned escrow, and funds are released to the creator in *Milestones*.
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

## 4. Instruction Groups

### 4.1 Protocol initialization & authority
| Instruction | Signer required | Effect |
|---|---|---|
| `initialize_dao` | `GENESIS_AUTHORITY` only | Creates global `DaoConfig`; sets authority = caller, mint addresses, treasury, voting parameters, `max_governance_supply`. One-time and **front-run-proof** (caller must equal the pinned `GENESIS_AUTHORITY` in `lib.rs`; see Security H1). |
| `initialize_governance_token` | `dao_config.authority` (`has_one`) + current mint authority | Creates `GovernanceTokenState`, **creates the Metaplex metadata record** for the mint (`create_metadata_accounts_v3` CPI honoring `name/symbol/uri`; metadata PDA validated; update authority = program PDA), then **transfers the mint's `MintTo` authority to the program PDA `["mint_authority"]`** (`SetAuthority` CPI), making the program the sole minter. |
| `mint_governance_tokens` | `dao_config.authority` | CPI `mint_to` using the program PDA as signer; cap enforced against the **real `mint.supply`**, not just `total_minted`. |
| `transfer_authority` | none (permissionless) | Proposal-gated trigger (step 1): after a `TransferAuthority` proposal passes + timelock elapses, sets `pending_authority` from `proposal.action` (rejects `Pubkey::default()` and the current authority). |
| `accept_authority` | pending `dao_config.authority` | Step 2: promotes `pending_authority` → `authority`, clears `pending_authority`. |
| `set_paused` | current `dao_config.authority` | Toggles `paused`; enforced on every fund-moving and governance-admin path. |

### 4.2 Campaign lifecycle
```
creator ──create_campaign──▶ Campaign(is_live=false, escrow ATA)
[ApproveCampaign proposal passes + queued] ──approve_and_go_live──▶ is_live=true
donor ──donate──▶ stablecoin → escrow ATA, total_deposited += n, DonationRecord[donor] += n
creator ──propose_milestone──▶ Milestone(amount, proof_cid)   [requires is_live]
[ReleaseMilestone proposal passes + queued] ──release_milestone──▶ escrow → creator ATA, total_released += n, Milestone closed
[EmergencyWithdraw proposal passes + queued] ──emergency_withdraw──▶ escrow → dao_config.treasury (pinned), emergency_withdrawn=true, total_deposited -= n
donor ──claim_refund──▶ (only after drain) min(DonationRecord[donor], escrow balance) → donor ATA
```

### 4.3 Governance lifecycle
```
holder ──create_proposal(action)──▶ Proposal(Pending, vote_start, vote_end, action)
holder ──cast_vote──▶ VoteRecord created; governance tokens LOCKED into per-voter escrow; for/against/abstain += weight
anyone ──queue_proposal──▶ quorum+result check → Queued(eta = now + timelock_delay)
anyone ──<action trigger>──▶ finalize_execution: now >= eta, within 14-day window → perform action atomically → Executed
proposer | any holder ──cancel_proposal──▶ Canceled
voter ──unlock_votes──▶ returns locked weight once final (Defeated/Canceled/Executed/Expired)
```

## 5. Trust Model

- **DAO-governed fund movement (C3).** `approve_and_go_live`, `release_milestone`, `emergency_withdraw`, and `transfer_authority` are **permissionless triggers** that only act when the proposal they reference has *passed, been queued, and its timelock delay has elapsed* (`execution.rs::finalize_execution`). No single key — not even `dao_config.authority` — can move funds directly. This is deliberately safer than a PDA-signer governor: the same execution code runs for every proposal, so there is no privileged key to compromise.
- **Residual authority powers.** `dao_config.authority` still initiates `mint_governance_tokens` (up to the `max_governance_supply` cap, so quorum can still be diluted via program mints — C5 residual) and `set_paused` (circuit breaker, cannot move funds). It can also create/vote on proposals itself, subject to the quorum/threshold rules.
- **Governance token holders** vote with a *locked* token balance: `cast_vote` transfers the voted weight into a per-voter escrow ATA (owned by the `["vote_escrow", voter]` PDA) and `unlock_votes` returns it once the proposal reaches a final state. No delegation (removed — was a log-only stub).
- **Donors** have a clawback path: `donate` records contributions in a `DonationRecord`, and after a governance-approved `emergency_withdraw` the donor can `claim_refund` up to `min(record, escrow_remaining)`. Funds can only be drained by a passed `EmergencyWithdraw` proposal to the DAO treasury, not by a single key.
- **Creators** propose milestones with a `proof_cid`; a **designated verifier** (named at campaign creation, endorsed by the DAO approval) must sign the proposal (M5), so the attestation is a first-class on-chain fact. The release itself is still DAO-vote-gated. An external oracle/reputation layer for the verifier remains a residual nice-to-have.

## 6. Notable Architectural Gaps (see Security.md for detail)

| Gap | Location | Impact | Status |
|---|---|---|---|
| Governance could not execute anything (no-op `execute_proposal`) | `instructions/execution.rs` (replaces removed `execute_proposal.rs`) | **Fixed** — proposals carry typed `ProposalAction`s performed atomically by permissionless triggers after timelock elapse | Resolved |
| Single-key fund movement (`approve_*`/`release_*`/`emergency_withdraw` signed by authority) | `instructions/approve_and_go_live.rs` etc. | **Fixed** — all fund-movers are proposal-gated; no key can move funds directly | Resolved |
| Voting weight locked into per-voter escrow at vote time | `instructions/cast_vote.rs`, `unlock_votes.rs` | **Fixed** — buy-vote-dump closed; weight returned only at final states | Resolved |
| Quorum denominator = proposer's own balance | `instructions/create_proposal.rs:73` | **Fixed** — now snapshots `governance_mint.supply` | Resolved |
| "Timelock" is just `dao_config.authority` | `lib.rs` comments | **Fixed** — real timelock via `queue_proposal` `eta` + `execution.rs` window, no signer required | Resolved |
| `delegate_votes` was a log-only no-op | `instructions/delegate_votes.rs` (deleted) | **Fixed** — instruction removed; the interface no longer advertises delegation | Resolved |
| Token metadata args ignored | `instructions/initialize_governance_token.rs` | **Fixed** — Metaplex metadata record created via CPI (M1) | Resolved |
| No donor recourse after a drain | `instructions/claim_refund.rs`, `state/donation_record.rs` | **Fixed** — per-donor records + `claim_refund` clawback (M4) | Resolved |
| No structured events | `state/events.rs` | **Fixed** — 20 Anchor `#[event]`s emitted by all handlers (L3) | Resolved |
| Rent locked in short-lived PDAs | `release_milestone.rs`, `unlock_votes.rs` | **Fixed** — `Milestone` and `VoteRecord` closed on final use (L4) | Resolved |
| `paused` flag enforcement | `instructions/set_paused.rs` | **Fixed** — now enforced on all fund-moving and governance-admin paths | Resolved |
| `emergency_withdrawn` enforcement | `instructions/donate.rs:43`, `release_milestone.rs:49`, `propose_milestone.rs:47` | **Fixed** — campaign frozen after drain | Resolved |
| `initialize_dao` is front-runnable | `instructions/initialize_dao.rs`, `lib.rs` (`GENESIS_AUTHORITY`) | **Fixed** — only the pinned genesis key can bootstrap the single global PDA | Resolved |
| Milestone `proof_cid` self-attested | `instructions/propose_milestone.rs`, `create_campaign.rs` | **Fixed** — designated `verifier` must sign (`InvalidVerifier`); `verified_by`/`verified_at` recorded; release stays DAO-gated. Oracle layer remains residual (M5) | Resolved |
| No on-chain integration tests (TS suite mutated local objects) | `tests/integration_litesvm.rs` | **Fixed** — full-lifecycle and gate regression tests run real transactions against a real SVM (LiteSVM) (H8) | Resolved |

**Fixes applied across the audit rounds** (verified in git history): `set_paused` added; `queue_proposal` persists `Defeated`; `transfer_authority` rejects zero address; `initialize_dao` validates delays/quorum **and is guarded by `GENESIS_AUTHORITY` (H1)**; `finalize_execution` persists `Expired` and enforces the 14-day window; `paused` enforced on all fund-moving/admin paths; `emergency_withdrawn` enforced on all campaign write paths; governance mint's `MintTo` authority transferred to a **program PDA** and the `max_governance_supply` cap enforced against the **real `mint.supply`** (C5/H5/M10); `create_proposal` snapshots mint supply; two-step authority transfer (`transfer_authority` + `accept_authority`); emergency-withdraw destination pinned to `dao_config.treasury`; **vote-locking via per-voter escrow + `unlock_votes` (C2)**; `trust_score` bounded to 0–100; **typed `ProposalAction` + real proposal-gated execution (C1/C3/C4, M3)**: `execute_proposal` deleted, timelock moved to `execution.rs::finalize_execution`, and `approve_and_go_live`/`release_milestone`/`emergency_withdraw`/`transfer_authority` became permissionless proposal-gated triggers; **designated milestone verifier (M5)**; **real on-chain integration tests via LiteSVM (H8)**.

## 7. Reference — data-flow of a stablecoin

1. `create_campaign` initializes the escrow ATA owned by the Campaign PDA.
2. `donate` transfers donor → escrow (token program CPI), increments `total_deposited`, and records the contribution in the donor's `DonationRecord`.
3. `release_milestone` (proposal-gated) transfers escrow → creator ATA via campaign PDA signer seeds, increments `total_released`, and closes the `Milestone` account.
4. `emergency_withdraw` (proposal-gated) transfers escrow → `dao_config.treasury` (pinned, never caller-supplied) via the same campaign PDA signer seeds, sets `emergency_withdrawn = true`, and decrements `total_deposited`. `donate`/`propose_milestone`/`release_milestone` block once the flag is set.
5. `claim_refund` (post-drain) transfers `min(DonationRecord.amount, escrow_remaining)` from the escrow back to the donor via the campaign PDA signer seeds, and decrements both the record and `total_deposited`.

## 8. Governance ↔ campaigns (how a proposal changes the world)

Proposals and campaigns are now connected through the typed `ProposalAction`:

- `ApproveCampaign { campaign }` → `approve_and_go_live` flips `campaign.is_live = true`.
- `ReleaseMilestone { campaign, milestone_id }` → `release_milestone` pays the milestone from escrow to the creator.
- `EmergencyWithdraw { campaign, amount }` → `emergency_withdraw` sends up to `amount` from escrow to the treasury.
- `TransferAuthority { new_authority }` → `transfer_authority` sets `pending_authority` (then `accept_authority` completes it).

Each trigger loads the `Proposal`, requires `proposal.action == <expected variant>` (error `ActionMismatch` otherwise), and calls `execution.rs::finalize_execution(proposal, clock)` which enforces: state `Queued`, `now >= eta`, `!executed`, and `now <= eta + 14 days` (else it persists `Expired` and no-ops). Only if all checks pass does it perform the action and then set `state = Executed; executed = true` in the same transaction — the action and the `Executed` transition are atomic, so a proposal can never be executed twice.

## 9. User Stories

The architecture is best understood from the people who use it. There are five roles plus a permissionless set of "triggerers" that act as relays for decisions the DAO has already made.

| Persona | On-chain identity | What they are allowed to do |
|---|---|---|
| **Genesis** (deployer) | pinned `GENESIS_AUTHORITY` (`lib.rs`) | one-time `initialize_dao` |
| **DAO authority** | `dao_config.authority` | admin only: `set_paused`, capped `mint_governance_tokens`, token bootstrap, accept a DAO-nominated authority transfer |
| **Campaign creator** | `creator` signer | `create_campaign`, `propose_milestone` |
| **Donor** | `donor` signer | `donate`, `claim_refund` (post-drain) |
| **Governance holder** | governance token balance + signer | `create_proposal`, `cast_vote`, `unlock_votes` |
| **Triggerer** | anyone, permissionless | `queue_proposal`, `approve_and_go_live`, `release_milestone`, `emergency_withdraw` |

The central idea: **creators and donors touch money directly, but nobody — not even `dao_config.authority` — can move escrow funds without a passed, queued, timelocked proposal.** Triggerers are just relays that fire an already-authorized decision.

### 9.1 Genesis bootstrap
**As the deployer, I want to launch the DAO exactly once, so I can configure its rules.**

`GENESIS_AUTHORITY` signs `initialize_dao`, creating the single global `DaoConfig` PDA (`["dao_config"]`) that holds the treasury token account, the governance and stablecoin mints, and the constitutional parameters (`voting_delay`, `voting_period`, `quorum_bps`, `proposal_threshold`, `max_governance_supply`, `timelock_delay`). Because the signer must equal the pinned constant, the one global PDA can never be front-run (H1).

### 9.2 Issuing the governance token
**As the DAO authority, I want the governance token to have real identity and a hard supply cap, so holders cannot be diluted arbitrarily.**

`initialize_governance_token` creates the Metaplex metadata record from `name`/`symbol`/`uri` and transfers the mint's `MintTo` authority to the program PDA `["mint_authority"]`. From then on the **program is the only possible minter**. `mint_governance_tokens` (authority-signed) mints up to `max_governance_supply`, checked against the real `mint.supply` — so tokens can neither be minted outside the program nor exceed the cap inside it (C5/M10).

### 9.3 Launching a campaign
**As a creator, I want to open a fundraiser, so donors can fund my project.**

`create_campaign` builds the `Campaign` PDA (`["campaign", creator, campaign_id]`) and its escrow ATA — a stablecoin account owned by the campaign PDA itself. The campaign starts `is_live = false`.

**As a holder, I want a say in which campaigns go live, so bad actors cannot accept donations immediately.**

The creator cannot go live alone. A holder must pass `ProposalAction::ApproveCampaign { campaign }` through the full lifecycle; once executed, a triggerer calls `approve_and_go_live` and the campaign flips to live.

### 9.4 Donating
**As a donor, I want to fund a live campaign and keep a receipt, so I can prove my contribution and claw it back if things go wrong.**

`donate` transfers stablecoins into the escrow and records the lifetime contribution in a `DonationRecord` (`["donation", campaign, donor]`). The escrow's authority is the **campaign PDA**, so the only ways funds ever leave are a passed `ReleaseMilestone` or `EmergencyWithdraw` proposal, or the donor's own post-drain `claim_refund`.

### 9.5 Getting paid via milestones
**As a creator, I want to receive escrow funds in stages, so I am paid as I deliver.**

`propose_milestone` attaches a self-attested `proof_cid` and an amount bounded by `total_deposited − total_released`.

**As a holder, I want to review and authorize each payment, so funds are not released on the creator's say-so.**

The DAO votes a `ReleaseMilestone { campaign, milestone_id }` proposal through the lifecycle. Once executed by a triggerer, the payment flows escrow → creator via campaign-PDA signer seeds, the `Milestone` account is **closed** (rent returned), and a `MilestoneReleased` event fires for indexers.

### 9.6 The voting loop (the heart of the system)
**As a holder, I want to create and vote on proposals, so my tokens control the DAO.**

- `create_proposal` — requires a balance ≥ `proposal_threshold`, snapshots `governance_mint.supply` as the quorum denominator, and computes `vote_start`/`vote_end` from the config.
- `cast_vote` — my weight equals my token balance, which is **locked into a per-voter escrow** ATA while the vote is live (no buy-vote-dump). The `VoteRecord` marks that I have voted.
- `queue_proposal` — after voting ends, quorum (`quorum_bps` of the snapshot) and majority decide `Succeeded` vs `Defeated`; a winner is queued with `eta = now + timelock_delay`.

**As a triggerer, I want to execute passed proposals without holding any authority, so a proposal cannot be blocked by an absent key.**

Any action trigger calls `finalize_execution`, which enforces `Queued`, `now ≥ eta`, and the 14-day window (else the proposal is persisted as `Expired`). If all checks pass the action runs atomically and the proposal becomes `Executed`.

**As a voter, I want my locked tokens back once the outcome is decided.**

`unlock_votes` returns the escrowed weight once the proposal reaches a final state (`Defeated`/`Canceled`/`Executed`/`Expired`) and closes the `VoteRecord`.

### 9.7 Emergency exit and donor recourse
**As a holder, I want to rescue funds from a stalled campaign, so money is not stuck forever.**

A `EmergencyWithdraw { campaign, amount }` proposal, after passing the lifecycle, lets a triggerer drain up to `amount` from the escrow **to the canonical DAO treasury** (pinned in `DaoConfig`, never caller-supplied). The campaign is frozen: `emergency_withdrawn = true` blocks new donations, milestone proposals, and releases.

**As a donor, I want my share back after a drain, so a rescue does not just confiscate my contribution.**

`claim_refund` transfers `min(DonationRecord.amount, escrow_remaining)` back to the donor via campaign-PDA signer seeds, decrementing both the record and `total_deposited`.

### 9.8 Guardrails
**As the DAO authority, I want a circuit breaker and a safe way to hand over power.**

- `set_paused` freezes every fund-moving and governance-admin path.
- Authority handover is two-step: the DAO votes `TransferAuthority` to nominate `pending_authority`, then the **new key** signs `accept_authority`. A PDA can never be nominated-and-accepted, so the protocol cannot be orphaned (C4/M9).

### 9.9 The connecting thread
Every money flow runs through the same loop — *proposal → vote (locked) → queue (timelock) → execute (permissionless) → event*. Donations and milestone proofs are the only creator/donor-trusted inputs; everything else is governed. All state transitions emit Anchor `#[event]`s so indexers can reconstruct history without parsing logs.

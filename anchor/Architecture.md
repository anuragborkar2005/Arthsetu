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
├── state/                    # all on-chain account structs
│   ├── dao_config.rs         # global protocol config (PDA)
│   ├── governance_token.rs   # governance token meta-state (PDA)
│   ├── campaign.rs           # campaign account (PDA)
│   ├── milestone.rs          # milestone account (PDA)
│   ├── proposal.rs           # proposal account + ProposalState/ProposalAction enums (PDA)
│   └── vote_record.rs        # per-voter vote receipt (PDA)
└── instructions/             # one file per instruction + shared execution gate
    ├── initialize_dao.rs
    ├── initialize_governance_token.rs
    ├── mint_governance_tokens.rs
    ├── delegate_votes.rs
    ├── create_campaign.rs
    ├── approve_and_go_live.rs   # proposal-gated trigger
    ├── donate.rs
    ├── propose_milestone.rs
    ├── release_milestone.rs     # proposal-gated trigger
    ├── emergency_withdraw.rs    # proposal-gated trigger
    ├── execution.rs             # finalize_execution (timelock + 14-day window gate)
    ├── create_proposal.rs
    ├── cast_vote.rs
    ├── unlock_votes.rs
    ├── queue_proposal.rs
    ├── cancel_proposal.rs
    ├── transfer_authority.rs    # proposal-gated trigger (step 1)
    ├── accept_authority.rs      # step 2, signed by the new authority
    └── set_paused.rs            # emergency circuit breaker (authority-gated)
```

## 2. Program ID & Deployment Config

- `declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS")` in `lib.rs:9`.
  This is the well-known **Anchor placeholder / example ID** — the program is not deployed under a real keypair as written.
- `anchor/Anchor.toml` declares `[programs.devnet] fydao = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"` (also `[programs.localnet]`).
  Program name and ID are now aligned with `declare_id!` (M8), but the ID is still the Anchor placeholder — `anchor keys sync` + a real keypair are required before any real deploy.
- `initialize_dao` is guarded by the pinned `GENESIS_AUTHORITY` constant (`lib.rs`) — set to the local dev wallet pubkey (the `[provider] wallet`) for the prototype; set it to the real deployer key before a production deployment (H1).

## 3. Account Model

All accounts are PDAs; none are closed/reclaimed after use.

| Account             | Seeds                                                                   | Key fields                                             | Written by                                                      |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `DaoConfig`         | `["dao_config"]`                                                        | authority, pending_authority, treasury, governance_mint, stablecoin_mint, voting params (voting_delay, voting_period, quorum_bps, proposal_threshold, timelock_delay), max_governance_supply, next_proposal_id, campaign_count, paused | `initialize_dao`, `create_campaign`, `create_proposal`, `transfer_authority`, `accept_authority` |
| `GovernanceTokenState` | `["gov_token"]`                                                      | bump, mint, authority, total_minted                     | `initialize_governance_token`, `mint_governance_tokens`          |
| `Campaign`          | `["campaign", creator, campaign_id]`                                    | creator, escrow_token_account, metadata_cid, trust_score, is_live, total_deposited, total_released, milestone_count, created_at, emergency_withdrawn | `create_campaign`, `approve_and_go_live`, `donate`, `propose_milestone`, `release_milestone`, `emergency_withdraw` |
| `Milestone`         | `["milestone", campaign, milestone_id]`                                 | campaign, milestone_id, proof_cid, amount, released, proposed_at, released_at | `propose_milestone`, `release_milestone`                         |
| `Proposal`          | `["proposal", proposal_id]`                                             | proposer, description, action (`ProposalAction`), total_votes_at_creation, for/against/abstain_votes, state, created_at, vote_start, vote_end, queued_at, eta, executed | `create_proposal`, `cast_vote`, `queue_proposal`, `cancel_proposal`, action triggers (`execution.rs`), `unlock_votes` |
| `VoteRecord`        | `["vote", proposal, voter]`                                             | proposal, voter, support, weight, voted_at, unlocked    | `cast_vote`, `unlock_votes`                                      |

**Escrow**: a classic SPL Token associated token account (`associated_token::authority = campaign`), i.e. the **Campaign PDA is the token authority** of the escrow. Transfers out of escrow use `CpiContext::new_with_signer(...)` with the campaign PDA seeds (`campaign` + creator + campaign_id + bump).

**Governance mint authority**: the program PDA `["mint_authority"]` (`GovernanceTokenState::MINT_AUTHORITY_SEED`) is granted the governance mint's `MintTo` authority at `initialize_governance_token`. It is a pure signer PDA (no data); it exists so the supply cap cannot be bypassed by a raw SPL `MintTo` (C5/H5).

## 4. Instruction Groups

### 4.1 Protocol initialization & authority
| Instruction | Signer required | Effect |
|---|---|---|
| `initialize_dao` | `GENESIS_AUTHORITY` only | Creates global `DaoConfig`; sets authority = caller, mint addresses, treasury, voting parameters, `max_governance_supply`. One-time and **front-run-proof** (caller must equal the pinned `GENESIS_AUTHORITY` in `lib.rs`; see Security H1). |
| `initialize_governance_token` | `dao_config.authority` (`has_one`) + current mint authority | Creates `GovernanceTokenState` and **transfers the mint's `MintTo` authority to the program PDA `["mint_authority"]`** (`SetAuthority` CPI), making the program the sole minter. `name/symbol/uri` args are **ignored** (no metadata created). |
| `mint_governance_tokens` | `dao_config.authority` | CPI `mint_to` using the program PDA as signer; cap enforced against the **real `mint.supply`**, not just `total_minted`. |
| `transfer_authority` | none (permissionless) | Proposal-gated trigger (step 1): after a `TransferAuthority` proposal passes + timelock elapses, sets `pending_authority` from `proposal.action` (rejects `Pubkey::default()` and the current authority). |
| `accept_authority` | pending `dao_config.authority` | Step 2: promotes `pending_authority` → `authority`, clears `pending_authority`. |
| `set_paused` | current `dao_config.authority` | Toggles `paused`; enforced on every fund-moving and governance-admin path. |

### 4.2 Campaign lifecycle
```
creator ──create_campaign──▶ Campaign(is_live=false, escrow ATA)
[ApproveCampaign proposal passes + queued] ──approve_and_go_live──▶ is_live=true
donor ──donate──▶ stablecoin → escrow ATA, total_deposited += n
creator ──propose_milestone──▶ Milestone(amount, proof_cid)   [requires is_live]
[ReleaseMilestone proposal passes + queued] ──release_milestone──▶ escrow → creator ATA, total_released += n, milestone.released=true
[EmergencyWithdraw proposal passes + queued] ──emergency_withdraw──▶ escrow → dao_config.treasury (pinned), emergency_withdrawn=true
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
- **Governance token holders** vote with a *locked* token balance: `cast_vote` transfers the voted weight into a per-voter escrow ATA (owned by the `["vote_escrow", voter]` PDA) and `unlock_votes` returns it once the proposal reaches a final state. No delegation yet (see Security C2/C4).
- **Donors** have no recourse: no refund/claim path. Funds can only be drained by a passed `EmergencyWithdraw` proposal to the DAO treasury, not by a single key.
- **Creators** self-attest milestone `proof_cid`; there is no on-chain or oracle verification.

## 6. Notable Architectural Gaps (see Security.md for detail)

| Gap | Location | Impact | Status |
|---|---|---|---|
| Governance could not execute anything (no-op `execute_proposal`) | `instructions/execution.rs` (replaces removed `execute_proposal.rs`) | **Fixed** — proposals carry typed `ProposalAction`s performed atomically by permissionless triggers after timelock elapse | Resolved |
| Single-key fund movement (`approve_*`/`release_*`/`emergency_withdraw` signed by authority) | `instructions/approve_and_go_live.rs` etc. | **Fixed** — all fund-movers are proposal-gated; no key can move funds directly | Resolved |
| Voting weight locked into per-voter escrow at vote time | `instructions/cast_vote.rs`, `unlock_votes.rs` | **Fixed** — buy-vote-dump closed; weight returned only at final states | Resolved |
| Quorum denominator = proposer's own balance | `instructions/create_proposal.rs:73` | **Fixed** — now snapshots `governance_mint.supply` | Resolved |
| "Timelock" is just `dao_config.authority` | `lib.rs` comments | **Fixed** — real timelock via `queue_proposal` `eta` + `execution.rs` window, no signer required | Resolved |
| `delegate_votes` is a log-only no-op | `instructions/delegate_votes.rs:30` | Delegation feature is not implemented | Open |
| Token metadata args ignored | `instructions/initialize_governance_token.rs:36` | Metadata feature not implemented | Open |
| `paused` flag enforcement | `instructions/set_paused.rs` | **Fixed** — now enforced on all fund-moving and governance-admin paths | Resolved |
| `emergency_withdrawn` enforcement | `instructions/donate.rs:43`, `release_milestone.rs:49`, `propose_milestone.rs:47` | **Fixed** — campaign frozen after drain | Resolved |
| `initialize_dao` is front-runnable | `instructions/initialize_dao.rs`, `lib.rs` (`GENESIS_AUTHORITY`) | **Fixed** — only the pinned genesis key can bootstrap the single global PDA | Resolved |

**Fixes applied across the audit rounds** (verified in git history): `set_paused` added; `queue_proposal` persists `Defeated`; `transfer_authority` rejects zero address; `initialize_dao` validates delays/quorum **and is guarded by `GENESIS_AUTHORITY` (H1)**; `finalize_execution` persists `Expired` and enforces the 14-day window; `paused` enforced on all fund-moving/admin paths; `emergency_withdrawn` enforced on all campaign write paths; governance mint's `MintTo` authority transferred to a **program PDA** and the `max_governance_supply` cap enforced against the **real `mint.supply`** (C5/H5/M10); `create_proposal` snapshots mint supply; two-step authority transfer (`transfer_authority` + `accept_authority`); emergency-withdraw destination pinned to `dao_config.treasury`; **vote-locking via per-voter escrow + `unlock_votes` (C2)**; `trust_score` bounded to 0–100; **typed `ProposalAction` + real proposal-gated execution (C1/C3/C4, M3)**: `execute_proposal` deleted, timelock moved to `execution.rs::finalize_execution`, and `approve_and_go_live`/`release_milestone`/`emergency_withdraw`/`transfer_authority` became permissionless proposal-gated triggers.

## 7. Reference — data-flow of a stablecoin

1. `create_campaign` initializes the escrow ATA owned by the Campaign PDA.
2. `donate` transfers donor → escrow (token program CPI) and increments `total_deposited`.
3. `release_milestone` (proposal-gated) transfers escrow → creator ATA via campaign PDA signer seeds, increments `total_released`, flips `milestone.released`.
4. `emergency_withdraw` (proposal-gated) transfers escrow → `dao_config.treasury` (pinned, never caller-supplied) via the same campaign PDA signer seeds, sets `emergency_withdrawn = true`. `donate` blocks further donations once set; `release_milestone` also enforces it.

## 8. Governance ↔ campaigns (how a proposal changes the world)

Proposals and campaigns are now connected through the typed `ProposalAction`:

- `ApproveCampaign { campaign }` → `approve_and_go_live` flips `campaign.is_live = true`.
- `ReleaseMilestone { campaign, milestone_id }` → `release_milestone` pays the milestone from escrow to the creator.
- `EmergencyWithdraw { campaign, amount }` → `emergency_withdraw` sends up to `amount` from escrow to the treasury.
- `TransferAuthority { new_authority }` → `transfer_authority` sets `pending_authority` (then `accept_authority` completes it).

Each trigger loads the `Proposal`, requires `proposal.action == <expected variant>` (error `ActionMismatch` otherwise), and calls `execution.rs::finalize_execution(proposal, clock)` which enforces: state `Queued`, `now >= eta`, `!executed`, and `now <= eta + 14 days` (else it persists `Expired` and no-ops). Only if all checks pass does it perform the action and then set `state = Executed; executed = true` in the same transaction — the action and the `Executed` transition are atomic, so a proposal can never be executed twice.

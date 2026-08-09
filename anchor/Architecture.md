# fydao — Program Architecture

## 1. Overview

`fydao` is a Solana program written with the Anchor framework (Rust). It combines two subsystems in a single program:

1. **Fundraising / donations** — creators open a *Campaign*, donors deposit a stablecoin into a PDA-owned escrow, and funds are released to the creator in *Milestones*.
2. **Governance (Governor-style)** — governance-token holders create *Proposals*, vote, and (nominally) execute them through a timelock-like state machine.

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
│   ├── proposal.rs           # proposal account + ProposalState enum (PDA)
│   └── vote_record.rs        # per-voter vote receipt (PDA)
└── instructions/             # one file per instruction (17 total)
    ├── initialize_dao.rs
    ├── initialize_governance_token.rs
    ├── mint_governance_tokens.rs
    ├── delegate_votes.rs
    ├── create_campaign.rs
    ├── approve_and_go_live.rs
    ├── donate.rs
    ├── propose_milestone.rs
    ├── release_milestone.rs
    ├── emergency_withdraw.rs
    ├── create_proposal.rs
    ├── cast_vote.rs
    ├── queue_proposal.rs
    ├── execute_proposal.rs
    ├── cancel_proposal.rs
    ├── transfer_authority.rs
    └── set_paused.rs
```

## 2. Program ID & Deployment Config

- `declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS")` in `lib.rs:9`.
  This is the well-known **Anchor placeholder / example ID** — the program is not deployed under a real keypair as written.
- `anchor/Anchor.toml` declares `[programs.devnet] vault = "CiKqdLCkp3VJBYhb6QCBPywJNy8aXLzUbvufWFz9qfYk"`.
  This is **inconsistent**: the section is named `vault`, but the crate/program is `fydao`, and the ID does not match `declare_id!`. Deployment config must be regenerated before any real deploy.

## 3. Account Model

All accounts are PDAs; none are closed/reclaimed after use.

| Account             | Seeds                                                                   | Key fields                                             | Written by                                                      |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| `DaoConfig`         | `["dao_config"]`                                                        | authority, governance_mint, stablecoin_mint, voting params (voting_delay, voting_period, quorum_bps, proposal_threshold, timelock_delay), next_proposal_id, campaign_count, paused | `initialize_dao`, `create_campaign`, `create_proposal`, `transfer_authority` |
| `GovernanceTokenState` | `["gov_token"]`                                                      | bump, mint, authority, total_minted                     | `initialize_governance_token`, `mint_governance_tokens`          |
| `Campaign`          | `["campaign", creator, campaign_id]`                                    | creator, escrow_token_account, metadata_cid, trust_score, is_live, total_deposited, total_released, milestone_count, created_at, emergency_withdrawn | `create_campaign`, `approve_and_go_live`, `donate`, `propose_milestone`, `release_milestone`, `emergency_withdraw` |
| `Milestone`         | `["milestone", campaign, milestone_id]`                                 | campaign, milestone_id, proof_cid, amount, released, proposed_at, released_at | `propose_milestone`, `release_milestone`                         |
| `Proposal`          | `["proposal", proposal_id]`                                             | proposer, description, instruction_data, total_votes_at_creation, for/against/abstain_votes, state, created_at, vote_start, vote_end, queued_at, eta, executed | `create_proposal`, `cast_vote`, `queue_proposal`, `execute_proposal`, `cancel_proposal` |
| `VoteRecord`        | `["vote", proposal, voter]`                                             | proposal, voter, support, weight, voted_at              | `cast_vote`                                                      |

**Escrow**: a classic SPL Token associated token account (`associated_token::authority = campaign`), i.e. the **Campaign PDA is the token authority** of the escrow. Transfers out of escrow use `CpiContext::new_with_signer(...)` with the campaign PDA seeds (`campaign` + creator + campaign_id + bump).

## 4. Instruction Groups

### 4.1 Protocol initialization & authority
| Instruction | Signer required | Effect |
|---|---|---|
| `initialize_dao` | none (anyone) | Creates global `DaoConfig`; sets authority = caller, mint addresses, voting parameters. One-time, but **front-runnable** (see Security H1). |
| `initialize_governance_token` | `dao_config.authority` (`has_one`) | Creates `GovernanceTokenState` pointing at a caller-supplied mint. `name/symbol/uri` args are **ignored** (no metadata created). |
| `mint_governance_tokens` | `dao_config.authority` **and** a separate `mint_authority` signer | CPI `mint_to` of the governance mint; increments `total_minted`. |
| `transfer_authority` | current `dao_config.authority` | Overwrites `dao_config.authority` with any non-zero pubkey (single-step; no confirmation round). |
| `set_paused` | current `dao_config.authority` | Toggles `paused`. **Note:** most admin instructions still do not read `paused` (see gaps). |

### 4.2 Campaign lifecycle
```
creator ──create_campaign──▶ Campaign(is_live=false, escrow ATA)
authority ──approve_and_go_live──▶ is_live=true
donor ──donate──▶ stablecoin → escrow ATA, total_deposited += n
creator ──propose_milestone──▶ Milestone(amount, proof_cid)   [requires is_live]
authority ──release_milestone──▶ escrow → creator ATA, total_released += n, milestone.released=true
authority ──emergency_withdraw──▶ escrow → arbitrary destination ATA
```

### 4.3 Governance lifecycle
```
holder ──create_proposal──▶ Proposal(Pending, vote_start, vote_end)
holder ──cast_vote──▶ VoteRecord created; for/against/abstain += voter's live token balance
anyone ──queue_proposal──▶ quorum+result check → Queued(eta = now + timelock_delay)
authority ──execute_proposal──▶ marks Executed (no real action performed)
proposer | authority ──cancel_proposal──▶ Canceled
```

## 5. Trust Model

- **`dao_config.authority` is the single root of trust.** This one EOA key can:
  - approve campaigns (`approve_and_go_live`),
  - release milestone funds to creators (`release_milestone`),
  - drain every campaign escrow (`emergency_withdraw`),
  - mint unlimited governance tokens (`mint_governance_tokens`),
  - transfer authority to anyone (`transfer_authority`),
  - pause/unpause the protocol (`set_paused`),
  - cancel/execute proposals.
  There is **no multisig, no timelock program, and no governance gating on any fund movement**. The protocol is only as trustworthy as this one key.
- **Governance token holders** have voting influence proportional to their *live* token balance (no snapshots, no delegation — see Security C2/C4).
- **Donors** have no recourse: no refund/claim path, and funds can be drained by authority at any time.
- **Creators** self-attest milestone `proof_cid`; there is no on-chain or oracle verification.

## 6. Notable Architectural Gaps (see Security.md for detail)

| Gap | Location | Impact | Status |
|---|---|---|---|
| `execute_proposal` performs no actual action | `instructions/execute_proposal.rs:56` | Governance cannot execute anything; proposals are cosmetic | Open |
| Voting weight = live balance; no snapshot | `instructions/cast_vote.rs:68` | Governance capture via token movement | Open |
| Quorum denominator = proposer's own balance | `instructions/create_proposal.rs:73` | **Fixed** — now snapshots `governance_mint.supply` | Resolved |
| "Timelock" is just `dao_config.authority` | `lib.rs` comments | No real timelock; transfer-to-PDA breaks signing (PDAs cannot sign) | Open |
| `delegate_votes` is a log-only no-op | `instructions/delegate_votes.rs:30` | Delegation feature is not implemented | Open |
| Token metadata args ignored | `instructions/initialize_governance_token.rs:36` | Metadata feature not implemented | Open |
| `paused` flag enforcement | `instructions/set_paused.rs` | **Fixed** — now enforced on all fund-moving and governance-admin paths | Resolved |
| `emergency_withdrawn` enforcement | `instructions/donate.rs:43`, `release_milestone.rs:49`, `propose_milestone.rs:47` | **Fixed** — campaign frozen after drain | Resolved |

**Fixes applied across the audit rounds** (verified in git history): `set_paused` added; `queue_proposal` persists `Defeated`; `transfer_authority` rejects zero address; `initialize_dao` validates delays/quorum; `execute_proposal` persists `Expired` and enforces the 14-day window; `paused` enforced on all fund-moving/admin paths; `emergency_withdrawn` enforced on all campaign write paths; `mint_authority` constrained to DAO authority; `create_proposal` snapshots mint supply.

## 7. Reference — data-flow of a stablecoin

1. `create_campaign` initializes the escrow ATA owned by the Campaign PDA.
2. `donate` transfers donor → escrow (token program CPI) and increments `total_deposited`.
3. `release_milestone` transfers escrow → creator ATA via campaign PDA signer seeds, increments `total_released`, flips `milestone.released`.
4. `emergency_withdraw` transfers escrow → caller-supplied destination via the same campaign PDA signer seeds, sets `emergency_withdrawn = true`. `donate` blocks further donations once set; `release_milestone` does **not**.

Governance flow is **fully parallel and unconnected**: proposals store `instruction_data` bytes that are never decoded, and `execute_proposal` never performs a CPI to `release_milestone`, `approve_and_go_live`, or anything else.

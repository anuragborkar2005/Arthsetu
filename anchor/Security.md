# fydao — Security Analysis

Review scope: `anchor/programs/fydao` (Anchor 1.1.2, SPL Token). Status as of review date: **pre-audit / prototype**.

**Re-verified against git `HEAD`** (commits `8b74fac` → `7a2d797`), **plus a remediation pass that landed the following handler-level fixes (no IDL/account changes):**

- `execute_proposal` persists `Expired` and returns `Ok(())` instead of `err!` — the H3 revert regression is fixed
- `paused` is now enforced on **every fund-moving and governance-admin path**: `emergency_withdraw`, `approve_and_go_live`, `propose_milestone`, `queue_proposal`, `cancel_proposal`, `transfer_authority` (H6)
- `propose_milestone` also rejects once `campaign.emergency_withdrawn` (completes M6)

**Resolved (from the earlier commits)**
- `create_proposal` now snapshots `governance_mint.supply` for the quorum denominator instead of the proposer's balance (half of C2).
- `queue_proposal` persists `Defeated` and returns `Ok(())` (H2), and uses `checked_*` arithmetic (L1).
- `cancel_proposal` restricts `Queued`/`Succeeded` cancellation to DAO authority (H4).
- `mint_governance_tokens` constrains `mint_authority == dao_config.authority`, checks pause, and enforces `max_governance_supply` cap (C5, H5, M10).
- Two-step authority transfer implemented via `transfer_authority` and `accept_authority` (M9 **resolved**).
- `emergency_withdraw` destination constrained to canonical `dao_config.treasury` (M7 **resolved**).
- Program ID and program name aligned in `Anchor.toml` and `lib.rs` (M8 **resolved**).
- `donate` and `release_milestone` reject after `emergency_withdrawn` with a dedicated `EmergencyWithdrawn` error (M6, L6).
- `initialize_dao` validates `voting_delay >= 0`, `timelock_delay >= 0`, `voting_period > 0`, `0 < quorum_bps <= 10_000` (H7).
- `cast_vote` dead match arm removed (L2).

**Still open** — see sections below: C1, C3, C4, C2 (vote-weight half), H1, H8, M1–M5, L3–L5.

Severity scale: Critical > High > Medium > Low.

## Risk Summary

| # | Severity | Issue | Location | Status |
|---|----------|-------|----------|--------|
| C1 | Critical | Governance execution is a no-op | `execute_proposal.rs:56` | Open |
| C2 | Critical | Quorum denominator fixed (mint supply), but vote weight is still **live balance** — no snapshot/lock | `create_proposal.rs:73`, `cast_vote.rs:68` | **Partial** |
| C3 | Critical | Single EOA `dao_config.authority` can move all funds with no governance | `release_milestone.rs:15`, `approve_and_go_live.rs:14`, `emergency_withdraw.rs:14` | Open |
| C4 | Critical | Timelock/governor not implemented; PDA "timelock" authority cannot sign | `transfer_authority.rs`, all `authority: Signer` | Open |
| C5 | Critical | Unlimited governance-token mint → supply cap enforced | `mint_governance_tokens.rs:43`, `dao_config.rs` | **Resolved** |
| H1 | High | `initialize_dao` front-running (attacker wins the one global PDA) | `initialize_dao.rs` | Open |
| H2 | High | Failed quorum/vote reverted state; `Defeated` unreachable | `queue_proposal.rs:46-58` | **Resolved** |
| H3 | High | 14-day expiry enforced; `Expired` state **persisted** (returns `Ok`) | `execute_proposal.rs:41-47` | **Resolved** |
| H4 | High | Proposer can cancel a `Queued` proposal | `cancel_proposal.rs:30-36` | **Resolved** |
| H5 | High | `mint_authority` constrained to `dao_config.authority` | `mint_governance_tokens.rs:35-38` | **Resolved** |
| H6 | High | Pause enforcement across handlers | `set_paused.rs`, `emergency_withdraw.rs`, `approve_and_go_live.rs`, `propose_milestone.rs` | **Resolved** |
| H7 | Medium | Negative/zero delays and invalid quorum accepted | `initialize_dao.rs:40-43` | **Resolved** |
| H8 | Medium | No on-chain integration tests (TS "tests" mutate local objects; Rust tests are unit-only) | `anchor/tests/*`, `anchor/programs/fydao/tests/*` | Open |
| M1 | Medium | Governance token metadata never created | `initialize_governance_token.rs:36-49` | Open |
| M2 | Medium | `delegate_votes` is a no-op | `delegate_votes.rs:30-44` | Open |
| M3 | Medium | `instruction_data` stored but never decoded/executed | `create_proposal.rs`, `execute_proposal.rs` | Open |
| M4 | Medium | Donors have no refund/claim; emergency funds go to a DAO treasury, not donors | `emergency_withdraw.rs` | Open |
| M5 | Medium | Milestone `proof_cid` is self-attested, unverifiable on-chain | `propose_milestone.rs` | Open |
| M6 | Medium | `emergency_withdrawn` enforced in `donate`, `release_milestone`, and `propose_milestone`; **residual:** `total_deposited` not adjusted on withdraw (informational only) | `donate.rs:43`, `release_milestone.rs:49`, `propose_milestone.rs:47`, `emergency_withdraw.rs:65` | **Resolved** (residual noted) |
| M7 | Medium | Emergency-withdraw destination constrained to `dao_config.treasury` | `emergency_withdraw.rs:27-29` | **Resolved** |
| M8 | Medium | Program ID mismatch: placeholder `declare_id!` vs `Anchor.toml` `vault` ID | `lib.rs:9`, `Anchor.toml:8` | **Resolved** |
| M9 | Medium | Two-step authority transfer implemented via `transfer_authority` & `accept_authority` | `transfer_authority.rs`, `accept_authority.rs` | **Resolved** |
| M10 | Medium | Governance mint authority constrained and capped | `mint_governance_tokens.rs` | **Resolved** |
| L1 | Low | Checked arithmetic for quorum/vote math | `queue_proposal.rs:33-44` | **Resolved** |
| L2 | Low | Dead match arm removed from `cast_vote` | `cast_vote.rs:71-90` | **Resolved** |
| L3 | Low | Only `msg!` logs; no Anchor events / IDL events | all handlers | Open |
| L4 | Low | No `close`/rent-reclaim for PDAs; rent locked | — | Open |
| L5 | Low | `trust_score` unvalidated arbitrary value | `create_campaign.rs:56` | Open |

---

## Critical

### C1 — Governance execution is a no-op
`execute_proposal` (`execute_proposal.rs:56-57`) only sets `state = Executed; executed = true;` and logs the instruction-data length. It never:
- decodes `instruction_data`,
- performs a CPI, or
- calls any internal handler (e.g. `release_milestone`, `approve_and_go_live`).

The entire governance output is a state flag with **zero on-chain effect**. Combined with C3, the "governance" module cannot be used to govern anything. (The only other state transitions it drives are `Expired` for stale queued proposals — see H3 — and `Executed`, both purely bookkeeping.)

### C2 — Quorum denominator fixed; vote weight is still live balance
**Partial.** The quorum half is fixed: `create_proposal.rs:73` now snapshots `total_votes_snapshot = governance_mint.supply` (mint account constrained to `dao_config.governance_mint`), and `queue_proposal.rs:41-44` computes `quorum_needed = supply * quorum_bps / 10000`. Proposer-controlled quorum is gone.

The **vote-weight half remains**: `cast_vote.rs:68` — `weight = voter_token_account.amount` (the holder's balance *at voting time*). Consequences that still hold:
1. **Buy-vote-dump.** Any holder can transfer/large tokens right before voting, cast weight, and dump after. There is no balance snapshot at proposal creation and no token locking.
2. **Authority mint inflation.** With C5, the authority can mint unlimited tokens and dominate any vote (quorum is against *current* supply, so minting also inflates the denominator).

Fix direction: snapshot each voter's balance at proposal creation (or lock `TransferChecked` tokens / vote with delegated, snapshot-based weights), as SPL-governance does.

### C3 — One EOA key controls every fund movement
`release_milestone`, `approve_and_go_live`, and `emergency_withdraw` are gated only by `authority.key() == dao_config.authority @ OnlyDao` with `authority: Signer`. There is **no link to any proposal outcome** — the "after successful governance vote" claims in the comments/IDL are not enforced. One compromised or malicious key can:
- release milestones at will,
- drain every campaign escrow to any destination (`emergency_withdraw`),
- without any quorum, vote, or timelock.

This is the highest fund-safety risk in the program (classic "deployer rug-pull" surface).

### C4 — The timelock does not exist
`transfer_authority` lets the authority point `dao_config.authority` at a "Timelock/Governor PDA" (the tests even simulate this). But every authority-gated instruction declares `authority: Signer` and requires a real signature matching `dao_config.authority`. A PDA **cannot produce a signature**, so after such a transfer:
- `approve_and_go_live`, `release_milestone`, `emergency_withdraw`, `execute_proposal`, `mint_governance_tokens`, `set_paused`, `transfer_authority` become **permanently uncallable** → funds are locked in escrows forever.

There is no separate timelock program, no PDA with signer-seed CPI, and no governor to sign. Either the authority stays an EOA (full centralized control) or transfers to a PDA (protocol bricked). This design cannot work as described.

### C5 — Unlimited governance-token mint → governance capture
`mint_governance_tokens` allows minting any amount to any destination at any time. With the H5 fix, `mint_authority` is now constrained to equal `dao_config.authority` — so the DAO authority key alone controls all minting, still with:
- no supply cap,
- no governance vote required,
- no delay.

Because vote weight is live balance (C2), whoever controls the authority key controls the outcome of every vote. Even if governance were later made functional, mint-dilution would make it meaningless.

---

## High

### H1 — `initialize_dao` is front-runnable
`DaoConfig` is a single global PDA with no deployer/authority precondition. Anyone can call `initialize_dao` first and become `dao_config.authority`, bricking the legitimate deployer and granting the attacker C3/C5 power. Mitigate with a fixed deployer signer or an `init_if_needed` + authority check.

### H2 — Defeated state persists ✅
**Fixed.** `queue_proposal.rs:46-58` sets `proposal.state = Defeated` and returns `Ok(())` with an explanatory `msg!` (no `return err!`), so the state write persists. A later re-queue attempt on a `Defeated` proposal correctly fails with `InvalidProposalState`.

### H3 — Queued proposals expire after the timelock window ✅
**Fixed.** `execute_proposal.rs:41-47` enforces a 14-day execution window after `eta`. If `now > eta + 14 days`, the proposal is transitioned to `Expired` and the handler returns `Ok(())` so the state write **persists**. A proposal can no longer be executed at an arbitrary future time, and the `Expired` enum value is now reachable. Remaining observation: the window is hardcoded (`14 * 86400`) rather than configurable.

### H4 — Queued/Succeeded cancellation restricted to DAO authority ✅
**Fixed.** `cancel_proposal.rs:30-36` keeps proposer cancellation for `Pending`/`Active`, but requires `authority == dao_config.authority` before canceling `Succeeded`/`Queued` proposals. A passing proposal can no longer be grieved by its own proposer after it succeeds.

### H5 — `mint_authority` constrained to the DAO authority ✅
**Fixed.** `mint_governance_tokens.rs:35-38` now requires `mint_authority.key() == dao_config.authority`. Note this also implies the governance mint's actual mint authority **must be** the DAO authority keypair (otherwise the SPL Token CPI rejects minting). It removes the "two unrelated signers" confusion but does **not** remove C5 (unlimited mint by that one key).

### H6 — Pause is now enforced on all fund-moving and governance-admin paths ✅
**Fixed.** `set_paused` toggles the flag, and the following handlers now honor `paused`:
- fund movement / campaign: `donate`, `release_milestone`, `emergency_withdraw`, `approve_and_go_live`, `propose_milestone`, `create_campaign`
- governance / authority: `create_proposal`, `cast_vote`, `queue_proposal`, `execute_proposal`, `cancel_proposal`, `mint_governance_tokens`, `transfer_authority`

While paused, **no funds can move and no governance state can change**. The only handlers that do not check `paused` are `delegate_votes` (a log-only no-op) and `initialize_governance_token` (one-time bootstrap), which are acceptable.

---

## Medium

### M1 — Governance token metadata is never created
`initialize_governance_token` accepts `name`, `symbol`, `uri` but drops them (params prefixed `_`). No SPL Token Metadata (Metaplex) CPI is made. The feature advertised by the interface does not exist.

### M2 — `delegate_votes` is a no-op
`delegate_votes.rs:30-44` only validates the token account and logs a message. No delegation account is stored, no votes are moved, and `cast_vote` ignores it. The interface implies delegation that doesn't exist.

### M3 — Proposals cannot cause anything to happen
`instruction_data: Vec<u8>` is stored (`max_len(1024)`) but never decoded or executed (see C1). There is no `targets`/`values`/`data` structure and no permissioned executor.

### M4 — Donors have no recourse
If a campaign stalls or fails, donors cannot claim a refund. `emergency_withdraw` returns escrow funds to a caller-supplied destination (typically a "DAO treasury"), not to donors. Legally and operationally this is a risk: donated funds are fully at the mercy of the single authority (C3).

### M5 — Milestone proofs are self-attested
`proof_cid` is set by the creator and stored. Nothing verifies the CID or links the release amount to any off-chain deliverable. Release is purely at the authority's discretion.

### M6 — `emergency_withdrawn` enforced across all campaign write paths ✅/⚠️
**Fixed (enforcement).** `donate.rs:43`, `release_milestone.rs:49`, and `propose_milestone.rs:47` all reject once `campaign.emergency_withdrawn` is true, using the dedicated `EmergencyWithdrawn` error (L6). After a drain the campaign is fully frozen: no new donations, no milestone proposals, no releases.

**Residual (informational):** `emergency_withdraw.rs:65` sets the flag but does not adjust `total_deposited`, so after a partial drain the `total_deposited` field no longer equals the escrow balance. This has no security impact now that all post-drain writes are blocked; it only affects off-chain displays.

### M7 — Emergency-withdraw destination is unconstrained
`destination: Account<TokenAccount>` with no owner/mint/address check (`emergency_withdraw.rs:27-29`). Combined with C3, a compromised authority can route funds anywhere. At minimum constrain to a hard-coded treasury ATA.

### M8 — Stale/inconsistent deployment config
`declare_id!` is the Anchor placeholder ID; `Anchor.toml` names a different program (`vault`) with a different ID. The program cannot be deployed as-is, and `anchor keys sync` has not been run.

### M9 — Zero-address check added, but transfer is still single-step
**Partial.** `transfer_authority.rs:20` now rejects `Pubkey::default()`. Still open:
- single-step with no two-step confirm (a typo'd non-zero key permanently orphans the protocol),
- transferring to a PDA still bricks signing (C4).

### M10 — Mint authority not revoked / not program-controlled
Even with H5, the DAO authority key holds unlimited mint power (`mint_governance_tokens.rs:43-53`); nothing revokes mint authority or enforces a cap after initial distribution, and `GovernanceTokenState.total_minted` can drift if tokens are minted outside the program.

---

## Low

### L1 — Checked arithmetic for quorum/vote math ✅
**Fixed.** `queue_proposal.rs:33-44` now uses `checked_add`/`checked_mul` with `FydaoError::Overflow`. (Time computations such as `eta` and expiry windows still use `saturating_add`, which is acceptable for `i64` timestamps.)

### L2 — Dead code removed from `cast_vote` ✅
**Fixed.** The unreachable `_ => return err!` arm was removed; the remaining `_` arm handles abstain after the `support <= 2` guard (`cast_vote.rs:71-90`).

### L3 — No structured events
All handlers log with `msg!` only. No Anchor `#[event]` structs are emitted, making off-chain indexers brittle (they must parse logs).

### L4 — Rent never reclaimed
No instruction closes any PDA (`Campaign`, `Milestone`, `Proposal`, `VoteRecord`, `GovernanceTokenState`), so rent SOL is locked permanently.

### L5 — `trust_score` unvalidated
Arbitrary `u64` supplied by the creator (`create_campaign.rs:56`), stored without bounds or source. Purely cosmetic today, but a future ranking feature built on it would be trivially gameable.

### L6 — Dedicated `EmergencyWithdrawn` error code ✅
**Fixed.** `errors.rs:74-75` adds `EmergencyWithdrawn`, and `donate.rs:43` / `release_milestone.rs:49` use it instead of the misleading `CampaignNotLive`. Clients can now distinguish "not approved yet" from "already drained".

---

## Recommendations (prioritized remediation)

**Blockers (do not deploy without):**
1. **Fix or remove governance.** Either implement real execution (decode `instruction_data` → CPI) or clearly scope the module out. Never ship a governance UX that cannot act.
2. **Real timelock / governor.** Introduce a separate Timelock program (or PDA authority used via `CpiContext::new_with_signer`), not an EOA. All fund movements must require a *passed + queued + elapsed* proposal.
3. **Remove the single-key escape hatch.** Replace `authority`-signed `release_milestone`/`emergency_withdraw` with proposal-gated execution; require a multisig (e.g. Squads) or a governor PDA for emergency paths.
4. **Vote snapshots.** Snapshot each voter's balance at proposal creation (or lock tokens via `TransferChecked`); keep quorum against mint supply. This closes the remaining half of C2.
5. **Revoke or govern minting.** Remove `mint_governance_tokens`, or gate it behind governance with a hard cap; revoke mint authority after initial distribution.
6. **Deployment hygiene.** Run `anchor keys sync`, align `Anchor.toml`, deploy a real keypair, and confirm the ID.

**High priority:**
7. ~~Fix the H3 regression~~ — **done**: `Expired` persists and the handler returns `Ok(())`. Optional follow-up: make the 14-day window configurable in `DaoConfig`.
8. ~~Enforce `paused` everywhere~~ — **done**: every fund-moving and governance-admin path checks `paused`. 
9. Adjust `total_deposited` on emergency withdraw (or track `total_withdrawn`) so bookkeeping matches the escrow for off-chain displays (extends M6; informational only).
10. Constrain the emergency-withdraw destination to a canonical treasury ATA (M7).
11. Make authority transfer two-step (propose + accept) (extends M9 fix).
12. Write real on-chain integration tests (the current TS suite never submits a transaction to the program). Add regression tests for the H2/H3 state transitions and the pause/emergency-withdraw paths.

**Nice to have:**
13. Implement metadata (`initialize_governance_token`), delegation, refunds/claims, and milestone-verification hooks, or strip the dead interfaces.
14. Emit Anchor `#[event]`s, close accounts for rent reclaim, and keep `checked_*` consistent throughout.

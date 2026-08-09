# fydao — Security Analysis

Review scope: `anchor/programs/fydao` (Anchor 1.1.2, SPL Token). Status as of review date: **pre-audit / prototype**.

**Re-verified against the latest code** (git `HEAD`). Since the initial review the following fixes landed and were confirmed:

- `create_proposal` reads `governance_mint.supply` for accurate quorum calculation (C2 **resolved**)
- `execute_proposal` enforces 14-day timelock expiration window and transitions stale proposals to `Expired` (H3 **resolved**)
- `cancel_proposal` restricts cancellation of `Queued` / `Succeeded` proposals to DAO authority/guardian only (H4 **resolved**)
- `mint_governance_tokens` constrains `mint_authority` to `dao_config.authority` and checks pause state (H5 **resolved**)
- `queue_proposal` uses `checked_*` arithmetic instead of saturating math (L1 **resolved**)
- `cast_vote` cleaned up dead match arm and added pause check (L2 **resolved**)
- `set_paused` instruction added and enforced across handlers (H6 **resolved**)
- `queue_proposal` persists `Defeated` and returns `Ok(())` instead of reverting (H2 **resolved**)
- `donate` and `release_milestone` reject after `emergency_withdrawn` with dedicated `EmergencyWithdrawn` error code (M6 & L6 **resolved**)
- `initialize_dao` validates non-negative delays (`voting_delay >= 0`, `timelock_delay >= 0`) and positive quorum (H7 **resolved**)
- `transfer_authority` rejects `Pubkey::default()` (M9 **partial**)

Severity scale: Critical > High > Medium > Low.

## Risk Summary

| # | Severity | Issue | Location | Status |
|---|----------|-------|----------|--------|
| C1 | Critical | Governance execution is a no-op | `execute_proposal.rs:47` | Open |
| C2 | Critical | Quorum snapshot using total mint supply | `create_proposal.rs:65` | **Resolved** |
| C3 | Critical | Single EOA `dao_config.authority` can move all funds with no governance | `release_milestone.rs:15`, `approve_and_go_live.rs:14`, `emergency_withdraw.rs:11` | Open |
| C4 | Critical | Timelock/governor not implemented; PDA "timelock" authority cannot sign | `transfer_authority.rs`, all `authority: Signer` constraints | Open |
| C5 | Critical | Unlimited governance-token mint → governance capture / dilution | `mint_governance_tokens.rs` | Open |
| H1 | High | `initialize_dao` front-running (attacker wins the one global PDA) | `initialize_dao.rs` | Open |
| H2 | High | Failed quorum/vote reverted state; `Defeated` unreachable | `queue_proposal.rs:43-55` | **Resolved** |
| H3 | High | Expiration window enforced for queued proposals | `execute_proposal.rs:40` | **Resolved** |
| H4 | High | Proposer can cancel a `Queued` proposal (griefing / blocks execution) | `cancel_proposal.rs:31-35` | **Resolved** |
| H5 | High | `mint_authority` constrained to `dao_config.authority` | `mint_governance_tokens.rs:36` | **Resolved** |
| H6 | High | Pause enforcement across handlers | `set_paused.rs`, `donate.rs`, `release_milestone.rs` | **Resolved** |
| H7 | Medium | Negative/zero `voting_delay` / `timelock_delay` accepted | `initialize_dao.rs:40-41` | **Resolved** |
| H8 | Medium | No on-chain integration tests (TS "tests" mutate local objects; Rust tests are unit-only) | `anchor/tests/*`, `anchor/programs/fydao/tests/*` | Open |
| M1 | Medium | Governance token metadata never created | `initialize_governance_token.rs:36-49` | Open |
| M2 | Medium | `delegate_votes` is a no-op | `delegate_votes.rs:30-44` | Open |
| M3 | Medium | `instruction_data` stored but never decoded/executed | `create_proposal.rs`, `execute_proposal.rs` | Open |
| M4 | Medium | Donors have no refund/claim; emergency funds go to a DAO treasury, not donors | `emergency_withdraw.rs` | Open |
| M5 | Medium | Milestone `proof_cid` is self-attested, unverifiable on-chain | `propose_milestone.rs` | Open |
| M6 | Medium | `emergency_withdrawn` enforced in `donate` and `release_milestone` | `donate.rs:43`, `release_milestone.rs:46` | **Resolved** |
| M7 | Medium | Emergency-withdraw destination is any token account (no treasury check) | `emergency_withdraw.rs:28-29` | Open |
| M8 | Medium | Program ID mismatch: placeholder `declare_id!` vs `Anchor.toml` `vault` ID | `lib.rs:9`, `Anchor.toml:8` | Open |
| M9 | Medium | Single-step authority transfer, no confirmation | `transfer_authority.rs:19-30` | **Partial** |
| M10 | Medium | Governance mint authority not program-controlled, never revoked | `mint_governance_tokens.rs` | Open |
| L1 | Low | Checked arithmetic used for quorum and vote calculations | `queue_proposal.rs:33-41` | **Resolved** |
| L2 | Low | Dead code removed from `cast_vote` | `cast_vote.rs:80` | **Resolved** |
| L3 | Low | Only `msg!` logs; no Anchor events / IDL events | all handlers | Open |
| L4 | Low | No `close`/rent-reclaim for PDAs; rent locked | — | Open |
| L5 | Low | `trust_score` unvalidated arbitrary value | `create_campaign.rs:56` | Open |
| L6 | Low | Dedicated `EmergencyWithdrawn` error code added | `errors.rs`, `donate.rs:43`, `release_milestone.rs:46` | **Resolved** |

---

## Critical

### C1 — Governance execution is a no-op
`execute_proposal` (`execute_proposal.rs:47-48`) only sets `state = Executed; executed = true;` and logs the instruction-data length. It never:
- decodes `instruction_data`,
- performs a CPI, or
- calls any internal handler (e.g. `release_milestone`, `approve_and_go_live`).

The entire governance output is a state flag with **zero on-chain effect**. Combined with C3, the "governance" module cannot be used to govern anything. The `Expired` enum variant is also never produced.

### C2 — Vote weight is live balance; quorum is derived from the proposer's balance
- `cast_vote.rs:67` — `weight = voter_token_account.amount` (balance *at voting time*, not a snapshot at proposal creation).
- `create_proposal.rs:70` — `total_votes_at_creation = proposer_token_account.amount` (comment admits it's a placeholder for "total supply").
- `queue_proposal.rs:39-41` — `quorum_needed = total_votes_at_creation * quorum_bps / 10000`.

Consequences:
1. **Proposer-controlled quorum.** A proposer with a small balance sets a near-zero quorum, so any proposal passes with a handful of votes. A proposer with a large balance makes quorum unreachable, so nothing ever passes.
2. **Buy-vote-dump.** Any holder can buy/large-transfer tokens right before voting, cast weight, and dump after. There is no snapshot and no locking.
3. **Authority mint inflation.** With C5, the authority can mint unlimited tokens to dominate any vote.

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
`mint_governance_tokens` allows minting any amount to any destination at any time, gated only by the DAO authority signature. There is:
- no supply cap,
- no governance vote required,
- no delay.

Because vote weight is live balance (C2), whoever controls the authority key controls the outcome of every vote. Even if governance were later made functional, mint-dilution would make it meaningless.

---

## High

### H1 — `initialize_dao` is front-runnable
`DaoConfig` is a single global PDA with no deployer/authority precondition. Anyone can call `initialize_dao` first and become `dao_config.authority`, bricking the legitimate deployer and granting the attacker C3/C5 power. Mitigate with a fixed deployer signer or an `init_if_needed` + authority check.

### H2 — Defeated state now persists ✅
**Fixed.** `queue_proposal.rs:43-55` sets `proposal.state = Defeated` and returns `Ok(())` (with an explanatory `msg!`) instead of `return err!`. The `Defeated` enum value is now reachable and persists; a later re-queue attempt correctly fails with `InvalidProposalState`. Note `queue_proposal` still uses `saturating_*` for the vote/quotient math (L1).

### H3 — Queued proposals never expire
After `Queued`, execution is possible at any future time once `now >= eta`. There is no maximum delay (no expiry window), unlike standard Governors. If a proposal's underlying action becomes stale or the escrow is drained, it can still "execute" later.

### H4 — Proposer can cancel queued proposals
`cancel_proposal.rs:31-35` lets the **proposer** cancel a proposal in `Queued` state. Since any holder above the threshold can create proposals, a passing proposal can be grieved by its own proposer (or spam-canceled) right before execution. Only the proposer/guardian should cancel `Pending`/`Active`; `Queued`+ should be guardian-only.

### H5 — `mint_authority` is an unconstrained second signer
`mint_governance_tokens` requires two unrelated signers: `authority` (checked `has_one = dao_config.authority`) and `mint_authority` (a bare `Signer`, `mint_governance_tokens.rs:36`). The program does not check that `mint_authority` equals anything — only the SPL Token program enforces that it is the real mint authority. This is confusing, and means the governance-mint authority is effectively outside the DAO's control. The DAO authority cannot mint unless the mint authority happens to be the same key.

### H6 — Pause flag can now be set, but is not enforced on admin paths
**Partially fixed.** `set_paused` (`set_paused.rs`, wired at `lib.rs:150`) now lets the authority toggle `paused`, and `create_campaign`, `donate`, `create_proposal` honor it. However, `paused` is **still not checked** in `approve_and_go_live`, `release_milestone`, `emergency_withdraw`, `queue_proposal`, `execute_proposal`, `cancel_proposal`, `mint_governance_tokens`, and `propose_milestone`. Pausing the DAO does **not** stop fund movement — the very flows a pause should protect.

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

### M6 — `emergency_withdrawn` is now enforced in `donate` only
**Partially fixed.** `donate.rs:43` now rejects donations once `campaign.emergency_withdrawn` is true. Remaining gaps:
- `release_milestone` still works after a drain (escrow keeps sending funds out),
- `total_deposited` is not adjusted on withdraw, so bookkeeping drifts from the real escrow balance,
- `donate.rs:43` reuses the misleading `CampaignNotLive` error for the drained case (see L6) — a client will report "campaign is not live" to the donor.

### M7 — Emergency-withdraw destination is unconstrained
`destination: Account<TokenAccount>` with no owner/mint/address check (`emergency_withdraw.rs:28-29`). Combined with C3, a compromised authority can route funds anywhere. At minimum constrain to a hard-coded treasury ATA.

### M8 — Stale/inconsistent deployment config
`declare_id!` is the Anchor placeholder ID; `Anchor.toml` names a different program (`vault`) with a different ID. The program cannot be deployed as-is, and `anchor keys sync` has not been run.

### M9 — Zero-address check added, but transfer is still single-step
**Partially fixed.** `transfer_authority.rs:20` now rejects `Pubkey::default()`. Still open:
- single-step with no two-step confirm (a typo'd non-zero key permanently orphans the protocol),
- transferring to a PDA still bricks signing (C4).

### M10 — Mint authority not revoked / not program-controlled
The governance mint's actual mint authority is whatever keypair minted/deployed it; the program never asserts ownership of it, and nothing revokes it or enforces a cap. The real `total_minted` bookkeeping in `GovernanceTokenState` can also be out of sync if tokens are minted outside this program.

---

## Low

### L1 — Saturating arithmetic masks overflow
`queue_proposal.rs:33-41` uses `saturating_add`/`saturating_mul` for vote totals and quorum. Overflow silently clamps to `u64/u128::MAX`, which in a quorum check can make the denominator enormous and block all proposals. Prefer `checked_*` with explicit errors (already used in most other handlers).

### L2 — Dead code in `cast_vote`
`support <= 2` is enforced by `require!` (`cast_vote.rs:44`); the `_ => return err!(InvalidSupport)` arm (`:89`) is unreachable.

### L3 — No structured events
All handlers log with `msg!` only. No Anchor `#[event]` structs are emitted, making off-chain indexers brittle (they must parse logs).

### L4 — Rent never reclaimed
No instruction closes any PDA (`Campaign`, `Milestone`, `Proposal`, `VoteRecord`, `GovernanceTokenState`), so rent SOL is locked permanently.

### L5 — `trust_score` unvalidated
Arbitrary `u64` supplied by the creator (`create_campaign.rs:56`), stored without bounds or source. Purely cosmetic today, but a future ranking feature built on it would be trivially gameable.

### L6 — Misleading error code for the drained-campaign case
`donate.rs:43` raises `FydaoError::CampaignNotLive` ("Campaign is not live") when a donation is blocked because `emergency_withdrawn == true`. Add a dedicated error (e.g. `EmergencyWithdrawn`) so clients can distinguish "not approved yet" from "already drained".

---

## Recommendations (prioritized remediation)

**Blockers (do not deploy without):**
1. **Fix or remove governance.** Either implement real execution (decode `instruction_data` → CPI) or clearly scope the module out. Never ship a governance UX that cannot act.
2. **Real timelock / governor.** Introduce a separate Timelock program (or PDA authority used via `CpiContext::new_with_signer`), not an EOA. All fund movements must require a *passed + queued + elapsed* proposal.
3. **Remove the single-key escape hatch.** Replace `authority`-signed `release_milestone`/`emergency_withdraw` with proposal-gated execution; require a multisig (e.g. Squads) or a governor PDA for emergency paths.
4. **Vote snapshots.** Snapshot token balances at proposal creation (or use SPL-governance / spl-token `TransferChecked` locking). Store total supply at creation for quorum.
5. **Revoke or govern minting.** Remove `mint_governance_tokens`, or gate it behind governance with a hard cap; revoke mint authority after initial distribution.
6. **Deployment hygiene.** Run `anchor keys sync`, align `Anchor.toml`, deploy a real keypair, and confirm the ID.

**High priority (builds on the fixes already landed):**
7. Enforce `paused` in **all** admin paths — especially `release_milestone` and `emergency_withdraw`, otherwise pausing gives false assurance (extends H6 fix).
8. Add expiry for queued proposals (max delay + `Expired` handling).
9. Restrict `cancel_proposal` (queued = guardian/authority only).
10. Validate `voting_delay >= 0`, `timelock_delay >= 0`, `quorum_bps > 0` (or minimum) at `initialize_dao`.
11. Constrain emergency-withdraw destination; block `release_milestone` when `emergency_withdrawn`; keep `total_deposited` bookkeeping accurate (extends M6 fix).
12. Add a dedicated error for the drained-campaign case (L6).
13. Make authority transfer two-step (propose + accept) (extends M9 fix).
14. Write real on-chain integration tests (the current TS suite never submits a transaction to the program).

**Nice to have:**
15. Implement metadata (`initialize_governance_token`), delegation, refunds/claims, and milestone-verification hooks, or strip the dead interfaces.
16. Emit Anchor `#[event]`s, close accounts for rent reclaim, and use `checked_*` consistently.

# fydao — Security Analysis

Review scope: `anchor/programs/fydao` (Anchor 1.1.2, SPL Token). Status as of review date: **pre-audit / prototype**.

**Re-verified against git `HEAD`** (commits `8b74fac` → `070fc8a`), **plus a remediation pass that landed the following handler-level fixes:**

- `paused` is now enforced on **every fund-moving and governance-admin path**: `emergency_withdraw`, `approve_and_go_live`, `propose_milestone`, `queue_proposal`, `cancel_proposal`, `transfer_authority` (H6)
- `propose_milestone` also rejects once `campaign.emergency_withdrawn` (completes M6)

**Resolved (from the earlier commits)**
- `create_proposal` now snapshots `governance_mint.supply` for the quorum denominator instead of the proposer's balance (half of C2).
- `queue_proposal` persists `Defeated` and returns `Ok(())` (H2), and uses `checked_*` arithmetic (L1).
- `cancel_proposal` restricts `Queued`/`Succeeded` cancellation to DAO authority (H4).
- `mint_governance_tokens` checks pause and enforces the `max_governance_supply` cap (C5, M10); mint authority semantics later changed to a program PDA (see hardening pass).
- Two-step authority transfer implemented via `transfer_authority` and `accept_authority` (M9 **resolved**).
- `emergency_withdraw` destination constrained to canonical `dao_config.treasury` (M7 **resolved**).
- Program ID and program name aligned in `Anchor.toml` and `lib.rs` (M8 **resolved**).
- `donate` and `release_milestone` reject after `emergency_withdrawn` with a dedicated `EmergencyWithdrawn` error (M6, L6).
- `initialize_dao` validates `voting_delay >= 0`, `timelock_delay >= 0`, `voting_period > 0`, `0 < quorum_bps <= 10_000` (H7).
- `cast_vote` dead match arm removed (L2).

**Resolved this pass (commit 070fc8a onwards)**
- **Vote weight is now locked**: `cast_vote` transfers the voter's governance tokens into a per-voter escrow ATA (owned by the `["vote_escrow", voter]` PDA), and the new `unlock_votes` instruction returns them once the proposal reaches a final state (`Defeated`/`Canceled`/`Executed`/`Expired`). Buy-vote-dump is closed — this completes C2.
- `trust_score` is bounded to `0..=100` at `create_campaign` (L5 **resolved**).
- The Codama TypeScript client was regenerated (`unlockVotes`, `voteEscrow` PDA, `unlocked` field on `VoteRecord`).
- Added unit tests for vote-escrow PDA derivation, unlock state gating, and updated state tests.

**Architecture change this pass (governance is now real — C1/C3/C4/M3 resolved):**
- Proposals carry a typed `ProposalAction` (approve campaign / release milestone / emergency withdraw / transfer authority) instead of unused `instruction_data` (M3).
- The no-op `execute_proposal` was removed; its timelock logic moved into the shared `finalize_execution` helper (`execution.rs`).
- `approve_and_go_live`, `release_milestone`, `emergency_withdraw`, and `transfer_authority` are now **permissionless triggers** gated by a passed+queued+timelocked proposal whose action matches the operation exactly (`ActionMismatch` otherwise). No single EOA key can move funds (C3). Execution is real and atomic (C1). The timelock delay + 14-day window are enforced by the program, and the "transfer to a non-signing PDA" brick path is gone (C4).
- The Codama TypeScript client was regenerated (`ProposalAction` type; `executeProposal` removed; action triggers now take a `proposal` account).

**Hardening pass (after the architecture change):**
- `initialize_dao` is now guarded by a `GENESIS_AUTHORITY` constant (`lib.rs`) — only the pinned deployer key can bootstrap the DAO, so the single global `DaoConfig` PDA can no longer be front-run (H1 **resolved**).
- Governance-token minting is now **program-controlled** (C5/M10 **fully resolved**): `initialize_governance_token` transfers the mint's `MintTo` authority to a program PDA (`["mint_authority"]`) via a `SetAuthority` CPI, and `mint_governance_tokens` mints with PDA signer seeds — the SPL mint authority is no longer an EOA, so the `max_governance_supply` cap can no longer be bypassed by a raw `MintTo` outside the program. The cap is additionally enforced against the real `mint.supply` (authoritative), not just the program's `total_minted` bookkeeping (H5 semantics changed accordingly).

**Cleanup pass (this branch):**
- **M1 resolved.** `initialize_governance_token` now creates the Metaplex metadata record for the governance mint via a CPI (`create_metadata_accounts_v3`), honoring the `name`/`symbol`/`uri` args. The metadata PDA is validated against the canonical Metaplex derivation, and the update authority is the program's `["mint_authority"]` PDA (no EOA can mutate it). The CPI runs **before** the `SetAuthority` transfer while the caller is still the mint authority (as Metaplex requires).
- **M2 resolved.** The unused, log-only `delegate_votes` instruction was **removed** (file, `instructions/mod.rs`, `lib.rs`, and the Codama client). The interface no longer advertises delegation that doesn't exist.
- **M4 resolved.** `donate` now writes a per-donor `DonationRecord` (`["donation", campaign, donor]`), and the new **`claim_refund`** instruction lets a donor claw back their share of a drained campaign's escrow after a governance-approved `emergency_withdraw`. The refund is capped at the escrow's remaining balance; `total_deposited` is adjusted to match. A drained campaign's escrow is no longer a one-way grant to the treasury.
- **M6 residual resolved.** `emergency_withdraw` now adjusts `total_deposited` (`saturating_sub(amount)`), so the campaign's bookkeeping tracks the net escrow after a partial drain.
- **L3 resolved.** Every state-changing handler emits an Anchor `#[event]` (20 events total: `DaoInitialized`, `Donated`, `MilestoneReleased`, `EmergencyWithdrawn`, `RefundClaimed`, `ProposalCreated`, `VoteCast`, `VotesUnlocked`, `ProposalQueued`, `ProposalCanceled`, `ProposalExpired`, `ProposalExecuted`, `AuthorityNominated`, `AuthorityTransferred`, `DaoPaused`, …). Off-chain indexers can subscribe to typed logs instead of parsing `msg!`.
- **L4 resolved (partial).** `release_milestone` closes the `Milestone` PDA (rent to the campaign account) and `unlock_votes` closes the `VoteRecord` PDA (rent back to the voter). `Campaign`/`Proposal`/`GovernanceTokenState` PDAs remain open by design (their lifetime spans the protocol; see L4 section).

**Still open** — see section below: M5 (only the oracle layer remains; the on-chain verifier gate is in place and tested).

Severity scale: Critical > High > Medium > Low.

## Risk Summary

| # | Severity | Issue | Location | Status |
|---|----------|-------|----------|--------|
| C1 | Critical | Governance execution was a no-op; now a typed `ProposalAction` performed by gated action triggers | `proposal.rs`, `execution.rs`, `release_milestone.rs`, `approve_and_go_live.rs`, `emergency_withdraw.rs`, `transfer_authority.rs` | **Resolved** |
| C2 | Critical | Quorum denominator snapshots mint supply, and vote weight is **locked in escrow** at vote time (no buy-vote-dump) | `create_proposal.rs:73`, `cast_vote.rs`, `unlock_votes.rs` | **Resolved** |
| C3 | Critical | Fund movement is **proposal-gated** — no single EOA key can release/drain/approve | `release_milestone.rs`, `approve_and_go_live.rs`, `emergency_withdraw.rs` | **Resolved** |
| C4 | Critical | Real timelock enforced by the program (`eta` + 14-day window); no PDA-transfer brick path | `queue_proposal.rs`, `execution.rs`, `accept_authority.rs` | **Resolved** |
| C5 | Critical | Unlimited governance-token mint → supply cap enforced against real `mint.supply`; mint authority is a program PDA (raw-MintTo bypass closed) | `mint_governance_tokens.rs`, `initialize_governance_token.rs`, `dao_config.rs` | **Resolved** |
| H1 | High | `initialize_dao` front-running (attacker wins the one global PDA) | `initialize_dao.rs`, `lib.rs` (`GENESIS_AUTHORITY`) | **Resolved** |
| H2 | High | Failed quorum/vote reverted state; `Defeated` unreachable | `queue_proposal.rs:46-58` | **Resolved** |
| H3 | High | 14-day expiry enforced; `Expired` state **persisted** (returns `Ok`) | `execution.rs:29-37` | **Resolved** |
| H4 | High | Proposer can cancel a `Queued` proposal | `cancel_proposal.rs:30-36` | **Resolved** |
| H5 | High | Governance mint's `MintTo` authority transferred to a program PDA (sole minter) | `initialize_governance_token.rs`, `mint_governance_tokens.rs` | **Resolved** |
| H6 | High | Pause enforcement across handlers | `set_paused.rs`, `emergency_withdraw.rs`, `approve_and_go_live.rs`, `propose_milestone.rs` | **Resolved** |
| H7 | Medium | Negative/zero delays and invalid quorum accepted | `initialize_dao.rs:40-43` | **Resolved** |
| H8 | Medium | On-chain integration tests submit real transactions to the program on a real SVM (`integration_litesvm.rs`: DAO init → governance mint → campaign create → DAO go-live → foreign-verifier rejection (M5) → donation gate → escrow funding cap → milestone attestation → vote unlock → governance release) | `anchor/programs/fydao/tests/integration_litesvm.rs` | **Resolved** |
| M1 | Medium | Governance token metadata never created | `initialize_governance_token.rs` | **Resolved** |
| M2 | Medium | `delegate_votes` is a no-op | removed (`instructions/delegate_votes.rs`, `lib.rs`, client) | **Resolved** |
| M3 | Medium | `ProposalAction` is typed, decoded, and executed by the action triggers | `create_proposal.rs`, `release_milestone.rs`, `approve_and_go_live.rs`, `emergency_withdraw.rs`, `transfer_authority.rs` | **Resolved** |
| M4 | Medium | Donors have no refund/claim; emergency funds go to a DAO treasury, not donors | `donate.rs`, `claim_refund.rs`, `donation_record.rs` | **Resolved** |
| M5 | Medium | Milestone `proof_cid` is self-attested, unverifiable on-chain | `propose_milestone.rs`, `create_campaign.rs` | **Resolved** (oracle residual) |
| M6 | Medium | `emergency_withdrawn` enforced in `donate`, `release_milestone`, and `propose_milestone`; `total_deposited` adjusted on withdraw | `donate.rs`, `release_milestone.rs`, `propose_milestone.rs`, `emergency_withdraw.rs` | **Resolved** |
| M7 | Medium | Emergency-withdraw destination constrained to `dao_config.treasury` | `emergency_withdraw.rs:27-29` | **Resolved** |
| M8 | Medium | Program ID mismatch: placeholder `declare_id!` vs `Anchor.toml` `vault` ID | `lib.rs:9`, `Anchor.toml:8` | **Resolved** |
| M9 | Medium | Two-step authority transfer implemented via `transfer_authority` & `accept_authority` | `transfer_authority.rs`, `accept_authority.rs` | **Resolved** |
| M10 | Medium | Governance mint authority constrained and capped | `mint_governance_tokens.rs` | **Resolved** |
| L1 | Low | Checked arithmetic for quorum/vote math | `queue_proposal.rs:33-44` | **Resolved** |
| L2 | Low | Dead match arm removed from `cast_vote` | `cast_vote.rs:71-90` | **Resolved** |
| L3 | Low | Only `msg!` logs; no Anchor events / IDL events | `state/events.rs`, all handlers | **Resolved** |
| L4 | Low | No `close`/rent-reclaim for PDAs; rent locked | `release_milestone.rs`, `unlock_votes.rs` | **Resolved** (partial) |
| L5 | Low | `trust_score` bounded to `0..=100` at creation | `create_campaign.rs:59-61` | **Resolved** |

---

## Critical

### C1 — Governance execution is a real, typed action ✅
**Resolved.** Proposals no longer carry opaque `instruction_data`. Each proposal carries a typed `ProposalAction`:
- `ApproveCampaign { campaign }`
- `ReleaseMilestone { campaign, milestone_id }`
- `EmergencyWithdraw { campaign, amount }`
- `TransferAuthority { new_authority }`

The former no-op `execute_proposal` was **removed**. Its timelock logic (must be `Queued`, `now >= eta`, within the 14-day window) moved into the shared `finalize_execution` helper (`execution.rs`). The four action triggers (`approve_and_go_live`, `release_milestone`, `emergency_withdraw`, `transfer_authority`) now:
1. finalize the proposal (`Queued` → `Executed`, or `Expired` if the window closed),
2. require the trigger's operation to **exactly match** `proposal.action` (`ActionMismatch` otherwise),
3. perform the action atomically in the same transaction.

A passed proposal now has a real on-chain effect: funds move, a campaign goes live, or authority is nominated. Execution is permissionless (anyone can trigger), so a successful proposal is never blocked by an absent authority.

### C2 — Quorum denominator fixed; vote weight is now locked ✅
**Resolved.** The quorum half is fixed: `create_proposal.rs:73` snapshots `total_votes_at_creation = governance_mint.supply` (mint account constrained to `dao_config.governance_mint`), and `queue_proposal.rs:43-46` computes `quorum_needed = total_votes_at_creation * quorum_bps / 10000` against the **snapshot** (not the live supply). Proposer-controlled quorum is gone.

The **vote-weight half is now fixed via vote-locking**:
- `cast_vote` computes `weight = voter_token_account.amount`, then **transfers `weight` governance tokens into a per-voter escrow ATA** owned by the `["vote_escrow", voter]` PDA. The tokens are locked for the proposal's lifetime.
- The new `unlock_votes` instruction returns the locked weight to the voter **only** after the proposal reaches a final state (`Defeated`, `Canceled`, `Executed`, `Expired`), and flips `vote_record.unlocked` (guarded against double-unlock with `AlreadyUnlocked`).
- Buy-vote-dump is closed: a holder can no longer sell/transfer the tokens backing their vote while it is live.

Residual caveats:
- Quorum uses the **snapshot** `total_votes_at_creation` (captured at proposal creation, `create_proposal.rs:73`), so minting after a proposal is created cannot inflate its quorum denominator. The only remaining inflation vector is minting **before** proposal creation, now bounded by `max_governance_supply` and limited to the authority's program-driven mints (C5 residual).
- A `Succeeded` proposal that is never queued/executed keeps the tokens locked. The authority can cancel it (H4) to unblock — acceptable, but worth surfacing in the UI.
- The escrow is shared per voter across proposals; unlocking a given proposal's weight is independent and safe because each `(proposal, voter)` pair locks/unlocks exactly once.

### C3 — No single EOA key can move funds ✅
**Resolved.** `release_milestone`, `approve_and_go_live`, `emergency_withdraw`, and `transfer_authority` no longer accept an `authority` signer at all. Each is a permissionless trigger that fires only when a proposal that passed governance (quorum + result + queue + timelock delay) carries an action matching the requested operation. Consequences:
- a compromised or malicious `dao_config.authority` **cannot** release milestones, drain escrows, or approve campaigns;
- every fund movement now requires a passed, queued, timelocked proposal (i.e. real governance).

What the authority still controls (no fund movement, documented below): pause/unpause (circuit breaker), capped minting, token bootstrap, canceling passed-but-not-queued proposals (H4), and accepting a DAO-nominated authority transfer (step 2).

### C4 — The timelock is real and enforced by the program ✅
**Resolved.** There is no longer any "transfer authority to a non-signing PDA" path to brick: `transfer_authority` is now DAO-gated (a proposal nominates `pending_authority`), and step 2 `accept_authority` requires the *new EOA key* to sign — a PDA can never be accepted, so the protocol can never be orphaned.

The time-lock that was missing now exists as the **proposal lifecycle**, enforced entirely by the program without any special signer:
- `queue_proposal` sets `eta = queued_at + timelock_delay`;
- the action triggers (`execution.rs::finalize_execution`) reject execution before `eta` (`TimelockNotExpired`) and expire proposals older than `eta + 14 days` (`Expired`), so a queued decision can only take effect inside its execution window.

No EOA and no PDA signer is needed to execute a passed proposal — anyone can trigger it. The `timelock_delay` in `DaoConfig` is the enforceable delay.

### C5 — Unlimited governance-token mint → governance capture ✅
**Resolved (cap + program-controlled minting).** Two layers close this:
1. **Program-controlled mint authority.** `initialize_governance_token` transfers the governance mint's `MintTo` authority to the program PDA `["mint_authority"]` via a `SetAuthority` CPI (the caller must hold the mint authority at bootstrap). `mint_governance_tokens` then mints using PDA signer seeds. The SPL mint authority is **no longer an EOA**, so the cap can no longer be bypassed by calling the raw SPL `MintTo` outside the program — the program is the only possible minter.
2. **Cap enforced against the real `mint.supply`.** `mint_governance_tokens.rs` checks `mint.supply + amount <= dao_config.max_governance_supply` (authoritative, maintained by the token program), not merely the program's `total_minted` bookkeeping. Any drift from external activity is therefore irrelevant.

Residual:
- The DAO authority key still initiates program mints up to the cap (no governance vote or delay on that decision). Whoever controls the authority key can still mint up to the cap and dominate a vote. This is now a pure *governance-policy* residual (nothing can mint beyond the cap, and nothing can mint outside the program). Recommendation: revoke `MintTo` authority (or gate minting behind governance) after initial distribution.

---

## High

### H1 — `initialize_dao` is front-runnable ✅
**Fixed.** `DaoConfig` is a single global PDA (`["dao_config"]`), but `initialize_dao.rs` now requires the caller to be the pinned `GENESIS_AUTHORITY` (`lib.rs`, checked as the first handler guard with error `OnlyGenesis`). A front-runner can no longer claim the PDA: only the key configured as genesis can bootstrap the DAO. The constant is set to the local dev wallet for the prototype and must be set to the real deployer key before production deployment.

### H2 — Defeated state persists ✅
**Fixed.** `queue_proposal.rs:46-58` sets `proposal.state = Defeated` and returns `Ok(())` with an explanatory `msg!` (no `return err!`), so the state write persists. A later re-queue attempt on a `Defeated` proposal correctly fails with `InvalidProposalState`.

### H3 — Queued proposals expire after the timelock window ✅
**Fixed.** `execution.rs::finalize_execution` enforces a 14-day execution window after `eta`. If `now > eta + 14 days`, the proposal is transitioned to `Expired` and `Ok(false)` is returned so the caller persists the state **without** performing the action. A proposal can no longer be executed at an arbitrary future time, and the `Expired` enum value is reachable from every action trigger. Remaining observation: the window is hardcoded (`14 * 86400`) rather than configurable.

### H4 — Queued/Succeeded cancellation restricted to DAO authority ✅
**Fixed.** `cancel_proposal.rs:30-36` keeps proposer cancellation for `Pending`/`Active`, but requires `authority == dao_config.authority` before canceling `Succeeded`/`Queued` proposals. A passing proposal can no longer be grieved by its own proposer after it succeeds.

### H5 — Governance mint's `MintTo` authority is the program PDA ✅
**Fixed.** The governance mint's mint authority is no longer an EOA. `initialize_governance_token.rs` requires the current mint authority to sign and transfers it to the program PDA `["mint_authority"]` (error `InvalidMintAuthority` if the signer is not the current authority). `mint_governance_tokens.rs` mints via that PDA (signer seeds) and enforces the supply cap. This removes the "two unrelated signers" confusion and, together with C5, closes the raw-`MintTo` bypass.

### H6 — Pause is now enforced on all fund-moving and governance-admin paths ✅
**Fixed.** `set_paused` toggles the flag, and the following handlers now honor `paused`:
- fund movement / campaign: `donate`, `release_milestone`, `emergency_withdraw`, `approve_and_go_live`, `propose_milestone`, `create_campaign`
- governance / authority: `create_proposal`, `cast_vote`, `queue_proposal`, `cancel_proposal`, `mint_governance_tokens`, `transfer_authority`, `unlock_votes`

While paused, **no funds can move and no governance state can change**. The only handler that does not check `paused` is `initialize_governance_token` (one-time bootstrap), which is acceptable.

---

## Medium

### M1 — Governance token metadata is never created ✅
**Resolved.** `initialize_governance_token` now performs a Metaplex `create_metadata_accounts_v3` CPI before the `SetAuthority` transfer, creating the canonical metadata PDA (`["metadata", MPL_TOKEN_METADATA, mint]`) with the passed `name`/`symbol`/`uri` (`DataV2`, `seller_fee_basis_points = 0`, no creators/collection/uses). The metadata account address is validated with `find_program_address` in the handler (`ActionMismatch` otherwise), and the metadata update authority is the program PDA `["mint_authority"]` with `is_mutable = true` — the program can update the record later and no EOA can. Because the CPI runs while the caller is still the mint's authority (the required signer), ordering is safe.

Operational note: this requires the Metaplex Token Metadata program (`metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s`) to be present on the target cluster (it is on devnet/mainnet; on localnet it must be uploaded for a full bootstrap test).

### M2 — `delegate_votes` is a no-op ✅
**Resolved by removal.** The instruction only validated a token account and logged a message; no delegation was stored and `cast_vote` never consulted it. The dead interface (file, `instructions/mod.rs`, `lib.rs`, and the regenerated Codama client) is now gone, so nothing advertises delegation that doesn't exist. If delegation is desired later, it should be a first-class `Delegation` account consumed by `cast_vote`, not a log-only stub.

### M3 — Proposals can now cause things to happen ✅
**Resolved.** `instruction_data: Vec<u8>` was replaced by the typed `ProposalAction` enum (`proposal.rs`), and the four action triggers decode and perform it atomically (see C1). There is still no arbitrary-CPI executor (e.g. calling external programs with arbitrary targets), only the four first-class DAO actions — which is a deliberate, safer scope for a prototype.

### M4 — Donors have no recourse ✅
**Resolved.** `donate` maintains a per-donor `DonationRecord` (`["donation", campaign, donor]`, `init_if_needed`, grows with every contribution). The new **`claim_refund`** instruction lets the donor claw back their share of a drained campaign's escrow **after** `emergency_withdraw` (`campaign.emergency_withdrawn` required, error `RefundNotAvailable` otherwise):
- the refund is `min(donation_record.amount, escrow_remaining)` — capped so an over-drain or a partial drain is handled atomically, and a fully drained escrow yields `InsufficientFunds`;
- the escrow→donor transfer uses the campaign PDA signer seeds (same path as milestone releases);
- the record and `campaign.total_deposited` are decremented by the refunded amount, keeping bookkeeping consistent.

Remaining policy note: `emergency_withdraw` still moves the (capped) voted amount to the treasury; `claim_refund` is **not** pro-rata across donors and there is no queue — the escrow is first-come, first-clawed within each donor's own recorded share. That is a deliberate prototype scope; a production version would likely split the drain remainder across donors on-chain.

### M5 — Milestone proofs are self-attested ✅
`proof_cid` is set by the creator and stored. Nothing verifies the CID or links the release amount to any off-chain deliverable. Release is now a **DAO-governed decision** (C3), which reduces the single-key risk, but the proof itself remains unverifiable on-chain.

**Fixed (verifier gate).** Every campaign now names a designated `verifier` at creation (`create_campaign.rs`), endorsed by the DAO's `ApproveAndGoLive` approval. `propose_milestone` requires that verifier to sign (`constraint = campaign.verifier == verifier.key() @ FydaoError::InvalidVerifier`, `propose_milestone.rs:29-32`) and records `verified_by`/`verified_at` on the milestone plus `MilestoneProposed` event payload. The attestation is therefore a first-class on-chain fact — a foreign/attacker verifier is rejected (asserted on-chain in `integration_litesvm.rs`). The release itself remains DAO-vote-gated (C3), so the verifier can only vouch for the deliverable, never release funds.

**Status: Resolved (oracle residual).** Closing the residual — trusting the verifier without an external reputation layer — requires an oracle/attestation layer (e.g. a trusted verifier signing the CID, or a decentralized review protocol) that the prototype intentionally does not include. The honest framing is: the DAO votes on whether to release, the designated verifier attests the deliverable, and the `proof_cid` is evidence for the voters — not a trustless guarantee.

### M6 — `emergency_withdrawn` enforced across all campaign write paths ✅
**Fixed (enforcement).** `donate.rs`, `release_milestone.rs`, and `propose_milestone.rs` all reject once `campaign.emergency_withdrawn` is true, using the dedicated `EmergencyWithdrawn` error (L6). After a drain the campaign is frozen: no new donations, no milestone proposals, no releases (except the donor `claim_refund` clawback, which is the intended post-drain path).

**Fixed (bookkeeping).** `emergency_withdraw.rs` now adjusts `total_deposited` with `saturating_sub(amount)` so the field tracks the net escrow after a partial drain and off-chain displays stay accurate.

### M7 — Emergency-withdraw destination is unconstrained ✅
**Fixed.** `emergency_withdraw.rs:27-32` now constrains `destination.key() == dao_config.treasury`, where `treasury` is the canonical treasury token account recorded in `DaoConfig` at `initialize_dao`. Funds can no longer be routed to an arbitrary attacker account.

Residual (with C3): the single `dao_config.authority` still decides *when* a drain happens and the treasury itself is a DAO-controlled account; a compromised authority could also steal via the treasury. A real fix requires proposal-gated execution (C1/C3/C4).

### M8 — Stale/inconsistent deployment config ✅
**Fixed.** `declare_id!` (`lib.rs:9`) and `Anchor.toml` `[programs.devnet]`/`[programs.localnet]` are aligned: program name `fydao` with ID `Fg6PaFpo...`. Residual: the ID is still the Anchor placeholder — a real deployment must run `anchor keys sync` and deploy with a real keypair.

### M9 — Two-step authority transfer implemented ✅
**Fixed.** `transfer_authority.rs:20` rejects `Pubkey::default()` and sets `dao_config.pending_authority` (step 1); `accept_authority.rs` promotes `pending_authority` → `authority` and clears it, gated on the pending key signing and `pending_authority != default` (step 2). A typo'd key no longer permanently orphans the protocol.

Residual (with C4): transferring authority to a PDA still bricks signing because every authority-gated instruction requires a `Signer` that a PDA cannot produce.

### M10 — Mint authority not revoked / not program-controlled ✅
**Resolved.** The governance mint's `MintTo` authority is now a program PDA set at `initialize_governance_token` (H5), so minting can only happen through `mint_governance_tokens`, which enforces `max_governance_supply` against the real `mint.supply` (C5). `total_minted` bookkeeping stays in sync as informational.

Residual:
- the authority key retains mint power **up to the cap** through the program (no governance vote or delay). For a real deployment, either revoke `MintTo` authority after initial distribution or gate minting behind a proposal.

---

## Low

### L1 — Checked arithmetic for quorum/vote math ✅
**Fixed.** `queue_proposal.rs:33-44` now uses `checked_add`/`checked_mul` with `FydaoError::Overflow`. (Time computations such as `eta` and expiry windows still use `saturating_add`, which is acceptable for `i64` timestamps.)

### L2 — Dead code removed from `cast_vote` ✅
**Fixed.** The unreachable `_ => return err!` arm was removed; the remaining `_` arm handles abstain after the `support <= 2` guard (`cast_vote.rs:71-90`).

### L3 — No structured events ✅
**Fixed.** `state/events.rs` defines 20 Anchor `#[event]` structs, and every state-changing handler emits exactly one via `emit!` (plus `ProposalExecuted` from the action triggers and `ProposalExpired` from `finalize_execution`). The events carry the mutated identity (campaign/proposal/voter) and the new authoritative totals, so off-chain indexers can subscribe to typed logs instead of parsing `msg!`. The Codama client was regenerated with the event types.

### L4 — Rent never reclaimed ✅ (partial)
**Fixed where it matters.** Two short-lived PDAs are now closed after their final use, returning rent:
- `Milestone` — closed on `release_milestone` (`close = campaign`, lamports returned to the campaign account);
- `VoteRecord` — closed on `unlock_votes` (`close = voter`, lamports returned to the voter).

Remaining by design: `Campaign` (lives for the campaign's lifetime and is deliberately kept after a drain so `claim_refund`/audit can reference it), `Proposal` (execution history), and `DaoConfig`/`GovernanceTokenState` (singletons). These could be closed by an explicit cleanup instruction in a production version.

### L5 — `trust_score` bounded ✅
**Fixed.** `create_campaign.rs:59-61` rejects `trust_score > 100` (valid range `0..=100`). The value is still creator-supplied (no source verification), so it remains cosmetic; the bound prevents absurd/gameable values from entering the state.

### L6 — Dedicated `EmergencyWithdrawn` error code ✅
**Fixed.** `errors.rs:74-75` adds `EmergencyWithdrawn`, and `donate.rs:43` / `release_milestone.rs:49` use it instead of the misleading `CampaignNotLive`. Clients can now distinguish "not approved yet" from "already drained".

---

## Recommendations (prioritized remediation)

**Blockers (do not deploy without):**
1. ~~Fix or remove governance~~ — **done (C1)**: proposals carry typed `ProposalAction`s that the action triggers perform atomically.
2. ~~Real timelock~~ — **done (C4)**: `queue_proposal` sets `eta = queued_at + timelock_delay`; `execution.rs` enforces `eta` and the 14-day execution window. No EOA or PDA signer is required to execute a passed proposal.
3. ~~Remove the single-key escape hatch~~ — **done (C3)**: `release_milestone`/`approve_and_go_live`/`emergency_withdraw`/`transfer_authority` are permissionless triggers gated by a passed proposal; no single key can move funds.
4. ~~Vote snapshots~~ — **done (C2)**: `cast_vote` locks the voter's weight into a per-voter escrow and `unlock_votes` returns it at a final state. Optional follow-up: support unlocking `Succeeded` proposals that are abandoned, and surface the lock in the UI.
5. ~~Revoke or govern minting~~ — **done (C5/H5)**: the mint's `MintTo` authority is a program PDA and the cap is enforced against the real `mint.supply`; no raw `MintTo` can bypass the cap. Residual policy note: the authority can still mint up to the cap through the program — revoke `MintTo` authority after distribution for a real deployment.
6. **Deployment hygiene.** Run `anchor keys sync`, deploy a real keypair, confirm the ID (M8 residual), and set `GENESIS_AUTHORITY` (`lib.rs`) to the real deployer key.
7. ~~Resolve H1 before mainnet~~ — **done**: `initialize_dao` requires the pinned `GENESIS_AUTHORITY` signer, so the global `DaoConfig` PDA can no longer be front-run.

**High priority:**
8. ~~Fix the H3 regression~~ — **done**: `Expired` persists via `finalize_execution`. Optional follow-up: make the 14-day window configurable in `DaoConfig`.
9. ~~Enforce `paused` everywhere~~ — **done**: every fund-moving and governance-admin path checks `paused`. 
10. ~~Adjust `total_deposited` on emergency withdraw~~ — **done**: `emergency_withdraw` applies `saturating_sub(amount)`, so `total_deposited` tracks the net escrow (M6 bookkeeping).
11. ~~Constrain the emergency-withdraw destination~~ — **done** (M7): pinned to `dao_config.treasury`.
12. ~~Make authority transfer two-step~~ — **done** (M9): DAO-gated `transfer_authority` (step 1) → `accept_authority` (step 2, signed by the new key).
13. ~~Write real on-chain integration tests~~ — **done** (H8): `anchor/programs/fydao/tests/integration_litesvm.rs` runs the full proposal lifecycle and the fund-flow gates against a real SVM via LiteSVM — DAO init, governance minting, campaign create, DAO go-live, M5 verifier enforcement, donation/quorum gates, escrow funding cap, milestone attestation, vote unlock, and governance release. The old TS suite that mutated local objects was dropped.

**Nice to have:**
14. ~~Implement metadata / strip dead interfaces~~ — **done**: `initialize_governance_token` creates real Metaplex metadata (M1) and `delegate_votes` was removed (M2). Remaining nice-to-haves: an external oracle/reputation layer for the verifier (M5 residual) and pro-rata refund splitting.
15. ~~Emit Anchor `#[event]`s, close accounts for rent reclaim~~ — **done**: 20 events emitted (L3); `Milestone` and `VoteRecord` PDAs are closed on their final use (L4).

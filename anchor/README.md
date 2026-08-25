# fydao — Anchor workspace

The `fydao` program is a Solana fundraising DAO: on-chain campaigns with a stablecoin
escrow, governed by a custom Governor (governance token, voted proposals, real
timelock, proposal-gated fund movement).

Program ID: `HwV2YLJscqtHApqHj3Lp6cW4hA3L7areeWe1PH9BUSBb`

## Program surface

| Group                  | Instructions                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol init          | `initialize_dao` (genesis-gated, H1), `initialize_governance_token` (real Metaplex metadata, M1), `mint_governance_tokens` (capped against `mint.supply`, C5/H5)                                                                                                          |
| Campaigns              | `create_campaign` (names the designated verifier, M5), `approve_and_go_live` (DAO-gated)                                                                                                                                                                                  |
| Donations & milestones | `donate`, `propose_milestone` (verifier-gated, M5), `release_milestone` (DAO-gated), `emergency_withdraw` (DAO-gated → treasury, M7), `claim_refund` (post-drain clawback, M4)                                                                                            |
| Governance             | `create_proposal` (typed `ProposalAction`, vote-weight snapshot C2), `cast_vote` (escrow-locked, C2), `unlock_votes`, `queue_proposal` (real timelock, C4), `cancel_proposal`, `transfer_authority`/`accept_authority` (two-step, M9), `set_paused` (circuit breaker, H6) |

Fund movement is **proposal-gated**: `release_milestone`, `approve_and_go_live`,
`emergency_withdraw`, and `transfer_authority` are permissionless triggers that only act
after a passed proposal has been queued and its timelock elapsed. No single key can move
funds.

## Testing

```bash
anchor build --ignore-keys
cargo test          # unit + PDA tests + LiteSVM on-chain integration tests
cargo clippy --tests
```

- `tests/governance_and_proposal_tests.rs` — PDA derivation round-trips and proposal
  lifecycle logic.
- `tests/integration_litesvm.rs` — real-transaction integration suite on a real SVM
  (LiteSVM): DAO init → minting → campaign create → go-live → verifier enforcement →
  donation/quorum gates → escrow funding cap → milestone attestation → vote unlock →
  governance release.

## Docs

- `Architecture.md` — architecture, trust model, governance ↔ campaign data flows, user stories.
- `Security.md` — audit findings (C1–C5, H1–H8, M1–M10, L1–L6) and resolution status.

## Deployment

```bash
anchor keys sync    # replace the placeholder program ID with a real keypair
anchor build
anchor deploy
```

Set `GENESIS_AUTHORITY` in `src/lib.rs` to the deployer key before initializing the DAO.

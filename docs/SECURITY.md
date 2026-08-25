# 🛡️ Arthasetu (`fydao`) — Security Analysis & Audit Log

> **Security Guarantees, Audit Findings Resolution Log, and Trust Model.**

---

## 📑 Security Status & Guarantees

| Audit Item | Mechanism | Implementation Guarantee |
| :--- | :--- | :--- |
| **C1: Real Governance Execution** | Typed `ProposalAction` | Proposals carry strongly typed actions executed atomically by permissionless triggers. |
| **C2: Anti-Flash-Loan Voting** | Vote Token Escrow | `cast_vote` locks tokens in `["vote_escrow", voter]` until proposal is terminal. Buy-vote-dump closed. |
| **C3: Non-Custodial Escrows** | PDA-Owned ATAs | Campaign funds are held in an ATA owned by `["campaign", creator, id]`. No single key can drain funds. |
| **C4: Timelock Safety** | 14-Day Expiry Window | Succeeded proposals must wait for `timelock_delay` before permissionless execution; expire after 14 days. |
| **C5: Hard Supply Cap** | Program-Controlled Mint | Mint authority is a program PDA `["mint_authority"]`; cap checked against real `mint.supply`. |
| **H1: Genesis Protection** | Pinned Deployer Key | `initialize_dao` requires caller == pinned `GENESIS_AUTHORITY` in `lib.rs` (front-run proof). |
| **M4: Donor Recourse** | Pro-Rata Clawbacks | Lifetime contributions tracked via `DonationRecord` PDAs allow backers to claim refunds if drained. |
| **M5: Attestation Rigor** | Dual-Signer Validation | `propose_milestone` requires explicit signatures from both Creator and Designated Verifier. |
| **M11: Privacy AI Diligence** | Zero-Retention AI | Documents are hashed client-side with SHA-256, sanitized for PII, and cross-examined without central storage. |

---

## 🔍 Detailed Finding Resolutions

### C1 — Governance execution is a real, typed action ✅
Proposals carry a typed `ProposalAction` (approve campaign / release milestone / emergency withdraw / transfer authority). The timelock logic moved into the shared `finalize_execution` helper (`execution.rs`). `approve_and_go_live`, `release_milestone`, `emergency_withdraw`, and `transfer_authority` are now **permissionless triggers** gated by a passed+queued+timelocked proposal whose action matches the operation exactly (`ActionMismatch` otherwise).

### C2 — Vote weight locked into per-voter escrow ✅
`cast_vote` transfers the voter's governance tokens into a per-voter escrow ATA (owned by the `["vote_escrow", voter]` PDA), and `unlock_votes` returns them once the proposal reaches a final state (`Defeated`/`Canceled`/`Executed`/`Expired`). Buy-vote-dump attacks are permanently closed.

### C3 — Fund movement is proposal-gated ✅
No single key—not even `dao_config.authority`—can move funds directly. Every fund-moving operation requires an on-chain DAO vote that satisfies quorum and passes timelock cooldowns.

### C5 / H5 — Governance-token minting is program-controlled ✅
`initialize_governance_token` transfers the mint's `MintTo` authority to a program PDA (`["mint_authority"]`) via a `SetAuthority` CPI, and `mint_governance_tokens` mints with PDA signer seeds. The SPL mint authority is no longer an EOA, and the cap is enforced against the real `mint.supply`.

### H1 — Genesis authority front-run protection ✅
`initialize_dao` is guarded by the pinned `GENESIS_AUTHORITY` constant (`lib.rs`)—only the pinned deployer key can bootstrap the DAO.

### M4 — Donor refund clawbacks post-emergency drain ✅
`donate` writes a per-donor `DonationRecord` (`["donation", campaign, donor]`), and `claim_refund` lets a donor claw back their share of a drained campaign's escrow after a governance-approved `emergency_withdraw`.

### M5 — Dual-signer milestone deliverable attestation ✅
Every campaign names a designated `verifier` at creation (`create_campaign.rs`). `propose_milestone` requires that verifier to co-sign (`constraint = campaign.verifier == verifier.key() @ FydaoError::InvalidVerifier`), making the attestation a first-class on-chain fact.

### M11 — Off-chain document privacy & AI diligence model ✅
Off-chain campaign submission and review incorporate a comprehensive privacy-preserving diligence layer:
1. **Client-Side SHA-256 Fingerprinting**: Documents are hashed in the browser using WebCrypto prior to transmission.
2. **Zero-Retention Ephemeral Processing**: Document text is extracted in memory buffers and never stored on centralized disks or databases.
3. **PII Sanitization**: Emails, phone numbers, and crypto private keys are redacted before analysis.
4. **Story vs. Document Cross-Examination**: The AI engine compares the campaign story against technical whitepapers and budget spreadsheets to catch contradictory claims, missing deliverables, or inflated numbers.
5. **On-Chain Trust Score Binding**: The resulting score (`0..=100`) is recorded on the `Campaign` PDA (`create_campaign.rs:59-61`).

---

*Arthasetu Security Analysis · Verified against 24/24 passing unit & LiteSVM on-chain integration tests.*

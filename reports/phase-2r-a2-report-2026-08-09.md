# FAZA 2R-A.2 — Final Reliability Guard

| | |
| -- | -- |
| **Date** | 2026-08-09 |
| **Base SHA** | `a6fbcb508c67287c33479f38c3678cd44684ee60` |
| **Node** | 22.14.0 |
| **Phase** | 2R-A.2 (STOP — no 2R-B / Phase 3 / budget bump / commit / push / deploy) |
| **Verdict** | **PASS with known D17 red only** |

## Pre-flight

### FOUND
- Same `importId`+`actorId` could run two commits if HTTP response lost and user retried
- Revalidation catch unlocked to `prepared` even after prior committing writes
- Expired locks could clear for `failed`+uncompensated / committing-like states
- Recovery messaging keyed mainly on `MONTHLY_IMPORT_COMPENSATION_FAILED`
- Client could claim rollback without `compensated=true`
- Schedule clear could leave `driverName=""`
- Plan-import preview interpolated dynamic strings into `innerHTML`
- A.1 “unauthenticated 401” was stub middleware wiring, not real verifier

### CHANGING
A–G reliability/client-truth + fail-first tests + HTTP/E2E + visual + gates/artifacts.

### NOT CHANGING
Language purge (→ 2R-B), Phase 3, D17 budget bump, KB optimization, new collections/deps, commit/push/deploy.

### RISKS
D17 remains red until 2R-B. Attempt lease is 2 minutes — rightful resume after lease expiry must re-own before mutate.

### PROOF
Executable unit/HTTP/E2E + UI visual trail. Logs in `reports/phase-2r-a2-logs/`.

## Auth claim honesty (G)

| Proof | What it actually proves |
| ----- | ----------------------- |
| `phase2r-a1-http.test.js` **auth-middleware-wiring** | Route wiring invokes injected `requireCompanyStaff` and returns 401 when that stub rejects |
| `tests/unit/staff-auth-http.test.js` | Real staff auth middleware: missing/forged/revoked tokens, role/tenant gates |

Report does **not** claim the stub test is a production auth verifier.

## Gates (Node 22.14.0)

| Gate | Exit | Log |
| ---- | ---- | --- |
| secrets | **0** | `reports/phase-2r-a2-logs/secrets.txt` |
| lint | **0** | `.../lint.txt` |
| targeted unit (A.2 + related HTTP) | **0** (24) | `.../unit-targeted.txt` |
| full unit | **0** (680) | `.../unit-full.txt` |
| HTTP / staff-auth integration | **0** (21) | `.../http-tests.txt` |
| E2E monthly import | **0** (9) | `.../e2e-monthly-import.txt` |
| full E2E | **0** (89) | `.../e2e-full.txt` |
| rules emulator | **0** (102) | `.../rules.txt` |
| firebase isolation | **0** | `.../firebase-isolation.txt` |
| audit `--omit=dev` | **0** | `.../audit.txt` |
| visual | **0** | `.../visual.txt` |
| build / D17 | **1 — only D17** | `.../build.txt` + `.../bundle-budgets.txt` |

### D17 arithmetic (no bump) vs A.1

| Metric | A.1 | A.2 | Δ A.2−A.1 | Max | A.2 over |
| ------ | --: | --: | --------: | --: | -------: |
| staff JS excl. translations | 589132 | **590695** | **+1563** | 581632 | **9063** |
| translations chunk | 381581 | **381918** | **+337** | 377856 | **4062** |

Limits unchanged. D17 is the only intentional red gate.

## Visual (`reports/phase-2r-a2-visual/`)

| File | Assertion (UI only) |
| ---- | ------------------- |
| `01-commit-in-progress.png` | IN_PROGRESS banner + retained importId; no rollback claim |
| `02-retry-retained-importId.png` | Retry keeps same importId |
| `03-recovery-required-no-false-rollback.png` | Recovery UI without “rolled back” text |
| `04-escaped-malicious-fields.png` | XSS payloads as text; no img/svg nodes |

Screenshots do **not** prove server lock, compensation, or auth.

## Artifacts

- `reports/phase-2r-a2-report-2026-08-09.md`
- `reports/phase-2r-a2-change-ledger.md`
- `reports/phase-2r-a2-logs/`
- `reports/phase-2r-a2-visual/` + `TRAIL.json`
- `reports/phase-2r-a2-review-source-2026-08-09.zip`
- `reports/phase-2r-a2-source-manifest.txt`
- `reports/phase-2r-a2-full-deliverable-2026-08-09.zip`

## STOP

Do not start 2R-B, Phase 3, commit, push, or deploy from this phase.

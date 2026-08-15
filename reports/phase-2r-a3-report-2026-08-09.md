# FAZA 2R-A.3 — NO-SCHEMA SINGLE-FLIGHT + TRUTHFUL OUTCOMES

**Date:** 2026-08-09  
**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Node:** 22.14.0  
**Verdict:** A.3 closed with **D17 as the only red gate**. Schema diff: **NONE**.  
**STOP:** 2R-B / Phase 3 / budget bump / commit / push / deploy not started.

## Why A.2 was rejected (addressed)

1. Unauthorized lease schema fields → **removed** from production code/tests/reports usage.
2. Non-atomic ownership vs mutation → **claim is a live Firestore transaction** (reads before writes).
3. Attempt A writing / extending after B takeover → **no takeover**; second HTTP never continues committing.
4. Missing `activeAttemptId` passed ownership → **lease ownership path deleted**.
5. False “nothing was saved” on IN_PROGRESS/RECOVERY → **validation panel hidden** for those phases.
6. RECOVERY left Confirm import → **Confirm/Retry removed** in recovery.
7. Generic recovery claimed rollback failure → **HTTP message fixed**.
8. Generic recovery audited as `compensation_failed` → **only real compensation failure uses that audit action**.
9. Manifest count/self-hash → **body-hash footer; verifier EXIT=0**.

## What changed (user-visible / operator)

- **Single-flight without new schema:** only one HTTP request can transactionally move `prepared → committing` and hold the group/month lock; peers get `MONTHLY_IMPORT_IN_PROGRESS` (`retryable=true`) with zero mutations.
- **Fail-closed recovery:** `committing` with expired/missing/mismatched lock → `MONTHLY_IMPORT_RECOVERY_REQUIRED` (no auto-resume).
- **Truthful outcomes:** IN_PROGRESS says processing only; RECOVERY says state needs review / plan not clean; rollback text only when compensation actually ran (`compensated=true` or real `COMPENSATION_FAILED`).
- **UI:** recovery warning without Confirm/Retry; Clear preview allowed and explicitly does not clear server lock/data; retained `importId` for IN_PROGRESS/UNKNOWN.

## Schema diff

**NONE.** No new Firestore fields, collections, indexes, dependencies, or API contract.

Lease fields absent from production sources (`server/`, `js/`, `api-server.js`, `translations.js`):

- `attemptId`, `leaseExpiresAt`, `activeAttemptId`, `wasCommitting`, `ATTEMPT_LEASE_MS`

Proof: `reports/phase-2r-a3-logs/schema-lease-absent.txt` + unit schema guard.

## Emulator concurrency

`tests/rules/phase2r-a3-commit-concurrency.test.js` (Admin SDK + Firestore emulator):

- Subtest **ok 93** — two parallel commits: one claims, other `MONTHLY_IMPORT_IN_PROGRESS`, zero dual writes
- Full rules suite: **103 pass**, EXIT=0 (`reports/phase-2r-a3-logs/rules.txt`, `concurrency-emulator.txt`)

## Visual trail (`reports/phase-2r-a3-visual/`)

| Shot | Proves (UI only) |
| ---- | ---------------- |
| `01-in-progress.png` | IN_PROGRESS + retained importId; no “nothing saved” / rollback |
| `02-in-progress-retry.png` | Retry keeps same importId |
| `03-recovery-required.png` | Recovery warning; no Confirm/Retry commit |
| `04-xss-as-text.png` | Malicious fields as text |
| `05-idempotent-success.png` | Preview → successful/idempotent path |

Each screenshot is **not** proof of server transactions, auth, or Rules. Server proof is unit + emulator + HTTP.

`TRAIL.json` + `README.md` included. Visual EXIT=0.

## Gate exit codes

| Gate | Exit | Log |
| ---- | ---- | --- |
| secrets | **0** | `phase-2r-a3-logs/secrets.txt` |
| lint | **0** | `lint.txt` |
| targeted unit (A.3 + related) | **0** (35) | `unit-targeted.txt` |
| A.3 single-flight unit | **0** (7) | `unit-a3-single-flight.txt` |
| full unit | **0** (684) | `unit-full.txt` |
| HTTP / staff-auth | **0** (32) | `http-tests.txt` |
| Firestore emulator concurrency (in rules) | **0** (ok 93) | `concurrency-emulator.txt` / `rules.txt` |
| full E2E | **0** (89) | `e2e-full.txt` |
| rules emulator | **0** (103) | `rules.txt` |
| firebase isolation | **0** | `firebase-isolation.txt` |
| npm audit --omit=dev | **0** (0 vulns) | `audit.txt` |
| visual trail | **0** | `visual.txt` |
| build + D17 | **1** (D17 only) | `build.txt` / `bundle-budgets.txt` / `d17-measure.json` |
| manifest verifier | **0** | `manifest-verifier.txt` |

## D17 arithmetic

| Surface | Max | A.2 | A.3 | Δ A.3−A.2 | Over max |
| ------- | --- | --- | --- | --------- | -------- |
| staff excl. translations | 581632 | 590695 | **590834** | **+139** | **+9202** |
| translations chunk | 377856 | 381918 | **382080** | **+162** | **+4224** |

Driver budget remains green (172642 ≤ 225280).  
No budget bump / no KB optimization in A.3 (per contract). D17 remains the sole red gate.

## Artifacts

- `reports/phase-2r-a3-report-2026-08-09.md` (this file)
- `reports/phase-2r-a3-change-ledger.md`
- `reports/phase-2r-a3-logs/`
- `reports/phase-2r-a3-visual/` + `TRAIL.json`
- `reports/phase-2r-a3-source-manifest.txt` (body-sha256 footer; manifest excluded from body)
  - `listed-files: 1213` + manifest in ZIP = **1214** entries
  - `body-sha256:` see footer of `phase-2r-a3-source-manifest.txt` / `manifest-verifier.txt` (authoritative)
  - verifier **EXIT=0** (`phase-2r-a3-logs/manifest-verifier.txt`)
- `reports/phase-2r-a3-review-source-2026-08-09.zip` (62 entries, `/` paths)
- `reports/phase-2r-a3-full-deliverable-2026-08-09.zip` (1214 entries; `AGENTS.md` + 8 `.cursor/rules/*`; no nested ZIPs; `/` paths)
- `reports/git-status-short.txt`, `git-diff-stat.txt`, `base-to-working.patch` (+ phase-prefixed copies)

## Intentionally not done

- Crash-resume of `committing` jobs
- Any new schema / dependency / API field
- 2R-B, Phase 3, language purge, bundle optimization, budget bump
- Commit, push, deploy

Owner must send `NASTAVI FAZU 2R-B` before any 2R-B work.

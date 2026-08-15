# FAZA 2R-A.3.1.1 — Driver confirmation + full lock consistency

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Date:** 2026-08-09  
**Schema diff:** **NONE** (no new collection, field, index, dependency, API, or budget bump)  
**Verdict:** A.3.1.1 closed; **D17 sole red gate** (unchanged sizes). **STOP** before 2R-B.

## Closed gaps (three A.3.1 reproductions)

1. **Stale confirmation fingerprint** — LIVE fingerprint computed with `fingerprintShift` from shift fields; never trusts stored `shiftFingerprint` (canonical writers set null). Mismatch or revision mismatch → `409 CONFIRMATION_STALE`, no writes. Missing live → `SHIFT_MISSING`, no phantom.
2. **Read-before-write on multi-scope confirm** — all shift + lock/job reads and gate validation complete before any `tx.delete` / confirmation writes. Assignment / undo / incident already followed this order (verified).
3. **Full lock consistency** — chunk + completion require exact `importId`, `actorId`, `groupId`, `month` + alive lock. Missing groupId/month is not a fallback → `MONTHLY_IMPORT_RECOVERY_REQUIRED`, never `completed`, never delete foreign lock.

Also: UX fast-check safe cleanup is transactional; `tx.getAll` for bounded chunk/compensation reads.

## Fail-first

`reports/phase-2r-a311-logs/fail-first-unit.txt` — **EXIT=1** (4 fail / 0 pass) against pre-fix tree.

## Emulator HTTP handler proofs (G1–G8)

All in `tests/rules/phase2r-a311-confirm-lock-consistency.test.js` (real confirm handler):

| # | Case | Result |
| - | ---- | ------ |
| G1 | Import lock first → confirm | IN_PROGRESS/RECOVERY |
| G2 | Confirm first → import | no false confirmation left |
| G3 | Stale target + null `shiftFingerprint` | CONFIRMATION_STALE |
| G4 | Two scopes + safe expired lock | HTTP 200, not 500 |
| G5 | Missing live shift | SHIFT_MISSING, no phantom |
| G6 | Completion missing groupId/month | RECOVERY, not completed |
| G7 | Chunk missing groupId/month | RECOVERY |
| G8 | Safe cleanup vs fresh claim | new lock kept |

Rules suite: **122 pass**, EXIT=0.

## Visual (`reports/phase-2r-a311-visual/`)

Shot **05** viewport shows **03.08.2026**, duty **101.S01**, bus **91101**, and toast **Import already applied — plan reloaded.**  
Screenshots are **not** auth/Rules/transaction proof. Trail: `TRAIL.json`.

## Gate exit codes

| Gate | Exit | Notes |
| ---- | ---- | ----- |
| secrets | **0** | |
| lint | **0** | 0 errors; unused admin/app warnings removed |
| targeted unit | **0** | 28 |
| full unit | **0** | 705 pass |
| HTTP/auth | **0** | 32 |
| Rules + emulator | **0** | 122 |
| focused A.3.1.1 emulator | **0** | G1–G8 |
| full E2E | **0** | 89 |
| firebase isolation | **0** | |
| npm audit --omit=dev | **0** | 0 vulns |
| visual | **0** | |
| build + D17 | **1** | D17 only |
| manifest verifier | **0** | see pack log |

## D17 arithmetic

| Surface | Max | A.3.1 | A.3.1.1 | Δ |
| ------- | --- | ----- | ------- | - |
| staff excl. translations | 581632 | 590834 | **590834** | **0** (over +9202) |
| translations | 377856 | 382080 | **382080** | **0** (over +4224) |

No budget bump / no language purge / no bundle optimization in this correction.

## Artifacts

- `reports/phase-2r-a311-report-2026-08-09.md`
- `reports/phase-2r-a311-change-ledger.md`
- `reports/phase-2r-a311-logs/` (fail-first EXIT=1 + final gates)
- `reports/phase-2r-a311-visual/` + `TRAIL.json`
- `reports/phase-2r-a311-source-manifest.txt`
- `reports/phase-2r-a311-review-source-2026-08-09.zip`
- `reports/phase-2r-a311-full-deliverable-2026-08-09.zip`
- `reports/git-status-short.txt`, `git-diff-stat.txt`, `base-to-working.patch`

## Intentionally not done

2R-B · Phase 3 · language purge · bundle optimization · commit / push / deploy · schema changes · budget bump.

Owner must send `NASTAVI FAZU 2R-B` before any 2R-B work.

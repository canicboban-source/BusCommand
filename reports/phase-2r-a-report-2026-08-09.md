# FAZA 2R-A — Reliability Correction Report

| | |
| -- | -- |
| **Date** | 2026-08-09 |
| **Base SHA** | `a6fbcb508c67287c33479f38c3678cd44684ee60` |
| **Node** | 22.14.0 |
| **Phase** | 2R-A (not Phase 3; not bundle optimization) |
| **Verdict** | **PASS with known D17 red** — reliability corrections proven; bundle gate remains red (no bump) |

## Pre-flight

### FOUND
- Staff monthly import used `group-monthly-plan-import` builders instead of canonical `shift-assignment.js`.
- Clear used `batch.delete` (lost revision / priorSnapshot / undo).
- Compensation used partial merge + swallowed `.catch(() => {})`.
- Client looped multi-month commits (partial month success possible).
- Pending driver select used display name; ambiguous duplicates unsafe.
- No commit-time revalidation of driver/duty/bus/revision.
- No rate limit / job byte bound on prepare; large schedule writes unbounded.
- Phase 2 closeout STOP solely on D17 budgets (staff/translations).

### CHANGING
- Canonical shift/clear/schedule builders + bus rules + `importId` ownership.
- Revisioned clear tombstone; full overwrite compensation; truthful `compensation_failed` / `recoveryRequired`.
- Job state machine: prepared → committing → completed; terminal non-retryable; idempotent completed.
- Single-month fail-closed client block before any API.
- Stable `driverId` in pending/select/rows; opaque short-ID disambiguation.
- Commit-time revalidation; rateLimit(10/60s); 700 KiB prepare bound → 413; chunked writes.
- Fail-first unit/HTTP/E2E + visual trail + this report.

### NOT CHANGING
- Rules (no change), D18.1, Phase 3, budget limits, new collections/deps, commit/push/deploy.
- Bundle/lazy-load optimization deferred to **2R-B**.

### RISKS
- Bundle still over budget (staff + translations) — expected until 2R-B.
- Visual step 08 recovery UI is **simulated** (insertAdjacentHTML); recovery truth proven by unit/HTTP.
- Cross-group bus warning remains warning (not new hard reject) per owner.

### PROOF
See Gates table + `reports/phase-2r-a-logs/` + unit/HTTP/E2E sources listed below.

## Diff vs prior Phase 2 narrative

| Claimed earlier | Actual pre-2R-A code | 2R-A fix |
| --------------- | -------------------- | -------- |
| Clear preserves revision/undo | `batch.delete` | `buildClearedShift` tombstone |
| Compensation always truthful | merge + `.catch(() => {})` | full restore; lock kept; recovery status |
| Multi-month safe | client month loop | block >1 month before API |

## Work completed (A–G)

### A — Canonical shift contract
`server/staff-monthly-plan-import.js` uses `buildAssignedShift` / `buildClearedShift` / `buildScheduleDayEntry` / `capturePriorSnapshot` / `currentRevision`.
Bus: explicit non-empty import bus wins; empty + same duty keeps ops bus; duty change clears bus; confirmation reset on mutate; `importId` marker; schedule is mirror (clear days omitted).

### B — Clear & rollback
Clear = revisioned tombstone. Compensation full overwrite restore; foreign `importId` skipped; compensation failure → `compensation_failed` + lock retained; HTTP message does not claim “partial changes rolled back” for that code.

### C — Job state machine
prepared → committing; completed idempotent; failed / compensation_failed / recovery_required / expired not retryable; resume skips rows already tagged with same `importId`; lock released only on proven completed or full compensate.

### D — Multi-month
Client blocks if pending months > 1 before any preview/commit API; EN/SR/DE strings; E2E asserts `previewCalls === 0` and `commitCalls === 0`.

### E — driverId
Pending stores `driverId`; `<select value=driverId>`; ambiguous same-name requires pick with opaque short ID; rows/revision by driverId; E2E proves selected UUID reaches server.

### F — Commit-time revalidation
Before mutations: group access, driver active+group, duty in active catalog, bus active/ready/group, expected revision. Tests for inactive / wrong group / missing duty / maintenance bus.

### G — Bounds
`rateLimit(10, 60_000)` on preview/commit; `MAX_JOB_BYTES = 700KiB` → 413 before job write; chunked shift/schedule writes with injectable batch assert.

## Files changed (ledger detail)

| File | What / why / brings / risk / proof |
| ---- | ---------------------------------- |
| `server/staff-monthly-plan-import.js` | Canonical builders, clear tombstone, compensate, SM, revalidate, bounds | Truthful import | Comp race | unit tests 10 |
| `server/driver-routes.js` | rateLimit; recovery error text; wiring | HTTP surface | msg i18n | HTTP tests |
| `server/plan-import-preview.js` | richer previous snapshots | undo data | size | unit preview |
| `js/dispatcher/plan-import.js` | single-month, driverId, recovery UI, no fake success | Client truth | UX | E2E |
| `js/core/api-client.js` | preview/commit clients | API | — | E2E |
| `translations.js` | EN/SR/DE multi-month, ambiguous, recovery | i18n | +bytes D17 | visual |
| `tests/unit/staff-monthly-plan-import.test.js` | fail-first reliability suite | Proof | — | 10 PASS |
| `tests/unit/phase2r-a-monthly-import-http.test.js` | role/group/fp/expiry/rateLimit | Authz proof | — | 8 PASS |
| `tests/e2e/dispo-monthly-import-server.spec.js` | local refuse, happy, multi-month, dup name | UI proof | — | 4 PASS |
| `tests/e2e/line-310.spec.js` | fixture grants assigned group 310 | Phase-1 scope | — | 3 PASS |
| `scripts/phase2r-a-visual-trail.mjs` | 8 screens + TRAIL | Owner path | simulated #08 | visual PASS |

## Mandatory test checklist (H)

| # | Requirement | Result |
| - | ----------- | ------ |
| 1 | clear early chunk + later conflict → full restore | PASS unit |
| 2 | exact restore prior fields | PASS unit |
| 3 | new row rollback deletes | PASS unit |
| 4 | foreign write never rewritten | PASS unit |
| 5 | compensation failure → recovery status | PASS unit |
| 6 | crash/retry + idempotent completed | PASS unit |
| 7 | multi-month blocked before API | PASS E2E |
| 8 | duplicate names → selected driverId | PASS E2E |
| 9 | commit-time driver/duty/bus/revision re-check | PASS unit |
| 10 | oversized prepared → 413 no write | PASS unit |
| 11 | bounded large schedule mirror write | PASS (chunk + assertBatchLimit) |
| 12 | executable HTTP auth/role/group/fp/expiry/rate-limit | PASS HTTP |
| 13 | local-mode no-fake-success E2E | PASS |
| 14 | preview → commit → canonical reload E2E | PASS |
| 15 | server reject no local plan / no success | PASS E2E |

## Visual trail (I)

`reports/phase-2r-a-visual/` — screens 01–08 + `TRAIL.json` + README.

**Explicit:** visual does **not** prove rollback atomics, Rules, or server auth.

## Gates (J)

| Gate | Exit | Log |
| ---- | ---- | --- |
| secrets | **0** | `reports/phase-2r-a-logs/secrets.txt` |
| lint | **0** | `.../lint.txt` |
| unit phase2r-a (+preview) | **0** (21) | `.../unit-phase2r-a.txt` |
| HTTP | **0** (8) | `.../http-tests.txt` |
| full unit | **0** (655) | `.../unit-full.txt` |
| E2E monthly import | **0** (4) | `.../e2e-monthly-import.txt` |
| full E2E | **0** (84) | `.../e2e-full.txt` |
| rules emulator | **0** (102) | `.../rules.txt` |
| firebase isolation | **0** | `.../firebase-isolation.txt` |
| audit `--omit=dev` | **0** (0 vulns) | `.../audit.txt` |
| visual | **0** | `.../visual.txt` |
| build + bundle | **1** — **only** known D17 | `.../build.txt` / `bundle-budgets.txt` |

### Known D17 (allowed red for 2R-A)

| Metric | Actual | Max | Over |
| ------ | ------ | --- | --- |
| staff JS excl. translations | **586981** | 581632 | +5350 |
| translations chunk | **380442** | 377856 | +2586 |

No budget bump. No KB optimization in this subphase.

## Artifacts (K)

- `reports/phase-2r-a-report-2026-08-09.md` (this file)
- `reports/phase-2r-a-change-ledger.md`
- `reports/phase-2r-a-logs/`
- `reports/phase-2r-a-visual/`
- `reports/phase-2r-a-deliverable-2026-08-09.zip`
- `reports/phase-2r-a-review-source-2026-08-09.zip`
- `reports/phase-2r-a-source-manifest.txt`

## STOP

Do **not** start Phase 2R-B, Phase 3, commit, push, or deploy from this subphase.

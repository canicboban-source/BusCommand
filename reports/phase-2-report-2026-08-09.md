# FAZA 2 — Pouzdan Dispo monthly import (2026-08-09)

## Verdict

**STOP — production build gate FAILED on D17 bundle budget.**

Implementation and functional proof (unit / E2E mock / visual) are in place, but `npm run build` does **not** pass. Per owner instruction: no KB optimization, no scope expansion, **no raising budgets**. Waiting for owner decision.

## Bundle gate (blocking)

| Metric | Actual | Max | Over |
| ------ | ------ | --- | ---- |
| **staff app JS excl. translations** | **583680** | **581632** (568 KiB) | **+2048 B** |
| translations chunk (would fail next) | 379042 | 377856 (369 KiB) | **+1186 B** |

**Chunks carrying Phase 2 client import path (staff sum):**

| Bytes | Chunk | Note |
| ----- | ----- | ---- |
| 200597 | `assets/dashboard-CmznuySu.js` | contains plan-import / API |
| 139841 | `assets/init-C_Pvz9EG.js` | contains plan-import / API |
| 127208 | `assets/staff-BoWVxiPW.js` | contains plan-import / API |
| (+ other staff refs) | … | company-admin / msg / reports |

**Uzrok:** FAZA 2 client rewrite of `js/dispatcher/plan-import.js` (server preview→confirm→commit UI/state), `js/core/api-client.js` staff preview/commit methods, plus EN/SR/DE i18n keys in `translations.js` (translations overrun). Server modules do not affect this Vite staff budget.

**Not done (by instruction):** no dead-code cut, no lazy-load split, no budget bump.

Logs: `reports/phase-2-logs/bundle-budgets.txt`, `bundle-budgets-assert.txt`, `build.txt`.

## What changed (source)

### Server
- `server/plan-import-preview.js` — duty catalog + bus validation; `previous` snapshots; `driverName`
- `server/staff-monthly-plan-import.js` — prepare job, commit chunks, **compensate** on failure
- `server/group-monthly-plan-import.js` — `buildShiftDocument` applies `row.bus`
- `server/driver-routes.js` — preview loads duties/buses, `prepareStaffMonthlyImport`; **`PUT /api/staff/monthly-plans/import/commit`** + audit

### Client
- `js/dispatcher/plan-import.js` — no `saveMonthlyPlan` / N× assignment before success; preview → confirm → commit → reload; local mode refuses fake success
- `js/core/api-client.js` — `previewStaffMonthlyPlanImport` / `commitStaffMonthlyPlanImport`
- `translations.js` — preview/commit/validation strings (en/sr/de)

### Tests / visual
- `tests/unit/plan-import-preview.test.js` — duty/bus/previous + route wiring
- `tests/unit/staff-monthly-plan-import.test.js` — prepare/commit/compensate/idempotent
- `tests/e2e/dispo-monthly-import-server.spec.js` — local refuse + preview/commit/reject (API mocked)
- `scripts/phase2-visual-trail.mjs` → `reports/phase-2-visual/` (screens 1–10)

### Not in this phase
- D18.1 not implemented
- No schema / new collections (reuse `monthly_plan_imports` / locks)
- No commit / push / deploy

## Flow (required)

`upload → parse → server preview (job+fingerprint) → confirm → server commit → audit → reload`

On commit failure: compensate rows tagged with `importId` (restore `previous` or delete). No success toast without commit success.

## Atomika

Chunked writes + compensation (not single Firestore transaction). Documented in change ledger. Max preview rows schema: 1000.

## Gates

| Gate | Result |
| ---- | ------ |
| secrets | PASS |
| lint | PASS |
| unit | PASS **642** |
| phase2 import unit | PASS 14 |
| E2E import server | PASS 2 |
| E2E monthly CTA | PASS 1 |
| visual trail | PASS (`reports/phase-2-visual/`) |
| firebase isolation | PASS (during build) |
| **bundle budgets** | **FAIL** (see above) |
| **full `npm run build`** | **FAIL** (budget) |
| rules | not re-run (no Rules change this phase) |

## Security / D21

- Preview/commit: dispatcher only + assigned `groupId`
- Name→`driverId` on client; no EID in Dispo UI
- Duty from active CA catalog (`requireDutyCatalog: true`)
- Bus existence / inactive / unavailable / group
- Expected revision re-checked on commit
- Fingerprint + importId idempotency
- CA monthly assignment routes remain `MONTHLY_ASSIGNMENTS_DISPATCHER_ONLY`

## Artifacts

- Report: `reports/phase-2-report-2026-08-09.md`
- Ledger: `reports/phase-2-change-ledger.md`
- Logs: `reports/phase-2-logs/`
- Visual: `reports/phase-2-visual/` + `TRAIL.json`
- ZIP: `reports/phase-2-deliverable-2026-08-09.zip`

## Owner decision needed

1. Allow a **targeted** staff/translations budget bump for Phase 2 strings+import UI, **or**
2. Authorize a **separate** bundle-cut task (lazy-load plan-import / trim) before Phase 2 closeout is green.

Until then: **STOP. Do not start Phase 3.**

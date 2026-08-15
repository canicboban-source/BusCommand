# FAZA 2R-A — Change Ledger (Reliability correction)

| | |
| -- | -- |
| **Base SHA** | `a6fbcb508c67287c33479f38c3678cd44684ee60` |
| **Phase** | 2R-A (not Phase 3; not bundle work) |
| **Bundle** | Remains red (known D17); no bump / no KB optimization |
| **Status** | Closed for reliability proof; STOP before 2R-B |

## Pre-flight

| | |
| -- | -- |
| **FOUND** | Staff import used `group-monthly-plan-import` builders (not `shift-assignment`); clear via `batch.delete`; compensation merge + swallowed `.catch`; multi-month client loop; pending selects by name; no commit-time revalidation; no rate/size bounds on prepare. |
| **CHANGING** | Canonical shift/clear/schedule builders; revisioned clear; full restore compensation + truthful recovery; job SM; single-month client; driverId pending; commit revalidation; rate+byte bounds; tests/visual/report. |
| **NOT CHANGING** | Rules; D18.1; Phase 3; budgets; schema/collections; deps; commit/push/deploy. |
| **RISKS** | Compensation must overwrite fully; lock retained on compensation_failed; large jobs 413 before write; D17 red until 2R-B. |
| **PROOF** | Fail-first unit + HTTP + E2E + visual trail; gates logged; build fails only on D17. |

## Diff vs prior Phase 2 narrative

| Claimed earlier | Actual code (pre-2R-A) |
| --------------- | ---------------------- |
| Clear preserves revision/undo | `batch.delete` removed doc |
| Compensation always truthful | `.catch(() => {})` on finalize; merge restore |
| Multi-month safe | Client loop commits month-by-month |

## Work items

| ID | Area | Status |
| -- | ---- | ------ |
| R2A-A | Canonical shift contract + bus rules | DONE |
| R2A-B | Clear tombstone + compensation | DONE |
| R2A-C | Job state machine | DONE |
| R2A-D | Single-month fail-closed client | DONE |
| R2A-E | driverId pending/select | DONE |
| R2A-F | Commit-time revalidation | DONE |
| R2A-G | Rate limit + byte/schedule bounds | DONE |
| R2A-H/I | Tests + visual | DONE |
| R2A-J/K | Gates + artifacts + STOP | DONE |

## Per-file notes

| File | Change | Why | Brings | Risk | Proof |
| ---- | ------ | --- | ------ | ---- | ----- |
| `server/staff-monthly-plan-import.js` | Rewrite around shift-assignment + compensate + bounds | Truth / undo | Canonical import | Comp race | unit |
| `server/driver-routes.js` | rateLimit; recovery message | HTTP truth | Authz surface | i18n | HTTP |
| `server/plan-import-preview.js` | Richer `previous` | Undo data | Snapshots | size | unit |
| `js/dispatcher/plan-import.js` | Multi-month block; driverId; recovery UI | Client truth | Safe UX | toast | E2E |
| `js/core/api-client.js` | Preview/commit helpers | API | Wiring | — | E2E |
| `translations.js` | EN/SR/DE keys | i18n | Clarity | D17 +bytes | visual |
| `tests/unit/staff-monthly-plan-import.test.js` | Fail-first suite | Proof | Coverage | — | 10 PASS |
| `tests/unit/phase2r-a-monthly-import-http.test.js` | Executable HTTP | Authz | Coverage | — | 8 PASS |
| `tests/e2e/dispo-monthly-import-server.spec.js` | Multi-month + dup name | Proof | Coverage | — | 4 PASS |
| `tests/e2e/line-310.spec.js` | Assign dispo to 310 | Phase-1 scope | Green E2E | — | 3 PASS |
| `scripts/phase2r-a-visual-trail.mjs` | 8 screens | Owner path | Trail | #08 simulated | visual PASS |

## Gate summary

- secrets/lint/unit(655)/HTTP/E2E(84)/rules(102)/firebase/audit: **PASS**
- build: **FAIL only D17** (staff 586981 / translations 380442)
- STOP — no 2R-B / Phase 3 / commit / push / deploy

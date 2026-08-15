# FAZA 2R-A.1 — Reliability Closeout Correction

| | |
| -- | -- |
| **Date** | 2026-08-09 |
| **Base SHA** | `a6fbcb508c67287c33479f38c3678cd44684ee60` |
| **Node** | 22.14.0 |
| **Phase** | 2R-A.1 (not 2R-B / Phase 3 / bundle work) |
| **Verdict** | **PASS with known D17 red only** |

## Pre-flight

### FOUND
- `actorGroups` optional → revalidation skippable (`null` bypass)
- Revalidation ran **before** lock; effective inherited bus not revalidated
- Expired lock TTL auto-deleted even for `compensation_failed` / `committing`
- Compensation recovery status write swallowed with `.catch(() => {})`
- Schedule mirror merge left failed `importId`/`updatedBy`; no canonical `driverName`
- No real resume test (completed retry mislabeled as crash/retry)
- Preview transport exception could leave busy UI; commit transport claimed hard failure
- `apiFetch` dropped `recoveryRequired`
- HTTP suite lacked unauthenticated 401; visual 08 simulated; visual 05 did not assert `committing`

### CHANGING
A–E server/client reliability closeout + fail-first tests + real visual trail + gates/report/review ZIP.

### NOT CHANGING
Rules, D18.1, Phase 3, D17 budgets, KB optimization, collections/deps, commit/push/deploy.

### RISKS
D17 remains red until 2R-B. Revalidation-after-lock releases lock on failure (no mutations yet).

### PROOF
Executable unit/HTTP/E2E + visual trail (UI only). Logs in `reports/phase-2r-a1-logs/`.

## Corrected prior overclaims
- Visual 08 was simulated → replaced by `05-recovery-required-api.png` (API intercept)
- Visual 05 did not prove commit pending → `02-commit-pending.png` asserts `data-plan-import-phase=committing` + “Committing…”
- Old “crash/retry” was completed idempotent only → new **D real resume** test
- HTTP now includes explicit **unauthenticated → 401**

## Per-change ledger

| File | Changed | Why | Brings | Risk | Proof |
| ---- | ------- | --- | ------ | ---- | ----- |
| `server/staff-monthly-plan-import.js` | Mandatory `actorGroups`; lock→revalidate→mutate; effective bus; afterLock hook; schedule delete fields + driverName; truthful recovery persist | Close authz/bus/order/mirror gaps | Fail-closed commit | Lock release on reval fail | unit A1–A5,C,D |
| `server/group-monthly-plan-import.js` | Durable recovery on expired lock via job status | TTL must not unlock recovery | `MONTHLY_IMPORT_RECOVERY_REQUIRED` | Stale jobs | unit B |
| `js/dispatcher/plan-import.js` | Preview transport catch; `commit_unknown`; showCommitAction while committing; recovery UI | Client truth | Retry-safe UX | Toast volume | E2E + visual |
| `js/core/api-client.js` | Pass `recoveryRequired` | Surface recovery | UI can show recovery | — | HTTP source + E2E |
| `translations.js` | EN/SR/DE for new states only | i18n | Clear copy | +D17 bytes | visual |
| `tests/unit/phase2r-a1-reliability-closeout.test.js` | Fail-first A–D | Adversarial gaps | Proof | — | 9 PASS |
| `tests/unit/phase2r-a1-http.test.js` | Unauth 401 + recoveryRequired wiring | Auth proof | — | — | 2 PASS |
| `tests/e2e/dispo-monthly-import-server.spec.js` | Transport / unknown / recovery | Client proof | — | — | 7 PASS |
| `scripts/phase2r-a1-visual-trail.mjs` | Real UI trail | Owner path | — | UI only | visual PASS |

## Gates (Node 22.14.0)

| Gate | Exit | Log |
| ---- | ---- | --- |
| secrets | **0** | `reports/phase-2r-a1-logs/secrets.txt` |
| lint | **0** (warning cleared) | `.../lint.txt` |
| targeted unit | **0** (29) | `.../unit-targeted.txt` |
| full unit | **0** (666) | `.../unit-full.txt` |
| HTTP | **0** | `.../unit-targeted.txt` + phase2r-a HTTP |
| E2E monthly import | **0** (7) | `.../e2e-monthly-import.txt` |
| full E2E | **0** (87) | `.../e2e-full.txt` |
| rules | **0** (102) | `.../rules.txt` |
| firebase isolation | **0** | `.../firebase-isolation.txt` |
| audit `--omit=dev` | **0** | `.../audit.txt` |
| visual | **0** | `.../visual.txt` |
| build / D17 | **1 — only D17** | `.../build.txt` |

### D17 arithmetic (no bump)

| Metric | Actual | Max | Over |
| ------ | ------ | --- | --- |
| staff JS excl. translations | **589132** | 581632 | **589132 − 581632 = 7500 B** |
| translations chunk | **381581** | 377856 | **381581 − 377856 = 3725 B** |

Prior 2R-A staff was 586981 (586981 − 581632 = **5349 B**). 2R-A.1 added client truth strings/UI → staff over is now **7500 B**. Limits unchanged.

## Visual (`reports/phase-2r-a1-visual/`)

| File | Assertion |
| ---- | --------- |
| `01-preview-network-failure.png` | retry enabled |
| `02-commit-pending.png` | phase=`committing`, text Committing… |
| `03-commit-unknown.png` | same importId + retry |
| `04-idempotent-retry-success.png` | reload success |
| `05-recovery-required-api.png` | real API intercept (not DOM inject) |

Visual ≠ rollback/lock/auth proof.

## Artifacts

- `reports/phase-2r-a1-report-2026-08-09.md` (this file)
- `reports/phase-2r-a1-change-ledger.md`
- `reports/phase-2r-a1-logs/`
- `reports/phase-2r-a1-visual/`
- `reports/phase-2r-a1-review-source-2026-08-09.zip` — **review-only** (not full-repo deliverable)
- `reports/phase-2r-a1-source-manifest.txt` (base SHA + SHA-256, `/` paths)

## STOP

Do **not** start 2R-B, Phase 3, commit, push, or deploy.

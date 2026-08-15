# FAZA 2R-A.3 — Change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Date: 2026-08-09  
STOP: no 2R-B / Phase 3 / budget bump / commit / push / deploy  
Schema diff: **NONE** (lease fields removed; no replacement fields)

| File | What changed | Why | Brings | Risk | Executable proof |
| ---- | ------------ | --- | ------ | ---- | ---------------- |
| `server/staff-monthly-plan-import.js` | Removed lease schema (`attemptId`/`leaseExpiresAt`/`activeAttemptId`/`wasCommitting`/`ATTEMPT_LEASE_MS`); `claimStaffMonthlyImportCommit` is a live Firestore txn reading `importRef`+`lockRef` before writes; matrix prepared→claim, committing+alive→IN_PROGRESS, committing+bad lock→RECOVERY (no takeover), completed→idempotent; completion/compensation delete lock only if `lock.importId` matches | A/B/C no-schema single-flight | One transactional claimer; second HTTP never resumes committing | Crash-resume intentionally absent | unit A.3 + rules concurrency #93 |
| `server/group-monthly-plan-import.js` | Lease takeover removed from `assertNoActiveGroupMonthlyImport`; allowlist fail-closed retained | C lock safety | Expired/partial cannot free group | Manual recovery only | unit allowlist + recovery cases |
| `server/driver-routes.js` | Truthful HTTP: IN_PROGRESS processing-only; generic recovery “Stanje zahteva proveru…”; “Automatski povrat nije uspeo” only for `MONTHLY_IMPORT_COMPENSATION_FAILED`; audit `compensation_failed` only for real compensation failure else `monthly_plan_import_failed` + `recoveryRequired` | D truthful outcomes | No false rollback / false compensation audit | SR wire messages | `phase2r-a2-http-outcomes` + staff-auth |
| `js/dispatcher/plan-import.js` | Hide validation panel for in-progress/unknown/recovery; recovery disables Confirm/Retry; Clear allowed; retained importId; XSS escape kept | D UI truth | No “nothing was saved” contradiction | Operator must not confuse Clear with unlock | E2E + visual |
| `translations.js` | EN/SR/DE recovery copy clarifies Clear does not clear server lock/data (existing key) | D / D17 | Honest recovery panel | +162 B translations vs A.2 | visual / i18n |
| `tests/unit/phase2r-a3-no-schema-single-flight.test.js` | Fail-first schema guard + parallel claim + lock matrix + idempotent | E | Gate before/after prod change | In-memory not sole proof | 7 PASS |
| `tests/rules/phase2r-a3-commit-concurrency.test.js` | Real Admin SDK + Firestore emulator parallel claim | E | Sole concurrency proof | Needs emulator | ok 93 in rules 103 |
| `tests/unit/phase2r-a2-http-outcomes.test.js` | Slimmed to no-lease IN_PROGRESS / recovery messaging | D/E | Align with A.3 | — | HTTP gate PASS |
| `tests/unit/phase2r-a2-reliability-guard.test.js` | No-lease reliability expectations | F regression | Align | — | in full unit |
| `tests/unit/phase2r-a1-*.test.js` / resume paths | Crash-resume → IN_PROGRESS (no takeover) | B intentional | Honest non-resume | — | full unit |
| `tests/e2e/dispo-monthly-import-server.spec.js` | Recovery mock uses truthful message; asserts no validation/rollback/compensation-failure text; no Confirm/Retry | E/F UI | 9 import E2E in full 89 | Needs dist + browsers | e2e-full EXIT=0 |
| `scripts/phase2r-a3-visual-trail.mjs` | Fresh 5-shot UI trail | G | Owner path | Not server proof | visual EXIT=0 |
| `scripts/phase2r-a3-d17-measure.mjs` / `phase2r-a3-pack-artifacts.mjs` | Measure + accurate body-hash manifest pack | I | Verifier exit 0 | — | pack logs |

## Intentionally not done

- Crash-resume / automatic takeover of `committing`
- New schema fields, collections, indexes, dependencies, API contract
- 2R-B, Phase 3, bundle optimization, language purge, budget bump
- Commit / push / deploy

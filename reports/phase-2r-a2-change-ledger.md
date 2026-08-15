# FAZA 2R-A.2 — Change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Date: 2026-08-09  
STOP: no 2R-B / Phase 3 / budget bump / commit / push / deploy

| File | What changed | Why | Brings | Risk | Executable proof |
| ---- | ------------ | --- | ------ | ---- | ---------------- |
| `server/staff-monthly-plan-import.js` | Attempt lease (`attemptId`/`leaseExpiresAt`/`activeAttemptId`); single-flight same importId; ownership checks before mutate/schedule/complete/compensate; resume revalidation fail-closed; expired committing → recovery; schedule `driverName` from drivers doc | A/B/E reliability holes | One active commit; no false prepared unlock; mirror name after clear | Lease TTL 2m; lost attempt leaves partial until rightful owner | `phase2r-a2-reliability-guard.test.js` A/B/E |
| `server/group-monthly-plan-import.js` | `GroupMonthlyImportError` meta; `isSafeToAutoClearImportLock` allowlist; expired unsafe lock → `MONTHLY_IMPORT_RECOVERY_REQUIRED` | C fail-closed lock TTL | Partial jobs cannot free the group | Allowlist must stay explicit | unit C + allowlist table |
| `server/driver-routes.js` | Commit HTTP maps `retryable` / `recoveryRequired` / `compensated`; truthful messages (IN_PROGRESS / recovery / compensated-only rollback) | D client-truth | No false rollback text | Message localization SR only on wire | `phase2r-a2-http-outcomes.test.js` |
| `js/core/api-client.js` | Pass `retryable` + `compensated` on non-OK | D | Client can branch outcomes | — | HTTP + E2E |
| `js/dispatcher/plan-import.js` | `commit_in_progress` / `recovery_required` phases; keep importId; rollback toast only if `compensated=true`; `escapeHtml` on dynamic preview fields | D/F | Truthful UI + XSS-as-text | Extra toast keys → D17 | E2E 9 PASS + visual |
| `translations.js` | EN/SR/DE: `plan_import_commit_in_progress`, `plan_import_commit_failed_no_rollback`; recovery copy tightened | H (no language purge) | Clear operator copy | +337 B translations vs A.1 | visual / i18n keys |
| `tests/unit/phase2r-a2-reliability-guard.test.js` | Fail-first A/B/C/E (+ lost ownership post-write) | Adversarial proof | Gate | — | 6 PASS |
| `tests/unit/phase2r-a2-http-outcomes.test.js` | HTTP IN_PROGRESS / RECOVERY / compensated contract | D | Gate | — | PASS |
| `tests/unit/phase2r-a2-html-escape.test.js` | Escape helper + plan-import wiring | F | Gate | — | PASS |
| `tests/unit/phase2r-a1-http.test.js` | Renamed to auth-middleware-wiring; no overclaim vs real verifier | G | Honest auth proof | — | PASS + `staff-auth-http` |
| `tests/unit/phase2r-a-monthly-import-http.test.js` | Terminal failed → `MONTHLY_IMPORT_RECOVERY_REQUIRED` | Align with D | Consistent codes | — | PASS |
| `tests/unit/staff-monthly-plan-import.test.js` | Same terminal code expectation | Align | — | — | PASS |
| `tests/e2e/dispo-monthly-import-server.spec.js` | IN_PROGRESS, recovery no false rollback, XSS-as-text | D/F E2E | 9 PASS | Needs rebuilt `dist/` | e2e-monthly-import |
| `scripts/phase2r-a2-visual-trail.mjs` | UI trail 01–04 | Owner path | Visual only | Not server proof | visual.txt PASS |

## Attempt lease lifecycle (compat)

- Existing lock/job docs gain optional fields: `attemptId`, `leaseExpiresAt`, `activeAttemptId`, `wasCommitting`.
- No new collection / dependency.
- Active lease + same import+actor → `MONTHLY_IMPORT_IN_PROGRESS` (`retryable=true`), no writes.
- Expired/missing lease → new attempt may take ownership; previous attempt must fail on `assertAttemptOwnership` and must not compensate/complete.

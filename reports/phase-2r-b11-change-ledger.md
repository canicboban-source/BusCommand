# FAZA 2R-B.1.1 — change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Schema/API/server business logic: **NONE** · No budget bump · No dependency change

| File | What | Why | Brings | Proof |
| ---- | ---- | --- | ------ | ----- |
| `js/dispatcher/plan-import-loader.js` | Same-origin recovery URL validator + trusted pathname allowlist | Audit: untrusted Performance/Error URLs must not reach `@vite-ignore` import | Foreign-origin → null; recoveryImport not called | unit A |
| `js/register-onclick-staff.js` | Sync `File[]` snapshot for input/drop; clear input; toast via `t()` only | Audit: stale DOM/DataTransfer across await; false “files stay” claim | Same file re-selectable; truthful next step | unit B/C + E2E |
| `js/dispatcher/plan-import.js` | Export `handleBulkPlanFiles`; sync snapshot in direct handlers | Stable API for wrappers | Cold drop parses after delayed chunk | E2E cold drop |
| `translations.js` | Update `plan_import_chunk_load_failed` en/de/sr | Tell user to re-choose file | No “files stay” wording | i18n unit + visual |
| `tests/unit/phase2r-b11-file-recovery.test.mjs` | Fail-first trust + snapshot proofs | Gate 2R-B.1.1 | 10 pass | unit |
| `tests/e2e/phase2r-b11-file-recovery.spec.js` | Real fixture retry + cold drop | No success test-hook | input cleared; month/days/driver | E2E |
| `tests/fixtures/qa-monthly-plan-import-loose.txt` | Known valid loose plan text | Deterministic parse proof | 2026-08 / 1 day / driver match | unit+E2E+visual |
| `scripts/phase2r-b11-visual-trail.mjs` | Real UI trail | Owner visual mandate | 2 shots + TRAIL honesty | visual EXIT=0 |
| `scripts/phase2r-b11-pack-artifacts.mjs` | Manifest + ZIPs | Closeout pack | verifier EXIT=0 | pack |

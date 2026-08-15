# FAZA 2R-B.1 — change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Schema diff: **NONE** · No budget bump · No dependency change · No import business-logic change

| File | What | Why | Brings | Proof |
| ---- | ---- | --- | ------ | ----- |
| `js/dispatcher/plan-import-loader.js` | Race-safe lazy loader + `bc_recovery` URL retry | Rejected Promise / sticky module map blocked import until reload | Prefetch fail clears cache; next action retries | unit A/B/C + E2E |
| `js/register-onclick-staff.js` | `withPlanImportModule` + toast on load fail only | Explicit user action must not unhandled-reject; preserve UI | Localized next-step message; module errors still propagate | unit C/C2 + E2E toast |
| `translations.js` | `plan_import_chunk_load_failed` en/de/sr | User-visible recovery copy | No server/commit/rollback claims | i18n unit + visual |
| `tests/unit/phase2r-b1-lazy-chunk-recovery.test.mjs` | Fail-first executable proofs | Gate recovery contract | attempts=2, shared promise, no sticky reject | unit EXIT=0 |
| `tests/unit/phase2r-b-lazy-plan-import.test.js` | Align source asserts with loader module | Keep 2R-B lazy contract | Still no static plan-import import | unit |
| `tests/e2e/phase2r-b1-lazy-chunk-recovery.spec.js` | Controlled chunk abort + retry | Prove real browser recovery | chunk requests increase; toast; preview | E2E 2 pass |
| `scripts/phase2r-b1-visual-trail.mjs` | Real UI trail | Owner visual mandate | 2 shots + TRAIL | visual EXIT=0 |
| `scripts/phase2r-b1-pack-artifacts.mjs` | Manifest + ZIPs | Closeout pack | verifier EXIT=0 | pack |

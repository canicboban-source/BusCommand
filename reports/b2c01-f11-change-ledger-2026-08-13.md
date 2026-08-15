# B2C-01-F1.1 change ledger — 2026-08-13

Baseline HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`  
Branch: `staging/phase-3-isolation`  
Staged throughout: **0** · No commit/push/PR/deploy · Dirty F1 tree preserved

## Production

| File | ŠTA | ZAŠTO | DONOSI |
|------|-----|-------|--------|
| `js/admin/sa-create-company-flow-loader.js` | **ADD** — `createLazyModuleLoader` wrapper, trusted recovery allowlist, shared Promise, clear on reject | Sticky rejected import + unhandled rejection | Retry without reload; same-origin recovery only |
| `js/admin/sa-create-company-flow.js` | UPDATE — remove `__saCreateFlowTestApi`; unknown/partial leave keys; `mapSaCreateApiError`; toast clearing; `deferRefresh` / single terminal refresh; optional `__b2c01f1.refreshWraps` mirror | Truthful UI + refresh contract + no test bypass | Honest unknown; one partial toast; proven refresh counts |
| `js/admin/superadmin.js` | UPDATE — static import loader; `withSaCreateFlowModule` load vs execution catch; Close via `getSaCreateFlowIfLoaded` or shell dismiss | Load failure must not brick Close or look like execution error | Localized chunk toast; Close after failed load |
| `translations.js` | ADD/UPDATE F1.1 keys en/de/sr (unknown close/abandoned, chunk load, company exists); fix abandoned hint (no R1 false claim) | UTF-8 + truthful copy | No mojibake; language-stable outcomes |
| `index.legacy-monolith.html` | Banner + leave-confirm markup (retained/aligned) | Both surfaces must carry mounts | Legacy source of truth |
| `staff.html` | Regenerated with same markup | Avoid legacy-only test masking | Staff surface parity |
| `css/staff-desktop.css` | Partial/leave styles (retained) | Readable partial UX | Consistent SA modal chrome |

## Tests

| File | ŠTA | ZAŠTO | DONOSI |
|------|-----|-------|--------|
| `tests/unit/b2c01-f11-create-company-ca.test.mjs` | **ADD** — UTF-8, loader race, allowlist, no test-hook, unknown keys, refresh helpers, dual markup | Fail-first contracts for F1.1 | Unit gate green |
| `tests/unit/b2c01-f1-create-company-ca.test.mjs` | Retained/aligned F1 contracts | Regression | F1 still proven |
| `tests/e2e/b2c01-f1-create-company-ca.spec.js` | Real UI only; block native+recovery for lazy; focus settle; refresh asserts A/A2/B | Remove hook bypass; prove H1-A.1 + refresh | 14-test suite green with B12 |
| `tests/e2e/b2c01-f1-visual-trail.spec.js` | Screenshots → `reports/b2c01-f11-visual/` | Owner visual path proof | 01–06 + TRAIL.json |

## Explicitly unchanged

- `api-server.js`, `server/**`, `firestore.rules`, schema, dependencies
- B2C-01-R1 product work
- B2C-03, H1-B, H1-C, Phase 4
- BLAGUSS / staging QA tenant data
- Bundle budget ceilings (no bump)

## Review patch

`reports/b2c01-f11-review.patch` — Node Buffer write; mojibake scan **clean** (94509 bytes at regen).

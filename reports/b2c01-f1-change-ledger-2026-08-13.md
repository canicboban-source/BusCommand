# B2C-01-F1 change ledger — 2026-08-13

Baseline HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`  
Branch: `staging/phase-3-isolation`  
Staged throughout: **0** · No commit/push/PR/deploy

## Production

| File | Change |
|------|--------|
| `js/admin/sa-create-company-flow.js` | **ADD** — lazy SA create-company + CA orchestration; states IDLE / CREATING_COMPANY / CREATING_CA / COMPANY_CREATED_CA_PENDING / COMPLETED / UNKNOWN_REQUIRES_CHECK; whole-flow boolean single-flight; server `companyId` for CA; partial UI; leave confirm; CA-only retry; no password in module memory |
| `js/admin/superadmin.js` | REPLACE inline create/CA submit with dynamic `import("./sa-create-company-flow.js")` loaders; remove unused `runSingleSubmission` import; remove phantom `#sa-create-admin-btn` dependency from production path |
| `index.legacy-monolith.html` | ADD `#sa-create-partial-banner` + `#sa-create-leave-confirm` markup inside create-company modal |
| `staff.html` | Regenerated from monolith (same banner/leave markup) |
| `translations.js` | ADD sr/en/de: `sa_create_retry_ca`, `sa_create_partial_company_ok_ca_fail`, `sa_create_close_partial_confirm`, `sa_create_leave_partial`, `sa_create_partial_abandoned_hint`, `sa_create_unknown_check_company`, `sa_create_busy_wait`, `sa_create_ca_requires_pending` |
| `css/staff-desktop.css` | ADD partial banner / leave confirm / disabled field styles |

## Tests

| File | Change |
|------|--------|
| `tests/unit/b2c01-f1-create-company-ca.test.mjs` | **ADD** — fail-first then green orchestration contracts + R1 honesty |
| `tests/e2e/b2c01-f1-create-company-ca.spec.js` | **ADD** — production-mode intercept E2E (full/partial/409/unknown/double-click/close/leak) |
| `tests/e2e/b2c01-f1-visual-trail.spec.js` | **ADD** — screenshots → `reports/b2c01-f1-visual/` |

## Explicitly unchanged

- `api-server.js`, `server/**`, `firestore.rules`
- Firebase / Auth configuration
- API client contracts (consumed as-is)
- Dependencies / bundle budget ceilings
- B2C-03, H1-B, H1-C, Phase 4
- BLAGUSS / QA tenant data

## Review patch

`reports/b2c01-f1-review.patch` — F1 production + test files only (includes full content of new files).

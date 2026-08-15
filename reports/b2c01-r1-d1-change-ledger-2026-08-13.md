# B2C-01-R1-D1 change ledger — 2026-08-13

Baseline HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`  
Branch: `staging/phase-3-isolation`  
Staged: **0** · Read-only diagnostic · **No production/test/config code changes**

## This task

| Path | Action |
|------|--------|
| `reports/b2c01-r1-d1-report-2026-08-13.md` | ADD diagnostic report |
| `reports/b2c01-r1-d1-call-flow.md` | ADD call flow |
| `reports/b2c01-r1-d1-failure-matrix.md` | ADD failure matrix |
| `reports/b2c01-r1-d1-change-ledger-2026-08-13.md` | ADD this ledger |
| `reports/b2c01-r1-d1-logs/` | ADD preconditions log |
| `reports/b2c01-r1-d1-visual/TRAIL.json` | ADD read-only trail marker |

## Explicitly not changed

- `js/admin/superadmin.js`, `sa-create-company-flow.js`, `api-server.js`, `server/provisioning.js`, `server/superadmin-company.js`
- tests, translations, Rules, schema, dependencies
- Git stage/commit/push/PR/deploy

## Future R1 (not in this task) — recommended touch list if Option B approved

| Area | Likely files | Notes |
|------|--------------|-------|
| API | `api-server.js`, new narrow handler module | `POST .../create-missing-admin` |
| Provision | `server/provisioning.js` or dedicated helper | transactional zero-CA check |
| Detail truth | `server/superadmin-company.js` | optional `caProvisionState` |
| UI | `js/admin/superadmin.js` (+ maybe tiny lazy chunk) | Create form only when `missing` |
| i18n | `translations.js` | sr/en/de only |
| Tests | unit + E2E fail-first then green | see report §8 |

# Integration 3D.4 — B2C-CLEAN1-B-BR4-D1 Change Ledger

**Datum:** 2026-08-11  
**Mode:** READ-ONLY Cloud Shell dry-run  
**`--execute`:** not run

---

## Cloud Shell / temp only

| Item | Change |
|------|--------|
| `$HOME/clean1b/input/purge-rest.mjs` | replaced with BR4 executor SHA `8a90f6b17370589bbe3a6c8c10279920ea1a36cb32acfa1b4d96ecc569e3a5ba` |
| `$HOME/clean1b/evidence/br4d1/` | created (fresh D1 evidence folder) |
| `$HOME/clean1b/evidence/br4d1/execution-state.json` | written by dry-run → `phase=BLOCKED` |
| `$HOME/clean1b/evidence/br4d1/dry-run.log` | created |
| `$HOME/clean1b/evidence/br4d1/perm-result.txt` | created |
| Prior `$HOME/clean1b/evidence/execution-state.json` | **not** overwritten |

## Repo reports (local)

| Path | Action |
|------|--------|
| `reports/integration-3d4-b2c-clean1b-br4d1-report-2026-08-11.md` | created |
| `reports/integration-3d4-b2c-clean1b-br4d1-change-ledger.md` | created |
| `reports/integration-3d4-b2c-clean1b-br4d1-logs/*` | created |
| `reports/integration-3d4-b2c-clean1b-br4d1-visual/*` | created |

## Explicitly unchanged

| Item | Status |
|------|--------|
| Product source | 0 |
| Commit / push / PR / deploy | 0 |
| IAM grant/revoke | 0 |
| Firestore write/delete/commit/beginTransaction | 0 |
| Auth write/delete | 0 |
| BLAGUSS | untouched |
| B2C-02 | untouched |
| Frozen manifest | unchanged SHA `d95dc839…` |

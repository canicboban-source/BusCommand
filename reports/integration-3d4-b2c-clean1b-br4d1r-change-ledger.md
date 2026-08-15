# Integration 3D.4 — B2C-CLEAN1-B-BR4-D1R Change Ledger

**Datum:** 2026-08-11  
**Mode:** READ-ONLY full manifest/live reconciliation  
**Manifest modified:** **no**  
**Dry-run / execute:** **not run**

---

## Cloud Shell evidence (new)

| Path | Action |
|------|--------|
| `$HOME/clean1b/evidence/br4d1r/` | created (separate from D1) |
| `$HOME/clean1b/evidence/br4d1r/d1r-reconcile.mjs` | uploaded temporary read-only reconciler |
| `$HOME/clean1b/evidence/br4d1r/reconcile.json` | live compare output |
| `$HOME/clean1b/evidence/br4d1r/reconcile-redacted.json` | redacted copy |
| `$HOME/clean1b/evidence/br4d1r/reconcile-run.log` | run log |

## D1 evidence (preserved)

| Path | Status |
|------|--------|
| `$HOME/clean1b/evidence/br4d1/execution-state.json` | unchanged `phase=BLOCKED` |
| `.ARMED` / `.MUTATED` | still absent |
| D1 mutations | still 0 |

## Local reports

| Path | Action |
|------|--------|
| `reports/integration-3d4-b2c-clean1b-br4d1r-report-2026-08-11.md` | created |
| `reports/integration-3d4-b2c-clean1b-br4d1r-diff.md` | created |
| `reports/integration-3d4-b2c-clean1b-br4d1r-change-ledger.md` | created |
| `reports/integration-3d4-b2c-clean1b-br4d1r-logs/*` | created |

## Explicitly unchanged

| Item | Status |
|------|--------|
| Frozen manifest | unchanged (SHA `d95dc839…`) |
| Product source | 0 |
| IAM | 0 |
| Firestore / Auth mutations | 0 |
| Permission gate re-run | not repeated |
| Commit / push / deploy | 0 |
| BLAGUSS | untouched |
| B2C-02 | untouched |

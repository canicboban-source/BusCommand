# B2C-01-R1-D1.1 change ledger — 2026-08-13

Baseline HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`  
Branch: `staging/phase-3-isolation`  
Staged: **0** · Read-only · **No source/test/config/schema/API implementation**

## Added (reports only)

| Path | Action |
|------|--------|
| `reports/b2c01-r1-d11-report-2026-08-13.md` | ADD |
| `reports/b2c01-r1-d11-concurrency-contract.md` | ADD |
| `reports/b2c01-r1-d11-server-truth-matrix.md` | ADD |
| `reports/b2c01-r1-d11-change-ledger-2026-08-13.md` | ADD |
| `reports/b2c01-r1-d11-logs/00-preconditions.txt` | ADD |

## Correction vs D1

D1 Option B “no new schema” is **insufficient** for parallel create fail-closed: empty CA query is not a lock; company root has no legitimate concurrency field today.

## Explicitly unchanged

Production JS/API/Rules/schema, tests, Git, deploy.

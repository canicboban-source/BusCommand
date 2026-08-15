# Change ledger — Integration 3D.4-B2C-0

**Date:** 2026-08-11  
**Verdict:** PASS — PERSISTENT QA BASELINE CREATED

| Resource | Action | Notes |
|----------|--------|-------|
| Render / Blueprint / env / Auto Deploy | **unchanged** | commit `80bd34b`, deploy count 2 |
| Firebase Rules / Auth domains / indexes | **unchanged** | |
| Git / deploy / commit / push / PR / workflow | **unchanged** | |
| Firestore `companies/buscommand-staging-qa-no-real-data` | **CREATED** | STARTER trial; synthetic |
| Auth user `bc-staging-qa-ca@example.invalid` | **CREATED** | company_admin for QA tenant |
| `companies/.../users/{uid}` for QA CA | **CREATED** | |
| BLAGUSS / `blaguss` | **read-only** | pre/post identical counts |
| Production | **untouched** | |
| QA harness | **absent** | |
| Rollback | **not used** | |

### Write sequence

1. SA UI Register Company once (company + contact email).  
2. Product `ApiClient.createUser` once to complete baseline CA after modal CA step dropped fields post-re-render.

# Change ledger — Integration 3D.4-B2C

**Date:** 2026-08-11  
**Run ID:** `BC-STG-B2C-20260811-5432cb`  
**Verdict:** **PARTIAL — CLEANUP BLOCKED** (product hard-delete gap)  
**Tenant (only):** `buscommand-staging-qa-no-real-data`  
**Forbidden:** `blaguss` — **zero mutations**

| Resource | Action | Notes |
|----------|--------|-------|
| Health / Render / Firebase Rules | read-only | unchanged vs B2A / staging commit `80bd34b` |
| Data ledger + B2C-01 doc | written | `integration-3d4b2c-data-ledger.md`, logs/01 |
| SA Manage QA | opened Close/no Save | inventory pre 1/0/0/0 |
| Run CA Auth+user | **created** | `bc-stg-b2c-20260811-5432cb-ca@example.invalid` |
| Group `543201` | **created** | name `BC-STG-5432cb Line` |
| Run Dispo | **created then deleted** | deactivate→delete product path |
| Driver | **created; deactivated** | no product hard-delete |
| Service plan v1 | **published+activated** | duty `543201.S01` |
| Monthly import Aug 2026 | **preview+commit** | 2 days assigned; idempotent re-import kept 2 |
| BLAGUSS | untouched | freeze not re-opened for write |
| Source / Rules / env / deploy / commit / push | **none** | |
| Phase 4 / QA harness / Admin SDK | **none** | |

### Residual after partial cleanup (not baseline)

| Count | Value |
|-------|-------|
| Admins | **2** (persistent + run CA; disable-only, no hard-delete CA) |
| Dispo | **0** |
| Drivers | **1** inactive (still in `drivers` collection → SA count) |
| Groups | **1** (`543201` — delete blocked: in use) |
| Active plans (CA card) | **0** (UI) / service-plan history may still exist |

### Open live findings (no code fix)

- **B2C-01** — SA create-company modal drops CA fields (kept OPEN)
- **B2C-02** — Monthly import responsive UI (Driver name priority / Month width) — OPEN
- **B2C-03** — Product cannot restore baseline 1/0/0/0 after synthetic driver + run CA (no hard-delete driver/CA)
- Driver work-window — **PENDING COVERAGE** (not automatic product bug)

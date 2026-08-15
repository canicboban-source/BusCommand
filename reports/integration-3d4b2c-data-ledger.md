# Data ledger — Integration 3D.4-B2C

**Run ID:** `BC-STG-B2C-20260811-5432cb`  
**Rule:** NO KNOWN CLEANUP → NO WRITE  
**Tenant (ONLY allowed):** `buscommand-staging-qa-no-real-data`  
**Forbidden:** `blaguss` / BLAGUSS (zero mutations)  
**Baseline after cleanup:** Admins **1** · Dispo **0** · Drivers **0** · Groups **0** (persistent CA kept)

---

## Open live finding (no code fix this checkpoint)

### B2C-01 — SA create-company modal drops CA fields before CA provision

| Field | Value |
|-------|--------|
| Status | **OPEN LIVE FINDING** |
| Code fix this run | **forbidden** (§12 NO-FIX) |
| Observed | `superadminCreateCompany` calls `renderSuperAdminDashboard()` before `superadminSubmitCreateModal` reads CA fields → CA step skipped |
| Impact | Company can be created with Admins=0 until a separate `createUser` CA call |
| Workaround used in B2C-0 | Product `ApiClient.createUser` (SA session) for persistent CA |
| Evidence | B2C-0 report 2026-08-11 |

---

## Persistent baseline (must survive)

| Resource | ID / value | Cleanup |
|----------|------------|---------|
| Company | `buscommand-staging-qa-no-real-data` | **KEEP** |
| Display name | BUSCOMMAND STAGING QA — NO REAL DATA | KEEP |
| Persistent CA | `bc-staging-qa-ca@example.invalid` | **KEEP** |
| Plan | STARTER (15/2) | KEEP |

---

## Actual run-scoped resources (2026-08-11)

| Resource | ID / value | Status after partial cleanup |
|----------|------------|------------------------------|
| Run CA | `bc-stg-b2c-20260811-5432cb-ca@example.invalid` uid `xfoYMF95iUdBWUKQnMKyLlLMuMh1` | **RESIDUAL** (no product hard-delete) |
| Group | `543201` / `BC-STG-5432cb Line` | **RESIDUAL** (delete blocked: in use) |
| Dispatcher | `bc-stg-b2c-20260811-5432cb-dispo@example.invalid` uid `rbIR3IRkbne9s742q6ci5dI3hf12` | **DELETED** |
| Driver | `5b3d1050-a58b-4d05-9949-f90fbcb73593` · EID `BC-STG-5432cb-EID-01` · name `BC-STG 5432cb Driver` | **RESIDUAL inactive** (no product hard-delete) |
| Service plan | group `543201` v1 valid_from 2026-08-01 duty `543201.S01` | residual / UI active-plans card 0 |
| Monthly assignments | 2026-08-11 + 2026-08-12 | residual (dispo deleted before month clear) |

### Finding B2C-02

Monthly import responsive UI: Driver name lacks priority; Month occupies too much space. OPEN — no code fix in B2C / CLEAN1-A.

### Finding B2C-03

Product paths cannot return SA counts to **1/0/0/0** after driver + run CA create (no product hard-delete). See report 2026-08-11.

### Driver work-window

**PENDING COVERAGE** — observed product work-window block; not automatic bug; retest with matching synthetic window.

### Synthetic identity patterns

| Kind | Value |
|------|--------|
| Run prefix | `BC-STG-B2C-20260811-5432cb` |
| Email | `bc-stg-b2c-20260811-5432cb-<role>@example.invalid` |
| Phone (only if required) | `+12025550177` |
| EID | `BC-STG-B2C-20260811-5432cb-EID-01` |
| PIN/codes | memory only — never in reports |

---

## Forbidden inventory

| Tenant | Verdict |
|--------|---------|
| `blaguss` | **FORBIDDEN** — do not open Save/Delete/Support/Reset; no smoke writes |

---

## Post-run residue target

- active run-scoped Firestore resources = **0**
- active run-scoped Auth users = **0**
- active locks = **0**
- local temp files = **0**
- persistent baseline unchanged: **1 / 0 / 0 / 0**
- mutations against `blaguss` = **0**

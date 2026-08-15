# Persistent Staging QA Baseline — 3D.4-B2C-0

**Date:** 2026-08-11  
**Firebase project:** `buscommand-preview` / `(default)`  
**Staging origin:** `https://buscommand-preview-staging.onrender.com`  
**Status:** **ACTIVE** — persistent QA baseline created

---

## Forbidden tenant (read-only forever in this program)

| Field | Value |
|-------|--------|
| Display name | BLAGUSS |
| companyId | `blaguss` |
| Rule | **No Save / Delete / Reset / Support / status/plan/limit mutations** |

---

## Allowed persistent resources (created)

| Resource | Value |
|----------|--------|
| Display name | `BUSCOMMAND STAGING QA — NO REAL DATA` |
| companyId | `buscommand-staging-qa-no-real-data` |
| Country | AT |
| Plan / licenseStatus | STARTER / trial (~30 days) |
| Limits | maxDrivers **15**, maxDispatchers **2** |
| Features (product defaults) | includes `excelImport: true` |
| Persistent CA email | `bc-staging-qa-ca@example.invalid` |
| Persistent CA Auth + `users/{uid}` | **yes** (1 admin) |
| Audit | `company_created` + `user_created` expected |
| Password / PIN / tokens | **never stored in reports** |

---

## Must remain zero until a later checkpoint

- Dispatchers (staff role)  
- Drivers / driver_credentials / EID  
- Groups / buses  
- Duties / service plans  
- Monthly plans / import jobs / locks  
- Shifts / revisions / confirmations  
- Messages / incidents / active SOS  
- Real email / phone  
- SMS / email outbound jobs  

Current inventory after B2C-0: Admins **1** · Dispatchers **0** · Drivers **0** · Groups **0**.

---

## Future run-prefix contract (inside this tenant only)

- All test-run resources: `BC-STG-*` prefix  
- Synthetic data only (`example.invalid`, fictional names/phones)  
- Clean up after each test run  
- Leave this tenant on this documented clean baseline  
- **Never** use `blaguss`

---

## Cleanup rules

| Scope | Action |
|-------|--------|
| This persistent QA tenant | **Keep** (not deleted each test) |
| Failed / dirty future runs | Delete only run-prefixed children; restore zero-ops baseline |
| Full tenant delete | SA Delete company → `deleteCompanyAtomic` on `buscommand-staging-qa-no-real-data` only |
| BLAGUSS | Never delete / never mutate |

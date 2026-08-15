# Integration Checkpoint 3D.4-B2C-0 — Persistent Isolated Staging QA Tenant

**Datum:** 2026-08-11  
**Verdict:** **PASS — PERSISTENT QA BASELINE CREATED**

---

## Identity

| Item | Value |
|------|-------|
| Staging origin | `https://buscommand-preview-staging.onrender.com` |
| Render service | `srv-d9t2ek6417fc7391958g` |
| Active commit | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Firebase | `buscommand-preview` / `(default)` |
| Ruleset | Active UI `Yesterday • 10:25 pm` (B2A `a6c1353f…`) |
| Deploy count | **2** |
| Auto Sync / Auto Deploy | Sync paused / Off |

---

## STARTER capability gate (pre-write)

| Check | Result |
|-------|--------|
| STARTER limits | maxDrivers **15**, maxDispatchers **2** |
| `createCompanyAtomic` features | `excelImport: true` for all packages incl. starter |
| Monthly import handlers gate on licenseType | **none** |
| Minimal B2C need (1 CA, 1 Dispo later, few drivers, 1 group) | **covered by STARTER** |
| Verdict | **PASS — proceed with STARTER** |

Evidence: `reports/integration-3d4b2c0-logs/03-starter-capability-gate.txt`

---

## BLAGUSS freeze (read-only)

| Field | Pre | Post |
|-------|-----|------|
| companyId | `blaguss` | `blaguss` |
| Status | TRIAL: 28 DAYS | TRIAL: 28 DAYS |
| Plan | PRO | PRO |
| Admins | 1 | 1 |
| Dispatchers | 1 | 1 |
| Drivers | 10 | 10 |
| Groups | 1 | 1 |
| Support | Off | Off |
| Save / Delete / Support / Reset | **not clicked** | **not clicked** |

**BLAGUSS unchanged.** Real emails/names redacted from evidence.

---

## Collision guard

- Exact QA display name absent before create  
- No `buscommand-staging-qa*` tenant present before create  
- **CLEAR** → one create allowed

---

## Created persistent QA tenant

| Field | Value |
|-------|--------|
| Display name | `BUSCOMMAND STAGING QA — NO REAL DATA` |
| companyId | `buscommand-staging-qa-no-real-data` |
| Country | AT |
| Plan / status | **STARTER** / TRIAL: 30 DAYS |
| Limits | maxDrivers **15**, maxDispatchers **2** |
| Support | Off |
| Contact email | `bc-staging-qa-ca@example.invalid` |
| Persistent CA | **1** (`bc-staging-qa-ca@example.invalid`) — password not recorded |
| Dispatchers | **0** |
| Drivers | **0** |
| Groups | **0** |
| Buses / duties / plans / imports / messages / SOS | **0** (UI inventory) |

### Creation notes

1. SA UI **Register Company** once → company root created (STARTER).  
2. Modal CA step did **not** attach on first submit (form cleared after `renderSuperAdminDashboard` before CA read) → Admins temporarily 0.  
3. Completed baseline CA via same product path `ApiClient.createUser` / SA session (role `company_admin`, same endpoint as create-modal CA). **No Admin SDK seed.**  
4. Hard reload confirmed both tenants persist from server.

---

## Outbound / safety

| Item | Count / result |
|------|----------------|
| Email / SMS / invite / webhook during create | **0** observed / none in create paths |
| Production touch | **none** |
| Source / Rules / env / deploy / commit / push / PR / workflow | **none** |
| Phase 4 | **none** |
| Rollback | **not used** (baseline valid) |
| QA harness | **absent** |

---

## Confirmations

- no real data in QA tenant  
- no import / operational data created in QA  
- no production  
- no source / Rules / deploy / commit / push / PR / workflow  
- no Phase 4  
- BLAGUSS read-only throughout  

---

## Artefacts

- `reports/integration-3d4b2c0-baseline.md`
- `reports/integration-3d4b2c0-change-ledger.md`
- `reports/integration-3d4b2c0-logs/`
- `reports/integration-3d4b2c0-visual/` (Cursor temp + copied where available)

**STOP after 3D.4-B2C-0.**

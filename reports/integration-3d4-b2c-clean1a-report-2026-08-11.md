# Integration 3D.4-B2C-CLEAN1-A — Read-only run-scoped purge manifest

**Date:** 2026-08-11  
**Verdict:** **READY FOR OWNER PURGE APPROVAL**  
**Run ID:** `BC-STG-B2C-20260811-5432cb`  
**Mode confirmation:** READ-ONLY / no delete / no write / no source change / no deploy / no commit/push/PR/workflow / no B2C-UI1 / no Phase 4  

---

## 1. Identity preflight

| Check | Result |
|-------|--------|
| Git branch | `staging/phase-3-isolation` |
| HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Staged | **0** |
| Tracked source/config mods | **0** |
| Staging health | **200** / `{ok:true}` / `Cache-Control: no-store` |
| Active commit (from B2C-0/B2C) | `80bd34b…` |
| Deploy count (B2C-0 evidence) | **2** |
| Auto Deploy / Blueprint Auto Sync | Off / paused |
| Firebase project / DB | `buscommand-preview` / `(default)` |
| Rules release | B2A `a6c1353f-7429-466d-8c76-2f74b13b7559` (unchanged evidence) |
| QA harness | absent |
| Preflight | **PASS** |

---

## 2. B2C report consistency (claim → proof)

| Claim | Proof | Status |
|-------|-------|--------|
| Run ID `BC-STG-B2C-20260811-5432cb` | report + all B2C logs | **CONFIRMED** |
| Run CA created UID `xfoY…uMh1` | log `03-run-ca-created.txt` + Auth + `users` | **CONFIRMED** |
| Persistent CA retained UID `jQYU…YI32` | B2C-0 + Auth + `users` | **CONFIRMED** |
| Group `543201` / `BC-STG-5432cb Line` | log `04` + Firestore group doc | **CONFIRMED** |
| Dispo created then deleted | log `04`/`09` + Auth/users absent | **CONFIRMED** |
| Driver id `5b3d1050-…` inactive | live profile `active=false` + credentials path | **CONFIRMED** |
| Service plan active + duty `543201.S01` | live plan status=active + duties list | **CONFIRMED** |
| Monthly import 11–12.08 | shifts exact IDs + 2 completed import jobs | **CONFIRMED** |
| Import terminal / locks empty | jobs `status=completed`; locks “no documents” | **CONFIRMED** |
| Residual counts 2/0/1/1 | users=2 admins; drivers=1; groups=1; dispo=0 | **CONFIRMED** |
| BLAGUSS unchanged | B2C freeze + no BLAGUSS paths in this inventory | **CONFIRMED** (count/status only; no detail browse) |
| Driver work-window block | log `08-driver-smoke.txt` product message | **CONFIRMED** as observed; classified **PENDING COVERAGE** |
| EID string in data-ledger vs smoke log | ledger long form vs log `BC-STG-5432cb-EID-01` | **PARTIAL** — purge uses driverId path, not EID value; EID not re-dumped |
| Driver Auth absent | Auth list shows UID=`driverId` with identifier `-` | **CONTRADICTED prior assumption → corrected**: Auth **present** → PURGE_RUN_DRIVER |
| Cleanup hard-delete gap | product paths + SA count semantics | **CONFIRMED** → finding **B2C-03** |

No unresolved contradiction that makes the manifest unsafe after Auth-driver correction.

---

## 3. Finding registry (corrected names)

| ID | Title | Status |
|----|-------|--------|
| **B2C-01** | Company creation / CA modal follow-up tok | **OPEN** (no code fix) |
| **B2C-02** | Monthly import responsive UI — Driver name lacks priority; Month occupies too much space | **OPEN** (registry name correction; no code fix this phase) |
| **B2C-03** | QA tenant has no product hard-delete for run CA + inactive driver; baseline 1/0/0/0 not restorable via product | **OPEN** (was mislabeled B2C-02 in B2C report) |
| Driver work-window | Not automatic product bug | **PENDING COVERAGE** — retest with matching synthetic work-window time |

Production code unchanged.

---

## 4. Auth inventory (QA-associated only)

| Classification | UID (redacted) | Notes |
|----------------|----------------|-------|
| RETAIN_PERSISTENT_CA | `jQYU…YI32` | company_admin; baseline |
| PURGE_RUN_CA | `xfoY…uMh1` | company_admin; run-prefixed email |
| PURGE_RUN_DRIVER | `5b3d1050-…` | Auth UID == driverId; identifier `-` |
| ALREADY_DELETED | `rbIR…hf12` | Dispo Auth+user absent |
| AMBIGUOUS | — | **0** |

Passwords / tokens / hashes not recorded.

---

## 5. Candidate counts

| Action | Count |
|--------|------:|
| DELETE firestore exact docs | **11** |
| DELETE auth users | **2** |
| RETAIN freeze entries | **7** (+ audit collection policy) |
| VERIFY_ABSENT | **4** (dispo auth, dispo user, import locks, local session) |
| AMBIGUOUS | **0** |
| BLAGUSS_CANDIDATES | **0** |

---

## 6. Exact future delete order

See `integration-3d4-b2c-clean1a-purge-manifest.md` / `.json`.  
Summary: locks verify → shifts → schedule → import jobs → duty → plan → credentials → driver → group → run CA FS → run CA Auth → driver Auth → post-check **1/0/0/0**.

---

## 7. Counter / guard plan

- SA counts = live snapshot sizes (`getCompanyDetail`) — hard delete of run docs yields 1/0/0/0 without company-root counter fields.  
- `maxDrivers` / EID uniqueness require profile+credentials hard delete for slot reuse.  
- `ops/driver_identity_guard` **RETAIN**; optional atomic `revision+1` + `updatedAt` after credential purge.  
- Group delete only after reference cleanup (`findCompanyGroupReferences`).  
- **No new production schema/code required** for exact Admin SDK purge.  
- `deleteCompanyAtomic` / wildcards **forbidden**.

---

## 8. Immutable residue

- `audit_log/*` retained.  
- Terminal import jobs may be deleted for hygiene **or** retained; they do not block new importIds.  
- Guard retained.

---

## 9. Dry-run postcondition

Mathematically reachable: Admins **1** / Dispo **0** / Drivers **0** / Groups **0**; active shifts/locks/nonterminal jobs **0**; run Auth **0**; persistent CA **1**; tenant root present; BLAGUSS unchanged.

---

## 10. Source / Git safety (end)

| Item | Result |
|------|--------|
| HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Staged | 0 |
| Production source/config/test edits | none |
| Purge script in repo | **none** |
| This phase artefacts | ignored `reports/integration-3d4-b2c-clean1a-*` only (+ naming corrections in ignored B2C reports) |
| Commit / push / PR / workflow / deploy | **none** |

---

## Artefacts

- `reports/integration-3d4-b2c-clean1a-report-2026-08-11.md`
- `reports/integration-3d4-b2c-clean1a-change-ledger.md`
- `reports/integration-3d4-b2c-clean1a-purge-manifest.json`
- `reports/integration-3d4-b2c-clean1a-purge-manifest.md`
- `reports/integration-3d4-b2c-clean1a-logs/`
- `reports/integration-3d4-b2c-clean1a-visual/`

**STOP after CLEAN1-A.** Do not execute purge without a new explicit owner command.

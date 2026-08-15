# Integration 3D.4-B2C-CLEAN1-A.1 — Exact purge manifest correction

**Date:** 2026-08-11  
**Verdict:** **READY FOR OWNER PURGE APPROVAL**  
**Run ID:** `BC-STG-B2C-20260811-5432cb`  
**Mode:** READ-ONLY / no delete / no write / no Auth update / no source change / no Admin key / no commit/push/deploy / no CLEAN1-B execution  

---

## Identity

| Item | Value |
|------|-------|
| Git HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Branch | `staging/phase-3-isolation` |
| Staged | 0 |
| Tracked source mods | 0 |
| Firebase | `buscommand-preview` / `(default)` |
| QA companyId | `buscommand-staging-qa-no-real-data` |
| BLAGUSS | forbidden / not a candidate |

---

## Manifest freeze

| Field | Value |
|-------|-------|
| Exact JSON | `reports/integration-3d4-b2c-clean1a1-purge-manifest.json` |
| SHA-256 | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |
| Redacted MD | `reports/integration-3d4-b2c-clean1a1-purge-manifest.md` |
| CLEAN1-B | may run only against this exact hash |

---

## Mandatory corrections completed

### 1. Exact identifiers
JSON contains full Firestore paths and full Auth UIDs. No `...`, no wildcard deletes, no collection-wide deletes.

### 2. RETAIN freeze (mutationAllowed=false)
- company root  
- persistent CA user `jQYUfo1QjsgVw1zn5ez37ONLYI32` + Auth  
- profile/main, settings/main, branding  
- audit_log  
- ops/driver_identity_guard — **unchanged** (no revision bump, no updatedAt write); expected updateTime `2026-08-11T14:22:34.387710Z`, revision `1`

### 3. Import job decision (single)
**DELETE** both terminal jobs (no optional retain):

| importId | updateTime | fingerprint |
|----------|------------|-------------|
| `48bc7166-8fa7-40f9-a880-c9d7c486ecfe` | `2026-08-11T14:29:09.783298Z` | `d8dc9c338af0c24c…357c` |
| `ad44c56d-558e-458e-939a-96f051cae6ab` | `2026-08-11T14:27:51.165119Z` | `c417a3200952122b…30eb` |

Retention rationale: completed jobs are only for same-importId idempotency in `server/staff-monthly-plan-import.js`; no mandatory retention contract. Audit stays in `audit_log`.

### 4. Two independent proofs
Each DELETE lists proofs from distinct sources (e.g. shift doc + import job; profile + Auth; plan + duty; group doc + B2C log). Same-document field pairs are not used as two proofs.

### 5. Related-data inventory
All required categories classified as DELETE / RETAIN / VERIFY_ABSENT (see JSON `categoryInventory`): shifts, schedules, revisions, confirmations, import jobs, locks, chunks/appliedChunks, service plan, duties, buses, driver profile/credentials, group refs, group `543201`, run CA FS/Auth, driver Auth, Dispo FS/Auth, audit residue, identity guard.

### 6. Live preconditions
Every DELETE has: exact path/UID, kind, expectedExistence, expectedCompanyId, runOwnershipProofs, createTime/updateTime (and/or contentFingerprint), dependenciesMustBeRemovedBefore, abortIf.

### 7. Auth safety
| UID | Role in plan |
|-----|----------------|
| `jQYUfo1QjsgVw1zn5ez37ONLYI32` | RETAIN |
| `xfoYMF95iUdBWUKQnMKyLlLMuMh1` | DELETE (after Firestore) |
| `5b3d1050-a58b-4d05-9949-f90fbcb73593` | DELETE (last with run CA Auth) |
| `rbIR3IRkbne9s742q6ci5dI3hf12` | VERIFY_ABSENT |

Auth delete orders **200–210** only after Firestore success.

### 8. BLAGUSS guard
DELETE-candidate scan: **BLAGUSS_CANDIDATES=0** (no `/blaguss/`, no `companyId=blaguss`, no cross-tenant paths, no wildcard deletes).

### 9. Postcondition (dry-run)
1 / 0 / 0 / 0 · run Auth 0 · active shifts/locks 0 · nonterminal jobs 0 · persistent CA 1 · tenant root present · identity guard unchanged · BLAGUSS unchanged.

---

## Candidate totals

| Class | Count |
|-------|------:|
| DELETE Firestore | 11 |
| DELETE Auth | 2 |
| RETAIN | 8 |
| VERIFY_ABSENT | 9 |
| AMBIGUOUS | 0 |

---

## Source / Git end-state

- HEAD `80bd34b…`  
- staged 0  
- no production source/config/test changes  
- no purge script in repo  
- artefacts only under `reports/integration-3d4-b2c-clean1a1-*`  
- no commit / push / PR / deploy  

**STOP.** Do not execute purge without a new explicit owner CLEAN1-B command against this SHA-256.

# CLEAN1-A.1 Exact Purge Manifest (redacted)

**Checkpoint:** 3D.4-B2C-CLEAN1-A.1  
**Run ID:** `BC-STG-B2C-20260811-5432cb`  
**Project / DB:** `buscommand-preview` / `(default)`  
**Company:** `buscommand-staging-qa-no-real-data`  
**Mode:** READ-ONLY exact manifest — **purge not executed**  
**Verdict:** **READY FOR OWNER PURGE APPROVAL**

## Manifest freeze

| Field | Value |
|-------|-------|
| Exact JSON | `reports/integration-3d4-b2c-clean1a1-purge-manifest.json` |
| SHA-256 | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |
| Canonicalization | sorted-keys canonical JSON (excludes sha fields) |
| CLEAN1-B rule | abort unless this exact hash |

## Corrections vs CLEAN1-A

1. Full paths + full Auth UIDs in JSON (no `...`).  
2. Identity guard **RETAIN unchanged** — no revision bump / no `updatedAt` write.  
3. Import jobs: single decision **DELETE** (no optional retain).  
4. Every DELETE has ≥2 independent proofs (separate docs/systems).  
5. Related-data inventory complete (DELETE / RETAIN / VERIFY_ABSENT).  
6. Live `createTime` / `updateTime` + content fingerprints for abort gates.  
7. Auth deletes last (orders 200–210).  
8. `BLAGUSS_CANDIDATES=0`.

## Import retention decision

**DELETE** both terminal jobs:

- `…/monthly_plan_imports/48bc7166-8fa7-40f9-a880-c9d7c486ecfe`
- `…/monthly_plan_imports/ad44c56d-558e-458e-939a-96f051cae6ab`

Rationale: production keeps completed jobs only for same-`importId` idempotency (`staff-monthly-plan-import.js`). No mandatory long-term retention. Preview TTL is for prepared jobs only. Audit remains in `audit_log` (RETAIN). Future runs use new importIds.

## Counts

| Action | Count |
|--------|------:|
| DELETE Firestore | 11 |
| DELETE Auth | 2 |
| RETAIN freeze | 8 |
| VERIFY_ABSENT | 9 |
| AMBIGUOUS | 0 |
| BLAGUSS_CANDIDATES | 0 |

## Auth scope (full UIDs in JSON)

| Class | UID |
|-------|-----|
| RETAIN persistent CA | `jQYUfo1QjsgVw1zn5ez37ONLYI32` |
| DELETE run CA | `xfoYMF95iUdBWUKQnMKyLlLMuMh1` |
| DELETE driver Auth | `5b3d1050-a58b-4d05-9949-f90fbcb73593` |
| VERIFY_ABSENT Dispo | `rbIR3IRkbne9s742q6ci5dI3hf12` |

No other Auth users in purge scope.

## RETAIN freeze (unchanged)

- QA company root  
- persistent CA Firestore + Auth  
- profile / settings / branding  
- `audit_log`  
- `ops/driver_identity_guard` (updateTime `2026-08-11T14:22:34.387710Z`, revision `1`)

## Future delete order (not executed)

1. VERIFY absences  
2. shifts → schedule  
3. both import jobs  
4. duty → service plan  
5. credentials → driver profile  
6. group `543201`  
7. run CA Firestore user  
8. **Auth last:** run CA → driver  
9. POST: **1/0/0/0**, guard unchanged, BLAGUSS unchanged

## Expected postcondition

Admins 1 · Dispo 0 · Drivers 0 · Groups 0 · run Auth 0 · active shifts/locks 0 · nonterminal jobs 0 · persistent CA 1 · tenant root present · identity guard unchanged · BLAGUSS unchanged.

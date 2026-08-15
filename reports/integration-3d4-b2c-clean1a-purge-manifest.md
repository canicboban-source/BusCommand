# CLEAN1-A Purge Manifest (redacted)

**Checkpoint:** 3D.4-B2C-CLEAN1-A  
**Run ID:** `BC-STG-B2C-20260811-5432cb`  
**Mode:** READ-ONLY manifest only — **purge not executed**  
**Project / DB:** `buscommand-preview` / `(default)`  
**QA companyId:** `buscommand-staging-qa-no-real-data`  
**Verdict:** **READY FOR OWNER PURGE APPROVAL**  
**BLAGUSS_CANDIDATES:** `0`

Sensitive fields omitted: passwords, tokens, EID plaintext, credential hashes, real emails.

---

## Current vs expected

| Metric | Current (live) | Expected post-purge |
|--------|----------------|---------------------|
| Admins | 2 | 1 |
| Dispatchers | 0 | 0 |
| Drivers | 1 inactive | 0 |
| Groups | 1 (`543201`) | 0 |
| Active locks | 0 | 0 |
| Nonterminal import jobs | 0 | 0 |
| Run Auth users | 2 (run CA + driver Auth) | 0 |
| Persistent QA CA | 1 | 1 |
| QA tenant root | present | present |
| BLAGUSS | out of scope | unchanged |

---

## RETAIN freeze (never DELETE)

| Resource | Exact / redacted ID | Reason |
|----------|---------------------|--------|
| Company root | `companies/buscommand-staging-qa-no-real-data` | Persistent QA tenant |
| Profile / settings / branding | `profile/main`, `settings/main`, branding | Plan/status/limits |
| Identity guard | `ops/driver_identity_guard` (rev **1**) | Uniqueness guard; optional revision bump only |
| Persistent CA Auth | UID `jQYU…YI32` | Baseline admin |
| Persistent CA user | `users/jQYU…YI32` | Baseline admin |
| Audit log | `audit_log/*` | Immutable residue |

---

## DELETE candidates (exact only)

| Order | Kind | Exact path / UID | Evidence (≥2) |
|------:|------|------------------|---------------|
| 10 | FS | `.../shifts/5b3d1050-…_2026-08-11` | driverId + run dates + group 543201 |
| 20 | FS | `.../shifts/5b3d1050-…_2026-08-12` | same |
| 30 | FS | `.../schedules/5b3d1050-…_2026-08` | driverId + month + sole schedule |
| 40 | FS | `.../monthly_plan_imports/48bc7166-…` | completed + driverId + group + dispo actor |
| 50 | FS | `.../monthly_plan_imports/ad44c56d-…` | completed + sourceName `BC-STG-5432cb-monthly.csv` |
| 60 | FS | `.../service_plans/543201-543201-1-2026-08-01/duties/543201.S01` | duty + publishedBy run CA |
| 70 | FS | `.../service_plans/543201-543201-1-2026-08-01` | plan id + sourceFileName + run CA |
| 80 | FS | `.../driver_credentials/5b3d1050-…` | driverId + profile pair |
| 90 | FS | `.../drivers/5b3d1050-…` | inactive + group + run email/name + statusChangedBy |
| 100 | FS | `.../groups/543201` | groupId + run name |
| 110 | FS | `.../users/xfoY…uMh1` | run CA UID + run-prefixed email |
| 120 | Auth | UID `xfoY…uMh1` | Auth list + Firestore user |
| 130 | Auth | UID `5b3d1050-…` (= driverId) | Auth UID equals driverId + run window |

No wildcards. No `deleteCompanyAtomic`. No tenant wipe.

---

## VERIFY_ABSENT

| Target | Result (live) |
|--------|---------------|
| Dispo Auth `rbIR…hf12` | absent |
| Dispo user doc | absent |
| `monthly_plan_import_locks` | empty collection |
| Local `sessionStorage BC_STG_B2C_RUN` | clear on operator browser |

---

## Future delete order (not executed)

1. VERIFY locks empty + dispo absent  
2. DELETE shifts → schedule  
3. DELETE terminal import jobs *(or retain as immutable evidence; future runs use new importId)*  
4. DELETE duty → service plan  
5. DELETE driver credentials → profile  
6. DELETE group `543201` (only after `findCompanyGroupReferences` empty)  
7. DELETE run CA Firestore user → Auth  
8. DELETE driver Auth  
9. POST-CHECK SA counts **1/0/0/0**; guard RETAIN (+ optional revision bump)

### Failure / retry

- Each exact delete is idempotent if already absent (`not-found` = success for that step).  
- If a mid-step fails: stop; do not continue past unmet precondition; persistent CA/tenant remain.  
- Auth deletes only after paired Firestore deletes for that identity.

---

## Counter / guard contract (source-cited)

| Topic | Conclusion | Source |
|-------|------------|--------|
| SA counts | Snapshot sizes / user role filters — **not** materialized counters on company root | `server/superadmin-company.js` `getCompanyDetail` (`driversSnap.size`, admins=`role===company_admin`, dispatchers length, groups size) |
| maxDrivers | Counts **all** `drivers` profiles including inactive | `server/company-admin-driver-ops.js` `existingProfiles.size` |
| EID uniqueness | Scans live `driver_credentials` | `server/driver-identity-guard.js` `findEidConflict` |
| Guard doc | RETAIN; fields `revision`+`updatedAt` only; optional bump after credential purge | `writeDriverIdentityGuardBumpInTx` |
| Group delete | Requires reference cleanup (drivers/plans/shifts/schedules/…) | `server/company-groups.js` `findCompanyGroupReferences` |
| Auth vs FS | Product tenant wipe deletes FS tree then Auth UIDs from users+drivers | `server/provisioning.js` `deleteCompanyAtomic` — **not** used here; exact deletes only |
| Product hard-delete CA/driver | None (B2C-03) | B2C cleanup log + SA disable-only |

**No production schema/code change required** for an owner-approved Admin SDK exact-path purge.

---

## Immutable residue (intentional non-delete)

| Residue | Why keep | Count impact |
|---------|----------|--------------|
| `audit_log/*` | Security/ops trail | None on Admin/Driver/Group counts |
| Optional terminal import jobs | Retention evidence | None if status=`completed` |
| `ops/driver_identity_guard` | Uniqueness contract | None |

---

## BLAGUSS exclusion

Static scan of this manifest: **BLAGUSS_CANDIDATES=0**  
No `/blaguss/`, no `companyId=blaguss`, no real-tenant Auth UIDs, no recursive deletes.

# Integration 3D.4 — B2C-CLEAN1-B-BR4-D1R Diff (proposed, not applied)

**Datum:** 2026-08-11  
**Frozen manifest SHA:** `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da`  
**Status:** PROPOSED ONLY — manifest not modified

---

## D1. DEL-SHIFT-2026-08-11 / DEL-SHIFT-2026-08-12

| Item | Value |
|------|--------|
| Frozen key | `contentFingerprint.dutyName = "543201.S01"` |
| Live fact | top-level `dutyName` **absent**; `name="543201.S01"`; `routeCode="543201.S01"` |
| Production schema | `server/group-monthly-plan-import.js` → `buildShiftDocument()` writes `name` + `routeCode` (never `dutyName`) |
| UI contract | `js/dispatcher/monthly-plans.js` reads `shift.routeCode` / `shift.name` |
| createTime / updateTime | **exact MATCH** both shifts (identical frozen timestamps) |
| Other FP keys | driverId, groupId, date, importId, revision → **MATCH** |
| Proposed correction | Replace `dutyName` with `name` and `routeCode` (both `"543201.S01"`), or keep one canonical key `routeCode` and drop `dutyName` |
| Security rationale | Removes false fail-closed abort; still binds duty identity to catalog code without inventing fields |

### Both shifts same schema?

**YES** — identical top-level field sets; both lack dutyName/dutyId/dutyCode/shiftId/nested duty; both have name+routeCode=`543201.S01`.

---

## D2. DEL-DUTY-543201-S01

| Item | Value |
|------|--------|
| Frozen keys | `dutyId="543201.S01"`, `parentPlanId="543201-543201-1-2026-08-01"` |
| Live fact | both keys **absent**; live has `code` (and activity fields); doc path is `.../service_plans/{planId}/duties/543201.S01` |
| Production schema | `server/service-plans.js` → `serializeDuty()` / `batch.set(...duties.doc(encodeURIComponent(duty.code)), …)` — field is `code`, parent is path |
| createTime / updateTime | **exact MATCH** |
| Proposed correction | Replace `dutyId` → `code: "543201.S01"`; drop `parentPlanId` from fingerprint (assert via path prefix only) |
| Security rationale | Fingerprint matches real written fields; path still pins parent plan |

---

## D3. DEL-DRIVER-CREDENTIALS

| Item | Value |
|------|--------|
| Frozen key | `contentFingerprint.driverId = "<run-driver-id>"` |
| Live fact | top-level `driverId` **absent**; doc id == run driverId; fields include credential material (names only logged: eid, loginCodeHash, …) |
| Production schema | `server/company-admin-driver-ops.js` → `credentialCol.doc(driverId).set({ eid, loginCodeHash, … })` — **no** `driverId` field |
| createTime / updateTime | **exact MATCH** |
| Proposed correction | Remove `driverId` from contentFingerprint; retain path `.../driver_credentials/{driverId}` as identity proof |
| Security rationale | Avoids requiring a field production never writes; does not weaken path/UID binding |

---

## D4. Auth DEL-RUN-DRIVER-AUTH (informational — no freeze field change required)

| Item | Value |
|------|--------|
| Frozen | authUid = run driverId; paired driver path |
| Live | present; localId MATCH; paired path EXISTS; not persistent CA; BLAGUSS=no; company claim NO_CLAIM |
| synthetic `@example.invalid` | **NO** |
| Proposed correction | None required for fingerprint; optional future QA note only |
| Security rationale | Ownership remains UID==driverId + paired Firestore driver doc |

---

## Resources with no proposed fingerprint change

All of the following: fingerprint keys **MATCH**, createTime/updateTime **MATCH**, ownership OK:

- DEL-SCHEDULE-2026-08  
- DEL-IMPORT-JOB-48BC7166  
- DEL-IMPORT-JOB-AD44C56D  
- DEL-SERVICE-PLAN  
- DEL-DRIVER-PROFILE  
- DEL-GROUP-543201  
- DEL-RUN-CA-USER  
- DEL-RUN-CA-AUTH  

---

## Explicitly not applied

- No manifest rewrite  
- No refreeze  
- No dry-run retry  
- No execute  

# Integration 3D.4 — B2C-CLEAN1-B-BR4-D1R Read-only Full Manifest/Live Reconciliation

**Datum:** 2026-08-11  
**Checkpoint:** `3D.4-B2C-CLEAN1-BR4-D1R`  
**Mode:** READ-ONLY (no dry-run retry, no `--execute`, no manifest edit)  
**HEAD:** `80bd34bdd85e07bea23cb9bc52793c72e3b31660`  
**Project:** `buscommand-preview`  
**Tenant:** `buscommand-staging-qa-no-real-data`  
**Run:** `BC-STG-B2C-20260811-5432cb`  
**Frozen manifest SHA:** `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da`  
**Executor SHA:** `8a90f6b17370589bbe3a6c8c10279920ea1a36cb32acfa1b4d96ecc569e3a5ba`

---

## Verdict

**SAFE_TO_PROPOSE_REFREEZE**

All 13 DELETE candidates exist, belong to the QA run, and have exact createTime/updateTime alignment on every Firestore document. Observed mismatches are **frozen fingerprint key-name errors** against the production write schema (not live data drift). Proposed diffs are complete; not applied. `AMBIGUOUS=0`, `BLAGUSS_CANDIDATES=0`.

---

## Why D1 failed

D1 abort:

```text
FATAL: fingerprint field missing DEL-SHIFT-2026-08-11.dutyName
```

Live shifts do **not** have `dutyName`. Production monthly import writes duty identity as:

- `name` = duty code (e.g. `543201.S01`)
- `routeCode` = duty code

So D1 fail-closed is correct against the frozen key, but the frozen key itself is wrong for production schema.

---

## D1 evidence preserved

| Check | Result |
|-------|--------|
| D1 state path | `$HOME/clean1b/evidence/br4d1/execution-state.json` |
| phase / mode | `BLOCKED` / `DRY_RUN` (unchanged) |
| `.ARMED` / `.MUTATED` | absent |
| D1 mutations | 0 |
| D1R evidence folder | `$HOME/clean1b/evidence/br4d1r/` (separate) |

Permission gate was **not** re-run (D1 already HTTP 200 + 3 perms).

---

## Source contract (HEAD, read-only)

| Concern | Canonical field | Source |
|---------|-----------------|--------|
| Shift create (monthly import) | `name`, `routeCode` | `server/group-monthly-plan-import.js` → `buildShiftDocument()` |
| Canonical row duty identity | `name` / `routeCode` from `duty.code` | same file → `canonicalImportRow()` |
| Monthly UI duty display | `shift.routeCode` then `shift.name` | `js/dispatcher/monthly-plans.js` |
| Duty catalog write | `code` (+ path doc id) | `server/service-plans.js` → `serializeDuty()` / `duties.doc(encodeURIComponent(duty.code))` |
| Driver credentials write | doc id = `driverId`; fields `eid`, `loginCodeHash`, … (**no** `driverId` field) | `server/company-admin-driver-ops.js` |

**Conclusion:** `dutyName` is **not** a production shift field. It is a frozen-manifest fingerprint naming error. Both live shifts match the production contract (`name` + `routeCode`).

---

## Complete DELETE candidate table (13)

| Resource | existence | createTime | updateTime | fingerprint | ownership | verdict |
|----------|-----------|------------|------------|-------------|-----------|---------|
| DEL-SHIFT-2026-08-11 | yes | MATCH | MATCH | `dutyName` FIELD_MISSING; other keys MATCH; live `name`/`routeCode`=`543201.S01` | path+importId+groupId OK | SCHEMA_FP_KEY_MISMATCH_ONLY |
| DEL-SHIFT-2026-08-12 | yes | MATCH | MATCH | same as above (date=2026-08-12) | OK | SCHEMA_FP_KEY_MISMATCH_ONLY |
| DEL-SCHEDULE-2026-08 | yes | MATCH | MATCH | all MATCH | OK | ALIGNED |
| DEL-IMPORT-JOB-48BC7166 | yes | MATCH | MATCH | all MATCH (sensitive `fingerprint` compared via digest policy in tool) | OK | ALIGNED |
| DEL-IMPORT-JOB-AD44C56D | yes | MATCH | MATCH | all MATCH | OK | ALIGNED |
| DEL-DUTY-543201-S01 | yes | MATCH | MATCH | `dutyId`/`parentPlanId` missing; live has `code`; parent in path | OK | SCHEMA_FP_KEY_MISMATCH (tool: FINGERPRINT_DRIFT) |
| DEL-SERVICE-PLAN | yes | MATCH | MATCH | all MATCH | OK | ALIGNED |
| DEL-DRIVER-CREDENTIALS | yes | MATCH | MATCH | `driverId` field missing; identity = doc id | OK | SCHEMA_FP_KEY_MISMATCH (tool: FINGERPRINT_DRIFT) |
| DEL-DRIVER-PROFILE | yes | MATCH | MATCH | all MATCH | OK | ALIGNED |
| DEL-GROUP-543201 | yes | MATCH | MATCH | all MATCH | OK | ALIGNED |
| DEL-RUN-CA-USER | yes | MATCH | MATCH | all MATCH | OK | ALIGNED |
| DEL-RUN-CA-AUTH | present | n/a | n/a | localId MATCH; synthetic YES; company claim MATCH; paired user exists; not persistent CA | OK | ALIGNED |
| DEL-RUN-DRIVER-AUTH | present | n/a | n/a | localId MATCH; synthetic **NO**; company claim NO_CLAIM; paired driver exists; not persistent CA | OK (UID==driverId) | OWNERSHIP_OK (domain note) |

### Shift schema probes (both)

| Field | Present? |
|-------|----------|
| dutyName | **no** |
| dutyId | **no** |
| dutyCode | **no** |
| shiftId | **no** |
| nested duty/assignment | **no** |
| name | **yes** (`543201.S01`) |
| routeCode | **yes** (`543201.S01`) |

Both shifts share the **same schema shape**.

### Cross-links

- Duty `543201.S01` under plan `543201-543201-1-2026-08-01` — yes (path + service plan ALIGNED).  
- Both import jobs + schedule tied to group `543201` / run driver / month `2026-08` — yes.  
- Remaining 8 Firestore fingerprints fully aligned (schedule, 2 imports, service plan, driver profile, group, run CA user) aside from the three schema-key cases above.  
- Auth CA fully aligned; Auth driver ownership unambiguous by UID.  
- `BLAGUSS_CANDIDATES=0`  
- `AMBIGUOUS=0`

---

## Auth reconciliation (lookup only)

Header used: `x-goog-user-project: buscommand-preview`  
No Auth deletes. No email local-parts / tokens logged.

| UID purpose | present | localId match | `@example.invalid` | company claim | paired path | persistent CA | BLAGUSS |
|-------------|---------|---------------|--------------------|---------------|-------------|---------------|---------|
| Run CA `xfoYMF95…` | yes | yes | YES | MATCH | users path yes | no | no |
| Driver `5b3d1050-…` | yes | yes | NO | NO_CLAIM | drivers path yes | no | no |

---

## Proposed diffs

See `reports/integration-3d4-b2c-clean1b-br4d1r-diff.md` (not applied):

1. Shifts: drop `dutyName`; fingerprint `name`/`routeCode` = `543201.S01`  
2. Duty: fingerprint `code`; drop `parentPlanId` field (path asserts parent)  
3. Credentials: drop `driverId` field fingerprint (doc id asserts identity)

---

## Final confirmations

| Flag | Value |
|------|--------|
| MANIFEST_CHANGED | **0** |
| DRY_RUN_RETRY | **0** |
| EXECUTE | **0** |
| FIRESTORE_WRITES/DELETES | **0** |
| AUTH_WRITES/DELETES | **0** |
| IAM_CHANGES | **0** |
| SOURCE_CHANGES | **0** |
| BLAGUSS_TOUCHED | **0** |
| D1_STATE_MUTATED | **0** |

---

## Artifacts

- `reports/integration-3d4-b2c-clean1b-br4d1r-report-2026-08-11.md`
- `reports/integration-3d4-b2c-clean1b-br4d1r-diff.md`
- `reports/integration-3d4-b2c-clean1b-br4d1r-change-ledger.md`
- `reports/integration-3d4-b2c-clean1b-br4d1r-logs/reconcile-summary-redacted.txt`

Cloud Shell: `$HOME/clean1b/evidence/br4d1r/reconcile.json` (+ redacted twin)

---

## Owner next step (out of scope)

Separate owner order required to **refreeze** the manifest with the proposed fingerprint key corrections, then re-run dry-run on a fresh state. Do not execute until green `DRY_RUN_PASS`.

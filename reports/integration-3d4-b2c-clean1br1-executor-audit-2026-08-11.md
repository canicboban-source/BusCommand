# Integration 3D.4 — B2C-CLEAN1-BR1 Executor Audit

**Datum:** 2026-08-11  
**Checkpoint:** `3D.4-B2C-CLEAN1-BR1`  
**Scope:** temporary REST executor safety correction only  
**Live Firebase / Cloud Shell / Auth mutation:** **none**  
**Git / source / deploy / Admin key:** **none**

---

## Verdict

**READY FOR EXECUTOR REVIEW**

All offline fail-closed tests passed (`17/17`). No dry-run and no `--execute` were run against Firebase in this task.

---

## Frozen contract (unchanged)

| Field | Value |
|--------|--------|
| Manifest SHA-256 | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |
| Project | `buscommand-preview` |
| Company | `buscommand-staging-qa-no-real-data` |
| Run | `BC-STG-B2C-20260811-5432cb` |
| DELETE FS / Auth | **11** / **2** |
| BLAGUSS | forbidden as candidate |

---

## Corrected artefacts (outside repo)

| Path | Role |
|------|------|
| `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.mjs` | Fail-closed REST executor |
| `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs` | Offline mock tests |
| `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\manifest.json` | Frozen manifest copy for local tests |

---

## Safety corrections implemented

1. **Strict REST handling** — `requireOk()` gates every call; 401/403/409/429/5xx abort; 404 only when explicitly allowed for post-delete GET; missing `documents`/`users` is never treated as success unless HTTP ok is confirmed.
2. **Exact timestamps** — `utClose` removed; `createTime`/`updateTime` compared as exact RFC3339 strings.
3. **Content fingerprint** — Firestore REST value decoder for string/int/bool/null/array/map; all fingerprint fields checked before mutation.
4. **Exact allowlist** — DELETE set must equal the 11 frozen FS paths + 2 Auth UIDs; tenant prefix requires trailing `/` (`companies/${COMPANY}/`).
5. **True REST transaction** — `beginTransaction` (read-write) → transactional `batchGet` + `runQuery` inventory → `documents:commit` with transaction id + exactly 11 delete writes + exact `currentDocument.updateTime`. Plain commit without transaction is rejected by `buildCommitBody` / `validateCommitBody`.
6. **Inventory / references** — collection inventory with pagination completeness (pageToken / runQuery pages); empty-collection API errors do not look like absence; group `543201` refs must be only DELETE allowlist docs; nonterminal import jobs abort.
7. **Retain freeze** — exact times for retain docs; branding/audit redacted digests (count/names/updateTimes/metaHash); identity guard never written.
8. **Auth ownership** — successful lookup required; `localId` exact; paired FS path; company claim when present; synthetic `@example.invalid` email when present; dispo absence requires successful empty lookup (errors → BLOCKED); Auth delete only after `FIRESTORE_COMMITTED`.
9. **Execution state** — redacted `/tmp/clean1b/execution-state.json` (overridable); phases `PREFLIGHT_ONLY`…`PASS`/`BLOCKED`/`PARTIAL`; post-commit state written before Auth deletes; partial state refuses full retry without narrow `--resume-auth`.
10. **Dry-run isolation** — dry-run never calls `beginTransaction`, `commit`, or Auth delete (proven by mock counters).

---

## Offline test proof

Command:

```text
node C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs
```

Result: `TOTAL pass=17 fail=0` → `ALL_OFFLINE_FAIL_CLOSED_TESTS_PASS`

Covered aborts / proofs:

- manifest SHA mismatch
- extra DELETE candidate
- wildcard / cross-tenant path
- contentFingerprint mismatch
- exact updateTime mismatch
- REST 403/500 on verify path
- Auth lookup error ≠ absence
- persistent CA in delete set
- retain digest drift
- extra group reference
- commit body = 11 deletes + transaction
- dry-run never commit/Auth delete
- Auth delete forbidden before `FIRESTORE_COMMITTED`
- partial state requires `--resume-auth`

---

## Explicitly not done (this task)

- Cloud Shell upload
- Live dry-run
- Live `--execute`
- Firebase / Auth mutations
- Screenshots / ZIP / product gates
- Source / commit / push / deploy

---

## Owner next step (out of scope here)

After executor review approval, a **separate** owner order is required before any Cloud Shell upload + live dry-run / execute.

# Integration 3D.4 — B2C-CLEAN1-BR2 Executor Audit

**Datum:** 2026-08-11  
**Checkpoint:** `3D.4-B2C-CLEAN1-BR2`  
**Scope:** execution-path + crash-safety correction (offline only)  
**Live Firebase / Cloud Shell / Auth mutation:** **none**  
**Git source / deploy / Admin key:** **none**

---

## Verdict

**READY FOR FINAL EXECUTOR REVIEW**

Offline fail-closed tests: **`28/28` PASS**  
(`ALL_OFFLINE_FAIL_CLOSED_TESTS_PASS`)

---

## Executor identity

| Field | Value |
|--------|--------|
| Path | `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.mjs` |
| **executorSha256** | `61579edf011280c5428f3826009db08ef55bdd1096a78d3936f7cb1381d06f18` |
| Tests | `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs` |
| Frozen manifest SHA | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |

---

## BR2 corrections

1. **runQuery REST** — parent in URL (`.../documents/{parent}:runQuery`); body only `structuredQuery` + `transaction`; explicit `orderBy __name__ ASC` before name cursors; `row.error` aborts.
2. **Execute gate** — requires fresh `DRY_RUN_PASS` (≤10 min) with matching `manifestSha256`, project/company/run, and `executorSha256`. Explicit `--state` required; insecure `/tmp/clean1b/...` refused; recommended `$HOME/clean1b/evidence/execution-state.json`.
3. **Atomic state** — temp + fsync + rename; fixed identity fields cannot be overridden; mutated phases sticky; `.MUTATED` lock sentinel; post-commit `FIRESTORE_COMMITTED` written before any Auth call.
4. **`--resume-auth` removed** — unknown/forbidden; PARTIAL requires new owner micro-executor order.
5. **Full RW transaction read set** — 11 deletes + retain docs + Dispo missing + empty collections + import chunk subs + duties + inventory/group refs; baseline exact IDs `2/0/1/1`; rollback on pre-commit failure.
6. **Complete post-Firestore check** before Auth — `1/0/0/0` + empty run collections + guard/digests; failure → `PARTIAL`, Auth=0.
7. **Auth revalidation** immediately before each delete; soft/uncertain delete → `PARTIAL` + `uncertainStep`; no next Auth delete; persistent CA checked after each success.
8. **Final PASS** only after full re-proof + `BLAGUSS_DELETE_ATTEMPTS=0` / `OTHER_TENANT_DELETE_ATTEMPTS=0`.

---

## Offline proof

```text
node C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs
→ TOTAL pass=28 fail=0
→ ALL_OFFLINE_FAIL_CLOSED_TESTS_PASS
→ EXECUTOR_SHA256=61579edf011280c5428f3826009db08ef55bdd1096a78d3936f7cb1381d06f18
```

Includes prior BR1 abort coverage plus execute-path cases **A–J** (full sequence, rollback, commit 409, post-check PARTIAL, Auth uncertain/fail, mutated lock, stale/missing dry-run, runQuery URL/body, `--resume-auth` rejected).

---

## Explicitly not done

- Cloud Shell upload
- Live dry-run / `--execute`
- Firebase / Auth mutations
- Screenshots / ZIP / product gates

---

## Owner next step (out of scope)

Separate owner order required before any Cloud Shell transfer + live dry-run/execute using this exact `executorSha256`.

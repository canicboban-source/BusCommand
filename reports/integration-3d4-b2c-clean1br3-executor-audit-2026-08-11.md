# Integration 3D.4 — B2C-CLEAN1-BR3 Executor Audit

**Datum:** 2026-08-11  
**Checkpoint:** `3D.4-B2C-CLEAN1-BR3`  
**Scope:** COMMIT-UNCERTAINTY + exact inventory closeout (offline only)  
**Live Firebase / Cloud Shell / Auth mutation:** **none**  
**Git source / deploy / Admin key:** **none**  
**BR2 Cloud Shell upload:** **not performed** (explicitly forbidden)

---

## Verdict

**READY FOR FINAL EXECUTOR REVIEW**

Offline fail-closed tests: **`32/32` PASS**  
(`ALL_OFFLINE_FAIL_CLOSED_TESTS_PASS`)

---

## Executor identity

| Field | Value |
|--------|--------|
| Path | `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.mjs` |
| **executorSha256** | `62a08c8598d9163ec0f9a75d5999bf4e6246140b95d01067db30901cc96191e5` |
| Tests | `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs` |
| Frozen manifest SHA | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |

---

## BR3 corrections

1. **PRE-COMMIT ARMED** — after all transaction reads/preconditions + exact inventory + writable state proof, atomicially write sticky phase `COMMIT_ARMED`, fsync `.ARMED` + `.MUTATED` sentinels, store `transactionFingerprint` (SHA-256 of tx id, never the token), *then* send commit HTTP. `COMMIT_ARMED` is an allowed + sticky mutated phase.
2. **Full `--execute` permanently refused** when any of: `COMMIT_ARMED`, `FIRESTORE_COMMITTED`, `RUN_CA_AUTH_DELETED`, `DRIVER_AUTH_DELETED`, `PARTIAL`, or `.ARMED`/`.MUTATED` sentinel.
3. **Commit response uncertainty** — `mutationStage = commit_in_flight` before HTTP commit. Confirmed path requires `200` + exactly 11 `writeResults` → `FIRESTORE_COMMITTED`. Lost transport / 5xx / unreadable body / process death after send → `PARTIAL` / `COMMIT_UNCERTAIN`, Auth deletes = 0. No rollback after commit request leaves the process. 409/ABORTED does **not** clear armed protection; requires read-only reconcile before any new owner order. Rollback only while still pre-commit (`mutationStage === "pre"`).
4. **Exact pre-commit inventory** — users = persistent CA + run CA only; drivers/credentials/groups/shifts/schedules/service_plans/duties/monthly_plan_imports exact manifest sets; locks/buses/confirmations/outbox/sessions empty. Any extra document blocks commit (even without groupId/run prefix).
5. **Retain digest revalidation** — immediately before `beginTransaction`, re-read branding/audit digests and compare to fresh `DRY_RUN_PASS` digests; mismatch → `BLOCKED` PRE-MUTATION (begin/commit/Auth = 0). Post-checks use the confirmed live-now digests.
6. **State-machine catch** — respects highest reached stage: pre-commit → `BLOCKED`; `COMMIT_ARMED`/`commit_in_flight` → `PARTIAL`/`COMMIT_UNCERTAIN`; `FIRESTORE_COMMITTED` → `PARTIAL`; Auth in flight → `PARTIAL` + `uncertainStep`. Never downgrades sticky phase to `BLOCKED`.

---

## Offline proof

```text
node C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs
→ TOTAL pass=32 fail=0
→ ALL_OFFLINE_FAIL_CLOSED_TESTS_PASS
→ EXECUTOR_SHA256=62a08c8598d9163ec0f9a75d5999bf4e6246140b95d01067db30901cc96191e5
```

Keeps prior BR1/BR2 abort + execute-path coverage and adds:

| Test | Contract |
|------|----------|
| **C** | commit 409 after ARMED → PARTIAL/COMMIT_UNCERTAIN, sticky, Auth=0, full retry refused |
| **G1** | mock commit applies 11 deletes + transport lost → COMMIT_UNCERTAIN, sticky, Auth=0, retry refused |
| **G2** | confirmed commit + state-write failure → PARTIAL sticky, Auth=0, retry refused |
| **K** | extra exact-inventory credential → commit=0 Auth=0 |
| **L** | retain digest changed since dry-run → begin/commit/Auth=0 |
| **M** | COMMIT_ARMED sticky refuses full retry |

---

## Explicitly not done

- Cloud Shell upload of BR2 or BR3 executor
- Live dry-run / `--execute`
- Firebase / Auth mutations
- Screenshots / ZIP / product gates

---

## Owner next step (out of scope)

Separate owner order required before any Cloud Shell transfer + live dry-run/execute using the exact final `executorSha256` from this BR3 suite.

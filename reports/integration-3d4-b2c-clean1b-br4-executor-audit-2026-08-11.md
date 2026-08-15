# Integration 3D.4 — B2C-CLEAN1-B-BR4 Executor Audit

**Datum:** 2026-08-11  
**Checkpoint:** `3D.4-B2C-CLEAN1-BR4`  
**Scope:** Exact `x-goog-user-project` header correction on temporary CLEAN1-B executor (offline only)  
**Live Firebase / Cloud Shell / Auth mutation:** **none**  
**IAM changes:** **none**  
**Git product source / commit / push / deploy / Admin key:** **none**  
**Cloud Shell upload:** **not performed** (explicitly forbidden)

---

## Verdict

**READY FOR BR4 EXECUTOR REVIEW**

Offline fail-closed tests: **`39/39` PASS**  
(`ALL_OFFLINE_FAIL_CLOSED_TESTS_PASS`)

- BR3 suite retained: **32/32**
- New header tests N–T: **7/7**

---

## Executor identity (frozen + BR4)

| Field | Value |
|--------|--------|
| Path | `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.mjs` |
| Tests | `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs` |
| **BR4 executorSha256** | `8a90f6b17370589bbe3a6c8c10279920ea1a36cb32acfa1b4d96ecc569e3a5ba` |
| Prior BR3 executorSha256 | `62a08c8598d9163ec0f9a75d5999bf4e6246140b95d01067db30901cc96191e5` |
| Frozen manifest SHA | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` (unchanged) |
| `PROJECT` | `buscommand-preview` (unchanged) |
| Delete allowlist | exact **11** Firestore + **2** Auth (unchanged) |

---

## Proven cause addressed (IAM2 → BR4)

Live read-only differential previously proved:

| Call | Result |
|------|--------|
| Identity Toolkit without `x-goog-user-project` | **403** `SERVICE_DISABLED` / quota project required |
| Same call with `x-goog-user-project: buscommand-preview` | **200** |

Cause tag: **A — PROVEN_MISSING_USER_PROJECT_HEADER**

BR4 makes that header mandatory and fail-closed on every Google REST path in the temp executor.

---

## BR4 corrections (allowed diff only)

1. **Central header builder** — single `buildGoogleApiHeaders(accessToken)` returns exclusively:
   - `Authorization: Bearer <token>`
   - `Content-Type: application/json`
   - `x-goog-user-project: buscommand-preview` from frozen `PROJECT` constant  
   No CLI / `process.env` / manifest / remote response / caller override for the quota project.
2. **Fail-closed assertion** — `assertUserProjectHeader(headers)` aborts before `fetch()` if header is missing, empty, wrong project, duplicated, or non-string. Case-insensitive header name; single semantic value must be byte-identical to `buscommand-preview`. Errors never print token or full headers.
3. **Both REST paths** — `raw()` and `rawSoft()` build + assert headers before every `fetchImpl` call (Firestore GET/batchGet/runQuery/begin/rollback/commit, Auth lookup, Auth delete, commit soft/uncertain path).
4. **Checkpoint** — `CHECKPOINT = "3D.4-B2C-CLEAN1-BR4"`.
5. **Offline tests N–T** — missing/wrong/correct header; dry-run + full-execute + rawSoft request audits; header immutability vs env/CLI/caller.

### Explicitly unchanged (BR3 contract)

- Exact 11 Firestore + 2 Auth allowlist
- `COMMIT_ARMED` / commit uncertainty / sticky state / exact inventory / retain digest
- Auth last; no `--resume-auth`
- Cleanup scope, paths, UIDs, state machine, transaction/delete order
- Frozen manifest SHA

---

## Offline proof

```text
node C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.test.mjs
→ TOTAL pass=39 fail=0
→ ALL_OFFLINE_FAIL_CLOSED_TESTS_PASS
→ EXECUTOR_SHA256=8a90f6b17370589bbe3a6c8c10279920ea1a36cb32acfa1b4d96ecc569e3a5ba
```

### New header tests

| Test | Contract |
|------|----------|
| **N** | Missing user-project → assertion abort; no fetch |
| **O** | Wrong project (`blaguss` / other) offline object → abort before fetch |
| **P** | Exact `buscommand-preview` passes |
| **Q** | Dry-run: every mocked Firestore + Auth lookup request has exact header |
| **R** | Full execute: begin/batchGet/runQuery/commit/post-check/Auth lookup/Auth delete have exact header |
| **S** | rawSoft: commit soft + both Auth deletes keep exact header even on transport/5xx failures |
| **T** | Caller/env/CLI cannot change project header (frozen `PROJECT` only) |

Test failure output records Authorization **presence** only — never the Bearer value.

---

## Static safety audit

| Check | Result |
|--------|--------|
| Exactly one `buildGoogleApiHeaders` | **PASS** (1 definition) |
| `x-goog-user-project` set only via builder (`USER_PROJECT_HEADER` + `PROJECT`) | **PASS** |
| No second hard-coded project header value elsewhere | **PASS** |
| No header override argument on builder | **PASS** (token-only arity) |
| No `process.env` quota/user-project source | **PASS** (`process.env` absent in executor) |
| Token not logged | **PASS** (console paths are status markers only) |
| DELETE allowlist unchanged (11 FS + 2 Auth) | **PASS** |
| Manifest SHA unchanged | **PASS** |
| All `fetchImpl` calls only inside `raw` / `rawSoft` | **PASS** |
| BLAGUSS still forbidden in candidates/paths | **PASS** (guard retained; no BLAGUSS live touch) |

### BR3 → BR4 diff classification

**Allowed / present:** header builder + assertion; use in `raw`/`rawSoft`; offline tests N–T; checkpoint/audit label.  
**Forbidden / absent:** cleanup scope, paths/UIDs, state machine, transaction/delete order, product source.

---

## Final confirmations

| Flag | Value |
|------|--------|
| LIVE_CALLS | **0** |
| IAM_CHANGES | **0** |
| FIRESTORE_WRITES | **0** |
| FIRESTORE_DELETES | **0** |
| AUTH_WRITES | **0** |
| AUTH_DELETES | **0** |
| PURGE_RETRY | **0** |
| SOURCE_CHANGES | **0** |
| BLAGUSS_TOUCHED | **0** |

---

## Explicitly not done

- Cloud Shell upload of BR4 executor
- Live dry-run / `--execute`
- IAM grants/revokes
- Screenshots / ZIP / product gates

---

## Owner next step (out of scope)

Separate owner order required before any Cloud Shell transfer or live dry-run/execute using the exact BR4 `executorSha256` recorded above.

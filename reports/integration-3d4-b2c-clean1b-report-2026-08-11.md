# Integration 3D.4 — B2C-CLEAN1-B / IAM1 Final Attempt

**Datum:** 2026-08-11  
**Checkpoint:** `3D.4-B2C-CLEAN1-B-IAM1`  
**Executor SHA-256:** `62a08c8598d9163ec0f9a75d5999bf4e6246140b95d01067db30901cc96191e5`  
**Frozen manifest SHA:** `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da`  
**Project / tenant / run:** `buscommand-preview` / `buscommand-staging-qa-no-real-data` / `BC-STG-B2C-20260811-5432cb`

---

## Verdict

**BLOCKED PRE-MUTATION**

Temporary conditional `roles/firebaseauth.admin` was granted, Auth lookup stayed **HTTP 403** for the full 5-minute propagation window, dry-run/execute were **not** started, and the task-created IAM binding was **removed**.

| Item | Result |
|------|--------|
| Firestore deletes | **0** |
| Auth deletes | **0** |
| begin / commit | **0** |
| Dry-run | not invoked (probe failed) |
| Execute | not invoked |
| IAM_ADDED | **1** |
| IAM_REMOVED | **1** |
| CRITICAL IAM REVOCATION | **no** (revoke OK) |

---

## Attempt timeline

### Prior CLEAN1-B (same day)
Live dry-run reached `ADMIN_READ_PROBE_OK` then failed Auth prevalidation with `REST_AUTHZ` / HTTP 403. State left as `BLOCKED` (no sentinels).

### IAM1
1. **Identity preflight (redacted):** 1 active user principal; project `buscommand-preview`; token OK. Email not logged.
2. **Executor freeze:** SHA match; manifest QA-only; state `BLOCKED`; `.ARMED`/`.MUTATED` absent.
3. **IAM collision:** `IAM_PREEXISTING=false`.
4. **Grant:** single conditional binding `roles/firebaseauth.admin`, title `clean1b-iam1-20260811`, expires `2026-08-11T18:39:09Z`. No Owner/Editor. No unconditional fallback.
5. **Revoke trap:** installed for EXIT/INT/TERM.
6. **Auth probe:** `AUTH_LOOKUP_HTTP=403` for 300s → `PROPAGATION_TIMEOUT` / `BLOCKED_PRE_MUTATION`.
7. **Stop before dry-run/execute** per contract.
8. **IAM revoke:** `IAM_REMOVED=1` / `REVOKE_OK`; helper state + helper files cleaned.
9. **Evidence:** Cloud Shell `execution-state.json` retained (`BLOCKED`); sentinels absent.

---

## IAM verdict (required)

| Field | Value |
|-------|--------|
| IAM_PREEXISTING | false |
| IAM_ADDED | 1 |
| IAM_REMOVED | 1 |
| Role | `roles/firebaseauth.admin` only |
| Condition | 60-minute expiry (title `clean1b-iam1-20260811`) |
| Member identity in reports | **not disclosed** |
| Residual task binding | none (verify via revoke OK) |

---

## Interpretation (non-prescriptive)

User OAuth + conditional Firebase Auth Admin was insufficient for Identity Toolkit `accounts:lookup` within 5 minutes (persistent 403). Unconditional binding was **not** attempted (forbidden by this order). Purge remains unexecuted.

---

## Safety confirmation

| Check | Result |
|-------|--------|
| HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` unchanged |
| Staged | **0** |
| Source / rules / indexes | unchanged |
| New Admin key | none |
| Render secret access | none |
| Commit / push / PR / deploy / workflow | none |
| BLAGUSS | untouched |
| Console manual delete | none |
| B2C-02 UI fix | not started |
| B2C-03 product hard-delete | still open (cleanup residue removed only on PASS — not claimed) |

---

## Local artifacts

- `reports/integration-3d4-b2c-clean1b-execution-ledger.json`
- `reports/integration-3d4-b2c-clean1b-change-ledger.md`
- `reports/integration-3d4-b2c-clean1b-logs/dry-run-log-redacted.txt`
- `reports/integration-3d4-b2c-clean1b-logs/iam1-log-redacted.txt`

Cloud Shell retained for reconciliation: `$HOME/clean1b/evidence/execution-state.json` (`phase=BLOCKED`).

---

## Owner next step

New order required. Do not resume from PARTIAL/COMMIT (none present). Do not use Console deletes. Any further Auth privilege approach must be explicitly owner-scoped (this order limited to conditional `firebaseauth.admin` only).

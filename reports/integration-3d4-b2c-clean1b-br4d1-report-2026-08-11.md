# Integration 3D.4 — B2C-CLEAN1-B-BR4-D1 Read-only Cloud Shell Dry-run

**Datum:** 2026-08-11  
**Checkpoint:** `3D.4-B2C-CLEAN1-BR4-D1`  
**Mode:** READ-ONLY (no `--execute`)  
**Project:** `buscommand-preview`  
**Tenant:** `buscommand-staging-qa-no-real-data`  
**Run:** `BC-STG-B2C-20260811-5432cb`

---

## Verdict

**BLOCKED_DRY_RUN**

- All three IAM permissions confirmed (`PERM_GATE_PASS`, HTTP 200)
- Frozen dry-run **did not** reach `DRY_RUN_PASS`
- Fail-closed on content fingerprint after Auth prevalidation
- Mutations: **0**

---

## Why blocked

After:

- `PROJECT_OK`
- `MANIFEST_HASH_OK`
- `DELETE_FS_COUNT=11`
- `DELETE_AUTH_COUNT=2`
- `BLAGUSS_CANDIDATES=0`
- `ADMIN_READ_PROBE_OK`
- `AUTH_PREVALIDATION_OK`

Executor aborted:

```text
FATAL: fingerprint field missing DEL-SHIFT-2026-08-11.dutyName
EXIT=2
```

State:

| Field | Value |
|-------|--------|
| phase | `BLOCKED` |
| mode | `DRY_RUN` |
| errorCode | `FINGERPRINT` |
| executorSha256 | `8a90f6b17370589bbe3a6c8c10279920ea1a36cb32acfa1b4d96ecc569e3a5ba` |
| manifestSha256 | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |
| `.ARMED` | absent |
| `.MUTATED` | absent |

Interpretation: live DELETE candidate shift `DEL-SHIFT-2026-08-11` is missing fingerprint field `dutyName` expected by the frozen manifest. Header/auth path worked; cleanup did **not** proceed.

---

## Preflight

| Check | Result |
|-------|--------|
| Active project | `buscommand-preview` |
| Active Cloud Shell account | present (email not logged) |
| IAM1 titled binding `clean1b-iam1-20260811` | **ABSENT** |
| Executor path | `$HOME/clean1b/input/purge-rest.mjs` |
| Executor SHA-256 | `8a90f6b17370589bbe3a6c8c10279920ea1a36cb32acfa1b4d96ecc569e3a5ba` |
| Frozen manifest | `$HOME/clean1b/input/integration-3d4-b2c-clean1a1-purge-manifest.json` |
| Manifest SHA | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |

---

## Permission gate (read-only)

Request: `projects/buscommand-preview:testIamPermissions`  
Header: `x-goog-user-project: buscommand-preview`  
Token: used, **not** logged

| Item | Value |
|------|--------|
| HTTP status | **200** |
| Returned permissions | `firebaseauth.users.delete`, `firebaseauth.users.get`, `serviceusage.services.use` |
| Gate | **PASS** (exact three) |

Visual: `reports/integration-3d4-b2c-clean1b-br4d1-visual/01-perm-gate-pass.png`

---

## Fresh D1 state

| Item | Value |
|------|--------|
| State path | `$HOME/clean1b/evidence/br4d1/execution-state.json` |
| Pre-dry-run | nonexistent (fresh) |
| Prior BLOCKED state | not reused / not overwritten |
| Pre-check `.ARMED` / `.MUTATED` | absent |

---

## Frozen dry-run (no `--execute`)

Command shape:

```text
node purge-rest.mjs \
  --manifest <frozen-manifest> \
  --manifest-sha d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da \
  --state $HOME/clean1b/evidence/br4d1/execution-state.json
```

### Markers observed

| Marker | Seen |
|--------|------|
| PROJECT_OK | yes |
| MANIFEST_HASH_OK | yes |
| DELETE_FS_COUNT=11 | yes |
| DELETE_AUTH_COUNT=2 | yes |
| BLAGUSS_CANDIDATES=0 | yes |
| ADMIN_READ_PROBE_OK | yes |
| AUTH_PREVALIDATION_OK | yes |
| DELETE_DOCS_LIVE_OK | **no** |
| VERIFY_ABSENT_OK | **no** |
| BASELINE_COUNTS_OK 2/0/1/1 | **no** |
| RETAIN_OK | **no** |
| COMMIT_BODY_OK | **no** |
| DRY_RUN_PASS | **no** |
| EXIT | **2** |

### Mutation confirmations

| Gate | Value |
|------|--------|
| beginTransaction | **0** |
| commit | **0** |
| Firestore writes/deletes | **0** |
| Auth writes/deletes | **0** |
| `.ARMED` | absent |
| `.MUTATED` | absent |
| BLAGUSS touched | **0** |
| `--execute` | **not run** |

Visual: `reports/integration-3d4-b2c-clean1b-br4d1-visual/02-dry-run-blocked-fingerprint.png`

---

## Final confirmations

| Flag | Value |
|------|--------|
| LIVE_CALLS | read-only only (`testIamPermissions` + dry-run reads) |
| IAM_CHANGES | **0** |
| FIRESTORE_WRITES | **0** |
| FIRESTORE_DELETES | **0** |
| AUTH_WRITES | **0** |
| AUTH_DELETES | **0** |
| PURGE_RETRY | **0** |
| SOURCE_CHANGES | **0** |
| BLAGUSS_TOUCHED | **0** |

---

## Artifacts

- `reports/integration-3d4-b2c-clean1b-br4d1-report-2026-08-11.md`
- `reports/integration-3d4-b2c-clean1b-br4d1-change-ledger.md`
- `reports/integration-3d4-b2c-clean1b-br4d1-logs/dry-run-log-redacted.txt`
- `reports/integration-3d4-b2c-clean1b-br4d1-logs/perm-result-redacted.txt`
- `reports/integration-3d4-b2c-clean1b-br4d1-logs/execution-state-redacted.json`
- `reports/integration-3d4-b2c-clean1b-br4d1-visual/01-perm-gate-pass.png`
- `reports/integration-3d4-b2c-clean1b-br4d1-visual/02-dry-run-blocked-fingerprint.png`

Cloud Shell retained: `$HOME/clean1b/evidence/br4d1/`

---

## Explicitly not done

- `--execute`
- IAM changes
- Firestore / Auth mutations
- Product source / commit / push / deploy
- ZIP / product gates / B2C-02

## Owner next step (out of scope)

Separate order required to reconcile live shift fingerprint (`dutyName` on `DEL-SHIFT-2026-08-11`) vs frozen manifest, then re-run D1 dry-run. Do **not** execute purge until a green `DRY_RUN_PASS` on fresh state.

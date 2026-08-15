# Integration 3D.4 — B2C-CLEAN1-B-IAM2 Read-only Auth 403 Root-Cause

**Datum:** 2026-08-11  
**Mode:** STRICT READ-ONLY  
**Project:** `buscommand-preview`  
**Executor under inspection:** BR3 `purge-rest.mjs` SHA-256 `62a08c8598d9163ec0f9a75d5999bf4e6246140b95d01067db30901cc96191e5`

---

## Verdict

**A. PROVEN_MISSING_USER_PROJECT_HEADER**

Identity Toolkit `accounts:lookup` returned HTTP 403 during IAM1 primarily because the BR3 HTTP client sends user OAuth / ADC credentials **without** `x-goog-user-project: buscommand-preview`, so Google rejects the call as missing a **quota project** (`reason=SERVICE_DISABLED` on `identitytoolkit.googleapis.com`) — even though the API is enabled and Auth permissions can be present.

Differential proof (post-revoke, max 2 calls, no polling):

| Call | Header | HTTP | Sanitized reason |
|------|--------|------|------------------|
| A | no `x-goog-user-project` (executor shape) | **403** | `SERVICE_DISABLED` / quota project required |
| B | `x-goog-user-project: buscommand-preview` | **200** | success (no user payload logged) |

---

## Confirmations

| Gate | Value |
|------|-------|
| IAM_CHANGES | **0** |
| FIRESTORE_WRITES / DELETES | **0** |
| AUTH_WRITES / DELETES | **0** |
| PURGE_RETRY | **0** |
| SOURCE_CHANGES | **0** |
| BLAGUSS_TOUCHED | **0** |
| HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Staged | **0** |

---

## Preflight

| Check | Result |
|-------|--------|
| Active project | `buscommand-preview` |
| Active principal | 1 × **user** (email not logged) |
| Principal hash | `611964faa16f704c20b1bfbe80419ee9e7df94f79dfa5ff587c118c369a70116` |
| CLEAN1-B IAM1 titled binding | **absent** (`clean1b-iam1-20260811`) |
| IAM1 ledger | IAM_ADDED=1 / IAM_REMOVED=1 |
| State | `phase=BLOCKED`, `.ARMED`/`.MUTATED` absent |
| Executor SHA on Cloud Shell | match |

---

## Evidence matrix

| Finding | Evidence | Confidence | Minimal future correction | New authority required |
|---------|----------|------------|---------------------------|------------------------|
| Missing quota / user-project header | Executor `createHttpClient` sets only `Authorization` + `Content-Type`; no `x-goog-user-project`. Live A=403 `SERVICE_DISABLED` + quota-project message; B=200 with header. | **High** | Add `x-goog-user-project: buscommand-preview` (and/or equivalent quota-project wiring) to BR3 Auth (and likely all) REST calls; re-run offline tests then owner-ordered dry-run. | New owner code-change + purge order (not IAM2). |
| `roles/firebaseauth.admin` lacks `serviceusage.services.use` | `gcloud iam roles describe` + [GCP IAM docs](https://cloud.google.com/iam/docs/roles-permissions/firebaseauth) (accessed 2026-08-11): get/delete users **true**; `serviceusage.services.use` **false**. | High (role fact) | May need quota-project header *and/or* a principal that can use Service Usage; **not** proven as sole IAM1 failure because B succeeded without re-adding `firebaseauth.admin`. | Only if future attempt still fails after header fix. |
| API disabled | `identitytoolkit` / `serviceusage` / `firebase` = **ENABLED** | High against E | None | — |
| Token scope insufficient | `cloud-platform` **true**; identitytoolkit-specific scope false (expected under cloud-platform) | Medium against D | None for this failure mode | — |
| Firebaseauth permission deny during grant | Original IAM1 403 body **UNAVAILABLE**; audit logs **UNAVAILABLE**. Current post-revoke perms include firebaseauth get/delete **true** (other role(s)). | Low for C during grant window | Do not treat C as proven | — |
| IAM propagation / member mismatch | Titled binding removed; A/B differential is header/quota, not grant lag | Low for F | — | — |

---

## Detail notes

### Preserved IAM1 body
`ORIGINAL_403_BODY=UNAVAILABLE` in Cloud Shell temp/evidence. Sanitized matrix above substitutes as live proof of the same client shape.

### Role capability (`roles/firebaseauth.admin`)
Includes `firebaseauth.users.get` and `firebaseauth.users.delete`. Does **not** include `serviceusage.services.use` (16 included permissions from describe).

### Current caller permissions
Marked **POST_REVOKE** — not a reconstruction of the IAM1 grant window.

### Executor headers (code)
```718:726:C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\purge-rest.mjs
export function createHttpClient({ fetchImpl, tokenFn }) {
  ...
    const headers = {
      Authorization: `Bearer ${tokenFn()}`,
      "Content-Type": "application/json"
    };
```
No `x-goog-user-project`.

### Audit
`AUTH_AUDIT_EVENT=UNAVAILABLE` (logging read empty/denied; no principal emails attempted).

---

## Explicitly not done

- IAM add/remove/update  
- API enable  
- Executor code change  
- Dry-run / execute / purge retry  
- Admin key / Render secret  
- B2C-02 UI fix  
- Screenshots with identities/tokens  

---

## Artifacts

- `reports/integration-3d4-b2c-clean1b-iam2-report-2026-08-11.md`
- `reports/integration-3d4-b2c-clean1b-iam2-change-ledger.md`
- `reports/integration-3d4-b2c-clean1b-iam2-logs/diag-redacted.txt`

## External sources

| Source | URL | Accessed | Used for |
|--------|-----|----------|----------|
| Firebase Auth IAM roles | https://cloud.google.com/iam/docs/roles-permissions/firebaseauth | 2026-08-11 | Role permission set |

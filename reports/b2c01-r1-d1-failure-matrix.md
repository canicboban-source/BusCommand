# B2C-01-R1-D1 — Failure / concurrency matrix

Legend: **Today** = current product; **R1-target** = required behavior for future implementation (not built).

| # | Case | Today | R1-target action | Expected HTTP/UI | Retryable | Compensation | Audit |
|---|------|-------|------------------|------------------|-----------|--------------|-------|
| 1 | CA truly missing (no Firestore `company_admin`) | Manage account: empty text; no create | Allow Create missing CA | 201 + table shows CA after refresh | no (success) | n/a | `user_created` / dedicated `company_admin_created` |
| 2 | Active CA already exists | Reset/Disable shown; createUser still can mint **another** CA | Fail-closed; no Create CTA | 409/`CA_EXISTS`; no second account | no | none | deny or no write |
| 3 | Inactive CA exists | Listed as Disabled + Enable/Reset | **No** Create; Enable is recovery | UI: enable path only | n/a | n/a | activate audit if Enable |
| 4 | Auth-only orphan (Auth user, no Firestore CA) | Appears as “no admins”; createUser new email → second Auth+Firestore CA; same email → 409 | Fail-closed / inconsistent; no Create until resolved | UI: inconsistent; no CTA | ops only | optional link/repair (out of R1 UI) | no blind create |
| 5 | Firestore-only orphan (doc, Auth missing) | Shows admin; Reset may 404 | Fail-closed create; Reset/status handle Auth miss | Reset 404 today | Reset retry careful | no auto-create | status/reset audits |
| 6 | Two parallel create submits | Both can succeed (no uniqueness tx) | One success, one fail-closed | 201 + 409 | loser: no | winner Auth+FS; loser no partial | one `user_created` |
| 7 | Timeout before known outcome | Client unknown; may have written | Unknown UI; re-GET detail before retry | no fake success toast | only after GET confirms missing | none speculative | server audit if write committed |
| 8 | Auth success + Firestore fail | compensation deletes Auth (+FS if any); else `compensation-failed` | Same; surface generic error; no success | 500 | yes if still missing | Auth delete required | no success audit if rolled back |
| 9 | Refresh after failure | Pending memory lost; empty Manage account | Re-GET; Create only if still `missing` | empty or Create CTA | if missing | n/a | n/a |
| 10 | Success then repeat click | Second createUser can create duplicate CA today | Button single-flight; server fail-closed | 409 | no | none | one create |
| 11 | Company deleted/suspended between open and Save | createUser: missing → 404; suspended not blocked for create today | Fail-closed if not operable | 404 / 403 license | no | none | deny |
| 12 | SA session/role expired | 401/403 | Same; re-login; no silent local write | 401/403 UI | after re-auth | none | none |

## State → Create CTA (R1-target)

| Server truth | Create missing CA CTA | Notes |
|--------------|----------------------|-------|
| `missing` | yes | only after successful GET detail |
| `present_active` | no | Reset/Disable |
| `present_inactive` | no | Enable |
| `inconsistent` (Auth/FS mismatch) | no | fail-closed message |
| `unknown` (GET error) | no | error banner; keep prior UI honest |

## Forbidden recovery inputs (R1 contract)

- localStorage/sessionStorage pending CA / password  
- URL/query credentials  
- browser-session assumption after refresh  
- re-calling `createCompany`  
- treating generic company 409 as “missing CA”  
- Create when state not positively `missing`

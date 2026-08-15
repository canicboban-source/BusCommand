# CLEAN1-B / IAM1 change ledger — 2026-08-11

## Product / source

- **No product source changes**
- **No rules/indexes changes**
- **No commit / push / PR / deploy**

## Cloud IAM (temporary, revoked)

| Action | Detail |
|--------|--------|
| Added | conditional `roles/firebaseauth.admin` on `buscommand-preview` (title `clean1b-iam1-20260811`, 60m expiry) |
| Removed | exact same binding after probe BLOCKED |
| Preexisting Auth Admin | none for active principal |
| Member identity in ledger | redacted / not printed |

## Runtime evidence

| Path | Action |
|------|--------|
| Cloud Shell `$HOME/clean1b/evidence/execution-state.json` | retained `BLOCKED` (no sentinel) |
| Cloud Shell IAM helper / `.iam1-binding.json` | removed after revoke |
| `reports/integration-3d4-b2c-clean1b-report-2026-08-11.md` | updated verdict |
| `reports/integration-3d4-b2c-clean1b-execution-ledger.json` | updated |
| `reports/integration-3d4-b2c-clean1b-logs/iam1-log-redacted.txt` | added |

## Mutations

- Firestore DELETE: **0**
- Auth DELETE: **0**

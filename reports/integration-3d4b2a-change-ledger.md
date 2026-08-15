# 3D.4-B2A Change Ledger

**Verdict:** PASS

| Area | Change |
|------|--------|
| Firebase `buscommand-preview` / `(default)` | Rules-only deploy of `firestore.rules` from `80bd34b…` |
| Active ruleset | New release `a6c1353f-7429-466d-8c76-2f74b13b7559` at `2026-08-10T20:25:06.593454Z` |
| Firestore indexes | **unchanged** (1 composite on `shifts`) |
| Render | **none** (deploy count remains 1 failed) |
| Auth / IAM / env | **none** |
| Git / source | **none** |
| Reports | `reports/integration-3d4b2a-*` evidence only |

### Command executed (once)

```text
firebase deploy --only firestore:rules --project buscommand-preview --non-interactive
```

EXIT 0 — compiled + released to Cloud Firestore.

### Rollback

Not executed (not required).

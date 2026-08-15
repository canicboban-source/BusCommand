# 3D.4-B1R Change Ledger

**Verdict:** PASS

| Area | Change |
|------|--------|
| Firebase Admin SDK | Generated **exactly one** new private key on existing SA for `buscommand-preview` |
| Render Environment `srv-d9t2ek6417fc7391958g` | Populated required staging env vars; **Save only** |
| Firebase Auth Authorized Domains | Added `buscommand-preview-staging.onrender.com` (once) |
| Local Downloads | Deleted the single new Admin JSON after successful Save |
| Render Deploy | **none** (count remained 1 failed) |
| Firebase Rules/indexes/Firestore | **none** |
| Git/source/GitHub | **none** |
| Reports | `reports/integration-3d4b1r-*` evidence only |

### Not changed

- Production Render services / domains / Firebase production project
- Blueprint Auto Sync (remains No)
- Service Auto Deploy (remains Off)
- Sign-in providers, users, email templates, OAuth, Identity Platform

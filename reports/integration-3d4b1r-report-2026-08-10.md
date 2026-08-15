# Integration Checkpoint 3D.4-B1R — Firebase Preview Credential Setup + Render Save Only + Auth Domain

**Datum:** 2026-08-10  
**Verdict:** **PASS**

---

## Identity

| Item | Value | Result |
|------|-------|--------|
| Git HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` | MATCH |
| Branch | `staging/phase-3-isolation` | MATCH |
| Staged | 0 | MATCH |
| Source dirty | 0 | MATCH |
| Render service | `buscommand-preview-staging` / `srv-d9t2ek6417fc7391958g` | MATCH |
| Blueprint | `buscommand-preview-staging` / `exs-d9t2co6gekts73ckic8g` | MATCH |
| Origin | `https://buscommand-preview-staging.onrender.com` | MATCH |
| Firebase project | `buscommand-preview` | MATCH |
| Auto Sync | No (Sync paused) | MATCH |
| Auto Deploy | Off | MATCH |

---

## Web App

- `WEB_APP_EXISTS=true` (BusCommand Preview Web)
- Existing Web App used — **no new Web App created**
- `VITE_PROJECT_MATCH=true` (projectId `buscommand-preview`)
- Config values **not** written into evidence

---

## Admin credential

- New private key generated: **1** (exactly one Confirm click)
- Existing Firebase Admin SDK service account used — **no new SA / IAM**
- `ADMIN_PROJECT_MATCH=true`
- `NEW_KEY_COUNT=1`
- Local download deleted after Save only: `LOCAL_KEY_DELETED=true`
- File was outside repo; not in git status

---

## Render Environment (Save only)

| Name | Status |
|------|--------|
| BUSCOMMAND_ENV | PRESENT (`staging`) |
| APP_PUBLIC_URL | PRESENT (exact staging origin) |
| CORS_ORIGINS | PRESENT (byte-identical to APP_PUBLIC_URL) |
| NODE_ENV | PRESENT (`production` runtime flag from `render.staging.yaml`) |
| NODE_VERSION | PRESENT (`22.14.0`) |
| FIREBASE_SERVICE_ACCOUNT_JSON | PRESENT (masked in evidence) |
| VITE_FIREBASE_API_KEY | PRESENT (masked in evidence) |
| VITE_FIREBASE_AUTH_DOMAIN | PRESENT |
| VITE_FIREBASE_PROJECT_ID | PRESENT (`buscommand-preview`) |
| VITE_FIREBASE_STORAGE_BUCKET | PRESENT (console literal) |
| VITE_FIREBASE_MESSAGING_SENDER_ID | PRESENT (masked in evidence) |
| VITE_FIREBASE_APP_ID | PRESENT (masked in evidence) |
| BUSCOMMAND_QA_HARNESS | **ABSENT** |

Save action: **Save only** (not Save and deploy).  
Deploy count pre/post: **1 / 1** (failed fail-fast; no new deploy).  
Service remains not healthy (expected until 3D.4-B2).

---

## Firebase Authorized Domain

- Hostname added: `buscommand-preview-staging.onrender.com`
- Status: **ADDED** (present exactly once)
- No Rules/indexes/Firestore/provider/user changes
- Existing domains left untouched

---

## Confirmations

- no Rules deploy
- no app deploy / no new deploy
- no source change
- no commit / push / PR / workflow
- no Phase 4
- no production service/project mutation
- no secrets in report artefacts / visual evidence files

---

## Visual / logs

- `reports/integration-3d4b1r-visual/`
- `reports/integration-3d4b1r-logs/`

**STOP** after 3D.4-B1R.

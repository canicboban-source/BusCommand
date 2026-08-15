# Integration Checkpoint 3D.4-B1 — Staging Env Save-Only + Firebase Authorized Domain

**Datum:** 2026-08-10  
**Verdict:** **BLOCKED**

**Reason:** Required credential / web-config values are not available in local ignored `.env` for safe transfer. Per contract: pause, list missing **names only**, do not Save, do not request secrets via chat.

---

## Preflight — PASS (Render identity)

| Check | Result |
|-------|--------|
| Service ID | `srv-d9t2ek6417fc7391958g` MATCH |
| Blueprint ID | `exs-d9t2co6gekts73ckic8g` MATCH |
| Origin | `https://buscommand-preview-staging.onrender.com` MATCH |
| Branch | `staging/phase-3-isolation` MATCH |
| Commit | `80bd34b…` MATCH |
| Auto Sync | **No** (Sync paused) MATCH |
| Auto Deploy | **Off** MATCH |
| Deploy count | **1** (failed Blueprint deploy) MATCH |
| App healthy | **no** MATCH |
| Git HEAD / staged / source dirty | `80bd34b…` / 0 / 0 |
| Firebase Console opened this phase | **no** (stopped before Auth domain step) |

---

## Env inventory (names only)

Sources checked: `render.staging.yaml`, `.env.example` / code, 3D.3 matrix, local ignored `.env` (presence/project match only — **no values printed**).

| Name | In Blueprint | Local `.env` | Notes |
|------|--------------|--------------|-------|
| `BUSCOMMAND_ENV` | PRESENT | MISSING | Non-secret target = `staging` (not saved) |
| `APP_PUBLIC_URL` | PRESENT | PRESENT* | Must be exact staging origin (not saved) |
| `CORS_ORIGINS` | PRESENT | MISSING | Must equal `APP_PUBLIC_URL` (not saved) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | PRESENT | **MISSING** | **BLOCKER** — `ADMIN_PROJECT_MATCH=false` |
| `VITE_FIREBASE_API_KEY` | PRESENT | **MISSING** | Example file has public config PRESENT |
| `VITE_FIREBASE_AUTH_DOMAIN` | PRESENT | **MISSING** | Example MATCH `buscommand-preview…` |
| `VITE_FIREBASE_PROJECT_ID` | PRESENT | **MISSING** | Example MATCH `buscommand-preview` |
| `VITE_FIREBASE_STORAGE_BUCKET` | PRESENT | **MISSING** | Example MATCH |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | PRESENT | **MISSING** | Example PRESENT |
| `VITE_FIREBASE_APP_ID` | PRESENT | **MISSING** | Example PRESENT |
| `BUSCOMMAND_QA_HARNESS` | absent in Blueprint | absent | Must remain absent |

\* Local `.env` has some `APP_PUBLIC_URL` entry present; value not validated/printed; staging origin would be set explicitly on next approved fill.

### Project identity (local transfer path)

| Check | Result |
|-------|--------|
| `ADMIN_PROJECT_MATCH` | **false** (no Admin JSON in `.env`) |
| `VITE_PROJECT_MATCH` (from `.env`) | **false** (missing) |
| `VITE_*` in `.env.example` project MATCH | **true** (public example only; not transferred this phase) |

---

## Missing fields for owner (names only — enter in Render Environment UI)

Owner must enter **directly in Render dashboard** (not via chat):

1. `FIREBASE_SERVICE_ACCOUNT_JSON` — Admin SA for **`buscommand-preview` only**  
2. `VITE_FIREBASE_API_KEY`  
3. `VITE_FIREBASE_AUTH_DOMAIN`  
4. `VITE_FIREBASE_PROJECT_ID`  
5. `VITE_FIREBASE_STORAGE_BUCKET`  
6. `VITE_FIREBASE_MESSAGING_SENDER_ID`  
7. `VITE_FIREBASE_APP_ID`  

Also set (non-secret, agent can do on resume once credentials exist):

- `BUSCOMMAND_ENV` = `staging`  
- `APP_PUBLIC_URL` = `https://buscommand-preview-staging.onrender.com`  
- `CORS_ORIGINS` = `https://buscommand-preview-staging.onrender.com`  

Save with **Save only** only. Then Auth domain: `buscommand-preview-staging.onrender.com`.

---

## Actions NOT executed (by design)

| Action | Status |
|--------|--------|
| Render Environment Save / Save only | **NOT EXECUTED** |
| Manual Deploy / Retry / Restart / Blueprint Sync | **NOT EXECUTED** |
| Firebase Authorized Domain add | **NOT EXECUTED** |
| Rules/indexes deploy | **NOT EXECUTED** |
| Source/git/workflow | **NOT EXECUTED** |

Deploy count remains **1**. No secrets in evidence.

---

## Visual

| Asset | Content |
|-------|---------|
| `01-service-identity-origin.png` | service ID + origin |
| `03-deploy-list-still-one.png` | Deploy 1 only |
| `05-auto-sync-no-auto-deploy-off.png` | Blueprint Auto Sync No / Sync paused |
| Env fill / Firebase Auth screens | **unavailable** (blocked before Save) |

---

## Confirmations

- no Rules deploy  
- no app deploy  
- no source change  
- no commit / push / PR / workflow  
- no Phase 4  
- no secrets printed  
- no production touch  

**STOP.** Resume 3D.4-B1 after owner places missing fields in Render (or provides them only inside the dashboard), then Save only + Auth domain.

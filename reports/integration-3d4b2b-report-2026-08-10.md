# Integration Checkpoint 3D.4-B2B — Manual Render Deploy Exact Commit + Infrastructure Smoke

**Datum:** 2026-08-10  
**Verdict:** **PASS**

---

## Identity

| Item | Value | Result |
|------|-------|--------|
| Branch | `staging/phase-3-isolation` | MATCH |
| Exact commit | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` | MATCH |
| Local HEAD = remote staging | `80bd34b…` | MATCH |
| Staged / source dirty | 0 / 0 | MATCH |
| Remote CI `31418767332` | success on `80bd34b…` | MATCH |
| Open PRs | 0 | MATCH |
| main | `1875d015586f5ddb981591fc9974daa23805b4f7` (unchanged) | MATCH |
| Blueprint | `buscommand-preview-staging` / `exs-d9t2co6gekts73ckic8g` | MATCH |
| Service | `buscommand-preview-staging` / `srv-d9t2ek6417fc7391958g` | MATCH |
| Origin | `https://buscommand-preview-staging.onrender.com` | MATCH |
| Firebase project | `buscommand-preview` | MATCH |
| Active ruleset (pre/post) | `a6c1353f-7429-466d-8c76-2f74b13b7559` (UI: Today, 10:25:05 pm Active) | MATCH |
| Auth domain staging | `buscommand-preview-staging.onrender.com` present | MATCH |
| Auto Sync / Auto Deploy | No (Sync paused) / Off | MATCH |
| Deploy count | pre **1** failed → post **2** (1 Live + prior failed) | MATCH |

---

## NEXT MUTATION (issued before click)

Manual Render deploy of exact commit `80bd34bdd85e07bea23cb9bc52793c72e3b31660` to `buscommand-preview-staging` only.  
Staging URL becomes publicly reachable. No Firebase data or production resource changed.

---

## Manual deploy

| Field | Value |
|-------|-------|
| Method | Dashboard → Manual Deploy → **Deploy a specific commit** (not latest / not clear-cache / not restart / not Blueprint sync) |
| Commit selected | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Clicks | **Deploy Commit** exactly once |
| Deployment ID | `dep-d9t3j7n40ujc73crrgl0` |
| Start | 2026-08-10 ~22:50 local / manually triggered via Dashboard |
| Live | 2026-08-10 ~22:51 local — “Your service is live” |
| Final status | **Live** |
| Retry | none |

Build/runtime signals observed (redacted):

- Build successful; dist present
- Safe startup: `mode=PREVIEW`, `runtimeEnv=staging`, `corsOriginCount=1`
- Listens on Render PORT
- Firebase isolation check passed
- No QA harness signal
- No cron/SMS outbound observed in this deploy log review

---

## Infrastructure smoke

### Health — PASS

`GET https://buscommand-preview-staging.onrender.com/api/health`

- HTTP **200**
- Body exactly `{"ok":true}`
- `Cache-Control: no-store`
- No company/user/Firebase/credential fields
- No redirect to production

### Static surfaces — PASS

| Path | Status | Content-Type |
|------|--------|--------------|
| `/` | 200 | text/html |
| `/staff.html` | 200 | text/html |
| `/staff` | 200 | text/html |
| `/driver.html` | 200 | text/html |
| `/driver` | 200 | text/html |

Local `/assets/*` JS/CSS referenced by `staff.html`: all **200**.  
CDN leaflet + Firebase compat scripts: all **200**.  
No redirect to `buscommand.com`.  
`/staff.html` shows unauthenticated Staff login surface — **no login attempted**.

### Plan-import lazy chunk — PASS

| Check | Result |
|-------|--------|
| Chunk from this build | `plan-import-BiDaB7PS.js` |
| Not `modulepreload` in `staff.html` | true |
| `GET /assets/plan-import-BiDaB7PS.js` | 200, `application/javascript` |
| Secret / sourceMappingURL in chunk | false / false |
| Import UI activated | **no** (login forbidden) |

### CORS matrix — PASS

Endpoint: `GET|OPTIONS /api/health` only.

| Origin | Method | Status | ACAO |
|--------|--------|--------|------|
| `https://buscommand-preview-staging.onrender.com` | GET | 200 | exact staging origin |
| `https://buscommand.com` | GET | 403 | absent |
| `https://example.invalid` | GET | 403 | absent |
| staging | OPTIONS | 204 | exact staging origin |
| production | OPTIONS | 403 | absent |
| foreign | OPTIONS | 403 | absent |

Never `*`. No protective suspend required.

### Log security — PASS

| Signal | Value |
|--------|-------|
| `SECRET_LEAK_SCAN` | **PASS** |
| `RUNTIME_PROJECT_MATCH` | **true** (buscommand-preview / PREVIEW+staging) |
| `QA_HARNESS_PRESENT` | **false** |

No private_key / service-account JSON / API token / env dump / EID / production URL observed in reviewed deploy logs.

---

## Post-check

| Area | Result |
|------|--------|
| Render Live + commit `80bd34b` | YES |
| Deploy count | **2** |
| Auto Sync / Auto Deploy | No / Off |
| Extra deploy | none |
| Firebase Rules release | still active B2A ruleset (`a6c1353f…` / Today 10:25:05 pm) |
| Auth domain | untouched (staging host still present) |
| Firebase Rules/indexes/Auth/data mutation during B2B | none |
| Git HEAD / staged / source dirty | `80bd34b…` / 0 / 0 |
| commit/push/PR/workflow | none |
| Suspension | **not required** |

---

## Confirmations

- no login / no Auth user creation  
- no Firestore mutation  
- no Firebase deploy (rules/indexes/Auth/env)  
- no source/commit/push/PR/workflow  
- no production change  
- no Phase 4  
- no deploy retry / clear-build-cache / Blueprint sync  

---

## Artefacts

- `reports/integration-3d4b2b-report-2026-08-10.md`
- `reports/integration-3d4b2b-change-ledger.md`
- `reports/integration-3d4b2b-logs/`
- `reports/integration-3d4b2b-visual/`

**STOP** after 3D.4-B2B.

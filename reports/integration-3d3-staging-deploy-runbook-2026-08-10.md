# 3D.3 — Staging Deploy Runbook (FUTURE OWNER APPROVAL ONLY)

**Approved code SHA to deploy later:** `80bd34bdd85e07bea23cb9bc52793c72e3b31660`  
**Branch:** `staging/phase-3-isolation`  
**Firebase project:** `buscommand-preview` (TEST-ONLY)  
**Planned Render service:** `buscommand-preview-staging`  
**This document does not authorize execution.** Every command below is:

`NOT EXECUTED — FUTURE OWNER APPROVAL REQUIRED`

---

## Bootstrap problem (must solve without weakening fail-fast)

| Fact | Implication |
|------|-------------|
| `APP_PUBLIC_URL` + matching `CORS_ORIGINS` required before listen in real staging | Cannot leave empty on a healthy deploy |
| Real HTTPS origin unknown until Render assigns it | Must not hardcode / assume any `*.onrender.com` name |
| Render Blueprint “Deploy Blueprint” **provisions** the web service ([Render Blueprints IaC](https://render.com/docs/infrastructure-as-code), accessed 2026-08-10) | First sync creates the service; `autoDeployTrigger: "off"` stops **git auto-deploys**, not the initial Blueprint provision action |
| `sync: false` vars are prompted at initial Blueprint creation ([blueprint-spec](https://render.com/docs/blueprint-spec)) | Owner can set secrets at create time; URL may still be unknown until service exists |

### Safe bootstrap sequence (CONTROLLED)

1. Create a **new** Blueprint bound to `render.staging.yaml` + branch `staging/phase-3-isolation`.  
   Set Blueprint **Auto Sync = No** ([Disabling automatic sync](https://render.com/docs/infrastructure-as-code#disabling-automatic-sync)).  
2. On first **Deploy Blueprint**, Render creates `buscommand-preview-staging` and prompts for `sync: false` values.  
3. Fill immediately: `FIREBASE_SERVICE_ACCOUNT_JSON` (`project_id=buscommand-preview`), all `VITE_FIREBASE_*` for that project.  
4. If assigned public URL is **not yet visible** at prompt time:  
   - Leave `APP_PUBLIC_URL` / `CORS_ORIGINS` unset or intentionally incomplete → **expect first deploy/start to fail fail-fast** (`staging-app-public-url-*` or CORS empty).  
   - Mark this as **CONTROLLED BOOTSTRAP EVENT**, not a product bug.  
5. After service exists, copy the **actual** assigned origin from Render (exact `https://…`, no path).  
6. Set **both** `APP_PUBLIC_URL` and `CORS_ORIGINS` to that **same** origin.  
7. Add Firebase Auth authorized domain = hostname only (no scheme) — see Firebase section.  
8. Manual Deploy of SHA `80bd34b…` → expect healthy listen + `/api/health` `{ok:true}`.

**Forbidden:** set `BUSCOMMAND_QA_HARNESS=1` to “get green”; invent URL; use `buscommand.com`; touch production Blueprint/`render.yaml`.

---

## Rules vs server order (from code, not assumption)

| Order | Compatibility | Risk |
|-------|---------------|------|
| **A. Firestore Rules/indexes → then Render server** (recommended for staging) | Admin SDK ignores Rules; browser deny on `companies/{id}/ops/{opsId}` (includes `driver_identity_guard`) hardens client before UI traffic | Brief window where old browser clients against new Rules see tighter denies (desired). Index build may be async. |
| **B. Render server → then Rules** | Server Admin writes to guard still work; browser Rules still old until deploy | Window where browser might still read/write paths that new Rules would deny — **worse for privacy** on a shared test project with any residual clients |
| **C. Mixed old/new** | Explicitly called out in prior 3D.1 notes | Avoid |

**Conclusion from `firestore.rules` + `server/driver-identity-guard.js`:** guard is lazy server-only; no batch migration. Prefer **Rules/indexes first**, then successful Render deploy. No data migration step required for empty/lazy guard docs.

---

## Numbered deploy steps (future)

### 0) Final identity check

| | |
|--|--|
| Who | Cursor/CLI read-only + owner confirm |
| Expected | Staging SHA = `80bd34b…`; main/checkpoint unchanged; no PR |
| Proof | `git ls-remote` + `gh pr list` |
| STOP | Any SHA drift |
| Rollback | N/A (no change yet) |

```text
# NOT EXECUTED — FUTURE OWNER APPROVAL REQUIRED
git fetch origin
git rev-parse origin/staging/phase-3-isolation
git ls-remote origin refs/heads/main
git ls-remote origin refs/heads/checkpoint/phases-0-3-d2421a1
gh pr list --head staging/phase-3-isolation
```

### 1) Render Blueprint create (separate from production)

| | |
|--|--|
| Who | **Owner / Render Dashboard** |
| Expected | New Blueprint; path `render.staging.yaml`; branch `staging/phase-3-isolation`; Auto Sync **No**; service name `buscommand-preview-staging`; no cron |
| Proof | Dashboard screenshots (redacted); service list shows planned web only |
| STOP | Would modify production Blueprint / `render.yaml` resources |
| Rollback | Do not delete production; abandon staging Blueprint create |

### 2) Controlled bootstrap of URL + env

| | |
|--|--|
| Who | **Owner / Dashboard** |
| Expected | Assigned origin known; `APP_PUBLIC_URL` == `CORS_ORIGINS` == that origin; Admin JSON `project_id=buscommand-preview`; all VITE_* for same project; **no** QA harness |
| Proof | Env key presence checklist (values never pasted into git/reports); origin string recorded as hostname for Auth |
| STOP | Origin unknown; mismatch; wrong Firebase project; production domain present |
| Rollback | Suspend staging service; clear bad env keys |

First start may fail until step 2 completes — **CONTROLLED BOOTSTRAP EVENT**.

### 3) Firebase Auth authorized domain

| | |
|--|--|
| Who | **Owner / Firebase Console** (`buscommand-preview`) |
| Expected | Add **hostname only** (e.g. `something.onrender.com`), not `https://…` — Firebase docs describe authorized domain as the domain of the continue URL (`www.example.com` form) ([Email link auth](https://firebase.google.com/docs/auth/web/email-link-auth), accessed 2026-08-10) |
| Proof | Authorized domains list screenshot (no secrets) |
| STOP | Domain not added; wrong project console |
| Rollback | Remove staging hostname from authorized domains |

### 4) Firestore Rules + indexes deploy

| | |
|--|--|
| Who | Owner-approved Cursor/CLI **only after explicit yes** |
| Expected | Deploy **only** to `--project buscommand-preview`; rules file `firestore.rules`; indexes `firestore.indexes.json` (single composite: `shifts` `driverId`+`date`) |
| Proof | Firebase deploy output (project id visible, no secrets) |
| STOP | Missing `--project`; wrong project; `firebase use` |
| Rollback | Firebase Console → Rules release history → previous rules; indexes left if harmless |

```text
# NOT EXECUTED — FUTURE OWNER APPROVAL REQUIRED
# firebase deploy --only firestore:rules --project buscommand-preview
# firebase deploy --only firestore:indexes --project buscommand-preview
# Forbidden: firebase deploy without --project; firebase use
```

Helper `scripts/staging-firestore-deploy.NOT_EXECUTED.sh` always exits 2 — documentation only.

### 5) Render Manual Deploy of approved SHA

| | |
|--|--|
| Who | **Owner / Render Dashboard** (Manual Deploy → specific commit `80bd34b…`) |
| Expected | Build OK; start OK; health check `/api/health` passes |
| Proof | Deploy logs (redacted); health JSON |
| STOP | Health not `{ok:true}`; fail-fast config errors; wrong SHA |
| Rollback | Suspend service; if prior deploy exists use Render rollback — **first deploy has no prior version** → suspend + keep env |

```text
# NOT EXECUTED — FUTURE OWNER APPROVAL REQUIRED
# Render Dashboard → buscommand-preview-staging → Manual Deploy → Commit 80bd34b…
# Optional CLI (only if already authenticated; do not install/login here):
# render deploys create --commit 80bd34b…   # NOT EXECUTED
```

### 6) Health + asset checks

| | |
|--|--|
| Who | Cursor/owner browser against staging origin |
| Expected | S1–S3 from smoke matrix |
| Proof | Screenshots / HAR |
| STOP | Non-liveness health payload; missing staff assets |
| Rollback | Suspend service |

### 7) Login / role / privacy / import smoke

| | |
|--|--|
| Who | Owner + Cursor visual QA (synthetic data) |
| Expected | Smoke matrix S4–S24 pass |
| Proof | Visual trail + redacted API |
| STOP | Any STOP from smoke matrix / §8 report |
| Rollback | Suspend; delete **synthetic** staging data only |

### 8) Final verdict of deploy phase

| | |
|--|--|
| Who | Owner |
| Expected | Staging usable; production untouched |
| Proof | This runbook checklist signed off |
| STOP | Any production contact |
| Rollback | See rollback section |

---

## Rollback plan (document only — NOT EXECUTED)

| Action | Detail |
|--------|--------|
| Render | Dashboard → suspend/stop `buscommand-preview-staging`; if a previous successful deploy exists, Roll back to it; **first deploy: no prior version** → suspend only |
| Firebase Rules | Console Rules playground/history → restore previous published rules for `buscommand-preview` only |
| Git safe points | Staging tip `80bd34b…`; rollback target if needed `d087d67…` (checkpoint, pre-isolation); **never** force-push main |
| Data cleanup | Delete only synthetic companies/users created in smoke; never production |
| Production | **Forbidden** to modify `render.yaml` Blueprint, prod service, or prod Firebase project |
| Owner | BusCommand owner |
| STOP rollback if | Would touch production or non-synthetic data |

---

## External sources

| Source | URL | Accessed | Used for |
|--------|-----|----------|----------|
| Render Blueprints IaC | https://render.com/docs/infrastructure-as-code | 2026-08-10 | First Deploy Blueprint provisions; Auto Sync |
| Render blueprint-spec | https://render.com/docs/blueprint-spec | 2026-08-10 | `autoDeployTrigger`, `sync:false` |
| Render deploys | https://render.com/docs/deploys | 2026-08-10 | Manual deploy / auto-deploy off |
| Firebase email-link auth | https://firebase.google.com/docs/auth/web/email-link-auth | 2026-08-10 | Authorized domain as domain of URL (host form) |

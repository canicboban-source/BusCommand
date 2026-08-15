# 3D.3 — Staging Environment Matrix (names only)

**SHA:** `80bd34bdd85e07bea23cb9bc52793c72e3b31660`  
**Scope:** real usages from `render.staging.yaml`, `.env.example`, `api-server.js`, `server/runtime-isolation.js`, `server/cors-policy.js`, `js/core/firebase-web-config.js`, `server/sms-provider.js`, `server/logger.js`.  
**Rule:** no secret values, API keys, tokens, phones, or credential JSON in this matrix.

Legend: **B** = build-time (Vite), **R** = runtime (Node), **Req** = required for real staging (no QA harness), **Opt** = optional, **Forb** = must not be set on real staging.

---

## A) Required for real staging web service

| Name | B/R | Req? | Secret? | Valid format (no value) | Used by | Fail-fast / effect if missing | Owner dashboard action |
|------|-----|------|---------|-------------------------|---------|-------------------------------|------------------------|
| `BUSCOMMAND_ENV` | R | Req | No | Exactly `staging` | cors-policy, runtime-isolation, dispatch script | Invalid non-empty → `runtime-env-invalid` exit before listen | Blueprint sets `value: staging` |
| `NODE_ENV` | R | Req | No | `production` on Render | startup logging, SMS default mode | Not staging-specific fail-fast; Blueprint sets `production` | Blueprint value |
| `NODE_VERSION` | Build platform | Req | No | `22.14.0` | Render Node runtime pin | Wrong Node → build/runtime drift vs Gate 3C | Blueprint value |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | R | Req | **Yes** | Single-line JSON object; `project_id` **must** be `buscommand-preview` | runtime-isolation → firebase-admin | Missing → `staging-firebase-credential-missing`; invalid JSON → `…-invalid`; wrong project → `…-project-mismatch`; exit 1 before listen | Dashboard `sync:false` paste Admin SA for **buscommand-preview** only |
| `CORS_ORIGINS` | R | Req | No | Comma-separated exact HTTPS origins; staging must not include `buscommand.com` | cors-policy | Empty → fail-closed browser CORS; production hosts rejected in staging | Set to **real assigned** staging origin only |
| `APP_PUBLIC_URL` | R | Req | No | Exact HTTPS origin (= one CORS entry); no path/query/hash/userinfo; not `buscommand.com` | runtime-isolation (+ SMS base URL if used) | Missing/invalid/prod/mismatch → `staging-app-public-url-*` exit before listen | Must equal same origin as `CORS_ORIGINS` |
| `VITE_FIREBASE_API_KEY` | B | Req | Public client | Non-empty string from Firebase console web app | `firebase-web-config.js` → client Auth | Build/isolation check fails if missing/wrong project binding | Dashboard `sync:false` (web app of `buscommand-preview`) |
| `VITE_FIREBASE_AUTH_DOMAIN` | B | Req | Public client | Must be `buscommand-preview.firebaseapp.com` | firebase-web-config | Validator rejects other authDomain | Dashboard `sync:false` |
| `VITE_FIREBASE_PROJECT_ID` | B | Req | Public client | Must be `buscommand-preview` | firebase-web-config | Must match `EXPECTED_FIREBASE_PROJECT_ID` | Dashboard `sync:false` |
| `VITE_FIREBASE_STORAGE_BUCKET` | B | Req | Public client | Must be `buscommand-preview.firebasestorage.app` | firebase-web-config | Validator rejects foreign bucket | Dashboard `sync:false` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | B | Req | Public client | Non-empty numeric string | firebase-web-config | Missing → web config invalid | Dashboard `sync:false` |
| `VITE_FIREBASE_APP_ID` | B | Req | Public client | Non-empty Firebase app id | firebase-web-config | Missing → web config invalid | Dashboard `sync:false` |

**Admin `project_id` contract:** staging runtime requires `FIREBASE_SERVICE_ACCOUNT_JSON.project_id === "buscommand-preview"`. Browser config independently pins the same project via Vite vars + `EXPECTED_FIREBASE_PROJECT_ID`.

---

## B) Platform / optional (not in staging Blueprint; not required for first smoke)

| Name | B/R | Staging | Secret? | Format | Used by | If missing | Dashboard |
|------|-----|---------|---------|--------|---------|------------|-----------|
| `PORT` | R | Opt (Render injects) | No | Integer | api-server | Defaults `8766` locally; Render provides | Usually none |
| `LOG_LEVEL` | R | Opt | No | pino level string | server/logger | Defaults `info` | Optional |
| `GOOGLE_APPLICATION_CREDENTIALS` | R | Opt / unused if JSON set | Path secret | Filesystem path outside repo | api-server key-file path | Staging fail-fast requires **JSON env**, not key file alone | Prefer JSON secret; do not upload key into repo |
| `CONFIRMATION_JOB_SECRET` | R | **N/A** (no cron) | Yes | Opaque hex/secret | confirmation dispatch | Cron absent on staging | Do **not** create staging cron |
| `CONFIRMATION_DISPATCH_URL` | R | **N/A** (no cron) | No | Absolute URL; staging rejects `buscommand.com` | `run-confirmation-dispatch.js` | Script exits if missing when run | Keep cron **ABSENT** |
| `CRON_SECRET` | R | N/A | Yes | Legacy alias for job secret | dispatch script | Same as above | Unused on staging |
| `SMS_PROVIDER` | R | Opt | No | `stub` \| `none` \| `twilio` \| `seven` | sms-provider | With `NODE_ENV=production` defaults toward `none` | Prefer `none`/`stub` for first staging; no live SMS |
| `SEVEN_API_KEY` / `SEVEN_FROM` | R | Opt | Yes / No | Provider key / sender | sms-provider | Unused if provider not seven | Do not set for first smoke |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | R | Opt | Yes | Twilio credentials | sms-provider | Unused if provider not twilio | Do not set for first smoke |
| `BUSCOMMAND_PUBLIC_URL` | R | Opt legacy | No | URL | sms-provider fallback chain | Staging requires `APP_PUBLIC_URL` before listen | Do not rely on this |
| `BUSCOMMAND_FORCE_SMS_STUB` | R | Test-only | No | `1` | sms-provider | — | Not for real staging |
| `BUSCOMMAND_QA_HARNESS` | R | **Forb** on real staging | No | `1` enables test bypass | runtime-isolation, sms-provider | If `1`, skips Firebase/APP_PUBLIC_URL fail-fast | **MUST NOT** set on real staging |

---

## C) Explicit non-goals for staging Blueprint

- No hardcoded HTTPS origins in YAML.
- No production `buscommand.com` values.
- No cron service → no confirmation dispatch env required.
- No `BUSCOMMAND_QA_HARNESS` key in Blueprint.
- Production `render.yaml` remains a separate production Blueprint (untouched).

---

## D) Bootstrap note for `APP_PUBLIC_URL` / `CORS_ORIGINS`

Real origin is unknown until Render assigns the service hostname. Both must be set to the **same exact HTTPS origin** after assignment and before a successful listen. See runbook bootstrap section (controlled first-fail deploy is allowed; weakening fail-fast is not).

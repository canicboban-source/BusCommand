# 3D.3 — Staging Smoke Matrix (NOT EXECUTED)

**Target SHA:** `80bd34bdd85e07bea23cb9bc52793c72e3b31660`  
**Data rule:** synthetic factory data only — no real customer PII, no production tenants, no live SMS, no cron.  
**Status this phase:** plan only — **do not execute**.

| # | Test | Expected result | Required proof |
|---|------|-----------------|----------------|
| S1 | `GET /api/health` | `200`, body exactly `{ "ok": true }`, `Cache-Control: no-store` | Response headers + body screenshot/HAR |
| S2 | `GET /staff.html` (+ hashed CSS/JS) | `200`, staff shell loads | Screenshot + network 200 for critical assets |
| S3 | Lazy `plan-import-*.js` | Chunk not in initial staff bundle; loads on import route open | Network waterfall: deferred chunk request |
| S4 | CORS allowed staging origin | `OPTIONS`/`GET` with `Origin: <staging>` → allowed | Response `Access-Control-Allow-Origin` exact match |
| S5 | CORS production origin | Origin `https://www.buscommand.com` / `https://buscommand.com` → denied | No ACAO / CORS error; no data body leak |
| S6 | CORS foreign origin | Random third-party origin → denied | Same as S5 |
| S7 | Firebase Auth login (synthetic) | Email/password (or existing test users in **buscommand-preview** only) succeeds from staging host | Auth success + authorized-domain proof |
| S8 | Role: Company Admin | CA can open CA surfaces; cannot import monthly assignments (`MONTHLY_ASSIGNMENTS_DISPATCHER_ONLY` / 403) | API status + UI trail |
| S9 | Role: Dispatcher | Dispo can preview/commit monthly import for assigned group only | Preview+commit trail screenshots |
| S10 | Role: Super Admin | SA overview/support paths within tenant isolation | Trail; no cross-tenant IDs |
| S11 | Role: Driver | Driver surface login; no EID/PIN/activation exposure to Dispo UI | Dispo UI/API payload redacted check |
| S12 | EID / credentials privacy | Dispo responses and UI contain no EID, PIN, activation codes, hashes | Response JSON scan (redacted log) |
| S13 | `driver_identity_guard` browser deny | Browser read/write/list on `companies/{id}/ops/driver_identity_guard` denied by Rules | Rules deny evidence / console permission-denied |
| S14 | Monthly import preview | Valid synthetic file → preview summary; invalid → structured errors | Preview UI + API |
| S15 | Monthly import commit | Commit after preview; server-confirmed save (no fake toast) | Commit response + refresh shows rows |
| S16 | Conflict / stale revision | Concurrent edit → conflict; no silent overwrite | Conflict code + UI |
| S17 | Retry / idempotency | Safe retry does not double-apply destructive duplicates | Before/after counts |
| S18 | In-progress / recovery | Interrupted commit recoverable per product contract | State markers + recovery action |
| S19 | Assignment resource guard | Over-allocation / invalid resource rejected server-side | Error code |
| S20 | FileChooser path | OS file picker → parse → preview still works on staging | Screenshot trail |
| S21 | Lazy-chunk recovery | Force-fail then reload recovers plan-import chunk | Network retry / reload proof |
| S22 | No cron | Staging service list has no cron; no confirmation-dispatch traffic | Render service list (owner) + no cron logs |
| S23 | No SMS send | `SMS_PROVIDER` none/stub; no provider API calls | Provider mode check; no outbound SMS |
| S24 | No production data | Only synthetic tenants/groups/drivers created for smoke | Inventory of created IDs for cleanup |

**STOP smoke if:** any production origin accepted; Admin project ≠ `buscommand-preview`; credentials leak; QA harness required to boot; real user data used.

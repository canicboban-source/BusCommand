# Manual smoke — 2026-07-24

Environment: local `api-server.js` on `:8766`, `BUSCOMMAND_DEMO_OTP=482913`, mode=demo (no Firebase Admin for staff writes).

## API / HTML

| Check | Result | Notes |
|-------|--------|-------|
| `GET /api/health` | PASS | `mode: demo` |
| `GET /api/config` | PASS | |
| Public drivers directory | PASS | `410 PUBLIC_DRIVER_DIRECTORY_DISABLED` |
| Identify EID `D1001` | PASS | returns id+name only |
| Driver login demo OTP `482913` | PASS | `demo=true`, `mustChangeLoginCode=true` |
| Wrong OTP / shared `123456` | PASS | `401` |
| Surface gate `/` | PASS | links to driver + staff |
| `driver.html` activation confirm | PASS after `npm run build` | **FAIL before rebuild** — server serves `dist/` which was stale |
| `staff.html` CA audit markup | PASS | |
| Staff message / shift APIs unauthenticated | 503 | Expected locally without Firebase; not 401. Production uses Auth. |

## UI (browser)

| Check | Result | Notes |
|-------|--------|-------|
| `staff.html?demo=dispatcher` first load | PASS | logged-in shell, DEMO badge, trial, dispatcher nav |
| Same URL second load | FLAKY | sometimes lands on login (Fahrer form) instead of auto demo session — quick-demo not reliable across reloads |
| Ops dashboard content | PARTIAL | a11y tree has KPIs; first viewport can look empty |
| Activation confirm in served `dist` | PASS after rebuild | |

## Findings

1. **Deploy/preview must rebuild `dist/`** after HTML surface changes (`npm run build`). Serving stale `dist/driver.html` omitted personal-code confirm field and would break activation UX.
2. Local demo cannot fully prove staff write APIs (messages/shifts) without Firebase credentials — those paths return 503.
3. Shared `123456` is rejected in demo login when `BUSCOMMAND_DEMO_OTP` is set.

## Verdict

**Smoke: OK for local demo gates + OTP + public directory lock**, with rebuild caveat.  
**Not proven here:** production Firebase staff write paths, SOS resolve, lost-item return, revision conflict UI.

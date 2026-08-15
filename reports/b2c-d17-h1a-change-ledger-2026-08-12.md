# B2C-D17-H1-A change ledger — 2026-08-12

## Scope
Reliable lazy load of Dispo `msg-compose` (+ co-lazy `sent-messages`) out of the staff initial graph. No message business-logic change. H1-B / H1-C not touched.

## Production files
| File | Change |
|------|--------|
| `js/dispatcher/msg-compose-loader.js` | **NEW** race/retry/recovery loader (reuses `createLazyModuleLoader`; msg-compose–scoped trusted recovery paths; rejects foreign origin and `msg-compose-loader-*` recovery) |
| `js/install-staff.js` | Removed static side-effect imports of `msg-compose.js` / `sent-messages.js` |
| `js/surface/register-staff-sections.js` | Messages section loads via `loadMsgCompose()`; localized load-error toast |
| `js/register-onclick-staff.js` | Wrappers for tab/submit/archive; post-load errors not toasted as load failures |
| `js/ui/i18n.js` | Template populate goes through loader (quiet catch) |
| `translations.js` | Added `msg_compose_chunk_load_failed` for en/sr/de |

## Test files
| File | Change |
|------|--------|
| `tests/unit/b2c-d17-h1a-msg-compose-loader.test.mjs` | **NEW** loader contract (parallel, cache, retry, recovery, quiet prefetch, post-load error) |
| `tests/e2e/b2c-d17-h1a-msg-compose-lazy.spec.js` | **NEW** cold Messages/compose + controlled chunk failure/retry |
| `tests/unit/poglavlje-17-performance-budgets.test.mjs` | Assert i18n uses loader, not direct msg-compose static path |

## Not changed
- `js/dispatcher/msg-compose.js` / `sent-messages.js` message logic
- plan-import loader reliability contract (only reused `createLazyModuleLoader`)
- API / Rules / Auth / schema / Firebase
- H1-B reports / H1-C schedule-import-utils
- Budget thresholds
- Languages remain sr/en/de

## Git hygiene
- HEAD stayed `80bd34bdd85e07bea23cb9bc52793c72e3b31660`
- Branch `staging/phase-3-isolation`
- staged = 0 throughout
- No commit / push / PR / deploy

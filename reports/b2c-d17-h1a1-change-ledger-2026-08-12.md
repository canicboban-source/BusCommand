# B2C-D17-H1-A.1 change ledger — 2026-08-12

## Scope
True cold-lazy + error-boundary correction on top of H1-A. No H1-B/H1-C work. No message business-logic change.

## Production
| File | Change |
|------|--------|
| `js/ui/i18n.js` | `translateUI` uses `getMsgComposeIfLoaded()` only — never cold-starts payload |
| `js/dispatcher/msg-compose-loader.js` | `getMsgComposeIfLoaded`; recovery unwraps Vite co-lazy `.m` namespace |
| `js/dispatcher/plan-import-loader.js` | Additive `getIfLoaded` on `createLazyModuleLoader` (shared helper; no plan-import behavior change) |
| `js/surface/register-staff-sections.js` | Split load catch vs execution catch (`error_generic`) |
| `js/register-onclick-staff.js` | Same load/exec separation on msg-compose + sent-messages wrappers |
| `js/install-staff.js` | (H1-A) still without static msg-compose imports |
| `translations.js` | (H1-A) `msg_compose_chunk_load_failed`; reuse existing `error_generic` for exec errors |

## Tests
| File | Change |
|------|--------|
| `tests/unit/b2c-d17-h1a-msg-compose-loader.test.mjs` | getIfLoaded + recovery unwrap + boundary source asserts |
| `tests/e2e/b2c-d17-h1a1-msg-compose-cold-lazy.spec.js` | **NEW** cold-lazy / failure+retry / language / exec-boundary |
| `tests/e2e/b2c-d17-h1a-msg-compose-lazy.spec.js` | H1-A regression retained |
| `tests/unit/poglavlje-17-performance-budgets.test.mjs` | i18n must peek, not `loadMsgCompose()` |

## Not changed
- H1-B reports optimization
- H1-C schedule-import-utils optimization
- API / Rules / Auth / schema
- Budget thresholds
- Languages remain sr/en/de

## Git hygiene
- HEAD `80bd34bdd85e07bea23cb9bc52793c72e3b31660`
- Branch `staging/phase-3-isolation`
- staged = 0
- No commit / push / PR / deploy

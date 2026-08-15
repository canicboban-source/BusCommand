# B2C-01-D1 change / execution ledger — 2026-08-13

## Verdict
BUG_CONFIRMED_SAFE_FIX_PLAN

## Executed (read-only)
1. Preflight: HEAD/local/remote `b1d057a…`; staged=0; CI 31710532315 success; PR none
2. Diff relevant SA/company/CA files `80bd34b`..`b1d057a` → create-flow identical
3. Source inventory: `staff.html`, `superadmin.js`, `submit-lock.js`, `api-client.js`, `api-server.js`, `provisioning.js`, `validation.js`, `register-onclick-staff.js`
4. Confirmed missing `#sa-create-admin-btn` on both SHAs
5. Documented call-flow, failure matrix, options A/B/C, D17 estimate
6. Evidence visuals labeled `SOURCE-LEVEL DIAGNOSTIC — NO LIVE MUTATION`
7. Writes/mutations: **0**

## Not executed
- Source/test/config edits
- Live or local API/Auth/Firestore writes
- Create company / CA / Auth accounts
- Browser intercept that could hit staging
- Build / full unit / E2E / Rules
- Commit / push / PR / deploy / workflow
- B2C-01 implementation, B2C-03, H1-B/C, Phase 4

## Root cause one-liner
Prod CA follow-up binds single-flight to non-existent `#sa-create-admin-btn`, so `createUser` never runs; modal still closes after company success; 409 retry blocks CA recovery.

## Recommended next (owner decision required)
Option A — minimal UI orchestration fix in `js/admin/superadmin.js` (+ optional markup/i18n); no schema; no new API.

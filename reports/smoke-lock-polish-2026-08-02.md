# Lock polish — Firestore mirror + release/break UI

Datum: **2026-08-02**  
Grana: `work/lock-polish-ui`  
Baziran na: `main` @ `346c616`

## Cilj

First-writer plan lock ostaje u engine-u; polish dodaje:

1. Firestore mirror (`companies/{id}/plan_locks/{docId}`) + memory L1
2. Banner na dnevnom planu: free / mine / held
3. Claim / Release (disponent) + Break-glass (CA/SA, razlog ≥8, audit)
4. Heartbeat 60s dok holder uređuje
5. ApiClient: `lock` na error odgovoru + plan-lock metode

## Tok (happy)

1. Disponent otvara Daily plan → banner „unlocked“ ili „you hold“
2. Claim ili prvi save → acquire + Firestore persist
3. Heartbeat produžava TTL
4. Release → memory + Firestore delete
5. Drugi disponent vidi held; CA Break + razlog → audit `plan_lock_break`

## Tok (fail)

| Scenario | Očekivano |
|----------|-----------|
| Drugi writer save | 409 `LOCK_HELD` + toast sa imenom |
| Break razlog <8 | 400 / toast |
| Disponent break | 403 |
| Live prod još bez #15 deploy | live smoke FAIL (vidi `live-smoke-prod-2026-08-02.md`) |

## Fajlovi

- `server/plan-edit-lock-store.js` (novo)
- `server/plan-edit-lock-routes.js`, `server/driver-routes.js`
- `js/dispatcher/plan-edit-lock-ui.js` (novo)
- `js/dispatcher/plan-edit-lock-{client,demo}.js`, `daily-plan.js`
- `js/core/api-client.js`, `js/register-onclick-staff.js`
- `css/staff-desktop.css`, `translations.js`
- `tests/unit/plan-edit-lock-store.test.mjs`

## Gate

Unit: **10/10 pass** (`plan-edit-lock` + `plan-edit-lock-store`)  
Build: **pass** (`npm run build`, Firebase isolation OK)  
Live: **FAIL / pending deploy** — vidi `live-smoke-prod-2026-08-02.md` (stari `staff-1DVzJ5Lc.js`, nema `hub-add-bus-btn`)

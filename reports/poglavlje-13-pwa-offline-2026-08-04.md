# Poglavlje 13 â€” Mobilni PWA i kontrolisani offline rad

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna taÄka: Poglavlje 12 (`23a2e61` / `81b7334`)
- Checkpoint commit: `02e2c69`
- Master prompt: v3.2 Â§15, odluka D13

## 1. Cilj

Zatvoriti Critical/High rupe oko vozaÄkog PWA: SW izolacija od staff
povrÅ¡ina, kontrolisan offline red za ne-kritiÄne prijave, status mreÅ¾e,
TTL snapshot smene/poruka i ÄiÅ¡Ä‡enje osetljivog keÅ¡a pri odjavi â€” bez
laÅ¾nog â€žuspehaâ€œ za SOS/potvrde/odmor.

## 2. PronaÄ‘eno / reÅ¡eno

| ID | Nalaz | Status |
| --- | --- | --- |
| C13-1 | SW keÅ¡ira/kontroliÅ¡e celu domenu (root scope) | ReÅ¡eno (`scope: /driver.html`, allowlist, cache v2) |
| C13-2 | Nema offline queue + idempotency za prijave | ReÅ¡eno (queue + `idem_{uid}_{key}` dedupe) |
| C13-3 | Nema jasnog network/sync statusa | ReÅ¡eno (banner + flush on online) |
| C13-4 | KritiÄni upisi mogu delovati â€žgotovoâ€œ offline | ReÅ¡eno (SOS/confirm/vacation zahtevaju mreÅ¾u) |
| C13-5 | Osetljivi keÅ¡ ne briÅ¡e se pri logout/session end | ReÅ¡eno (`clearDriverSensitiveCaches`) |
| C13-6 | Nema TTL read-snapshot smene/poruka | ReÅ¡eno (8h snapshot pri aktivnoj sesiji) |

Namerno odloÅ¾eno: pun IndexedDB sync engine; Background Sync API; FCM
push dok je offline; offline vacation/SOS; live Firestore offline
persistence policy; Playwright offline reconnect scenario (unit pokriva
allowlist/idempotency).

## 3. Izmene

- `public/sw-driver.js` + `server/driver-sw-policy.js` â€” driver-only fetch
- `js/main-driver.js` + manifest â€” uski scope `/driver.html`
- `js/driver/offline-queue.js` / `offline-snapshot.js` / `network-status.js`
- `js/driver/reports.js`, `quick-reports.js`, `dashboard.js`, `work-session.js`
- `server/driver-routes.js` + `server/driver-report-idempotency.js`
- i18n + `css/driver-pwa.css`
- Testovi: `tests/unit/driver-pwa-offline.test.js`

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors, 1 pre-existing warning) |
| `npm run test:unit` | **514/514** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Ocena

**8.5/10** â€” Â§15 Critical/High zatvoreni za kontrolisani offline driver
PWA. SledeÄ‡e: Poglavlje 14 (pronaÄ‘eni predmeti).

# Poglavlje 13 — Mobilni PWA i kontrolisani offline rad

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 12 (`23a2e61` / `81b7334`)
- Checkpoint commit: _(popunjava se posle commit-a)_
- Master prompt: v3.2 §15, odluka D13

## 1. Cilj

Zatvoriti Critical/High rupe oko vozačkog PWA: SW izolacija od staff
površina, kontrolisan offline red za ne-kritične prijave, status mreže,
TTL snapshot smene/poruka i čišćenje osetljivog keša pri odjavi — bez
lažnog „uspeha“ za SOS/potvrde/odmor.

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C13-1 | SW kešira/kontroliše celu domenu (root scope) | Rešeno (`scope: /driver.html`, allowlist, cache v2) |
| C13-2 | Nema offline queue + idempotency za prijave | Rešeno (queue + `idem_{uid}_{key}` dedupe) |
| C13-3 | Nema jasnog network/sync statusa | Rešeno (banner + flush on online) |
| C13-4 | Kritični upisi mogu delovati „gotovo“ offline | Rešeno (SOS/confirm/vacation zahtevaju mrežu) |
| C13-5 | Osetljivi keš ne briše se pri logout/session end | Rešeno (`clearDriverSensitiveCaches`) |
| C13-6 | Nema TTL read-snapshot smene/poruka | Rešeno (8h snapshot pri aktivnoj sesiji) |

Namerno odloženo: pun IndexedDB sync engine; Background Sync API; FCM
push dok je offline; offline vacation/SOS; live Firestore offline
persistence policy; Playwright offline reconnect scenario (unit pokriva
allowlist/idempotency).

## 3. Izmene

- `public/sw-driver.js` + `server/driver-sw-policy.js` — driver-only fetch
- `js/main-driver.js` + manifest — uski scope `/driver.html`
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

**8.5/10** — §15 Critical/High zatvoreni za kontrolisani offline driver
PWA. Sledeće: Poglavlje 14 (pronađeni predmeti).

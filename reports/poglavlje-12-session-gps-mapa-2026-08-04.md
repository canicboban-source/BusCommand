# Poglavlje 12 — Driver session, GPS i mapa

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 11 (`6a8d0cb` / `6289d91`)
- Checkpoint commit: `23a2e61`
- Master prompt: v3.2 §13–14, odluka D12

## 1. Cilj

Zatvoriti Critical/High rupe oko serverske radne sesije i GPS/mape uz
konzervativan pristup: `liveGps` OFF by default dok O2 retention i L1 legal
ne budu odobreni.

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C12-1 | GPS watcher bez tenant flag-a | Rešeno (`features.liveGps === true` only) |
| C12-2 | Koordinate samo u sessionStorage | Rešeno (`POST /api/driver/location`, current point) |
| C12-3 | Nema map access audit-a | Rešeno (`PUT /api/staff/map-access`) |
| C12-4 | Mapa bez group filtera | Rešeno (dispatcher assigned groups) |
| C12-5 | Nema driver notice na tracking start | Rešeno (toast `gps_tracking_notice`) |
| C12-6 | Off-duty ne briše lastLocation | Rešeno (clear na work-session off) |

Namerno odloženo / dokumentovano: O2 retention politika; L1/DPIA; FCM
pre-shift login reminder (stub helper postoji, channel=none); historical GPS
trail.

## 3. Izmene

- `server/driver-location.js` — sanitize, throttle, flag helpers
- `server/driver-routes.js` — location + map-access; work-session features
- `server/provisioning.js` + bootstrap/setup — `liveGps: false`
- `js/maps/gps-track.js`, `js/driver/work-session.js`, `js/layout/shell-driver.js`
- `js/maps/live-map-core.js` — lastLocation + group scope + audit
- Testovi: `tests/unit/driver-location.test.js`

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors, 1 pre-existing warning) |
| `npm run test:unit` | **509/509** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Enablement

```
companies/{id}/settings/main.features.liveGps = true
```

samo posle O2 + L1. Do tada watcher i upload su ugašeni; demo mapa ostaje
demo-only.

## 6. Ocena

**8/10** — §13–14 Critical/High zatvoreni konzervativno. Sledeće: Poglavlje 13
(PWA / offline).

# Poglavlje 14 — Pronađeni predmeti

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 13 (`02e2c69` / `bda3b1e`)
- Checkpoint commit: _(popunjava se posle commit-a)_
- Master prompt: v3.2 §16, odluka D14

## 1. Cilj

Zatvoriti Critical/High rupe oko evidencije pronađenih predmeta: status triad
(`in_depot` / `stays_on_bus` / `returned`), foundAt, opciona fotografija sa
validacijom i EXIF odbijanjem, staff filteri i auditovane tranzicije.

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C14-1 | Nedostaje status „ostaje u autobusu“ | Rešeno (`stays_on_bus`) |
| C14-2 | Staff može samo `returned` | Rešeno (open triad + return) |
| C14-3 | Nema fotografije / EXIF kontrole | Rešeno (canvas strip + server magic/EXIF reject) |
| C14-4 | foundAt/date/time često prazni posle sync-a | Rešeno (`buildFoundAtFields`) |
| C14-5 | Nema status filtera na staff tabeli | Rešeno |
| C14-6 | Audit samo na return | Rešeno (`lost_item_status_changed` + return) |

Namerno odloženo: Firebase Storage putanja (trenutno tenant Firestore doc
`photo`); Background Sync za foto; puni Storage rules; E2E staff status
matrix (unit pokriva lifecycle + photo).

## 3. Izmene

- `server/lost-item-lifecycle.js` — status/photo/foundAt helpers
- `server/driver-routes.js` — create + status API
- `js/driver/lost-item-photo.js`, `reports.js`, forme
- `js/dispatcher/lost-items.js` — filter, akcije, thumbnail
- i18n + HTML (driver/staff/monolith)
- Testovi: `tests/unit/lost-item-lifecycle.test.js`

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors, 1 pre-existing warning) |
| `npm run test:unit` | **518/518** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Ocena

**8.5/10** — §16 Critical/High zatvoreni bez nove storage zavisnosti.
Sledeće: Poglavlje 15 (SA/CA kompletiranje).

# Poglavlje 9 — Dnevni plan, problem-resolution i cockpit

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 8 (`b53787b` / `3ce73fe`)
- Checkpoint commit: *(follow-up SHA note)*
- Master prompt: v3.2 §8, §9, §11 (cockpit), odluka D9

## 1. Cilj

Zatvoriti generički lifecycle problema, vehicle-out put, nedavni audit feed u
cockpitu, notify relevantnih vozača posle transactional resolve-a, i istiniti
zeleni status (potvrđeno ≠ „čeka“ po defaultu).

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C9-1 | Lifecycle samo `active→resolved` | Rešeno (`open→acknowledged→solution_proposed→applying→resolved/cancelled`) |
| C9-2 | Problem bez revision/assignee/entity | Rešeno (`buildProblemCreateFields`, transition API) |
| C9-3 | Nema vehicle out-of-ops | Rešeno (`affectedEntity: vehicle` + UI) |
| C9-4 | Nema notify posle resolve | Rešeno (best-effort `tmpl_shift_now` poruke) |
| C9-5 | Zeleni status lažno „čeka potvrdu“ | Rešeno (`confirmed` / `pending` / `neutral`) |
| C9-6 | Nema recent audit u cockpit-u | Rešeno (`GET /api/staff/ops-activity` + panel) |

Namerno odloženo: pun outbox/scheduler (P10); duboki E2E live Firebase lifecycle
(demo cockpit ostaje smoke); labour-law fitness provera zamene (eksplicitno van
opsega §9).

## 3. Izmene

- `server/problem-resolution.js` — pure lifecycle + ops-activity filter
- `server/report-lifecycle.js` / `js/dispatcher/report-model.js` — open statuses
- `server/driver-routes.js` — create open; transition; ops-activity; resolve
  revision + notify; same-driver bus swap
- `js/dispatcher/dashboard.js` — ack, vehicle out, activity feed, status pills
- `js/core/api-client.js` — transition + ops-activity
- `staff.html` + CSS + i18n
- Testovi: `tests/unit/problem-resolution-ch9.test.js`

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors) |
| `npm run test:unit` | **491/491** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Ocena

**8.5/10** — §8–9 Critical/High zatvoreni bez rebuild-a ops shell-a.
Sledeće: Poglavlje 10 (confirmations scheduler / outbox).

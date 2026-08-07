# VOR 320 crew walkthrough — screenshots (2026-08-07)

Folder: `reports/vor320-walkthrough/`

## Crew (5 on line 320)

| EID | Name | Home bus | Home slot |
|-----|------|----------|-----------|
| 100615 | Canic Boban | 91504 | (real plan F/S mix) |
| 100601 | Marko Petrović | 91503 | F05 |
| 100602 | Nikola Jovanović | 91505 | F07 |
| 100603 | Stefan Ilić | 91101 | F09 |
| 100604 | Aleksandar Nikolić | 91104 | F08 |

On each Ferien day Boban keeps his code; the other four of **F05–F09** go to colleagues (no duplicate).  
Weekend `320.701`: Boban works, colleagues `SLOBODNO`.

Plan file: `tests/fixtures/vor320-group-plan-2026-08.csv`  
Drivers template: `tests/fixtures/vor320-crew-drivers.csv`

## Screenshot index

| # | File | What to check |
|---|------|----------------|
| 01 | `01-login-screen.png` | Demo login |
| 02 | `02-dispo-home-after-login.png` | Ops — groups 101 / 310 / 320 |
| 03 | `03-monthly-plan-320-with-crew.png` | Monthly 320 — 5 drivers in select |
| 04 | `04-import-dropzone-before.png` | Import dropzone ready |
| 05 | `05-import-preview-after-upload.png` | Preview 5×24 days OK |
| 06 | `06-after-save-all-plans.png` | After Save all |
| 07 | `07-calendar-canic-boban-august.png` | Boban Aug — F06 on 03. |
| 08 | `08-calendar-marko-petrovic-august.png` | Marko — F05 |
| 09 | `09-calendar-nikola-jovanovic-august.png` | Nikola — F07 |
| 10 | `10-vehicles-panel-320.png` | Buses on 320 |

## Import result (automated)

- Canic Boban_2026-08 — 24 days — 03.08 = **320.F06**
- Marko — 24 — **320.F05**
- Nikola — 24 — **320.F07**
- Stefan — 24 — **320.F09**
- Aleksandar — 24 — **320.F08**

Re-run: `node scripts/vor320-walkthrough.mjs` (server on :8766).

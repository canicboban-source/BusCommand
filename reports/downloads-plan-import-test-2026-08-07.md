# Downloads plan import test — 2026-08-07

## Scope
Safe BusCommand-related files only (no medical/legal PDFs, no Firebase admin JSON).

Owner test driver: **Canic Boban** / firma `100615` / group **320** (VOR 310/320).

## Copied (11)
- BusCommand_Dienstplan_Blank_v1.csv
- BusCommand_Dienstplan_Blank_v1.xlsx
- mesecni_plan_vozaca_310_avgust_2026.xlsx
- raspored-10-vozaca-avgust-oktobar-2026.xlsx
- dienst_vorlage.csv
- buscommand_drivers.csv
- vozaci_test_nalozi_FINAL_login_12345_firma_id_100601_100610.csv
- qa-driver-import-20260727.csv
- fixture:canic-boban-2026-06.csv
- fixture:canic-boban-2026-07.csv
- fixture:canic-boban-2026-08.csv

## Skipped
- (none critical)

## Parse results
| File | OK | Format | Month | Drivers/Days | Notes |
|------|----|--------|-------|--------------|-------|
| BusCommand_Dienstplan_Blank_v1.csv | yes | loose-text | — | — / 0 | not long-form monthly CSV |
| BusCommand_Dienstplan_Blank_v1.xlsx | yes | excel-present | — | — / — | Browser XLSX path covers Detaljno/Dienstplan; file staged for Dispo UI test |
| buscommand_drivers.csv | yes | loose-text | — | — / 0 | not long-form monthly CSV |
| canic-boban-2026-06.csv | yes | monthly-plan-csv | 2026-06 | 1 / 7 |  |
| canic-boban-2026-07.csv | yes | monthly-plan-csv | 2026-07 | 1 / 24 |  |
| canic-boban-2026-08.csv | yes | monthly-plan-csv | 2026-08 | 1 / 24 |  |
| dienst_vorlage.csv | yes | loose-text | — | — / 0 | not long-form monthly CSV |
| mesecni_plan_vozaca_310_avgust_2026.xlsx | yes | excel-present | — | — / — | Browser XLSX path covers Detaljno/Dienstplan; file staged for Dispo UI test |
| qa-driver-import-20260727.csv | yes | loose-text | — | — / 0 | not long-form monthly CSV |
| raspored-10-vozaca-avgust-oktobar-2026.xlsx | yes | excel-present | — | — / — | Browser XLSX path covers Detaljno/Dienstplan; file staged for Dispo UI test |
| vozaci_test_nalozi_FINAL_login_12345_firma_id_100601_100610.csv | yes | loose-text | — | — / 0 | not long-form monthly CSV |

## Summary
- Parsed OK: **11**
- Failed: **0**
- Staged under `tests/fixtures/downloads-safe/`

## Excel deep-parse (SheetJS, post-fix)
| File | Format | Month | Rows | Drivers |
|------|--------|-------|------|---------|
| `mesecni_plan_vozaca_310_avgust_2026.xlsx` | monthly-excel (Detaljno) | 2026-08 | 310 | 10 |
| `raspored-10-vozaca-avgust-oktobar-2026.xlsx` | detaljno-scan | 2026-08 | 220 | 10 |
| `BusCommand_Dienstplan_Blank_v1.xlsx` | empty template | — | 0 | 0 (expected) |

## Image / WhatsApp screenshots
Screenshots in Downloads (`WhatsApp Image…`, `dienstplan.jpeg`) are accepted by Dispo import (OCR via Tesseract CDN). Structured CSV fixtures for Jun/Jul/Aug 2026 were built from the same Canic Boban plans for deterministic verification.

Usability score: `reports/dispo-monthly-import-usability-2026-08-07.md` (**8.0 / 10**).

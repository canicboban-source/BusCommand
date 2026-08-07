# Dispo monthly import — funkcionalnost i upotrebljivost (2026-08-07)

## Sažetak

Veliki test nad **bezbednim** fajlovima iz Downloads + Canic Boban (100615) mesecni planovi (jun/jul/avg 2026). Privatni medicinski/pravni PDF-ovi i Firebase admin JSON **nisu** dirani.

| Oblast | Ocena (1–10) | Napomena |
|--------|--------------|----------|
| Funkcionalnost uvoza | **8.5** | Structured Excel/CSV rade; raspored + Detaljno + Tag/Bus/Linie-Dienst auto |
| Auto-prepoznavanje formata | **8.0** | F/S/X kodovi, Urlaub, Dienst, Von/bis; blank šablon = 0 dana (očekivano) |
| Screenshot / WhatsApp JPEG | **6.5** | Prihvaćeni + OCR (Tesseract CDN); deterministic CSV fixture-i za QA |
| Upotrebljivost Dispo UI | **8.0** | Preview + driver/month override; EID/PIN ne ulaze u Dispo tok |
| Testabilnost / seed | **9.0** | Canic Boban u grupi 320; fixture CSV + unit suite |
| **Ukupno** | **8.0** | Spreman za ručni Dispo prolaz sa avgust CSV/XLSX |

## Owner test driver

| Polje | Vrednost |
|-------|----------|
| Firma / EID | `100615` (samo CA / login; Dispo ne prikazuje) |
| Ime | Canic Boban |
| Email | cane@gmx.at |
| Telefon | +4369917137535 |
| Login code / PIN | `59991` |
| Grupa | **320** (+ known 310), VOR 310/320 |
| Seed | `ensureOwnerTestDriver` u demo baseline |

## Šta je urađeno u kodu

1. Dispo `plan-import.js` prvo pokušava structured Excel (`parseMonthlyPlanWorkbook` / Dienstplan) i long-form CSV, pa tek onda loose text/OCR.
2. `normalizeShiftCode`: F/S/X short codes, bare **Dienst**, line-less full codes.
3. `parseDienstplanSheet`: ime iz `Dienstplan für: Ime` u istoj ćeliji; sken svih sheetova.
4. `parseDetaljnoSheet` + workbook scan: raspored `Datum|Vozač|Smena (Dienst)|Bus` bez imena sheeta „Detaljno“.
5. Accept: `.xlsx,.xls,.pdf,.csv,.txt,.jpg,.jpeg,.png,.webp` + lazy Tesseract.
6. Fixture CSV jun/jul/avg + unit testovi; staged `tests/fixtures/downloads-safe/`.

## Rezultati Downloads testa

| Izvor | Ishod |
|-------|--------|
| `canic-boban-2026-08.csv` | 24 dana, 1 vozač, mesec 2026-08 |
| `canic-boban-2026-07.csv` | 24 dana |
| `canic-boban-2026-06.csv` | 7 dana (screenshot sample) |
| `mesecni_plan_vozaca_310_avgust_2026.xlsx` | 310 redova, 10 vozača (Detaljno) |
| `raspored-10-vozaca-avgust-oktobar-2026.xlsx` | 220 redova / 10 vozača (scan) |
| Blank Dienstplan xlsx/csv | 0 dana — prazan šablon (OK) |
| Driver CSV-ovi | Nisu planovi — ne importuju se kao smene (OK) |
| WhatsApp JPEG | UI accept + OCR path; QA preko CSV fixture-a |

Unit: **11/11** pass (`canic-boban-dienstplan` + `monthly-plan-real-format`).

## Preostali rizici

- OCR na WhatsApp slikama zavisi od kvaliteta fotke; uvek bolje Excel/CSV ili export PDF sa tekstom.
- CA V66 PDF (`Dienstplan 310/320 V37…`) je katalog smena, ne mesečna dodela vozača — Dispo monthly import nije mesto za to.
- Blank BusCommand šablon mora biti popunjen pre uvoza.
- Demo seed dodaje Bobana u sve tenant dispo grupe (310/320) — e2e fixture-i se ne brišu.

## Preporučeni ručni prolaz (sledeći korak)

1. `/staff.html?mode=demo` → Dispo `demo@buscommand.com` / `demo123`
2. Otvori Group Hub **320** → Monthly plan
3. Drop `tests/fixtures/canic-boban-2026-08.csv` → preview → Save
4. Proveri da Canic Boban ima avgust dane + bus 91504 / Urlaub / Dienst
5. Po želji: `mesecni_plan_vozaca_310…` na grupi 310 (vozači iz fajla moraju postojati ili biti mapirani)

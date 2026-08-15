# Surface split — radni dnevnik

Poslednje ažuriranje: 2026-07-24 (uvoz formata zaključan — opcija 1)

## Dogovoreni redosled

1. **Faza 0** — inventar + ADR ✅ `docs/ADR-001-surface-split.md`
2. **Faza 1** — razvezivanje importa + section registry ✅
3. **Faza 2** — `driver.html` / `staff.html` + Vite MPA ✅
4. **Faza 3** — PWA (manifest + SW + ikone) ✅
5. **Faza 4** — HTML proređivanje + QA ✅
6. **UI vozač** — dnevni plan ka mockupu ✅ osnovni layout + logo
7. **UI staff** — ka mockupima ✅ osnovni CA/dispo layout + brand
8. **CA multi-format uvoz** — XLSX + CSV twin + strukturirani PDF ✅
9. **Ops Reši/Dodeli + edit polja** ✅
10. **E2E smoke** ✅ `tests/e2e/ui-smoke.spec.js` — **30/30 passed** (2026-07-24)

## Definition of Done

- [x] Vozač URL odvojen (`/driver.html`, `/driver`)
- [x] Staff URL odvojen (`/staff.html`, `/staff`)
- [x] Driver moduli bez `../dispatcher/` importa
- [x] Dva install / register barrel-a
- [x] PWA manifest + SW
- [x] HTML shell proređen (driver ~72 KB, staff ~176 KB)
- [x] Vozački dashboard: topbar, današnja smena, sledeća, poruke, brze prijave, SOS, bottom nav
- [x] Brand logo sa mockupa (`/brand/logo-mark.svg`) na login, header, landing, driver topbar
- [x] Staff primary blue (`#2563EB`) usklađen sa mockupima
- [x] CA **Planovi smena**: uvoz + Aktivan katalog + pregled pre uvoza
- [x] CA uvoz: **XLSX + CSV + strukturirani BusCommand PDF** → isti `BUSCOMMAND-DIENSTPLAN-1` ugovor
- [x] Dispečer **Operativni centar**: 3 kolone (akcija / dnevni plan+poruke / posada)
- [x] Ops centar: snapshot tabela današnjih smena u srednjoj koloni
- [x] Ops centar: **Reši / Dodeli** + edit autobus/smena (demo + produkcioni API)
- [x] Dnevni plan full: edit vozač/autobus po slotu
- [x] E2E smoke potvrđen: `npx playwright test tests/e2e/ui-smoke.spec.js` → 30 passed (~44s)
- [x] Smanjiti shared `state-observer` chunk — Ch17: staff-only `state-observer-setup-staff.js` (driver više ne preload-uje dispatcher graph)
- [ ] VDV-455 adapter (kasnije, industrija)

## E2E napomene (iskreno)

Šta je popravljeno u testovima (ne u produkcionoj logici):

- Aktivacija vozača / pre-trip → **`/driver.html`** (nije na staff surface).
- CA team: custom checkbox UI → klik na `.company-team-group-option`, ne `.check()` na skrivenom inputu.
- CA login race: `loginDispatcher` pre `switchSection` (inače ostaje overview, forma „nije vidljiva”).
- CSV export selektor: `[data-action="exportDriversCSV"]` (posle save jezika dugme više nije „Drivers (CSV)”).

## Formati CA kataloga

**Zaključano 2026-07-24 (vlasnik, opcija 1):** samo BusCommand ugovor.

| Format | Status |
|--------|--------|
| XLSX šablon | ✅ kanonski |
| CSV twin (`section` kolona) | ✅ |
| Strukturirani BusCommand PDF | ✅ |
| XLS / TXT / proizvoljni firmi PDF | ❌ namerno van obima |

Šabloni: `public/templates/BusCommand_Dienstplan_Import_v1.{xlsx,csv,pdf}`

## Sledeći korak

Master prompt Poglavlje 1 → checkpoint WIP (ako odobreno) → gap matrica / Poglavlje 2.

Detalj ops edita: `docs/OPS-CENTER-EDIT.md`

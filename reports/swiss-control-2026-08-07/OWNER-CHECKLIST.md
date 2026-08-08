# Owner checklist — kontrola posle posla (5–20 min)

Otvori: `reports/swiss-control-2026-08-07/`  
Server: `npm run start` → `http://localhost:8766/staff.html?mode=demo`  
Posle JS/HTML izmena uvek: **`npm run build`** (ne samo `build:surfaces`).

## Zeleno očekivano

- [ ] Login pokazuje tab **Staff** (ne samo “Dispatcher”) i kratki role hint
- [ ] SA: `sa@demo.local` / `sa-demo-ok` → Super Admin dashboard
- [ ] CA: `admin@demo.com` / `demo123` → Company Admin dashboard
- [ ] CA → Service plan: **nema** monthly assignment import kartice (D21)
- [ ] CA → otvori Group Hub za **320**: žuti **Read-only** banner ostaje vidljiv
- [ ] Dispo: `demo@buscommand.com` / `demo123` → Ops
- [ ] Dispo → otvori hub **320**: header kaže Active group **VOR 320** (ne zaglavljen 101)
- [ ] Dispo → Monthly plan: dropzone tekst pominje **image (OCR)** / Excel/CSV/PDF/TXT
- [ ] Screenshoti `01`–`10` postoje u ovom folderu
- [ ] `VERIFY-3x.log` pokazuje 3× BUILD+UNIT+E2E OK
- [ ] JSON dokazi: `00-d1-*.json`, `00-c4-*.json`, `00-d3-*.json`, `00-d21-*.json` zeleni

## Brzi regres smoke

- [ ] Needs attention / Ops i dalje učitava bez belog ekrana
- [ ] CA i dalje može katalog (V66) preview putanju (ne monthly assignments)
- [ ] Dispo ne vidi EID/PIN u monthly import preview

## Crveno — tvoja sledeća odluka (ne “gotovo”)

- [ ] MFA za SA/CA (prod gate)
- [ ] Staging Firebase kredencijali (O1)
- [ ] Export/anonymize pre firm purge
- [ ] Pravnik/DPO potvrda retention / GPS / radno pravo za tržište
- [ ] Hard production release — **ne** bez tvog eksplicitnog “da”

## Ako nešto padne

1. `npm run build`  
2. Hard refresh  
3. Proveri da nisi pokrenuo samo `build:surfaces`  
4. Otvori `SCORECARD.md` + failing `passN-*.txt`

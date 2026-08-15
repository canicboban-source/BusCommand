# Ops centar — šta smo uradili vs šta aplikacija stvarno radi

Datum: 2026-07-24

## Urađeno u ovom koraku

1. **Operativni centar — dnevni plan tabela**
   - Kolone Autobus i Smena su **select** (edit na mestu).
   - Kolona Akcija: **Reši** (nepokriveno → dodeli `morning`) / **Izmeni**.
2. **Posada (desna kolona)**
   - Autobus + smena select uvek aktivni (više nisu disabled u produkciji).
   - Dugme **Dodeli** / **Izmeni**.
3. **Prijave (leva kolona)**
   - Dugme **Reši** i dalje zatvara prijavu (`resolveReport`).
4. **Dnevni plan (puni ekran)**
   - Slotovi imaju edit: izbor vozača, autobus, dugme Izmeni → forma smena.
5. **Persistencija**
   - Demo: lokalni `state` + `setShiftForDriverDate`.
   - Produkcija: `PUT /api/staff/shifts/assignment` preko `persistShift` (isti API kao raspored smena).

## Šta aplikacija STVARNO radi (bitno)

| UI akcija | Stvarni efekat |
|-----------|----------------|
| Promena autobusa u ops | Snima smenu za **danas** sa novim `bus` (+ tip smene ako već postoji, inače `morning`) |
| Promena tipa smene | Snima/uklanja smenu za **danas** za tog vozača |
| Reši / Dodeli | Dodeljuje tip smene (default `morning`) za **danas** |
| Reši na prijavi | Status prijave → `resolved` |
| Izbor vozača u dnevnom planu | Dodeljuje tip slota + kod rute tom vozaču za izabrani datum |

## Šta NIJE (još)

- Nije pun “mockup” editor sa “nepokrivena smena bez vozača” kao zaseban entitet — slotovi dolaze iz postojećeg `getDailyPlanForDate`.
- Vreme početka/kraja se ne edituje u ops tabeli (to je u formi **Raspored smena** / `openShiftCell`).
- CA katalog smena (XLSX/CSV/PDF) nije isto što i dnevna dodela vozača.

## Kako proveriti

```bash
npm run build && npm start
# http://localhost:8766/staff.html?mode=demo
# Uloga dispečer → Operativni centar → promeni autobus/smenu → Reši/Dodeli
```

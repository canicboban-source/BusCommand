# Poglavlje 17 — Performanse i budžeti

- Datum: 2026-08-05
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 16 (`b38a6e0` / `85c6b37`)
- Checkpoint commit: 0da122
- Master prompt: v3.2 §27 #17, §35 (kvalitet), odluka D17
- Napomena: §35 nema KB/TTI brojeve — budžeti su uvedeni u D17

## 1. Cilj

Uvesti merljive soft-pilot bundle budžete i ukloniti Critical/High
performansne curenja: driver preload dispatcher graph-a, `@latest` Lucide,
eager PDF/XLSX CDN, unbounded staff list reads — bez redesign-a i bez deploy-a.

## 2. Izmereno (posle izmene)

| Metrika | Vrednost | Budžet (D17) |
| --- | --- | --- |
| Driver app JS excl. translations | **~160 KB** | ≤ 220 KB |
| Staff app JS excl. translations | **~490 KB** | ≤ 520 KB |
| Najveći driver chunk (init) | **~130 KB** | ≤ 150 KB |
| Translations chunk | **~339 KB** | ≤ 360 KB |
| Driver preload dispatcher UI | **ne** | zabranjeno |

Pre: driver modulepreload uključivao ~274 KB dispatcher `state-observer` blob
(+ shared i18n → msg-compose → dashboard). Posle: ~160 KB app JS.

## 3. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C17-1 | Driver preload dispatcher chunk | Rešeno (staff-only observer + i18n dynamic import) |
| C17-2 | Nema budget CI / D17 pragova | Rešeno (`check-bundle-budgets.js` u `npm run build`) |
| C17-3 | `lucide@latest` | Rešeno (pin `0.469.0`) |
| C17-4 | Eager pdf.js + xlsx na login | Rešeno (lazy `office-parsers.js`) |
| C17-6 | (delimično) staff graph | Odloženo route-level lazy CA/maps |
| C17-7/8 | Unbounded confirmations/drivers scans | Rešeno (date range + groupId queries) |
| C17-10 | CA search bez debounce | Rešeno (groups + drivers search 250ms) |

Namerno odloženo: per-locale translations split, Leaflet defer, pun Lighthouse/TTI
na staging (O1/§36), route-level lazy za ceo staff install graph.

## 4. Izmene

- `js/core/state-observer-setup-staff.js` + prazan shared setup
- `js/ui/i18n.js` — dynamic `msg-compose` samo na staff
- `js/core/office-parsers.js` + wire u import putanje
- `scripts/check-bundle-budgets.js` + `package.json` build hook
- `server/driver-routes.js` — scoped list reads
- Lucide pin + uklonjeni eager parser script tagovi (monolith → surfaces)
- Testovi: `tests/unit/poglavlje-17-performance-budgets.test.mjs`

## 5. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors, 1 pre-existing warning) |
| `npm run test:unit` | **532/532** |
| `npm run test:rules` | **40/40** |
| `npm run build` (+ bundle budgets) | prolaz |
| Playwright chromium | **57/57** |

## 6. Ocena

**8/10** — Critical driver bundle leak zatvoren; D17 budžeti su merljivi u CI.
Sledeće: Poglavlje 18 (integraciono testiranje / cleanup testnih podataka).

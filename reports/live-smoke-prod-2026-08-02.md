# Live smoke — production after PR #15

Datum: **2026-08-02 ~22:10 Europe/Vienna**  
URL: `https://www.buscommand.com/staff.html`  
`main` SHA: `346c616` (merged)

## Rezultat: **FAIL — deploy još nije stigao**

| Provera | Očekivano (posle #15) | Produkcija sada |
|---------|----------------------|-----------------|
| `hub-add-bus-btn` | da | **ne** |
| `bus-import-paste` | da | **ne** |
| add-bus `btn-icon-only` | ne | **da (legacy)** |
| JS asset | novi hash | `staff-1DVzJ5Lc.js` (stari) |

Dokaz: HTTP 200 probe `scripts/_probe-prod-staff.mjs` (lokalno, ne commitovati).

## Sledeće

1. Potvrditi Render/host deploy sa `main` @ `346c616`
2. Hard refresh + ponoviti ovaj smoke
3. Tek onda live login QA za Add bus `91504`

Lock polish se radi paralelno na grani `work/lock-polish-ui`.

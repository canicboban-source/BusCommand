# Poglavlje 2 — Kanonski roster + optimistic concurrency

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1`  
Cilj: zatvoriti **G2/G7** iz RBAC matrice (dodeljivanje smene bez race-a; monthly day-edit kroz isti API).

## Šta je urađeno

### Server
- `server/shift-assignment.js` — kanonski id `${driverId}_${date}`, revision assert, schedule mirror helperi.
- `PUT /api/staff/shifts/assignment`:
  - `expectedRevision` (opciono; client ga šalje uvek);
  - transakcija: shift doc + `schedules/{driverId}_{YYYY-MM}` mirror;
  - legacy shift/schedule cleanup;
  - **409** `REVISION_CONFLICT` kad je revision zastareo.
- `firestore.indexes.json` — kompozitni indeks `shifts(driverId, date)` (deploy potreban).

### Client
- `persistShift` šalje `expectedRevision`, obrađuje 409, čuva `revision` u lokalnom state-u.
- `saveMonthlyDayEdit` više ne ide samo kroz `saveState` — zove `persistShift`.
- `shift-plan.js` čuva `revision`, preferira `driverId_*` schedule ključ.

### Testovi
- `tests/unit/shift-assignment.test.js`

## Šta još nije zatvoreno (iskreno)

| Stavka | Status |
|--------|--------|
| CA service-plan publish → schedules | Odvojen import path (nije day-edit) |
| `createEmptyMonthlyPlan` | Još `saveState` (prazan omotač, ne day assignment) |
| `updateMonthlyPlanDay` (deprecated) | Još `saveState` |
| Client Rules write na `schedules` | Još moguć ako neko zaobiđe UI — Rules harden kasnije |
| Live multi-tab sync bez refresh-a | 409 traži refresh; nema push conflict payload merge UI |

## G2 / G7

| ID | Posle ove izmene |
|----|------------------|
| G7 | **Closed** |
| G2 | **Mitigated** (day-edit); bulk/import ostaje |

## Sledeće (dogovoreni red)

1. G1 — staff messages API  
2. G3 — zaključati client driver CRUD/PIN

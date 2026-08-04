# Kanonski model plana i revizije

Izvor u kodu: `server/shift-assignment.js` · Master prompt §5 · Poglavlje 6.

## 1. Jedan izvor istine

| Sloj | Kolekcija / putanja | Uloga |
| --- | --- | --- |
| **Kanonski** | `companies/{id}/shifts/{driverId}_{date}` | Dnevna dodela. Svaka izmena povećava `revision`. |
| **Projekcija** | `companies/{id}/schedules/{driverId}_{YYYY-MM}` | Mesečni mirror (`parsedShifts`). Menja ga **samo** server u istoj transakciji kao shift. |
| **Katalog** | `service_plans` / duties | Šablon smena — **nije** roster. |

Klijent ne sme da piše `shifts` ni `schedules` direktno (Firestore Rules + `firebase-service` skip). Jedini mutacioni API: `PUT /api/staff/shifts/assignment`.

## 2. Polja kanonskog shift dokumenta

Obavezna posle staff upisa:

- `driverId`, `date`, `type`, `name`, `bus`, `routeCode`, `start`, `end`
- `groupId`, `driverName`, `assignedBy`, `assignedAt`
- `revision` (int ≥ 1 posle prve dodele; create očekuje `expectedRevision: 0`)
- `confirmationBoundRevision` — jednaka `revision` u trenutku upisa
- `confirmedByDriver: false`, `confirmedAt: null`, `shiftFingerprint: null`,
  `confirmationSourceShiftDate: null` (svaka staff izmena poništava potvrdu)

## 3. Optimistic concurrency

1. Klijent šalje `expectedRevision` (iz `shifts[]`; mirror ćelija šalje `0`).
2. Ako se ne poklapa sa serverom → `409 REVISION_CONFLICT` +
   `{ conflict: { currentRevision, shift } }`.
3. Klijent **mora** da primeni `conflict.shift` u lokalni state (`applyServerShiftConflict`)
   i **ne** sme da zadrži svoju zastarelu izmenu.
4. Plan edit lock (`plan_locks`) je dodatni first-writer sloj; ne zamenjuje reviziju.

## 4. Potvrda vozača

Potvrda važi samo dok je `confirmedByDriver === true` i
`confirmationBoundRevision === revision`. Staff mutate resetuje potvrdu.
Scheduler/outbox (Poglavlje 10) koristi fingerprint; posle izmene plana stari
fingerprint se otkazuje.

## 5. Čitanje

- Server policy (`driver-work-policy`): `source: "shift"` ili `"schedule_mirror"`.
- Klijent (`shift-plan.getShiftForDriverDate`): isto. Mirror nikad ne lažira
  pozitivnu day-level reviziju.

## 6. Šta nije u ovom modelu

- Problem/resolution entiteti → Poglavlje 9
- CA katalog import/activate/rollback → Poglavlje 7
- Outbox delivery lifecycle → Poglavlje 10

## 7. Mesečni undo (Poglavlje 8)

- Svaki staff mutate na `shifts/{driverId}_{date}` čuva `priorSnapshot`
  (jedan nivo unazad).
- `clear` ne briše dokument — soft tombstone (`type: "clear"`) zadržava
  reviziju i `priorSnapshot` radi konkurencije i undo-a.
- `POST /api/staff/shifts/assignment/undo` vraća prior stanje, bump-uje
  `revision`, audit `shift_undone`. Ne briše istoriju.
- Klijent ne sme da prijavi „sačuvano“ dok API ne potvrdi; prazan mesečni
  omotač je samo lokalni shell (`localOnly`).

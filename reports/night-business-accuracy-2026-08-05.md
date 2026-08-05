# Noćni rad — poslovna tačnost (2026-08-05)

**Status:** urađeno bez pitanja, po dogovorenom redu (švajcarski sat).  
**Deploy:** nije rađen (čekamo jutarnju odluku).  
**O1–O5:** i dalje sa strane.

## Rezultat provera posle popravki

| Provera | Rezultat |
|--------|----------|
| Lint | **0 errors** |
| Unit | **538 / 538** pass |
| Build + bundle budgets | **OK** |
| E2E (pun paket, 2×) | **57 / 57** pass |

## Šta je popravljeno

### Auth / uloge (CRITICAL → zatvoreno)
- Staff login više ne podrazumeva `dispatcher` i ne prihvata `driver` ulogu.
- `Auth` više ne podrazumeva `driver`/`dispatcher` kad role claim nedostaje — logout.
- Production auth gate proverava `assertSurfaceRole` pre ulaska u app.
- Staff shell na driver ulozi: logout + clear session.
- Role-switch samo u demo režimu.
- SA stealth impersonate samo u demo (produkcija = support session).
- Demo lokalni login zahteva tačnu lozinku (nema fail-open bez password polja).

### CA / ops write gaps
- Vacation API: **dispatcher-only** + group scope.
- Lost-item status API: **dispatcher-only** (uskladjeno sa CA read-only).
- Vacations UI: scope na vidljive vozače + RO blokada.
- Lost-items UI: group/driver scope + RO blokada.
- Group delete: broji i `groupIds[]` (server + CA model).

### Dispečer operativa
- Daily-plan incident lookup koristi `isActiveReport` (ne zastareli `status === "active"`).
- Shifts UI: današnja pokrivena smena ne ide u clear/off/vacation/sick bez incident toka.

### CA import tačnost
- CSV više ne tretira `pin` / `login_code` / `licni_kod*` kao login PIN.
- Mesečni merge import **čuva bus** i confirmation kad je duty identity isti; replace i dalje čisti.

### Vozač / SA (dodato kasnije u noći)
- Uklonjen izmišljeni bus `91022` — koristi se samo dodeljeni bus smene.
- Offline queue se više ne briše na kraju smene (čuva se za sync).
- `create-user` API ne može da mintuje `superadmin`.
- Suspend firme: staff API 403 `COMPANY_SUSPENDED` + login odbija ulazak.
- SA stealth impersonate ostaje demo-only.

### Ulaz (ranije u sesiji)
- `/` otvara BusCommand staff (email + lozinka), bez Vozač PWA gate-a.

## Novi / ažurirani testovi
- `tests/unit/app-surface-roles.test.mjs`
- `tests/unit/company-groups-model-membership.test.mjs`
- proširen `company-groups-server.test.js`, `group-monthly-plan-server.test.js`, `driver-csv.test.js`

## Šta još sledi ujutru (po redu)
1. Ručni acceptance na live/preview (kad odobriš deploy ulaza + ovih fixeva)
2. Vizuelni polish (prazna/loading/error stanja gde još škripi)
3. Vozač PWA dubinski prolaz (van staff pregleda)
4. SMS + GPS tek kad jezgro drži
5. Test-mesec / prodajni pilot

## Rizici / napomene
- Live `buscommand.com` još nema noćne izmene dok se ne push/merge/deploy.
- Server-side incident-first za `PUT /api/staff/shifts/assignment` još nije hard gate (UI jeste) — sledeći kandidat.
- SOS resolve i dalje tenant-wide (može biti namerno zbog bezbednosti).

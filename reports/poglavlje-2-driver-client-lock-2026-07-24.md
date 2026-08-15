# Poglavlje 2 — Driver client write lock (G3)

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1`

## Šta je urađeno

### Client sync
- `saveStateToFirestore` **preskače** kolekciju `drivers` (kao `groups` / `reports`)
- Ručni CRUD/PIN u `drivers.js` i dalje `IS_DEMO_MODE` only
- Onboarding `wizardSaveDrivers` u produkciji: toast `ca_drivers_admin_only`, bez push + PIN

### Rules
- `drivers` `create, delete: if false`
- `update`: samo vozač + `lastSeen` / `lastLocation`
- CA/dispatcher profile mutacije samo Admin SDK (import / status / resend)

### Testovi
- `tests/unit/driver-client-lock.test.mjs`
- ažurirani `company-admin-drivers.test.mjs`, `driver-list-security.test.mjs`

## Iskreno još otvoreno

| Stavka | Status |
|--------|--------|
| Single-driver profile/group edit API | Nema — lokalni `assignDriverToLine` se neće persistovati u produkciji |
| `resend-activation` ApiClient + UI | Endpoint postoji, UI wrapper nema |
| Hard delete / archive driver | Nema (status inactive postoji) |

## G3

| ID | Status |
|----|--------|
| G3 | **Closed** (client bypass) |

## Sledeće (iz matrice)

G4 lost-item / SOS staff API, ili Super Admin support session — po prioritetu.

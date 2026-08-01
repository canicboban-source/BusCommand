# Poglavlje 2 — Public driver directory lock (G5)

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1`

## Šta je urađeno

### Server
- `GET /api/public/companies/:companyId/drivers` → **410** `PUBLIC_DRIVER_DIRECTORY_DISABLED`
- `POST /api/public/drivers/identify` ostaje (EID → id+name, rate-limited)

### Client
- Produkcija: sakriven driver dropdown; EID obavezan
- Demo: lokalni `state.drivers` dropdown (bez public API)

### Legal
- L6: tehnički zatvoreno; pravna potvrda EID-only UX i dalje otvorena (nije inventisan novi poslovni zahtev — identify je već postojao)

## G5

| ID | Status |
|----|--------|
| G5 | **Closed** (technical) |

## Sledeće

G6 ili SA support session

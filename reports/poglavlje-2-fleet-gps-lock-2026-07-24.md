# Poglavlje 2 — Fleet / GPS client lock (G6)

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1`

## Šta je urađeno

### Sync + Rules
- `saveStateToFirestore` preskače `buses` i `routes`
- Rules: `buses` / `routes` `write: if false`

### Client
- `addBus` / `deleteBus` / `addRoute` / `deleteRoute` — samo `IS_DEMO_MODE`
- Live map GPS simulation: `saveState()` samo u demou
- `gps-track.js` ostaje session-only (lat/lng u sessionStorage) — nema Firestore GPS kolekcije

### Šta nije urađeno (namerno)
- Nema novog fleet CRUD API (nije postojao; ne inventišemo)
- Produkcijski live GPS feed i dalje van scope (legal L1)

## G6

| ID | Status |
|----|--------|
| G6 | **Closed** (client bypass) |

## Sledeće

SA support session (L7) ili commit celog P2 niza.

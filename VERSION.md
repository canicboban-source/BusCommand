# BusCommand v30.1

Snapshot sačuvan: **9. jul 2026.**

## Lokacija

`C:\Users\cane\Desktop\fleet_v30.1`

## Šta je u ovoj verziji

- **Group Hub** — upravljanje po formiranoj liniji/grupi (310, 105, bilo koja nova)
- **Mesečni planovi** — pregled i modal „Uredi dan“ (dan, tip smene, šifra, autobus)
- **Per-line shift catalog** (`js/core/line-shift-catalog.js`) — svaka grupa ima svoj šifarnik (`{linija}.F01`, `{linija}.X2`, …)
- **Paket uvoz** — CSV vozači + Excel mesečni plan, dinamički po aktivnoj liniji
- **Group membership** — vozači, autobusi, podgrupe po liniji

## Pokretanje

```powershell
cd C:\Users\cane\Desktop\fleet_v30.1
npm install
npm run build
npm start
```

Demo dispečer: `http://localhost:8766/?demo=dispatcher`

## Prethodna verzija

Bazirano na `fleet_v20.1` (Group Hub + mesečni planovi za sve grupe).

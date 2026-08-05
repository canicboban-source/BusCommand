# Provera rada × 3 — sažetak (2026-08-05)

**Cilj:** švajcarski sat — bez grešaka, tačno, pouzdano, prijatno, radi posao.  
**Odluke O1–O5:** sa strane.  
**Redosled:** dogovoren (ulaz → 3× provera → poslovna tačnost → polish → soft-live → SMS/GPS → test-mesec).

## Rezultati po krugovima

| Krug | Unit | Lint | Build | E2E | Status |
|------|------|------|-------|-----|--------|
| 1 | 532/532 | 0 err (1 warn) | OK | 48/48 (smoke+ops) | ZELENO |
| 2 | 532/532 | — | — | **57/57** (pun paket) | ZELENO |
| 3 | 532/532 | 0 err | OK | **57/57** (ponovljeno) | ZELENO |

Napomena Krug 3: prvi E2E pokušaj pao zbog nestalog Playwright Chromium-a u sandbox cache-u (okruženje, ne app). Posle `playwright install chromium` → **57/57**.

## Šta je pokriveno

- API smoke (health, config, auth fail-closed)
- UI smoke (login, CA, dispečer, vozač, SOS, poruke, odmor…)
- CA mesečni uvoz, katalog/planovi
- Dispečerski cockpit / resolution
- Line 310 Group Hub
- Plan edit lock
- Bus import / multi-group / cross-group warn
- CA read-only ops lock

## Sitna popravka u toku provere

- Uklonjen neiskorišćen import `sourceHashForPlan` u `tests/unit/service-plans.test.js` (lint warning).

## Lokalne izmene ulaza (još nisu na live)

- `/` → BusCommand staff (email + lozinka), bez Vozač PWA gate-a
- Za `buscommand.com` treba odobren deploy

## Sledeći korak u dogovorenom redu

**Poslovna tačnost funkcija po funkcija** (auth → CA → dispečer → vozač → SA), pa vizuelni polish, pa soft-live.

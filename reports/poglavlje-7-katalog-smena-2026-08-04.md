# Poglavlje 7 — CA katalog smena (import / preview / activate / rollback)

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 6 (`e6dd4c5` / `87fac24`)
- Checkpoint commit: *(upisuje se posle commita)*
- Master prompt: v3.2 §6, §17, §20.2

## 1. Cilj

Zatvoriti životni ciklus zvaničnog kataloga smena: sačuvaj nepromenljivu
verziju → aktiviraj atomski → auditovan rollback, uz sticky „Aktiviraj katalog“
traku i source hash.

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C7-1 | Publish = odmah active; nema odvojenog activate | Rešeno (`staged` → `activate`) |
| C7-2 | Nema auditovanog rollback-a | Rešeno (activate superseded verzije) |
| C7-3 | Nema source hash / staging metapodataka | Rešeno (`sourceHash`, file meta) |
| C7-4 | Sticky „Aktiviraj katalog“ traka nedostaje | Rešeno (`.ca-catalog-activation-bar`) |
| C7-5 | History samo View | Rešeno (Activate / Restore) |

Namerno odloženo: server-side file quarantine/malware skener (nema multipart
upload-a; klijent staging + server JSON validacija); inline korekcija redova u
preview-u (re-upload ostaje put; P8/P16).

## 3. Izmene

- `server/service-plans.js` — `publish` → `staged` + hash; novo `activateServicePlan`
- `api-server.js` — `POST …/service-plans/:planId/activate`, audit
  `service_plan_staged` / `_activated` / `_rolled_back`
- Klijent: sticky activate bar; stage+activate na primarnoj akciji; history rollback
- i18n SR/DE/EN; CSS deli sticky stil sa monthly bar-om
- Testovi: unit activate/rollback; access; E2E activate + restore

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz |
| `npm run test:unit` | **472/472** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Ocena

**8.5/10** — §6 lifecycle zatvoren za katalog; mesečni roster UI ostaje P8.
Sledeće: Poglavlje 8 (mesečni plan).

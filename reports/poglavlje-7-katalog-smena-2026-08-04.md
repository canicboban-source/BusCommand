# Poglavlje 7 â€” CA katalog smena (import / preview / activate / rollback)

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna taÄka: Poglavlje 6 (`e6dd4c5` / `87fac24`)
- Checkpoint commit: `07ac15f`
- Master prompt: v3.2 Â§6, Â§17, Â§20.2

## 1. Cilj

Zatvoriti Å¾ivotni ciklus zvaniÄnog kataloga smena: saÄuvaj nepromenljivu
verziju â†’ aktiviraj atomski â†’ auditovan rollback, uz sticky â€žAktiviraj katalogâ€œ
traku i source hash.

## 2. PronaÄ‘eno / reÅ¡eno

| ID | Nalaz | Status |
| --- | --- | --- |
| C7-1 | Publish = odmah active; nema odvojenog activate | ReÅ¡eno (`staged` â†’ `activate`) |
| C7-2 | Nema auditovanog rollback-a | ReÅ¡eno (activate superseded verzije) |
| C7-3 | Nema source hash / staging metapodataka | ReÅ¡eno (`sourceHash`, file meta) |
| C7-4 | Sticky â€žAktiviraj katalogâ€œ traka nedostaje | ReÅ¡eno (`.ca-catalog-activation-bar`) |
| C7-5 | History samo View | ReÅ¡eno (Activate / Restore) |

Namerno odloÅ¾eno: server-side file quarantine/malware skener (nema multipart
upload-a; klijent staging + server JSON validacija); inline korekcija redova u
preview-u (re-upload ostaje put; P8/P16).

## 3. Izmene

- `server/service-plans.js` â€” `publish` â†’ `staged` + hash; novo `activateServicePlan`
- `api-server.js` â€” `POST â€¦/service-plans/:planId/activate`, audit
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

**8.5/10** â€” Â§6 lifecycle zatvoren za katalog; meseÄni roster UI ostaje P8.
SledeÄ‡e: Poglavlje 8 (meseÄni plan).


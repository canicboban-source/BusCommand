# Faza 1 — Čišćenje, bezbednost i prazan start (2026-08-08)

## Ocena Faze 1

**PASS (lokalno)** — build + secrets gate + empty-start proof.  
V66 live import: **NOT VERIFIED — čeka fajl vlasnika** (nije deo Faze 1).  
Cloud / Firestore šema: **nedirano**.

## Komande i exit code

| Komanda | Exit |
|---------|------|
| `node scripts/phase1-empty-start-proof.mjs` | **0** |
| `npm run check:secrets` | **0** |
| `npm run build` (uključuje `check-no-secrets` na početku) | **0** |

## Obrisano / uklonjeno iz produkcijskog puta

| Stavka | Akcija |
|--------|--------|
| `firebase-admin-key.json` | Odsutan iz root-a (gate pada ako se vrati) |
| `js/core/demo-ops-baseline.js` | **Obrisan** |
| `js/dispatcher/plan-edit-lock-demo.js` | **Obrisan** → `plan-edit-lock-local.js` |
| `public/templates/BusCommand_Dienstplan_Import_v1.xlsx` | **Uklonjen** (bio popunjen: 310.S01 / FAHRT…) → `tests/fixtures/qa-dienstplan-sample.xlsx` |
| `BusCommand_Dienstplan_Import_v1.csv` / `.pdf` | Već uklonjeni; gate zabranjuje u `dist` |
| `BusCommand_Drivers_Import_pilot_sr.csv` | Uklonjen (PIN-ovi / imena) |
| `IS_DEMO_MODE` / URL `?mode=demo` | Uklonjeno; lokalni state samo preko `window.__BUSCOMMAND_QA_HARNESS__` |
| `BUSCOMMAND_FORCE_LOCAL_DEMO` / `BUSCOMMAND_DEMO_OTP` | Uklonjeno iz Playwright i API (samo `BUSCOMMAND_QA_HARNESS`) |
| Auto-seed `ensureDemoPlatformAdmin` / `sa@demo.local` | Uklonjeno iz `state.js` |

## Secrets gate

- Skripta: `scripts/check-no-secrets.js`
- npm: `npm run check:secrets`
- Ugrađeno u `npm run build` (prvi korak)
- Pada ako postoji `firebase-admin-key.json` (root ili `dist/`) ili PEM/`private_key` u stablu
- **Napomena vlasniku:** stvarni ključ koji je ranije bio u stablu treba **opozvati/rotirati** u Google Cloud / Firebase konzoli (agent to nije radio i ne može dokazati rotaciju)

## Prazan start (potvrda)

`FRESH_STATE` / prazan shell:

- groups: **0**
- drivers: **0**
- companyAdmins: **0**
- dispatchers: **0**
- shifts / schedules / messages / buses: **0**
- shiftCatalog: **null**
- branding.name: **""**

`public/templates` (i `dist/templates` posle build-a) — samo blank šabloni:

- `BusCommand_Dienstplan_Blank_v1.csv` / `.xlsx`
- `BusCommand_Drivers_Import_v1.csv` (samo zaglavlje)
- `BusCommand_Monthly_Group_Plan_Blank_v1.csv` / `.xlsx`

## QA harness (E2E priprema)

- `tests/e2e/qa-factory.js` — ephemeral tenant/factory
- `tests/e2e/helpers.js` — `installQaHarness` umesto `?mode=demo`
- `playwright.config.js` — `BUSCOMMAND_QA_HARNESS=1`
- Popunjeni katalog za CA upload test: samo `tests/fixtures/` (ne ulazi u `dist`)

Pun E2E suite + matrica = **Faza 2** (po tvom planu).

## Rizik / sledeće

- Stari ad-hoc skriptovi (`scripts/*walkthrough*.mjs`) još mogu pominjati stare QA emailove — nisu produkcioni runtime.
- README / PROJEKAT-STATUS još opisuju stari demo režim — dokumentacija u Fazi 2.
- Node lokalno v26 vs engines 22.x — pratiti.

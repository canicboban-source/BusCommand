# Ultimate Master Prompt — Pre-flight (2026-08-08)

## Našao sam

- Ulazne tačke: `index.html` / `staff.html` / `driver.html` → Vite `dist/`; API `api-server.js` + `server/*`.
- Runtime: na localhost `resolveRuntimeMode` podrazumevano uključuje **demo** (`modeParam === null` ⇒ `isDemoMode`), zatim `ensureDemoOpsBaseline` puni firme/korisnike/planove.
- E2E: Playwright `BUSCOMMAND_FORCE_LOCAL_DEMO=1` + `BUSCOMMAND_DEMO_OTP`.
- Verzija: `1.0.10`. Git: grana `work/ca-group-monthly-import`, HEAD `b10d1ff` (NOT VERIFIED za potpunu istoriju worktree), mnogo lokalnih izmena.
- `firebase-admin-key.json` **prisutan** u stablu (kompromitovan po ugovoru).
- Popunjeni šabloni: `BusCommand_Dienstplan_Import_v1.csv` (katalog smena), `BusCommand_Drivers_Import_pilot_sr.csv` (vozači + PIN-ovi).
- Design: Fleet Aurora / `css/design-tokens.css` ostaje izvor istine.

## Poslednje stanje

- Owner Task Contract (ovaj chat) **nadjačava** staro `?mode=demo` vizuelno pravilo.
- Stari izveštaji (CONDITIONAL PASS / demo matrice) nisu autoritet bez nove provere.

## Menjam

- Runtime: ukloniti demo aktivaciju i auto-seed; prazan start.
- Tajne: obrisati key iz stabla; env + CI gate.
- Šabloni: ukloniti popunjene; zadržati blank CSV/XLSX.
- E2E → izolovan QA harness (ephemeral factory, bez URL demo).
- `.cursor/rules/visual-step-qa.mdc`.
- Matrica funkcija + P0/P1 popravke + vizuelni polish.

## Ne menjam

- Firestore šemu / nove kolekcije.
- Nove produkcione zavisnosti.
- Commit / push / deploy / `pilot:wipe` / `pilot:purge-all`.
- Izmišljeni V66 katalog.

## Rizici

- Duboka sprega `IS_DEMO_MODE` u klijentu — zameniti QA harness-om bez URL bypass-a.
- Stale `dist` ako se ne uradi puni `npm run build`.
- Cloud wipe zabranjen bez inventara + odobrenja.

## Plan dokaza

1. Secrets gate + key removed.
2. Clean start empty (browser + grep).
3. Lint / build / unit / e2e / rules / isolation / budgets / audit ×2.
4. Function matrix sa stvarnim PASS/FAIL.
5. V66 live: `NOT VERIFIED — čeka fajl vlasnika`.

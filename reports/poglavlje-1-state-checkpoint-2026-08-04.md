# Poglavlje 1 — stanje i stabilan checkpoint

Datum: 2026-08-04  
Master prompt: `docs/BusCommand-MASTER-PROMPT.md` v3.1  
Autoritativni worktree: `C:\Users\cane\Desktop\BusCommand-ca-monthly-import`  
Grana: `work/ca-group-monthly-import`  
Početna baza: `c0e915c` (`origin/main`)

## 1. Cilj poglavlja

Utvrditi dokazivo stanje aktuelnog worktree-a, zaštititi završeni CA grupni mesečni import i dispatcher-delete tok, uspostaviti reproduktivno lokalno testno okruženje, izvršiti kompletan gate dva puta i napraviti lokalni checkpoint bez push-a ili merge-a.

Ovo poglavlje ne potvrđuje da je svaki klik aplikacije već testiran. Početni inventar pokrivenosti je u `reports/qa-interaction-ledger-2026-08-04.md`.

## 2. Početno stanje

- Grana je bila 29 stvarno izmenjenih/dodatih fajlova ispred baze, bez commita.
- Tri dodatna status zapisa (`index.html` i dva postojeća CSV šablona) bila su posledica line-ending normalizacije bez sadržajnog diffa i nisu deo funkcionalne izmene.
- Postojeći checkpoint dokumenti odnosili su se na stariju verziju i stariji SHA.
- Projekat zahteva Node 22, dok je globalni runtime bio Node 26.4.0.
- Java nije bila instalirana, zbog čega Firestore emulator ranije nije mogao da se pokrene.
- Playwright Chromium je bio dostupan tek posle lokalne instalacije browser paketa.
- `npm ci` je prvobitno bio blokiran otvorenim `bcrypt.node` handle-om iz zaostalog lokalnog `npm start` procesa.

## 3. Pronađeni problemi i rizik

### High — nedostatak dokaza za kompletan Rules gate

Pre instalacije Jave `npm run test:rules` nije bio izvršiv. Instaliran je Eclipse Temurin JRE 21.0.12+8 i oba ponovljena Rules gate-a su prošla 24/24.

### Medium — runtime drift

Globalni Node 26 nije odgovarao `package.json` zahtevu `22.x`. QA gate je izvršen sa Node 22.23.2 aktiviranim iz izolovanog npm runtime paketa; globalni Node nije menjan.

### Medium — dependency audit

`npm audit --omit=dev` prijavljuje 8 moderate tranzitivnih nalaza kroz `firebase-admin`/Google zavisnosti i `uuid`. Potpuna automatska popravka zahteva breaking prelazak na `firebase-admin@14.2.0`; nije primenjena u ovom poglavlju.

Clean install je dodatno prijavio 20 nalaza u kompletnom dependency stablu (15 moderate, 5 high), uključujući dev tooling. Potrebna je posebna SCA/upgrade procena.

### Medium — automatizovana pokrivenost nije potpuna

- nema autentifikovanog Super Admin Playwright lifecycle-a;
- produkcioni Firebase tokovi se ne izvršavaju u lokalnom demo E2E okruženju;
- CA monthly import browser test mockuje preview/commit HTTP odgovor;
- driver PWA offline/reconnect nije funkcionalno testiran;
- veliki broj access testova proverava source wiring umesto stvarnog HTTP middleware lanca;
- nema sistematskog keyboard/axe testa svakog polja.

### Medium — postojeći embedded API identifier

Secret scan je pronašao hardkodovan Firebase-style API identifier u `scripts/l7-live-smoke.js`. Fajl nije deo ovog diff-a. Firebase web API key često nije poverljiva serverska tajna, ali prisustvo je u konfliktu sa strogom politikom master prompta o API ključevima u repozitorijumu. Poglavlje 2 mora klasifikovati konfiguraciju, proveriti ograničenja ključa i po potrebi ukloniti/rotirati vrednost. Sama vrednost nije kopirana u izveštaj.

### Low — npm konfiguraciono upozorenje

Npm prijavljuje zastareli `devdir` env config i listu nepokrivenih install skripti. Native `bcrypt` require i kompletan gate ipak prolaze. Potrebna je zasebna supply-chain provera pre release-a.

## 4. Okruženje

- OS: Windows 10.0.22000
- Node za gate: 22.23.2
- npm: 11.17.0
- Java: Eclipse Temurin JRE 21.0.12+8 LTS
- Playwright: 1.61.1
- Vite: 6.4.3
- App/package verzija: 1.0.10

Clean dependency install:

```text
npx -y node@22.23.2 "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" ci
exit code 0
951 packages installed
```

## 5. Test komande i rezultati

### Gate 1

```text
npm run lint
exit code 0

npm run test:unit
exit code 0
434/434 passed

npm run test:rules
exit code 0
24/24 passed

npm run build
exit code 0
164 Vite modules transformed
Firebase isolation check passed

npx playwright test --project=chromium
exit code 0
56/56 passed

npm audit --omit=dev
exit code 1
8 moderate findings; breaking upgrade required for complete remediation
```

### Gate 2 — neizmenjeno stanje

```text
npm run lint
exit code 0

npm run test:unit
exit code 0
434/434 passed

npm run test:rules
exit code 0
24/24 passed

npm run build
exit code 0
164 Vite modules transformed
Firebase isolation check passed

npx playwright test --project=chromium
exit code 0
56/56 passed
```

Unit raw-output artefakti:

- `C:\Users\cane\.cursor\projects\c-Users-cane-Desktop-BusCommand-ca-monthly-import\agent-tools\a971be4d-1766-4aaf-be38-e46d98fd807f.txt`
- `C:\Users\cane\.cursor\projects\c-Users-cane-Desktop-BusCommand-ca-monthly-import\agent-tools\4b7e3f03-1937-46d8-9bce-828824d2ada5.txt`

Typecheck i posebna format komanda ne postoje u `package.json`; rezultati nisu izmišljeni. ESLint i Vite build predstavljaju raspoložive statičke/build provere.

## 6. Dokazano funkcionalno stanje trenutnog feature-a

- CA grupni mesečni CSV/XLSX parser, server preview i commit poslovna logika imaju unit testove.
- CA monthly import browser tok prolazi za validan fajl i lokalno odbijanje duplikata.
- Disponentov konkurentni assignment je blokiran tokom aktivnog grupnog importa.
- Deaktivacija i trajno brisanje disponenta prolaze unit i browser tok.
- Tenant provere, potvrda emaila i audit za dispatcher delete su pokriveni.
- Novi prazni CSV/XLSX šabloni postoje i ulaze u production build.
- Kompletan postojeći Chromium paket prolazi bez regresije.

## 7. Šta nije potvrđeno

- Produkcioni Firebase preview/commit i Auth delete nisu izvršeni bez kontrolisanog Firebase test tenanta i QA identiteta.
- Staging/live acceptance test nije deo lokalnog Poglavlja 1.
- Backup/restore proba nije izvršena.
- Pravna, DPO i radnopravna potvrda nije data niti se može zaključiti iz tehničkih testova.
- Nije potvrđen svaki klik/polje; ledger eksplicitno čuva nepokrivene klase za naredna poglavlja.

## 8. Bezbednosni i privacy uticaj

- EID ostaje u CA import granici i ne upisuje se u operativne shift/schedule dokumente.
- Disponent nema pristup EID/PIN/credential podacima.
- Dispatcher delete zahteva prethodnu deaktivaciju, tenant proveru i tačnu email potvrdu.
- Auth nalog i aktivni profil se uklanjaju, dok istorijski planovi i audit ostaju radi operativnog integriteta.
- Rules gate potvrđuje deny-by-default, cross-tenant granice, server-owned upise i session-gated lokaciju u trenutno pokrivenim kolekcijama.

## 9. Rollback i checkpoint

- Pre-feature rollback tačka: `c0e915c`.
- Feature snapshot commit: `5807be728b4b3652a396d9aae8e1d608037f6c09`.
- Lokalni Git attribution hook je naslov feature snapshot commita sveo na `Co-authored-by:`; sadržaj i autor su provereni, istorija nije prepisivana bez eksplicitnog amend odobrenja.
- Završni dokumentacioni checkpoint commit se pravi nakon ove dopune.
- Nema push-a, merge-a, deployment-a niti promene produkcionog Firebase-a.

## 10. Ocena poglavlja

**9/10 za Poglavlje 1.**

Razlog: reproduktivno okruženje je uspostavljeno, Rules blocker uklonjen, kompletan gate je dva puta ponovljen i QA inventar je dokumentovan. Jedan poen ostaje otvoren jer dependency audit ima nerazrešene nalaze i produkcioni/staging dokazi nisu deo lokalnog checkpoint-a.

## 11. Preporučen sledeći korak

Posle vlasnikovog odobrenja otvoriti samo **Poglavlje 2 — tajne, RBAC, Firestore Rules i tenant izolacija**. Prioriteti su embedded API identifier klasifikacija, stvarni HTTP middleware testovi, proširenje Rules matrice na nepokrivene server-owned kolekcije i cross-tenant negativni testovi.

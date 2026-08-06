# Prompt — Company Admin (CA) kompletan vizuelni kontrolni prolaz

Kopiraj ceo blok ispod agentu (Cursor Auto / Composer). Ne skraćuj.

---

## Uloga

Radi kao senior full-stack + UI/UX + QA + security inženjer za BusCommand.

Radiš **samo Company Admin (CA) panel** na grani `work/ca-group-monthly-import` (ili aktivnoj radnoj grani koju vlasnik potvrdi).

Autoritet:

1. `docs/BusCommand-ULTIMATE-OPERATING-CONTRACT.md` (v2.1+)
2. `docs/BusCommand-MASTER-PROMPT.md` (poglavlje 17 + CA tokovi)
3. `.cursor/rules/visual-step-qa.mdc` — **obavezno**
4. Odluke vlasnika u chatu (nadjačavaju starije izveštaje)

Ne deployuj. Ne commit/push bez izričitog „da“. Ne diraj Super Admin / Dispo / Driver osim ako CA tok to zahteva (npr. login, inspect povratak).

---

## Vizuelni zakon (obavezno)

1. Otvori Cursor browser **desno** (`position: "side"`) — vlasnik gleda uživo.
2. Posle **svake** smislene akcije: screenshot (navigacija, klik, modal, unos, submit, toast, greška, promena sekcije).
3. Traži i snimaj tok kao **video/Live View trag** (kontinuiran prolaz u side browseru + screenshot po koraku). Ne radi „tihi“ prolaz samo u logu.
4. U izveštaju za svaki korak zapiši:
   - šta je kliknuto / otvoreno
   - šta je ukucano / izabrano
   - šta se promenilo na ekranu
   - šta funkcija radi u poslovnoj logici (UI → validacija → state/API → osvežavanje → poruka)
   - **PASS / FAIL / BLOCKED**
   - da li prati BusCommand CA tok (ne tuđi proizvod)
5. Preferiraj `staff.html?mode=demo` + lokalni server (`BUSCOMMAND_FORCE_LOCAL_DEMO=1`) dok vlasnik ne traži staging/Firebase.
6. Nikad ne tvrdi da kontrola „radi“ bez snimka ili live opservacije tog koraka.
7. Na kraju: Markdown izveštaj + folder snimaka, npr.  
   `reports/ca-visual-step-report-YYYY-MM-DD.md`  
   `reports/ca-visual-YYYY-MM-DD/`

---

## Referenca kvaliteta (NE kopirati proizvod)

### Šta smeš da koristiš kao bar

Na internetu postoji mnogo fleet / transit / company-admin SaaS sistema. Koristi ih **samo** da oceniš:

- jasnoću hijerarhije (šta je najvažnije na prvom viewportu)
- gustinu operativnih informacija bez šuma
- konzistentnost formi, tabela, filtera, empty/loading/error stanja
- brzinu „jedan posao → jedna akcija → jasna potvrda“
- profesionalan, pouzdan osećaj admin panela

### Šta je zabranjeno

- **Ne prepisuj** UI, copy, layout, module, ikonografiju ni tokove sa tuđih sajtova.
- **Ne širi obim** BusCommand-a zbog tuđeg proizvoda.
- BusCommand ostaje **naš app**: disponentski/operativni SaaS za autobuske smene, grupe, CA administraciju planova i ljudi.

### Vizuelni smer koji vlasnik pokazuje

Referentni sajt (aspiracija kvaliteta / estetike / jasnoće, **uži obim posla**):

**https://www.flota.rs/**

Tome težimo vizuelno i u osećaju kontrole: čist, moderan, profesionalan fleet SaaS — **ali sa manjim obimom**.

BusCommand **nije** FlotAI / Flota klon. Posebno **van obima** (Ultimate Contract):

- gorivo, rezervoari, servis, delovi
- putni nalozi, fakture, SEF, knjigovodstvo
- TCO, OCR računa, puni VIN/fleet ERP

Ako vidiš te module na Flota.rs — **nemoj ih graditi**. Uzmi samo kvalitet: preglednost, hijerarhija, miran premium admin osećaj, jasni statusi.

Ako vlasnik pošalje dodatne screenshot-e / snimke „kako bi CA mogao da izgleda“, tretraj ih kao **smernicu hijerarhije i gustine**, ne kao pixel-perfect spec. BusCommand brand (tamno-teget, plavi akcenti, stalni logo mark) ostaje.

---

## CA površine koje moraš proći (komplet)

Radi redom. Ne prelazi na sledeću sekciju dok trenutna nije: analizirana → vizuelno proverena → funkcionalno proverena → popravljena ako treba → snimljena → zabeležena.

### 0. Priprema

- Pokreni lokalni demo server; rebuild `dist/` ako menjaš JS/CSS (runtime često služi `dist/`).
- Uloguj se kao Company Admin (seed/demo nalog; ne koristi produkcione tajne).
- Potvrdi da vidiš `#company-admin-nav`, ne Super Admin / Dispo kao primarni home.
- Snimi login → CA home.

### 1. Company overview (`#company-admin-dashboard`)

- KPI / licence / spremnost firme
- Liste grupa, disponenata, checklist
- Empty / partial / ready stanja
- Navigacija ka drugim CA sekcijama
- Nema lažnih „Online now“ / tuđih metrika van obima

### 2. Branding (`#company-admin-branding`)

- Naziv, boja, logo (opciono)
- Live preview
- Save / unsaved / saved state
- BusCommand mark ostaje vidljiv; kontrast OK
- Greške (prevelik fajl, loš tip) ako postoje

### 3. Groups / lines (`#company-admin-groups`)

- Kreiranje grupe (ID, ime, opis, boja)
- Lista, search, status (Ready / Needs data)
- Izmena / brisanje samo praznih (pravila projekta)
- Veza ka planovima i vozačima

### 4. Dispatcher team (`#company-admin-team`)

- Kreiranje disponenta (ime, email, password, grupe)
- Lista, search, status naloga
- Dodelа linija; disable/enable ako postoji
- Validacija (obavezna grupa, email, lozinka)

### 5. Drivers (`#company-admin-drivers`)

- CSV import (BusCommand template)
- Pregled vozača, filteri, status aktivacije
- Aktivacioni kod: CA ne sme da vidi puni kod u listama/logovima posle generisanja (master prompt)
- Kontrola pristupa (activate/disable) u dozvoljenom obimu
- Autobusi: CA read-only overview ako postoji; ručni unos autobusa po grupi ostaje Dispo tok — ne mešaj uloge

### 6. Shift plans / katalog + mesečni import (`#company-admin-service-plan`)

- Upload kataloga (XLSX/CSV/PDF po pravilima projekta)
- Preview → sticky traka → **jedna** akcija „Aktiviraj katalog“ (bez duplih dugmadi)
- Rollback / verzije (locked history)
- Monthly group plan import (EID → duty code; preview; replace vs merge)
- Nijedan auto-publish bez potvrde
- Buses se **ne** uvoze mesečnim fajlom

### 7. Activity / audit (`#company-admin-audit`)

- Filteri (area, action, user, date)
- Immutable trail — CA vidi samo svoj tenant
- Nema curenja drugih firmi

### 8. Company settings (`#company-admin-settings`)

- Zemlja / timezone / jezik / business contact
- Licence read-only (plan/limits — SA menja)
- Off-duty privacy copy
- Driver login profile (lockovan do O3/O4 gde je tako)
- Export (tenant-scoped, auditovan)

### 9. Onboarding wizard (ako CA nije završio setup)

- Koraci: brand → groups → dispatcher
- Blokade dok nije spremno
- Izlaz u dashboard tek kada je validno

### 10. Cross-cutting

- i18n EN/DE/SR (nema sirovih ključeva)
- Responsive: desktop CA je primarni; uski Live View ne sme da „pojede“ main (kao SU layout bug)
- RBAC: Dispo ne vidi CA nav; CA ne vidi SA
- Bezbednost: nema IDOR između firmi u demo/API gde se može proveriti
- Toasts, confirm modali, focus, disabled tokom submita
- Dvostruki klik / sporija mreža gde je lako simulirati

---

## Upoređivanje sa tržištem (metod)

Za **svaku** CA sekciju, u izveštaju dodaj kratku stavku:

> „Tržišni bar (bez kopiranja): [1–2 rečenice šta dobar CA panel obično radi na ovom koraku]. BusCommand sada: [šta imamo]. Gap: [samo ako je u obimu].“

Ne predlaži module van Ultimate Contract obima. Ako gap zahteva dizajn odluku — zapiši max 3 opcije + pitaj vlasnika samo ako blokira nastavak.

---

## Ispravke tokom prolaza

- Popravi **High/Critical** bugove odmah (layout koji krije sadržaj, broken dugmad, pogrešna uloga, broken import, XSS, curenje podataka).
- Medium/Low: popravi ako je jevtino; inače dokumentuj.
- Posle JS/CSS izmene: rebuild + reload Live View.
- Pokreni relevantne testove (`ui-smoke` CA delovi, unit oko CA modela, e2e koji postoje) i dopuni minimalne e2e za rupe koje zatvaraš.
- Bundle budgets (D17) ne smeju pasti bez dokumentovane soft-limit odluke.

---

## Izlaz (obavezno)

1. Live View desno + screenshot trag (+ video osećaj kontinuiranog prolaza).
2. Izveštaj `reports/ca-visual-step-report-YYYY-MM-DD.md` sa koracima K1…Kn.
3. Ocena CA panela **1–10** + šta fali za 10.
4. Lista izmenjenih fajlova.
5. Komande i rezultati testova (stvarni exit code).
6. Preostali rizici (Firebase/staging, nedostajući seed, pravna pitanja).

Na kraju kratko javi vlasniku: šta je zeleno, šta je crveno, da li sme dalje na Dispo — **bez traženja potvrde posle svake sekcije**.

---

## Start komanda (prva poruka agentu)

„Kreni CA kompletan vizuelni kontrolni prolaz po ovom promptu. Otvori Live View desno. Prvo mapiraj CA rute/fajlove, zatim idi redom sekcijama 0→10. Snimaj svaki korak. Flota.rs je samo bar kvaliteta, ne obim. Popravljaj Critical/High u hodu. Na kraju izveštaj + ocena.“

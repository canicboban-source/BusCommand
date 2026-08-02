# BusCommand — Swiss-watch execution prompt (za odobrenje vlasnika)

**Verzija:** 1.2 · **Datum:** 2026-08-03  
**Status:** ODOBRENO (vlasnik 2026-08-03) — jedini znak = **plavi logo** iz chata.  
**Repo (jedini izvor):** `C:\Users\cane\Desktop\BusCommand` (`canicboban-source/BusCommand`)  
**Live:** `https://www.buscommand.com`  
**Test asseti:** `C:\Users\cane\Downloads\` (+ logo koji je vlasnik poslao u chat)  
**Ustav (nadređeni dokument):** `docs/BusCommand-MASTER-PROMPT-v3.1.md` (Master Prompt v3.1)

---

## Odnos prema Master Promptu v3.1 (obavezno)

Ovaj nalog je **podređen** `BusCommand-MASTER-PROMPT-v3.1`.

- Ako bilo šta u ovom fajlu konfliktuje sa Masterom → **važi Master**.
- Pass 1 i Pass 2 **ne** znače “sve odjednom bez strukture”. Idú **po poglavljima / ulogama** u skladu sa Master §A (strogi iterativni protokol):
  1. Super Admin  
  2. Company Admin  
  3. Dispečer  
  4. Vozač (PWA)  
  5. Cross-cutting (security, tenant, i18n, logo, build/lint/unit)
- Unutar svakog poglavlja: pregled → test → (po potrebi) popravka → ponovni test. Critical/High se zatvaraju **pre** prelaska na sledeće poglavlje.
- Posle svakog poglavlja: kratak rezime + ocena 1–10 za to poglavlje (Master §29).
- Pravni / GDPR / Betriebsrat deo se **tehnički priprema i dokumentuje**, ali se **ne proglašava** “pravno usklađenim” (Master §23 / ulaz).
- Posebna Master pravila koja Swiss mora poštovati u relevantnim poglavljima: kanonski model plana (§5–8), SOS jedan + press-hold (§15), `urgent-action` amber (§11), sticky potvrda uvoza (§6/vizuelna dopuna), BC znak stalno (§19), release gate (§31) pre deploy tvrdnje.

Vlasnik jednim **`ODOBRENO`** odobrava ovaj Swiss nalog kao **jedan ograničeni radni paket** pod Masterom (ne kao zaobilaznicu Master §A).

---

## Šta ovaj prompt jeste

Ovo je **radni nalog** po kome agent radi. Nije izveštaj. Nije “samo analiza”.

Agent mora:

1. proći **ceo sistem** (od prvog do poslednjeg relevantnog toka), **poglavlje po poglavlje**,  
2. **proveriti svaku funkciju / dugme / put / opciju** unutar aktivnog poglavlja,  
3. uraditi to **dva puta** (Pass 1 + Pass 2) — svaki pass ide istim redosledom poglavlja,  
4. objasniti **šta ne radi i zašto**,  
5. **popraviti**,  
6. **ponovo testirati** dok aplikacija ne bude švajcarski sat,  
7. koristiti Downloads + kanonski logo vlasnika.

Korisnikovi pojedinačni live nalazi (PDF >2MB, logo, delete vs deactivate, Activity email…) su **obavezni ulazi**, ali **ne sužavaju** obim — obim je **ceo proizvod**, izvršen kroz Master-usklađena poglavlja.

---

## Cilj (definicija “švajcarskog sata”)

Aplikacija je švajcarski sat tek kad za **Super Admin, Company Admin, Dispečer i Vozač** važi:

- svaka vidljiva funkcija ima jasan put:  
  `UI → validacija → auth/RBAC → API → poslovna logika → baza/transakcija → audit → osvežavanje UI → uspeh ili jasna greška`  
  (usklađeno sa Master tok-formulom, uklj. notifikaciju/oporavak gde postoji)
- nema mrtvog dugmeta, lažnog success-a, placeholder “uskoro”, tihe greške, pogrešnog tenanta, hardkodovanog korisničkog teksta, demo/Transit Flow tragova u produkcijskom toku
- BusCommand logo vlasnika je **uvek** na login-u, header-u, favicon-u, driver/staff površinama (tenant logo sme biti **pored**, nikad umesto) — Master §19
- dvostruki prolaz (Pass 1 i Pass 2) je zelen za Critical/High u **svim** poglavljima
- lint + unit + build prolaze; smoke pokriva dirnute tokove

**Ocena 10 nije cilj na silu.** Ocena raste samo uz dokaz (komanda, browser/API rezultat, SHA). Ne koristiti “100%”, “potpuno bezbedno”, “pravno usklađeno” ili “production ready” bez Master §31 kriterijuma.

---

## Nepromenljiva pravila

1. Bez React/Vue rewrite-a. Vanilla ESM ostaje.  
2. Minimalan diff po nalogu; ne mešaj redesign sa security fix-om bez potrebe.  
3. Ne izmišljaj poslovna pravila. Ako nije u kodu/odluci/Masteru → `Business decision` + ≤3 opcije.  
4. **Ne commit / push / deploy / Render** dok vlasnik eksplicitno ne kaže.  
5. Ne diraj: `*.legacy.js`, `fleet-bundle.legacy.js`, `DEMO_STATE` (osim zahteva), tajne, ručno `dist/`.  
6. Soft-delete / **deactivate** za vozače, dispečere, buseve = **namerno** dok vlasnik ne naredi hard delete. Ako UI piše “Obriši” a radi deactivate → popravi labelu/i18n da ne zbunjuje.  
7. Uvezeni početak/kraj smene ≠ zvanična evidencija radnog vremena.  
8. Jedna radna grana od `main`; ne uništavaj checkpoint.  
9. Tajne iz Downloads (npr. firebase admin JSON) **nikad** u git/commit/log.  
10. Master §A: ne skači na sledeće poglavlje dok Critical/High u tekućem nisu zatvoreni ili eksplicitno `OPEN` uz odluku vlasnika.

### Klasifikacija

`Critical` · `High` · `Medium` · `Low` · `Improvement` · `Business decision` · `Legal validation`

---

## Kanonski logo (obavezno) — ODOBRENO 2026-08-03

- **Jedini** znak aplikacije: **plavi logo** (stilizirano plavo B) koje je vlasnik **poslao u chat**.  
- Ne koristiti druge „logo“ nazive — samo ovaj plavi logo.  
- Upotreba **uvek i svuda**: login, header, favicon, apple-touch, driver topbar, staff shell, loading overlay, PWA ikone.  
- Datoteke (bit-identične chat fajlu): `public/brand/logo-mark.png`, `logo-hero.png`, `logo-icon-512.png`.  
- Tenant branding sme biti **samo pored** ovog znaka — **nikad umesto** njega (Master §19).

---

## Test materijal (Downloads)

| Materijal | Upotreba |
|-----------|----------|
| `Dienstplan 310 V66 2026_02_09.pdf` | CA service plan (~1.3 MB) |
| `Dienstplan 320 V37 2025_02_17.PDF` | CA service plan (~3.4 MB) — mora proći |
| `mesecni_plan_vozaca_310_avgust_2026.xlsx` | Dispo mesečni/package import |
| CSV vozača (`vozaci_test_nalozi*`, `qa-driver-import*`, `buscommand_drivers.csv`) | CA import vozača |
| Busevi `91500`–`91525` | Dispo hub import / Add bus |
| Logo asseti | BC kanonski + opciono Blaguss PNG/WEBP kao tenant pored BC |

---

## Redosled rada (strogo)

### Faza 0 — odobrenje
- Ovaj prompt (v1.1) je odobren porukom vlasnika (npr. `ODOBRENO`).  
- Tek tada agent kreće.  
- Pre prvog poglavlja: git status, grana, poslednji commit-i, mapiranje (Master §2) — read-only dok se ne krene u fix.

### Faza 1 — Pass 1 (kompletan test #1, poglavlje po poglavlje)
Za svako poglavlje A→E redom:

1. Nađi UI (dugme/forma/`data-action`) u tom poglavlju.  
2. Prati ceo put kroz kod i, gde je moguće, stvarno izvrši.  
3. Happy path + fail path (prazno, prevelik fajl, 401/403, dupli klik, pogrešan tenant).  
4. Upisi: `PASS` / `FAIL` + dokaz.  
5. Critical/High u poglavlju: **fix odmah** + ciljani re-test pre prelaska.  
6. Na kraju poglavlja: kratak rezime (Master §29).  
7. Medium/Low mogu ići u backlog poglavlja ako ne blokiraju prelazak — ali se beleže.

### Faza 2 — Objašnjenje (posle Pass 1 / posle svakog kritičnog bloka)
Kratak, istinit rezime:

- šta ne radi,  
- zašto (root cause u kodu),  
- uticaj na ulogu,  
- prioritet,  
- referenca na Master paragraf ako važi.

### Faza 3 — Popravke
- Fix po prioritetu unutar aktivnog poglavlja: Critical → High → Medium → ostalo.  
- Posle grupe fix-eva: lokalni lint/unit/build za dirnuto.  
- Logo + PDF limit + audit actor + sticky plan + import 310/320 + busevi su **must-fix** ako FAIL (pripadaju CA/Dispo/cross poglavljima).

### Faza 4 — Pass 2 (kompletan test #2)
- Ponovi **isti** redosled poglavlja A→E kao Pass 1 (ceo sistem, ne samo popravljeno).  
- Sve što je bilo FAIL mora biti `PASS` ili eksplicitno `OPEN` sa razlogom / Business decision / Legal validation.  
- Ako Pass 2 otkrije regresiju → nazad na Fazu 3 za to poglavlje, zatim ponovo Pass 2 za pogođeno + povezano.

### Faza 5 — Završni dokaz
- `reports/swiss-watch-run-YYYY-MM-DD.md` sa Pass1/Pass2 matricom po poglavlju, root cause, izmenjeni fajlovi, komande, ocene.  
- Ne tvrditi Master §31 “release ready” dok gate nije dokazan.  
- Pitaj vlasnika za commit/PR/deploy — **ne radi sam**.

---

## Inventura koju agent MORA proći (oba passa)

### Poglavlje A) Super Admin
Login/PIN · dashboard/overview · create company · create CA · copy ID · company detail · open app · reset CA password · enable/disable CA · suspend/activate company · delete company (samo test tenant) · support start/end · bez curenja tajni/login kodova · tenant granice.

### Poglavlje B) Company Admin
Overview/KPI · ops overview read-only · branding (plavi logo uvek) · groups (uklj. 310/320) · team/dispečeri (deactivate-only, revoke, reset pwd, grupe) · drivers (CSV import, edit, personal code, deactivate-only) · service plan (PDF 310, PDF 320 >2MB, preview, sticky confirm, publish, history) · activity/audit (User ≠ sirovi email) · settings · exports · onboarding wizard ako postoji · i18n sr/de/en.

### Poglavlje C) Dispečer
Login/setup grupa · group hub · package/XLSX 310 · bus import 91500–91525 · add/deactivate bus · daily plan · monthly plan · assign/edit/remove shift (sticky delete = FAIL) · plan lock acquire/release/break · messages · reports/incidents (`urgent-action`) · SOS resolve · vacations · lost items · live map ako postoji (GPS samo u dozvoljenom prozoru) · logout/theme.

### Poglavlje D) Vozač (PWA)
Identify/login · personal-code activation · (company-code removed = OK) · work session · confirm shifts · check-in (dokumentuj ako local-only) · quick reports · SOS (jedan, press-hold/potvrda) · lost item · vacation · messages read/archive · calendar · language/theme/logout · nema IDOR.

### Poglavlje E) Cross-cutting
Multi-tenant izolacija · RBAC na serveru · audit na mutacijama · rate limit / revoke session · SW ne kešira auth/PII · production build · nema demo podataka u prod toku · kanonski logo na svim surface-ima · i18n kompletnost dirnutih ključeva.

---

## Posebni must-fix ulazi vlasnika (ako FAIL)

1. PDF plan > 2 MB (320 ~3.4 MB) mora da se uveze.  
2. Plavi logo (poslat u chat) uvek i svuda.  
3. Dispečer: nema hard delete — samo deactivate (uskladi UI ako zbunjuje).  
4. Vozač: isto.  
5. Activity “User” ne sme da pokazuje email kao ime.  
6. Test sa 310/320 + vozači + busevi 91500–91525.

---

## Šta agent NE sme

- Da zaobiđe Master v3.1 ili Master §A.  
- Da “završi” posle pisanja plana bez Pass 1 + Pass 2 po poglavljima.  
- Da proglasi Swiss-watch / production ready / pravno usklađeno bez dokaza.  
- Da deployuje na live bez odobrenja.  
- Da proširi scope na mikroservise / novi framework / veliki CSS redesign.  
- Da briše produkcione tenante ili koristi prave tajne u izveštaju.  
- Da pređe na sledeće poglavlje dok Critical/High u tekućem nisu rešeni ili eksplicitno ostavljeni OPEN uz vlasnika.

---

## Format odgovora vlasniku posle rada

1. Pass 1 rezime (PASS/FAIL po poglavlju A–E)  
2. Šta ne radi i zašto (lista)  
3. Šta je popravljeno (fajlovi)  
4. Pass 2 rezime  
5. Šta je još OPEN (uklj. Legal validation)  
6. Ocena po poglavlju + ukupna ocena 1–10 sa dokazom  
7. Tačan next step (npr. “odobri commit/PR/deploy”)

---

## Potvrda vlasnika

- **2026-08-03:** ODOBRENO UZ IZMENU — jedini znak = plavi logo iz chata. Agent radi po **v1.2**.

---

## KRAJ PROMPTA

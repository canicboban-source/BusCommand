# Zadatak za razvojnog agenta — popravke iz live provere (2026-07-26)

**Kontekst:** ovo je nastavak postojećeg rada na BusCommand-u (`reports/*.md`, `docs/BusCommand-MASTER-PROMPT.md`). Danas je urađena nezavisna, ručna, hands-on provera na `www.buscommand.com` (produkcija) i `buscommand-preview.onrender.com`, uz stvarno kreiranje i brisanje sintetičke test firme kroz Super Admin panel. Pun nalaz sa dokazima, screenshotovima i tačnim koracima reprodukcije je u `reports/live-review-2026-07-26.md` — **pročitaj taj fajl u celini pre nego što počneš**, ovaj prompt je samo sažeti radni nalog izveden iz njega.

Radi po pravilima iz `docs/BusCommand-MASTER-PROMPT.md` §2 i §26: prvo `git status`/`git log` da vidiš trenutno stanje (radno stablo je bilo vrlo "prljavo" — 256 nekomitovanih fajlova na grani `fix/remove-logo-url-field` u trenutku provere), radi u zasebnoj grani, ne pravi rewrite van obima, svaka promena dobija test i kratak izveštaj u `reports/`. Ne nagađaj poslovnu logiku koja nije jasna — dokumentuj i pitaj.

Sve niže navedeno je **potvrđeno uživo, sa reprodukcijom**, ne pretpostavka — ali uzrok u kodu (tačan fajl/red) treba da agent pronađe i potvrdi pre popravke.

---

## KRITIČNO — radi prvo

### 1. Vozačka prijava ne radi ni sa ispravno postavljenim PIN-om

**Reprodukcija:**
1. Kao Company Admin, uvezi vozača preko CSV-a (Drivers → Choose CSV file → Import).
2. Otvori "Edit driver profile" za tog vozača, upiši "New personal code (PIN)" (npr. 5 cifara), sačuvaj.
3. Activity log potvrđuje audit zapis "Driver Personal Code Set" sa tačnim `DriverId`.
4. Otvori `driver.html`, unesi isti EID i isti PIN.
5. **Rezultat: "Nevažeći podaci." — prijava odbijena, dosledno, ponovljeno dva puta.**

**Šta proveriti:** da li CA "set new PIN" tok (`server/driver-routes.js` ili sličan, endpoint za CA edit profila vozača) upisuje PIN u isto polje/hash koje login-check čita; da li postoji skriveni preduslov (npr. `mustActivate`/OTP-first-time flag) koji blokira login uprkos ispravnom PIN-u i koji nije nigde naznačen CA-u u interfejsu. Ovo je release-blocker — bez ovoga nijedan vozač ne može da se uloguje, bez obzira na SMS/OTP status.

**Prihvatanje:** nov CSV-uvezen vozač + CA-set PIN → uspešna prijava na `driver.html`. Dodati regresioni test (unit + Playwright ako je moguće).

### 2. `localStorage` keš po firmi (`buscommand_state_<companyId>`) se nikad ne briše — stare/obrisane firme se vraćaju u UI

**Reprodukcija:**
1. Uloguj se kao CA za bilo koju firmu (u browseru se pravi ključ `buscommand_state_<companyId>` u `localStorage` sa punim brendingom/grupama/porukama).
2. Odjavi se, ili obriši firmu preko Super Admin panela ("Delete", uz typed-confirmation).
3. Ključ **ostaje** u `localStorage` — potvrđeno na dva odvojena primera (`buscommand_state_blaguss` i `buscommand_state_qa-test-gmbh`, oba preživela logout i/ili SA brisanje firme).
4. Posledica: stari naziv firme/brend boja se povremeno vraćaju u formama (npr. "Company branding" prikazuje staro ime), i sesija zna da pozove API sa **pogrešnim/tuđim `companyId`** (video sam `GET /api/license/blaguss` pozvan iz sesije koja pripada potpuno drugoj firmi).

**Šta proveriti:** verovatno u `js/core/state-observer-setup.js` / `firestore-sync.js` / sličnom — gde se piše i čita `buscommand_state_<companyId>`.

**Prihvatanje:**
- Ključ se briše pri logout-u (za trenutno ulogovanu firmu).
- Ključ se briše (klijentski i/ili server šalje signal) kad SA obriše firmu.
- Nijedan API poziv ne sme koristiti `companyId` iz lokalnog keša — companyId mora uvek doći iz trenutnog auth tokena/servera.
- Regresioni test: login firma A → logout → login firma B → nijedan network poziv ne sme sadržati companyId firme A.

---

## VISOK PRIORITET

### 3. Hardkodovane srpske poruke grešaka nezavisno od izabranog jezika

**Reprodukcija:** na `driver.html`, sa jezikom eksplicitno na EN ili DE, pogrešan EID/kod prijave ispisuje `"Nevažeći podaci."` (i server vraća `{"error":"Nevažeći token."}` na `401`). Potvrđeno u oba jezika.

**Šta uraditi:** naći te string-ove (verovatno `js/auth/login-driver.js` i odgovarajući server error) i provući kroz `translations.js` ključeve za sr/de/en.

### 4. Nekonzistentno/tiho ponašanje grešaka pri CA/Dispečer prijavi (i blagi user-enumeration)

**Reprodukcija (isti jezik, EN):**
- Ispravan email + pogrešna lozinka → prikazuje se poruka ("Wrong password"/generic).
- Nepostojeći email + bilo koja lozinka → **nikakva poruka**, polja se samo isprazne, bez toast-a, bez konzolne greške.

**Šta uraditi:** mapirati `auth/user-not-found` na istu generičku poruku kao `auth/wrong-password` ("Pogrešan email ili lozinka" / "Wrong email or password"), na sva tri jezika. Cilj: uvek ista poruka, bez obzira da li email postoji.

---

## SREDNJI PRIORITET

### 5. Super Admin "Details" dugme na redu firme ne radi

Dugme je aktivno i ispravno "ožičeno" (`data-action="superadminOpenCompanyDetail"`), ali klik ne otvara modal (`#sa-company-detail-modal` ostaje `display:none`, bez JS grešaka). Popraviti handler ili ukloniti dugme dok ne radi (master prompt §26 — ne ostavljaj nefunkcionalno dugme).

### 6. SA/CA dashboard brojači i liste ne odražavaju stvarno stanje posle re-login-a

- SA "Create Company Admin Account" sekcija posle re-login-a pokazuje "No company admins created." iako CA nalog sigurno postoji i radi.
- CA "Company overview" KPI kaže "2 Dispatchers", dok stvarna "Dispatcher team" stranica u istoj sesiji pokazuje samo 1.

Proveriti da li se ove liste/brojevi učitavaju sa servera pri svakom loginu, ili delom zavise od privremenog session-state-a koji se gubi/zastareva.

### 7. CA "Company setup" wizard se vraća prazan pri svakom loginu

Čak i posle potpunog završetka (firma + grupa + dispečer kreirani), wizard se ponovo pojavljuje pri svakom sledećem loginu. Koraci 2 (grupa) i 3 (dispečer) su **prazni** (placeholder tekst izgleda kao popunjena vrednost) — realan rizik da CA klikne "Next" misleći da su podaci već tu i napravi **duplikat** grupe/dispečera.

**Šta uraditi:** wizard treba da proveri da li već postoji bar jedna grupa / jedan dispečer i da automatski preskoči taj korak ili se uopšte ne prikaže ako je firma već postavljena.

---

## NISKO / KOZMETIKA

### 8. Pluralizacija

"1 drivers are ready for review", "Import 1 drivers", "Successfully imported 1 drivers!" — treba jednina za count=1. Najmanje 3 mesta u toku uvoza vozača.

### 9. Nekonzistentan jezik po ulozi

Super Admin Dashboard prikazuje tekst na engleskom iako je jezički selektor pokazivao "DE" (CA panel je ispravno pokazivao nemački u istoj sesiji/browseru).

### 10. "Trial period" banner prikazan i Super Adminu (vlasniku platforme)

Verovatno generička komponenta bez provere uloge — SA ne bi trebalo da vidi sopstveni "trial" countdown.

---

## Napomena o already-known otvorenim stavkama (iz ranijih izveštaja, i dalje važe)

Ovi nisu novi, ali ih ne zatvaraj slučajno kao "gotovo" dok gore navedeno nije rešeno:
- Rules emulator test (`npm run test:rules`) i dalje blokiran bez Java.
- Live GPS blokiran dok legal L1 nije zatvoren (`reports/legal-l1-gps-brief-2026-07-25.md`).
- `CONFIRMATION_JOB_SECRET` još ručno na Renderu.

## Šta NE raditi

- Ne uključivati live GPS / pravi SMS / scheduler bez eksplicitne odluke vlasnika.
- Ne praviti nove test naloge/firme u produkciji bez čišćenja posle (isto pravilo koje sam ja pratio: napravi sintetičku firmu, testiraj, obriši).
- Ne menjaj `firestore.rules` bez `git diff` pregleda pre commita.
- Ne commituj Desktop credential pack (`BusCommand-Test-Nalozi`) niti `firebase-admin-key.json`.

## Definicija završenog za svaku stavku

- Kod na zasebnoj grani.
- Regresioni test (unit i/ili Playwright) koji dokazuje popravku, ne samo da build prolazi.
- Kratak izveštaj u `reports/` sa: šta je bio uzrok, šta je promenjeno, koja komanda/test je pokrenut i prošao, šta ostaje otvoreno.
- Ne tvrdi da je nešto popravljeno ako nije ručno/testom potvrđeno da radi — pogotovo stavka 1 (vozačka prijava), jer je to bio release-blocker.

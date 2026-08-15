# BusCommand — nezavisna live provera (2026-07-26, popodnevna sesija)

**Ko je radio:** Claude (Cowork), nezavisno od prethodnih agent-sesija istog dana.
**Šta je pregledano:** lokalni repo (`C:\Users\cane\Desktop\BusCommand-Preview-Local`, read-only), `https://www.buscommand.com`, `https://buscommand-preview.onrender.com` (staff + driver), API endpoint-i bez i sa pokušajem autentifikacije.
**Šta NIJE rađeno:** nikakvo čuvanje/brisanje/menjanje podataka, nijedan destruktivan poziv, nijedan commit/push.

Ovo je verifikacija sa dokazima (screenshot/HTTP status/git output), ne prepričavanje starih izveštaja iz `reports/`. Gde se moj nalaz razlikuje od nečeg što već piše u `reports/`, to je jasno naznačeno.

---

## 1. KRITIČNO

### 1.1 Live sesija realnog klijenta "BLAGUSS" se automatski otvara na www.buscommand.com — bez unosa lozinke

Kad sam otvorio `https://www.buscommand.com/staff.html` u tvom Chrome-u, aplikacija je **sama, bez ijednog klika na login**, učitala postojeću Firebase sesiju i otvorila **"Company branding"** ekran sa pravim podacima firme **BLAGUSS** (pravi naziv, prava brend boja `#D8252C`, upload logoa). Konzola je odmah ispisala:

```
✅ Firebase: Granular State loaded for blaguss
✅ Firebase: Real-time granular sync active for blaguss
🔄 Firebase: Remote update for groups
🔄 Firebase: Remote update for dispatchers
```

Nisam ništa upisao niti sačuvao. Pokušao sam da se odjavim klikom na "Log out" i reload — sesija se **odmah ponovo automatski ulogovala** u istu Blaguss firmu (persistentna Firebase Auth sesija u ovom Chrome profilu, po svemu sudeći tvoja stvarna prijava kao vlasnik/dispečer te firme).

**Zašto je ovo Critical:** ovo znači da je BusCommand u ovom trenutku **već u produkcionoj upotrebi sa pravim klijentom** (Blaguss), ne samo u "soft pilot" fazi sa sintetičkim `bc-test` nalogom kako opisuju današnji izveštaji u `reports/`. To menja procenu rizika za SVE što sledi — svaka greška u kodu sad direktno utiče na pravog korisnika, ne na test tenant.

**Šta treba da se uradi:**
1. Potvrdi da li je Blaguss zaista aktivan pravi klijent ili sopstveni test nalog koji si napravio pod realnim imenom. Ako je pravi klijent — status projekta mora da se tretira kao **hard pilot / produkcija**, ne "soft pilot", i svi §22/§29 pravni artefakti (DPIA, ROPA, retention) postaju hitni, ne "kasnije".
2. Ako želiš da nastavim testiranje kroz test naloge (kao što si rekao), preporučujem da se **eksplicitno odjaviš** iz Blaguss sesije na ovom uređaju/profilu (ili rotiraš tu sesiju) pre nego što bilo ko drugi (ili agent) otvori `www.buscommand.com` u ovom Chrome-u — trenutno svako ko otvori taj sajt na ovom računaru upada direktno u Blaguss admin bez lozinke.
3. Ja sam za dalje testiranje prešao na `buscommand-preview.onrender.com` (odvojen origin, bez deljene sesije), tako da Blaguss podaci nisu dirani nakon ovog nalaza.

**Dodatni tehnički detalj (bitan za popravku):** probao sam da "izađem" iz Blaguss sesije na dva načina — (a) klik na "Log out" dugme u UI, (b) programski: obrisao sam sve `firebase*` IndexedDB baze + `localStorage` + `sessionStorage` za `www.buscommand.com` i uradio reload. **Ni jedno ni drugo nije upalilo** — posle oba pokušaja stranica se i dalje sama vratila u Blaguss sesiju ("Firebase: Granular State loaded for blaguss").

**UPDATE — pravi uzrok pronađen (nije bio jasan kad je ovaj izveštaj prvi put poslat):** nije server-side kolačić. Aplikacija čuva **kompletan lokalni keš stanja firme u `localStorage`, po ključu `buscommand_state_<companyId>`** — npr. `buscommand_state_blaguss` — koji sadrži i brending (`name: "BLAGUSS"`, `primaryColor: "#D8252C"`), grupe, dispečere, poruke itd. Ovaj ključ:
- se **ne briše ni pri logout-u**, ni pri brisanju firme sa Super Admin panela (potvrdio sam identičan obrazac i sa svojom test firmom: `buscommand_state_qa-test-gmbh` je ostao u `localStorage` i posle SA-brisanja te firme preko "Delete" dugmeta);
- verovatno se koristi kao **offline/fallback izvor podataka** kad live Firestore konekcija kasni — što objašnjava zašto se "BLAGUSS" ime i boja povremeno vrate u formama/headeru čak i posle brisanja firme iz baze i posle logout-a: aplikacija na trenutak prikaže stari keš dok (ili ako) sveži podaci ne stignu.

Ja sam ručno obrisao oba zaostala ključa (`buscommand_state_blaguss`, `buscommand_state_qa-test-gmbh`) iz `localStorage` u ovom browseru preko konzole — to je čisto lokalno čišćenje keša, ne dira bazu — tako da se "BLAGUSS" trenutno više ne bi trebalo pojavljivati u ovom browseru. **Ali ovo se vraća čim neko drugi (ili ti na drugom uređaju/browseru) otvori aplikaciju dok firma još postoji u bazi** — pravi fix mora biti u kodu, ne ručnim brisanjem keša.

**Prava preporuka za kod:** `buscommand_state_<companyId>` mora da se obriše iz `localStorage`:
1. pri logout-u (za trenutno ulogovanu firmu),
2. pri brisanju firme sa Super Admin panela (server bi trebalo da vrati signal klijentu da očisti keš, ili klijent treba eksplicitno da ukloni taj ključ posle uspešnog `Delete`),
3. idealno: ključ treba da nosi i vremensku oznaku/TTL, pošto branding/grupe/poruke firme koja više ne postoji ne bi trebalo da žive neograničeno u tuđem browseru.

### 1.2 Sve tri "soft pilot" test lozinke (SA/CA/Dispečer) NE RADE na live serveru

Iz `C:\Users\cane\Desktop\BusCommand-Test-Nalozi\test-nalozi.json` (generisano danas 2026-07-26 09:42) probao sam sva tri naloga na `https://buscommand-preview.onrender.com/staff.html`:

| Nalog | Email | Rezultat |
|---|---|---|
| Super Admin | `sa.test@buscommand.local` | ❌ "Pogrešan email ili lozinka." |
| Company Admin | `ca.test@bc-test.local` | ❌ "Falsches Passwort." |
| Dispečer | `disp.test@bc-test.local` | ❌ "Falsches Passwort." |

Proverio sam preko DOM-a (`input.value`) da su email/lozinka ukucani tačno kako piše u fajlu (bez razmaka/autofill greške), tako da ovo nije greška u kucanju — server dosledno odbija sve tri lozinke iz paketa.

**Posledica:** owner-ova "role-by-role live checklist" (`reports/poglavlje-9-role-checklist-2026-07-26.md`), na kojoj se zasniva procena "88% soft-pilot ready" iz `release-readiness-2026-07-26.md`, **fizički nije mogla da se izvrši** sa ovim paketom naloga — a izveštaji to ne pominju kao rizik. Ja takođe nisam mogao da kliknem kroz CA/SA/Dispečer ekrane uživo zbog ovoga.

**Šta treba da se uradi:**
1. Ponovo pokreni `node scripts/bootstrap-preview-test-accounts.js --out ...` da vidiš da li skripta zaista resetuje lozinku postojećih naloga ili samo upisuje lozinku u fajl a nalog u Firebase-u ostaje sa starom lozinkom (`"created": false` u JSON-u sugeriše da nalozi već postoje i da ih skripta možda ne resetuje).
2. Dok se ovo ne reši, obustavi dalje pokušaje logina na ista tri naloga — napravio sam 4 neuspela pokušaja (Dispečer 2×, CA 1×, SA 1×); ako postoji rate-limit/lockout (`server/rate-limit.js`), vredi proveriti da nalozi nisu sada privremeno zaključani.

### 1.3 Radna kopija repoa je izuzetno "prljava" i na drugoj grani od one koju izveštaji pominju

```
Trenutna grana:  fix/remove-logo-url-field
Poslednji commit: d918ebe, 2026-07-26 18:56:39 +02:00, "Remove logo URL field; keep file upload only."
Izmenjeno (M):    256 fajlova, nekomitovano
```

`reports/poglavlje-1-forensic-2026-07-24.md` govori o grani `work/master-prompt-ch1`; to više nije aktivna grana. Dodatno, `.git/index.lock` fajl trenutno postoji i nije mogao da se obriše ("Operation not permitted") — što obično znači da **neki drugi git proces upravo radi nad ovim repoom** (npr. druga sesija/alat na tvom računaru u ovom trenutku).

**Zašto je bitno:** 256 nekomitovanih fajlova + aktivan lock = realan rizik da se izgubi napredak ili da dva procesa (ti/drugi agent i ja) slučajno pišu u isti repo istovremeno. Ovo direktno krši sopstveno pravilo iz `docs/BusCommand-MASTER-PROMPT.md` (§2: "ne ponavljaj raniji posao dok dokazima ne utvrdiš stanje", "radi u zasebnoj grani/worktree-u").

**Šta treba da se uradi:** ne pokreći paralelno dve agent-sesije nad istim repoom bez git worktree izolacije; commituj ili bar `git stash` trenutne izmene pre nego što bilo ko drugi (uključujući mene) dira fajlove, da se izbegne konflikt.

### 1.4 Live deploy nije u koraku sa najnovijim commit-om (mini stale-deploy, drugačiji od jutrošnjeg)

Najnoviji commit (`d918ebe`, 18:56) kaže "Remove logo URL field; keep file upload only" — ali kad sam otvorio Blaguss "Company branding" formu (odeljak 1.1), polje **"Or HTTPS URL"** i dalje postoji na živom sajtu. To znači da live `www.buscommand.com` još uvek servira build **pre** ovog poslednjeg commit-a.

Ovo je odvojeno od jutrošnjeg nalaza u `reports/domain-stale-deploy-2026-07-26.md` (koji je govorio o starom tekst-logu) — taj problem izgleda **rešen** (video sam ispravan plavi B logo i na `www.buscommand.com` i na Preview-u, `uptime` ~100–120s na oba, verzija `30.1.0` na oba, što znači da su oba restartovana skoro istovremeno i verovatno služe isti noviji build od jutros). Ali sadašnji commit iz 18:56 još nije stigao do živog sajta — očekivano ako Render deployuje samo posle push-a na `main`, a trenutna grana je `fix/remove-logo-url-field`.

**Šta treba da se uradi:** potvrdi da li `fix/remove-logo-url-field` treba da se merguje u `main` da bi Render pokupio ovu promenu, ili je namerno još nemergovano.

---

## 2. VISOK PRIORITET

### 2.1 Hardkodovane srpske poruke o grešci — i18n nije kompletan (potvrđeno uživo)

Na `driver.html` (Preview), sa jezikom eksplicitno postavljenim na **English** (svi ostali tekstovi ispravno prevedeni: "Driver", "Login code", "Sign on duty"), pogrešan EID/kod prijave i dalje ispisuje toast:

> **Nevažeći podaci.**

Isto sam potvrdio i sa jezikom na **Deutsch** — ista srpska poruka. Dodatni poziv na `/api/driver/identify` sa lažnim EID-om vraća `401` sa telom `{"error":"Nevažeći token."}` — poruka je hardkodovana na srpskom na nivou servera/klijenta, ne prolazi kroz `translations.js`.

Ovo je tačno ono što `reports/poglavlje-1-gap-matrix-2026-07-24.md` i `session-full-report-2026-07-25.md` već navode kao otvorenu stavku ("uklanjanje srpskih `||` fallbackova"), ali danas potvrđujem da **i dalje postoji uživo**, uključujući baš na ekranu koji vozač prvi vidi (login).

**Šta treba da se uradi:** naći string "Nevažeći podaci" / "Nevažeći token" u kodu (verovatno `js/auth/login-driver.js` ili `driver-routes.js`) i provući kroz `translations.js` ključeve za sva tri jezika.

### 2.2 Nekonzistentno (i delimično curenje) ponašanje grešaka pri prijavi na staff.html

Testirao sam dva slučaja na istom ekranu (Dispečer/CA login), isti jezik (EN):

| Slučaj | Email postoji? | Prikazana poruka |
|---|---|---|
| Ispravan email, pogrešna lozinka | Da (`disp.test@bc-test.local`) | "Falsches Passwort." / generička poruka |
| Nasumičan, nepostojeći email | Ne | **Ništa** — polja se samo isprazne, nema toast-a, nema konzolne greške |

To znači da trenutno ponašanje **razlikuje** "email postoji, loša lozinka" od "email ne postoji" — što je klasičan **user-enumeration** propust (napadač može da proveri koji email-ovi postoje u sistemu na osnovu toga da li se pojavljuje poruka ili ne), a uz to je i loše korisničko iskustvo za legitimnog korisnika koji pogrešno ukuca email (dobija tišinu, ne objašnjenje).

**Šta treba da se uradi:** mapirati i `auth/user-not-found` i `auth/wrong-password` (Firebase kodovi grešaka) na **istu** generičku poruku ("Pogrešan email ili lozinka"/"Wrong email or password"), i to uraditi na sva tri jezika.

---

## 3. SREDNJI PRIORITET

### 3.1 Više paralelnih kopija projekta na Desktopu

Pored `BusCommand-Preview-Local`, na Desktopu postoje i: `BusCommand-Preview-ClaudeWork`, `BusCommand-Preview-WorkingCopy`, `_ARHIVA_BusCommand`. Nisam ulazio u njih (nije mi dat pristup, samo imena foldera). Rizik: lako je izgubiti iz vida koja je kopija "izvor istine", posebno u kombinaciji sa nalazom 1.3 (aktivan git lock).

**Šta treba da se uradi:** potvrdi koja je kopija autoritativna (verovatno `BusCommand-Preview-Local` prema git remote-u koji sam video: `github.com/canicboban-source/BusCommand-Preview.git`) i po mogućnosti arhiviraj/ukloni ostale sa Desktopa da ne dođe do slučajne zabune ili rada na pogrešnoj kopiji.

### 3.2 "PREVIEW" bedž je vidljiv i na `www.buscommand.com` (custom domenu)

I na jutrošnjem izveštaju i sada, zeleni "PREVIEW" bedž u gornjem levom uglu je prisutan i na custom domenu `buscommand.com`, ne samo na `*.onrender.com`. Ovo je verovatno namerno za soft-pilot fazu (transparentnost da nije finalna verzija), ali ako je Blaguss (nalaz 1.1) stvarni klijent koji redovno koristi sistem, vredi potvrditi da li taj bedž treba da bude vidljiv njemu ili je to nešto što treba ukloniti/sakriti sada kada nalaz 1.1 sugeriše da je ovo već u realnoj upotrebi.

---

## 4. POZITIVNO POTVRĐENO (bez nalaza — radi kako treba)

Ovo sam lično proverio uživo, ne prepisao iz starih izveštaja:

- `GET /api/health` i `/api/config` rade identično na `www.buscommand.com` i `buscommand-preview.onrender.com` (200, `mode: production`, `firebase: true`, `version: 30.1.0`).
- `GET /api/admin/overview` bez tokena → **401** `{"error":"Nema tokena."}` — ispravno odbijeno.
- `GET /api/public/companies/bc-test/drivers` → **410** `PUBLIC_DRIVER_DIRECTORY_DISABLED` — javna lista vozača je zaista onemogućena, kako izveštaji tvrde.
- SA "hidden" pristup (5× klik na logo) radi i otvara poseban modal, odvojen od običnog CA/Dispečer login toka.
- `firebase-admin-key.json` je u `.gitignore` i **nije** komitovan u repo (proverio `git check-ignore` i `git ls-files`) — nema curenja privatnog ključa u istoriji koda koju sam proverio.
- Driver login ekran (`driver.html`) nema demo/test hintove vidljive korisniku.

---

## 5. ŠTA NISAM MOGAO DA PROVERIM DANAS (i zašto)

Zbog nalaza 1.1 i 1.2, **nisam mogao da odradim pun "klik na svako polje"** kroz stvarne SA/CA/Dispečer/Vozač ekrane, jer:
- Test nalozi ne rade (1.2), pa nisam mogao da se ulogujem kao CA/Dispečer/SA na test tenant.
- Jedina radna sesija koju sam zatekao je bila realna (Blaguss), i namerno je nisam dalje koristio niti menjao, po tvom uputstvu.

Konkretno NIJE provereno uživo klikom danas: Grupe/linije, Tim dispečera, uvoz službenog plana (XLSX/CSV/PDF), dnevni/mesečni plan, problem-resolution tok, poruke, mapa/GPS simulacija, Lost & Found, vozačka aktivacija OTP end-to-end, Super Admin tenant lifecycle akcije. Sve ovo je ranije "na papiru" testirano u `reports/poglavlje-8-3-e2e-qa-2026-07-26.md` (Playwright 41/41) — ali to su automatizovani testovi protiv lokalnog/build okruženja, ne isto što i ručni klik na živom sajtu koji si tražio.

**Preporuka:** popravi nalog 1.2 (test lozinke), potvrdi nalaz 1.1 (Blaguss sesija), pa mogu u sledećoj sesiji da završim pun ručni obilazak svih 2ekrana/uloga na živom sajtu.

---

## 6. Revidirana procena (u odnosu na `reports/release-readiness-2026-07-26.md`)

Taj izveštaj tvrdi **~88% soft-pilot / ~62% hard-pilot**. Na osnovu današnjih nalaza, ta procena je bila **prevremena**:

- Test-nalog checklist na kojoj se "88%" delimično oslanja **nije mogla fizički da se izvrši** (1.2).
- Sistem je već u kontaktu sa realnim podacima jednog klijenta (1.1), što pomera ceo razgovor iz "soft pilot" u "moram da tretiram ovo kao produkciju" — uključujući pravne stavke (DPIA, GPS L1) koje izveštaji već ispravno označavaju kao otvorene, ali sad hitnije.

Realnija procena za **danas**: soft-pilot tehnička spremnost **~65–70%** (ne 88%) dok se 1.1–1.4 ne reše i dok se ne odradi pravi ručni obilazak iz odeljka 5.

---

## 7A. DEO 2 — hands-on test kroz sintetičku firmu (posle brisanja demo podataka)

Nakon što si obrisao sve demo podatke i dao mi svoje SU (Super Admin) kredencijale (`canicboban+buscommand-owner@gmail.com`), baza je bila potpuno prazna (0 firmi/vozača/dispečera). Uz tvoju dozvolu napravio sam jednu sintetičku test firmu **"QA-Test GmbH"** (`qa-test-gmbh`), kompletno je testirao kroz sve uloge, i **na kraju je obrisao** preko SA panela (typed-confirmation delete) — produkcija je sada opet čista, potvrđeno ("No companies yet. Register one above.").

Ovo je pravi "klik na svako polje" prolaz kroz SA → CA → (Dispečer nalog kreiran, ali login nije testiran zbog nedostatka vremena) → Vozač.

### 7A.1 Nov, ozbiljan nalaz: CA-postavljeni PIN vozača ne radi za prijavu (High)

Kreirao sam vozača kroz CSV import (EID `QA9001`), zatim mu preko **"Edit driver profile"** postavio nov PIN (`13579`) — audit log je odmah potvrdio akciju: **"Driver Personal Code Set"** sa tačnim `DriverId`. Uprkos tome, prijava na `driver.html` sa `EID: QA9001` / `Anmeldecode: 13579` je **dva puta uzastopno odbijena** sa "Nevažeći podaci." — probao sam pažljivo, dva odvojena pokušaja, ista greška oba puta.

Ovo je ozbiljnije od ranijeg nalaza sa test-nalog paketom (1.2), jer ovde je PIN postavljen upravo sada, kroz zvaničan CA tok, i audit ga potvrđuje kao uspešno sačuvan — a ipak ne radi za login. Mogući uzroci (nisam mogao dalje da potvrdim bez pristupa serverskim logovima/Firestore-u):
- Novoimportovan vozač možda zahteva prvu OTP aktivaciju pre nego što CA-postavljeni PIN uopšte postane važeći login kod (ako je tako, to nigde nije naznačeno u CA interfejsu — polje kaže samo "It is shown once after save", ne pominje da vozač prvo mora da se aktivira drugim putem).
- Mogući bug u tome kako se PIN hešira/upoređuje između CA-set toka i login-check toka.

**Preporuka:** ovo direktno blokira kompletno testiranje vozačkog PWA (nisam mogao da uđem dalje od login ekrana ni sa test-nalog paketom ni sa svežim CA-kreiranim vozačem). Treba proveriti server-side kod za `driver-routes.js` / `driver-activation-otp.js` — da li CA-set PIN zaista upisuje u isto polje koje login-check čita, i da li postoji skriveni preduslov (npr. `mustActivate`/`otpVerified` flag) koji blokira login uprkos ispravnom PIN-u.

### 7A.2 Nov nalaz: sesija jedne firme poziva API drugog (nepostojećeg) tenant-a (High — tenant-izolacija)

Dok sam bio ulogovan kao CA za **QA-Test GmbH**, mreža je pokazala pozive na:

```
GET https://www.buscommand.com/api/license/blaguss
```

— dakle poziv ka licenci firme **"blaguss"**, ne `qa-test-gmbh`, iz sesije koja pripada potpuno drugoj firmi. Trenutno je bezopasno jer je `blaguss` obrisan (vraća 404 "Firma nije pronađena"), ali ovo pokazuje da negde na klijentskoj strani ostaje **zaostali (stale) companyId u kešu/storage-u** koji se ne resetuje ispravno između sesija različitih firmi. **Ovo je isti uzrok kao nalaz 1.1** — `localStorage` ključ `buscommand_state_blaguss` (vidi update u 1.1) je i dalje postojao u ovom browseru i očigledno se negde čita kao "poslednja aktivna firma" nezavisno od trenutno ulogovane CA sesije. Da je "blaguss" (ili bilo koji drugi realan tenant) i dalje postojao, ova sesija bi mu čitala license status iz sesije koja NIJE ta firma.

**Preporuka:** proveriti odakle klijent uzima `companyId` za `/api/license/:id` poziv — treba da se izvodi isključivo iz trenutnog auth tokena/servera, nikad iz keširane klijentske vrednosti koja može da zaostane iz prethodne sesije u istom browseru.

### 7A.3 Ponovljen obrazac: polja za pretragu "cure" identitet iz prethodne, nepovezane sesije (Medium)

Ovo sam sada video **dva puta** na dva različita mesta:
- Dispečerov email (`disp.test@bc-test.local`) se pojavio pre-popunjen u CA **audit-actor** filter polju iako CA nikad nije ručno upisao taj email.
- Email SU vlasnika (`canicboban+buscommand-owner@gmail.com`) se pojavio pre-popunjen kao **USER** filter u CA **Activity log**, zbog čega je log prvo prikazao "No matching activity" (0 rezultata) sve dok nisam ručno rikliknuo "Reset" — tek tada su se pojavili stvarni zapisi (9 učitano, 3 operacije).

**Zašto je bitno:** ako se CA osloni na Activity log da proveri "da li se nešto desilo", a filter je tiho pred-popunjen pogrešnim korisnikom, CA će pogrešno zaključiti da nema aktivnosti. Ovo je UX/podatkovni bug, ne bezbednosni proboj, ali vredi popraviti — filter polja ne bi trebalo da nasleđuju vrednosti iz drugih uloga/sesija.

### 7A.4 SA panel — dugme "Details" ne radi (Medium)

Na Super Admin listi firmi, dugme **"Details"** je aktivno (nije `disabled`) i ispravno "ožičeno" (`data-action="superadminOpenCompanyDetail"`), ali klik **ne otvara ništa** — proverio sam kroz DOM da odgovarajući modal (`#sa-company-detail-modal`) ostaje `display:none` i posle klika, bez ijedne JS greške u konzoli. Za poređenje, dugme **"Support"** je ispravno `disabled` (soft-pilot default OFF, kako i treba), a **"Sperren"/"Löschen"** su ispravno ožičeni i rade.

**Preporuka:** popraviti handler za `superadminOpenCompanyDetail` da zaista ukloni `hidden` klasu / postavi `display`, ili ukloniti dugme dok ne radi (master prompt §26: "ne ostavljaj nefunkcionalno dugme").

### 7A.5 SA panel ne pokazuje stvarno stanje posle re-login-a (Medium)

Kreirao sam CA nalog (`ca.qatest@buscommand-test.local`) i on je odmah radio (uspešno sam se ulogovao i koristio ga opsežno). Ali kad sam se kasnije vratio na SA Dashboard (nova sesija, isti browser), sekcija **"Create Company Admin Account"** je pokazivala **"No company admins created."** — kao da nalog ne postoji, iako sasvim sigurno postoji i radi. Slično, CA "Company overview" je pokazivao **"2 Dispatchers"**, dok stvarna "Dispatcher team" stranica u istoj sesiji pokazuje samo **1** nalog.

**Zaključak:** neki brojevi/liste na SA i CA dashboard-u se ne učitavaju iznova sa servera pri svakom loginu, već delom zavise od privremenog stanja iz sesije u kojoj su kreirani — posle re-login-a prikazuju zastarelu/netačnu sliku. Ne utiče na stvarne podatke (nalog i dalje radi), ali čini dashboard nepouzdanim izvorom istine, što je direktno u sukobu sa ciljem iz master prompta ("SA dobija maksimalnu legitimnu kontrolu... sa jasnim pregledom").

### 7A.6 CA "Company setup" wizard se vraća pri svakom loginu, prazan (Medium — rizik od duplikata)

Company-setup wizard (Branding → First group → First dispatcher) se **ponovo pojavio kod svakog mog sledećeg login-a/reload-a** kao CA, iako sam ga već jednom kompletno završio (firma, grupa 310, dispečer napravljeni). Pri ponovnom pojavljivanju:
- Korak 1 (Branding) je bio pred-popunjen postojećim podacima (ime firme, boja) — ok.
- Korak 2 (grupa) i korak 3 (dispečer) su bili **potpuno prazni** (placeholder tekst kao "310"/"Linija 310" izgleda kao vrednost, ali nije) — da sam kliknuo "Next" bez razmišljanja, realan rizik je da bi se napravila **duplirana grupa/dispečer**. Ja sam svaki put koristio "Skip (add later)" / "Finish without dispatcher" da izbegnem duplikate — i to je ostavilo tačno jedan "Branding Updated" audit trag koji nije bio potreban (re-save iste brend konfiguracije).

**Preporuka:** wizard treba da proveri da li su koraci 2/3 već ispunjeni (postoji bar jedna grupa / jedan dispečer) i da se automatski preskoči ili sakrije, umesto da se iznova prikazuje kao da firma nikad nije podešena.

### 7A.7 Manji nalazi

- **Pluralizacija (i18n):** "1 drivers are ready for review", "Import 1 drivers", "Successfully imported 1 drivers!" — gramatički pogrešno za jedninu, pojavljuje se na najmanje 3 mesta u toku uvoza vozača.
- Super Admin Dashboard prikazuje tekst **na engleskom** iako je jezički selektor pokazivao "DE" — CA panel je za razliku od toga ispravno prikazivao nemački. Nekonzistentnost po ulozi.
- Banner **"Trial period: X days remaining"** prikazuje se i samom SA/vlasniku platforme — verovatno generička komponenta namenjena Company Adminima koja nije uslovljena ulogom.

### 7A.8 Pozitivno potvrđeno (Deo 2)

- Ceo tok SA → registracija firme → kreiranje CA naloga → CA login → wizard → grupa → dispečer je **radio ispravno** iz prve, bez grešaka.
- CSV uvoz vozača: ispravan preview/staging korak pre potvrde, ispravno parsiranje polja (EID, ime, telefon, email, company_code).
- "Edit driver profile" modal ispravno primenjuje RBAC: eksplicitno piše "CA can see EID and set a new personal code (PIN). Dispatchers only see name, email and phone." — i audit zapis PIN promene **ne sadrži samu vrednost PIN-a**, samo `DriverId` (dobra praksa).
- Brisanje firme zahteva **upisivanje tačnog Firmen-ID/Company-ID kao potvrdu** pre nego što dugme "Delete" uopšte odradi nešto — dobar safeguard za destruktivnu akciju (master prompt §26/§30).
- Test firma je na kraju **potpuno očišćena** — produkcija je opet na 0 firmi, kako je i bila pre testa.

---

## 7. Tačan sledeći korak (predlog redosleda)

1. **Najpre popraviti vozačku prijavu (7A.1)** — bez ovoga nijedan vozač ne može da se uloguje ni sa CA-postavljenim PIN-om ni sa starim test-nalog paketom. Ovo je sada potvrđeno kao pravi funkcionalni bug, ne samo zastareli kredencijali.
2. Proveriti i popraviti stale `companyId` curenje (7A.2) — pregledati kako se `companyId` prosleđuje klijentskim API pozivima poput `/api/license/:id`.
3. Ti: potvrdi da li je ranije viđeni "Blaguss" bio pravi klijent — sad kad su demo podaci obrisani, ovo je manje hitno, ali dobro je znati za buduće planiranje (pravni/DPIA status).
4. Popraviti dead "Details" dugme na SA panelu (7A.4) i SA/CA dashboard brojače koji ne odražavaju stvarno stanje posle re-login-a (7A.5).
5. Popraviti CA onboarding wizard da se ne vraća prazan posle prve kompletirane postavke (7A.6) — rizik od dupliranih grupa/dispečera ako korisnik ne primeti da su polja prazna.
6. Ispraviti i18n hardkodovane srpske poruke grešaka (2.1), nekonzistentno ponašanje login grešaka (2.2), i pluralizaciju "1 drivers" (7A.7).
7. Rešiti `.git/index.lock` / 256 nekomitovanih fajlova (1.3) i razjasniti da li `fix/remove-logo-url-field` treba u `main`/deploy (1.4) pre nego iko drugi radi na repou.
8. Tek posle stavke 1 (vozačka prijava) ima smisla praviti novi test tenant i završiti pun klik-kroz obilazak Dispečer + Vozač PWA (uključujući SOS, quick-report, potvrdu smene) — ovaj put nisam stigao do njih jer je vozačka prijava blokirala dalji napredak.

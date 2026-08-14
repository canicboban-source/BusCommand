# Zadatak za razvojnog agenta — popravke posle drugog kruga provere (2026-07-26)

**Kontekst:** ovo ZAMENJUJE prethodni radni nalog (`reports/agent-task-live-review-fixes-2026-07-26.md`) — ne radi po njemu, radi po ovom fajlu, jer je stavka #1 tamo upućivala na pogrešno mesto u kodu. Pun dokaz i koraci reprodukcije za sve niže navedeno su u `reports/live-review-2026-07-26.md` (prvi krug) i `reports/recheck-2026-07-26.md` (drugi krug, danas) — **pročitaj oba pre nego što počneš**, prvenstveno drugi.

Radi po pravilima iz `docs/BusCommand-MASTER-PROMPT.md` §2 i §26: prvo `git status`/`git log`, radi u zasebnoj grani, ne diraj nepovezane fajlove, ne nagađaj poslovnu logiku koja nije jasna — dokumentuj i pitaj. Svaka popravka dobija regresioni test i kratak izveštaj u `reports/`.

Drugi krug provere je urađen na novoj sintetičkoj test firmi (kreirana, testirana, potpuno obrisana) — svih 10 stavki iz prvog kruga i dalje postoje bez promene, plus su otkrivena 2 nova nalaza. Sve niže je **potvrđeno uživo, sa reprodukcijom**.

---

## KRITIČNO — radi prvo, ovim redosledom

### 1. Vozačka prijava ne radi — TAČAN UZROK SADA POZNAT

**Ovo zamenjuje staru stavku 1 iz prethodnog naloga. Stari nalog je pogrešno upućivao na PIN storage/hash tok — to NIJE problem.**

**Dokaz uzroka (urađeno danas):** pozvan je backend endpoint `POST /api/public/drivers/identify` direktno, van UI forme:
- Sa telom `{eid, pin, companyId}` → `200 OK`, `{"success":true,"driver":{...}}` — PIN je tačan, backend logika radi ispravno.
- Sa telom `{eid, pin}` (bez `companyId`) → `400 Bad Request`, `{"code":"INVALID_DATA","error":"Nevažeći podaci."}` — identično onome što vozač vidi uživo na `driver.html`.

Provera DOM-a `driver.html` login forme pokazuje da **ne postoji nijedno polje (vidljivo ili skriveno) za companyId/firmu** na vozačkom login ekranu — samo EID i PIN. Frontend nikad ne šalje `companyId` serveru, pa backend ispravno odbija svaki zahtev (EID očigledno nije globalno jedinstven preko svih firmi), ali frontend nikad nije napravljen/popravljen da tu vrednost obezbedi.

**Zadatak:** naći kod koji šalje ovaj fetch/XHR poziv (verovatno `js/auth/login-driver.js` ili slično) i dodati companyId u telo zahteva. Otvoreno pitanje za tebe da istražiš i, ako nije očigledno, dokumentuješ i pitaš: odakle companyId treba da dođe na vozačkom ekranu — da li driver.html treba da ima polje/izbor firme (kao dodatno polje pored EID), ili companyId treba da se sačuva lokalno (device-scoped, ne cross-tenant) posle prve aktivacije vozača i ponovo koristi pri svakoj sledećoj prijavi. Ne biraj sam ako nije jasno iz postojećeg koda/dokumentacije — ovo je poslovna odluka.

**Prihvatanje:** nov CSV-uvezen vozač + CA-set PIN → uspešna prijava na `driver.html`, sa proverom preko network taba da zahtev ka `/api/public/drivers/identify` sadrži companyId. Regresioni test (unit + Playwright) koji proverava telo zahteva, ne samo krajnji rezultat.

### 2. `localStorage` keš po firmi (`buscommand_state_<companyId>`) se i dalje ne briše

Nepromenjeno od prvog izveštaja: ključ ostaje posle logout-a i posle SA brisanja firme. Danas dodatno potvrđeno da ovaj zaostali keš može ometati i SA login (videti stavku 4 ispod — nije 100% jasno da li su ova dva bug-a povezana, istraži).

**Prihvatanje (nepromenjeno):**
- Ključ se briše pri logout-u za trenutno ulogovanu firmu.
- Ključ se briše (klijentski i/ili server šalje signal) kad SA obriše firmu.
- Nijedan API poziv ne sme koristiti companyId iz lokalnog keša — companyId mora uvek doći iz trenutnog auth tokena/servera.
- Regresioni test: login firma A → logout → login firma B → nijedan network poziv ne sme sadržati companyId firme A.

### 3. NOVO — Service worker vozačke PWA (`sw-driver.js`) kontroliše celu domenu, ne samo `driver.html`

**Dokaz:** na `staff.html` (dispečerska/CA/SA strana), `navigator.serviceWorker.getRegistrations()` vraća aktivan service worker sa `scope: "https://www.buscommand.com/"` (koren cele domene) i `scriptURL` koji pokazuje na `sw-driver.js`. Taj SW koristi `clients.claim()` i cache-first strategiju (`caches.match`), bez network-first fallback logike koju sam uspeo da pronađem pretragom fajla. Ovo znači da vozački service worker kontroliše i dispečerski/admin interfejs, suprotno arhitekturnom principu izolacije (master prompt §20).

Moguća (nije 100% dokazana, samo koreliše) posledica: na `staff.html` je zabeležena konzolna greška "Firebase render callback failed: renderCompanyAdminDashboard TypeError: Failed to fetch dynamically imported module: https://www.buscommand.com/admin/company-admin.js" (404/503 na taj modul) dok je ovaj SW aktivan.

**Zadatak:** registruj `sw-driver.js` sa eksplicitnim, uskim scope-om (npr. `/driver.html` ili poddirektorijum), proveri da build/deploy (Render/`render.yaml` ili ekvivalent) ne šalje `Service-Worker-Allow-Scope` header koji nenamerno širi scope na koren. Istraži da li je 404/503 na `/admin/company-admin.js` posledica ovog SW-a ili odvojen problem (proveri i da li ta putanja uopšte postoji u trenutnom build izlazu — možda je reč o pogrešnoj/zastareloj putanji u kodu koji pokušava dinamički import).

**Prihvatanje:** posle logina na `staff.html`, `navigator.serviceWorker.getRegistrations()` ne vraća nijedan SW čiji scope pokriva `/staff.html` ili `/admin/*` ako taj SW pripada vozačkom PWA. Regresioni test (Playwright) koji proverava scope liste service worker-a na obe strane (`driver.html`, `staff.html`).

### 4. NOVO — Intermitentan SA login race condition (nije uvek reproducibilno, ali ozbiljno)

**Reprodukcija:**
1. Ulogovan kao Super Admin, radi normalno.
2. Logout.
3. Pokušaj ponovnog logina sa ISTIM ispravnim mejlom/lozinkom → forma odmah (pre klika, dok se kuca) prikazuje "No account found with this email"; dugme ostaje zatamnjeno.
4. Klik na "Log in" ipak šalje zahtev — Firebase Auth `accounts:signInWithPassword` vraća `200 OK`, token se osvežava, `firebase.auth().currentUser` ima ispravan UID/email/`role:"superadmin"` custom claim.
5. UI se NE prebacuje na SA dashboard — ostaje na login ekranu sa istom greškom.
6. Full page reload → korisnik NIJE ulogovan, sesija nije perzistirana.
7. Sledeći pokušaj (identičan mejl/lozinka) → radi normalno, dashboard se učitava.

**Zaključak:** autentifikacija na Firebase Auth nivou je tehnički ispravna; problem je u frontend logici koja povremeno (a) lažno prikazuje "nalog ne postoji" na osnovu neke client-side provere pre nego što stigne odgovor od Firebase-a, i (b) ne prebacuje UI na autentifikovano stanje uprkos uspešnom loginu.

**Zadatak:** dodaj logging/telemetriju oko auth-state-listener logike (npr. `onAuthStateChanged` handler, i bilo koju client-side proveru koja odlučuje "account exists" pre stvarnog Firebase poziva) da se uhvati tačan trenutak/uslov kad se ovo dešava. Ne pokušavaj popravku naslepo dok se ne razume tačan trigger — ovo je flaky bug, teško ga je popraviti bez razumevanja uzroka. Ako se pronađe veza sa stavkom #2 (zaostali `buscommand_state_*` keš), dokumentuj to eksplicitno.

**Prihvatanje:** minimum — dokumentovan tačan uzrok u `reports/`, sa dokazom (logovi/repro koraci) šta uzrokuje lažni "no account" prikaz. Ako se uzrok pronađe i popravi, dodaj regresioni test koji ponavlja logout→login ciklus više puta uzastopno i proverava da svaki put uspešno stigne do dashboard-a.

---

## VISOK PRIORITET

### 5. Hardkodovane srpske poruke — šire rasprostranjeno nego što je prvobitno prijavljeno

Potvrđeno ponovo na `driver.html` ("Nevažeći podaci." nezavisno od jezika). Dodatno pronađeno danas:
- CA "Company setup" wizard, korak 2: placeholder "Linija 310" (srpski) u engleskom/nemačkom kontekstu.
- CA "Company setup" wizard, korak 3: placeholder "Marko Dispečer" (srpski).
- Stranica uvoza vozača: rečenica meša jezike — "...Select a fallback group; **CSV grupa** is used when it matches an existing line."

**Zadatak:** ne popravljaj samo ova četiri mesta — pretraži ceo kodbejs za literal srpske reči (grupa, dispečer, linija, vozač, firma...) unutar UI stringova/placeholder-a koji nisu iza `translations.js` ključeva, na sva tri jezika.

### 6. Nekonzistentno ponašanje grešaka pri CA/Dispečer prijavi

Nepromenjeno od prvog izveštaja (nije ponovo testirano u drugom krugu, ali nema razloga da se smatra rešenim). Mapiraj `auth/user-not-found` na istu generičku poruku kao `auth/wrong-password`, na sva tri jezika.

---

## SREDNJI PRIORITET

### 7. SA "Details" dugme — potvrđeno mrtvo i danas, na potpuno novoj firmi

Isto ponašanje kao pre: `#sa-company-detail-modal` postoji u DOM-u, `display:none` se ne menja posle klika, bez JS grešaka. Popravi handler ili ukloni dugme.

### 8. SA/CA brojači posle re-login-a — proveri ponovo pre nego što označiš kao gotovo

U drugom krugu, brojači i liste (company admin lista, broj dispečera) SU se poklopili sa stvarnim stanjem — moguće da je originalni bug zavistan od specifičnog redosleda akcija koji danas nije identično ponovljen. Ne pretpostavljaj da je popravljeno — reprodukuj tačno originalni scenario iz `reports/live-review-2026-07-26.md` (stavka 7A.5) pre zaključka.

### 9. CA "Company setup" wizard se vraća prazan — potvrđeno ponovo, rizik i dalje prisutan

Isto ponašanje: i pored postojeće grupe/vozača/dispečera, posle logout/login wizard se vraća na korak 1/3 sa praznim (placeholder) poljima u koracima 2 i 3. Wizard treba da proveri da li već postoji bar jedna grupa/dispečer i preskoči korak, ili se uopšte ne prikaže ako je firma već postavljena.

---

## NISKO / KOZMETIKA

### 10. Pluralizacija — potvrđeno ponovo, tri puta u istom toku uvoza

"1 drivers are ready for review", "Import 1 drivers", "Successfully imported 1 drivers!" — jednina za count=1.

### 11. Trial banner i Super Adminu — potvrđeno ponovo

"Trial period" banner i dalje vidljiv na SA dashboard-u.

### 12. Nekonzistentan jezik po ulozi — potvrđeno ponovo, novi primer

Login ekran nasumično engleski/nemački posle logout-a. CA onboarding wizard na engleskom dok okolni CA dashboard ispravno prikazuje nemački.

---

## Šta NIJE ponovo testirano u drugom krugu (ne pretpostavljaj da je OK)

- Tiha greška za nepostojeći email (stavka 6 gore).
- SOS, quick-report, potvrda smene na vozačkom PWA — blokirano jer vozačka prijava ne radi (stavka 1).
- Uvoz zvaničnog PDF plana smena.
- Rules emulator, GPS legal L1, `CONFIRMATION_JOB_SECRET` — nepromenjeno prema ranijim izveštajima.
- Git stanje lokalnog projekta — proveri PRVO, pre bilo čega drugog, da vidiš da li je prethodni pokušaj popravke uopšte započet/commit-ovan negde.

## Šta NE raditi

- Ne uključivati live GPS / pravi SMS / scheduler bez moje eksplicitne odluke.
- Ne praviti nove test naloge/firme u produkciji bez čišćenja posle.
- Ne diraj `firestore.rules` bez da mi prvo pokažeš `git diff`.
- Ne commituj Desktop credential pack (`BusCommand-Test-Nalozi`) niti `firebase-admin-key.json`.
- Ne popravljaj stavku #1 (vozačka prijava) tako što ćeš companyId "zakucati" (hardkodovati) — mora doći iz ispravnog, tenant-scoped izvora, inače praviš novi security bug (cross-tenant curenje).

## Definicija završenog za svaku stavku

- Kod na zasebnoj grani.
- Regresioni test (unit i/ili Playwright) koji dokazuje popravku, ne samo da build prolazi.
- Kratak izveštaj u `reports/` sa: šta je bio pravi uzrok, šta je promenjeno (fajl/red), koji test je pokrenut i prošao (stvaran rezultat, ne samo da je build zelen), šta ostaje otvoreno.
- Ne tvrdi da je nešto popravljeno ako nije ručno/testom potvrđeno da radi — pogotovo stavka 1 (vozačka prijava, release-blocker) i stavka 4 (intermitentan SA login, teško ga je "slučajno" popraviti bez razumevanja uzroka).

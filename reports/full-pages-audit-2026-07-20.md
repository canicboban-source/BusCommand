# Potpuna analiza stranica — tekući izveštaj

Datum: 2026-07-20  

## Driver working-hours privacy and shift confirmation

### Implemented behavior

- **Critical - resolved:** GPS previously started whenever the driver shell opened and had no shift-end stop. The client now starts GPS only after a server-confirmed active work session and clears the geolocation watcher exactly at shift end.
- **Critical - resolved:** driver message, shift and schedule listeners previously remained active outside working hours. A server-created `driver_sessions` window and Firestore `request.time` checks now stop driver reads at `notificationsUntil`; the client also stops all realtime listeners and clears in-memory messages.
- **High - resolved:** all driver operational APIs now fail closed outside an active assigned shift. Company profile timezone is authoritative; the device clock cannot extend access.
- **High - resolved:** the server correctly handles overnight shifts and a separate session deadline 30 minutes after shift end. At shift end the app enters a full rest screen; at the deadline it signs out automatically.
- **High - resolved:** production shift confirmation now uses an authenticated API and immutable per-date fingerprints. A later change to a confirmed shift makes that date unconfirmed without affecting other dates.
- **Medium - resolved:** one confirmation package is displayed to the driver, while the database retains an individual confirmation for every date. Friday includes assigned Saturday, Sunday and Monday shifts; Thursday does the same when Friday is free. Ordinary workdays request only the next assigned shift.
- **Medium - resolved:** dispatcher manual shift assignment now requires authoritative start and end times, which are persisted in daily overrides and monthly schedule entries.
- **Improvement - resolved:** newly provisioned Austrian companies use `Europe/Vienna` and German; Serbian companies use `Europe/Belgrade` and Serbian. Both are IANA zones and therefore include daylight-saving rules instead of a fixed UTC offset.

### Verification

- `npm run test:unit`: 128/128 passed, including timezone, overnight, Friday/Thursday package, privacy guard, Firestore window and regional provisioning regressions.
- `npm run lint`: 0 errors; 56 pre-existing warnings.
- `npm run build`: passed; Firebase isolation check passed.
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "dispatcher assigns shift"`: 1/1 passed with persisted start/end times.

### Legal and regulatory context (accessed 2026-07-22)

- **Serbia, mandatory baseline:** *Zakon o radu*, Articles 66-67, official consolidated text, provides minimum uninterrupted daily and weekly rest periods. Source: https://reg.pravno-informacioni-sistem.rs/api/viewdoc?doctype=reg&regactid=427266&uuid=c87cb147-7a7b-4dd1-afec-df66ae6da1ca. Applies to the no-notification/rest-mode policy; final employer procedures require Serbian employment-law review.
- **EU, mandatory baseline where applicable:** Directive 2003/88/EC, Articles 3 and 5, requires daily and weekly rest; Commission Interpretative Communication 2023/C 143/06 explains that daily rest should be consecutive and directly follow work. Source: https://eur-lex.europa.eu/legal-content/EN/TXT/?toc=OJ%3AC%3A2023%3A143%3AFULL&uri=uriserv%3AOJ.C_.2023.143.01.0008.01.ENG. Applies to the Austrian pilot and common EU design baseline.
- **EU road transport, scope-dependent mandatory baseline:** Regulation (EC) No 561/2006, Articles 4 and 8, defines rest as uninterrupted time in which a driver may freely dispose of their time and regulates daily/weekly rest for drivers within its scope. Source: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A02006R0561-20240522. Applicability to a specific urban/passenger operation must be confirmed by transport-law counsel.

### Remaining risks

- Real push delivery infrastructure is not yet present in this repository. The access window, listener shutdown and server enforcement are implemented; any future FCM/APNs sender must apply the same `notificationsUntil` gate and message TTL.
- Firestore emulator execution still requires a Java runtime unavailable in this local environment. Rules are covered by static regression tests; emulator and real Preview-project verification remain required before pilot deployment.
- Legacy shifts without valid `start` and `end` fail closed. They must be migrated or corrected before drivers can open a production work session.

## Company Admin — važeći vozni plan i katalog smena

### Poslovna podela i rezultat

- **High — rešeno:** važeći vozni plan i katalog smena ranije su bili deo disponentskog paketnog uvoza, pa je disponent mogao promeniti vremena koja određuju početak rada, prvu/poslednju vožnju i kraj rada. Uvedena je posebna Company Admin stranica `company-admin-service-plan`; Company Admin jedini objavljuje katalog, dok ga disponent samo učitava za svoje dodeljene grupe.
- **High — rešeno:** oznaka plana iz XLSX-a ranije se implicitno koristila i kao ID grupe. Company Admin sada pre uvoza obavezno bira postojeću grupu firme. `groupId` se proverava na serveru, čuva u metapodacima i audit događaju, a aktivna verzija i zaključani katalog vode se nezavisno za svaku grupu. Isti plan se može objaviti za više grupa bez međusobnog povlačenja verzija.
- **High — rešeno:** Company Admin i disponent ranije su imali istu Firestore write dozvolu nad `shifts` i `schedules`. Pravila sada razdvajaju vlasništvo: Company Admin kreira grupe i objavljuje master plan kroz server, a samo disponent menja dnevni i mesečni raspored. `PUT /api/staff/shifts/assignment` dodatno odbija Company Admin ulogu.
- **High — rešeno:** browser-only uvoz nije bio dovoljna kontrola. Novi `shared/service-plan-contract.mjs` koristi isti ugovor u browseru i na serveru; serverski dry-run i publish ponovo proveravaju tenant, ulogu, verziju šablona, IANA vremensku zonu, šifre smena, hronologiju, neprekinut tok aktivnosti i slaganje prve/poslednje `FAHRT` aktivnosti sa sažetkom smene.
- **Medium — rešeno:** korisnik je mogao birati XLS, PDF, CSV i TXT za podatke plana. Company Admin tok sada prihvata samo macro-free `.xlsx` do 2 MB i zahteva tačne listove `PLAN`, `SMENE` i `AKTIVNOSTI`, tačne kolone i verziju `BUSCOMMAND-DIENSTPLAN-1`.
- **Medium — rešeno:** objava nije imala životni ciklus ni audit. Nova verzija postaje `active`, prethodna aktivna verzija iste grupe postaje `superseded`, svaka objava dobija revision ID, autora, vreme i nepromenljiv `service_plan_published` audit događaj.
- **Medium — rešeno:** raniji fallback katalog je mogao da doda izmišljene smene u objavljeni katalog. Company Admin katalog se učitava sa `locked: true`, potpuno zamenjuje fallback i ne može se dopuniti generičkim F/S/X2 stavkama.
- **Improvement — rešeno:** napravljen je profesionalno formatiran i vizuelno proveren `BusCommand_Dienstplan_Import_v1.xlsx`. Primer `310.S01` sadrži: rad 04:02, prvu vožnju 04:33, poslednju vožnju do 14:00 i završetak rada 14:35, uz 25 redoslednih aktivnosti iz dostavljenog plana.
- **Improvement — rešeno:** Company Admin ekran je redizajniran prema operativnom panelu: kompaktan izbor grupe i XLSX-a, odvojen aktivni katalog, pregled nove verzije pre objave, upozorenje za mogući nesklad oznake plana i grupe, poređenje dodatih/promenjenih/uklonjenih smena i responzivna tabela sa početkom rada, prvom vožnjom, krajem poslednje vožnje, završetkom rada i režimom. Klik na smenu otvara pristupačan bočni pregled svih aktivnosti, sa Escape zatvaranjem, focus trap kontrolom i vraćanjem fokusa na polaznu smenu.

### Povezani fajlovi i rute

- `index.html`, `style.css`, `translations.js`: Company Admin navigacija, responzivan upload/dry-run/publish ekran i EN/SR/DE tekstovi.
- `public/templates/BusCommand_Dienstplan_Import_v1.xlsx`: jedini podržani ručni šablon i deo production build-a.
- `js/imports/service-plan-excel.js`: stroga kontrola ekstenzije, veličine, listova i kolona.
- `shared/service-plan-contract.mjs`: zajednička poslovna i vremenska validacija browsera/servera.
- `js/admin/company-admin-service-plan.js`, `js/core/service-plan.js`: preview, objava, status važećih planova i zaključani katalog za disponenta.
- `server/service-plans.js`, `api-server.js`: tenant-scoped preview, publish i čitanje važećeg plana; Firestore batch objava i audit.
- `firestore.rules`, `server/driver-routes.js`: master plan je server-write-only; raspored menja samo disponent; grupu menja samo Company Admin.

### Testovi i provere

- `npm run test:unit`: 142/142 prošlo. Novi testovi pokrivaju `310.S01`, plan preko ponoći, pogrešan šablon, vremenske praznine/preklapanja, nepoznatu smenu, odbijanje grupe koja ne pripada firmi, strogi XLSX parser, veličinu fajla, API uloge, Firestore granice, čuvanje objavljene revizije, povlačenje prethodne aktivne verzije i nezavisnu objavu istog plana za više grupa.
- `npm run lint`: 0 grešaka; 56 postojećih upozorenja.
- `npm run build`: prošlo; XLSX je potvrđen u `dist/templates`, a Firebase isolation provera je prošla.
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "company admin validates"`: 1/1 prošlo u Chromiumu; stvarni XLSX je učitan, tabela je prikazala `310.S01`, drawer je prikazao svih 25 aktivnosti, a plan je zatim objavljen za dve izabrane grupe (`north` i `south`) koje su zadržale sopstvenu aktivnu verziju 66.
- Ručni browser QA na desktop prikazu 1440×1000: potvrđeni su vizuelna hijerarhija, aktivni/nacrt status, upozorenje za grupu, poređenje verzija, lepljivo zaglavlje tabele, konkretno dugme za objavu i bočni prikaz svih 25 aktivnosti. Company Admin pristup je namerno desktop-only; mobilni viewport zato nije produkcijski podržan tok, dok se tabela i kontrole prilagođavaju užim dozvoljenim desktop prozorima.
- Radna sveska je pregledana kroz sva četiri lista (`UPUTSTVO`, `PLAN`, `SMENE`, `AKTIVNOSTI`); nema isečenih zaglavlja, formula grešaka niti nečitljivih tabela.

### Eksterni tehnički izvori (pristupljeno 2026-07-22)

- **VDV Soll-Daten-Schnittstellen / VDV-Schrift 452**, zvanični Verband Deutscher Verkehrsunternehmen: https://www.vdv.de/oepnv-datenmodell.aspx. VDV 452 je standard za razmenu mrežnih i vozno-rednih podataka; beleži se kao budući profesionalni adapter, ne kao ručni Company Admin format.
- **General Transit Feed Specification — Overview**, zvanična GTFS dokumentacija: https://gtfs.org/documentation/overview/. GTFS Schedule opisuje linije, vožnje, stajališta, vremena i kalendare. Zaključak da sam GTFS nije dovoljan za `ARBEIT`/`DEPOT`/`TRANS`/`RUHE` tok je tehnička inferencija iz zvanično definisanog skupa fajlova, a ne tvrdnja da se GTFS ne može kombinovati sa drugim izvorom.

### Preostali rizici

- Firestore emulator pravila nisu izvršena jer Java runtime nije dostupan. Nova pravila imaju statičke regresione testove; emulator i stvarni Preview projekat ostaju obavezni pre pilot puštanja.
- Produkcijski publish/get tok nije izvršen nad stvarnim Firebase projektom u ovom lokalnom okruženju; autentifikacija, tenant/group ograničenje i persistence servis pokriveni su unit/statičkim testovima, dok je kompletan UI tok potvrđen u demo režimu.
- VDV 452/NeTEx adapter nije implementiran. Za prve pilot firme jedini podržani ručni format ostaje verzionisani XLSX; novi adapter se uvodi tek kada se dobije stvarni izvoz njihovog planerskog sistema.

## Company Admin — vozački nalozi

### Poslovni rezultat i sprovedene izmene

- **High — rešeno:** bezbedan serverski uvoz vozačkih naloga postojao je samo unutar dispečerskog paketnog uvoza, dok Company Admin nije imao sopstveni ekran. Dodat je `company-admin-drivers` panel i navigacija; uvoz naloga, kontrola pristupa i status pripadaju Company Admin ulozi, a dispečer zadržava operativni raspored smena.
- **High — rešeno:** uvoz nije vozača vezivao za izabranu grupu. Company Admin sada mora izabrati postojeću grupu pre CSV fajla, server proverava da grupa pripada istoj firmi, a `groupId` i `lineId` se čuvaju u bezbednom javnom profilu vozača i audit događaju.
- **High — rešeno:** Firestore je dispečeru dozvoljavao kreiranje i proizvoljno menjanje matičnog profila vozača. `drivers` create/update je ograničen na Company Admin ulogu; vozač i dalje može promeniti samo dozvoljena operativna polja sopstvenog profila, a dispečer ima read-only pregled potreban za raspored.
- **High — rešeno:** import endpoint je prihvatao oba staff tipa i nije proveravao licencni limit. Endpoint sada zahteva `company_admin`, tenant podudaranje, postojeću grupu, aktivni limit `maxDrivers`, najviše 250 redova, najviše 1 MB i pet pokušaja u minutu.
- **Medium — rešeno:** Company Admin nije mogao pre potvrde proveriti šta uvozi. CSV se lokalno strogo parsira sa istim obaveznim kolonama kao server, proverava prazna polja, email, duplikate EID/koda firme, navodnike i broj redova, pa prikazuje pregled prvih osam vozača.
- **Medium — rešeno:** osetljivi kod firme se u pregledu više ne prikazuje. Vrednost se šalje serveru, hashira bcrypt cost-12 algoritmom u server-only `driver_credentials` kolekciji i nikad se ne vraća u UI ili izvoz.
- **Medium — rešeno:** dodati su KPI sažetak, pretraga po imenu/emailu/telefonu, filter grupe i statusa, paginacija po 25 redova, prazna stanja i trenutno aktiviranje/deaktiviranje sa potvrdom. Deaktiviranje opoziva Firebase refresh tokene i upisuje audit događaj.
- **Improvement — rešeno:** dodat je verzionisani `BusCommand_Drivers_Import_v1.csv` šablon, EN/SR/DE tekstovi, pristupačni nazivi kontrola i mobilni card prikaz tabele. Zajednički Company Admin header više ne pravi horizontalno prelivanje na 390 px.

### Povezani fajlovi i rute

- `index.html`, `style.css`, `translations.js`: navigacija, import panel, evidencija, responsive prikaz i lokalizacija.
- `js/admin/company-admin-drivers.js`: CSV preview, filteri, paginacija, demo/production uvoz i kontrola statusa.
- `public/templates/BusCommand_Drivers_Import_v1.csv`: jedini podržani šablon za vozačke naloge.
- `js/core/api-client.js`, `server/driver-routes.js`, `server/driver-csv.js`: tenant/group-scoped import, limit licence, rate limit, validacija, hash kredencijala, opoziv sesija i audit.
- `firestore.rules`: Company Admin vlasništvo nad matičnim profilima i potpuna zabrana klijentskog pristupa `driver_credentials` kolekciji.
- `tests/unit/company-admin-drivers.test.mjs`, `tests/unit/driver-credentials.test.js`, `tests/unit/driver-csv.test.js`, `tests/e2e/ui-smoke.spec.js`, `tests/rules/firestore.rules.test.js`: UI, ugovor, bezbednost, granice i uloge.

### Testovi i provere

- `npm run test:unit`: 147/147 prošlo.
- `npm run lint`: 0 grešaka; 56 postojećih upozorenja.
- `npm run build`: prošlo; production bundle i Firebase isolation provera su prošli, a CSV šablon je kopiran u `dist/templates`.
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "company admin"`: 3/3 prošlo. Novi tok potvrđuje stvarni CSV upload, pregled dva reda bez prikaza koda firme, uvoz, pretragu, status filter, aktivaciju i širinu bez horizontalnog overflow-a na 390 px.
- Ručni browser QA: potvrđena je vizuelna hijerarhija desktop panela, čitljivost evidencije, semantika kontrola i odsustvo browser console grešaka.
- `npm run test:rules`: test je pripremljen, ali izvršavanje emulatora je blokirano jer Java nije instalirana/u PATH-u na ovom računaru.

### Preostali rizici

- Firestore emulator test i stvarni Preview Firebase import/read/status tok ostaju obavezni pre pilot puštanja. Lokalni environment nema Java runtime ni odobrene pilot kredencijale.
- Produkcijski import je namerno „insert-only“: postojeći EID ili kod firme se odbija, umesto implicitnog prepisivanja naloga. Poseban kontrolisani edit/move tok treba definisati tek kada pilot firme potvrde pravilo za prelazak vozača između grupa.
- EID, telefon i email su lični podaci. Rok čuvanja, pravni osnov, obaveštenje zaposlenima i postupak ispravke/brisanja moraju biti potvrđeni sa DPO/pravnikom svake pilot firme; ova tehnička izmena ne predstavlja pravno mišljenje.

## Dispatcher shift assignment and daily plan

### Findings and implemented changes

- **High - resolved:** dashboard quick edits tried to use global `saveState()` in production. Production controls now point staff to the shift schedule; demo keeps its local simulation.
- **High - resolved:** `PUT /api/staff/shifts/assignment` validates the payload, scopes data to the company, restricts dispatchers to drivers in their assigned groups, and writes an audit event.
- **High - resolved:** old random shift document IDs could create duplicates. The API now updates an existing driver/date record, cleans duplicate records, and deletes a shift for an explicit clear operation with a `shift_removed` audit event.
- **Medium - resolved:** daily-plan fields from imported plans are HTML-escaped and empty states use `textContent`.
- **Medium - resolved:** production dashboard quick-edit controls are disabled with an accessible explanation instead of offering an action that cannot safely persist.

### Test results

- Targeted Node tests: 19/19 passed (server authorization, tenant/group scope, and client API flow).
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "dispatcher assigns shift"`: 1/1 passed.
- `npm run lint`: 0 errors; 56 pre-existing warnings.
- `npm run build`: passed; Firebase isolation check passed.

### Remaining risks

- Firestore `shifts` i `schedules` write dozvole sada su ograničene na disponenta; Company Admin ima samo uvid. Potrebna je emulator/Preview potvrda svih legacy mesečnih i dnevnih direktnih upisa pre pilot puštanja.
- The visual review of the remaining dispatcher dashboard and shift grid continues within this same dispatcher area.
Status: rad u toku; dokument se dopunjava nakon svake završene stranice.

## Sažetak završenog obima

Završeni su vozački nalog i aktivacija, kontrolna tabla, operativne prijave, poruke i arhiva poruka, kao i vozački/dispečerski tok godišnjih odmora. Izmene su do ovog preseka uklonile direktne produkcijske upise kompletnog klijentskog stanja iz ovih tokova i zamenile ih uskim autentifikovanim API operacijama.

## Godišnji odmori vozača

### Rute i povezani fajlovi

- `index.html`: vozačka forma, istorija, dispečerska tabela i navigacija.
- `js/driver/reports.js`: validacija, slanje zahteva i istorija vozača.
- `js/driver/calendar.js`: prikaz samo odobrenih odmora trenutnog vozača.
- `js/dispatcher/vacations.js`: bezbedan prikaz i obrada zahteva.
- `js/core/api-client.js`: uske API operacije za kreiranje i promenu statusa.
- `server/driver-routes.js`: autentifikacija, validacija, tenant vezivanje, preklapanje i audit.
- `firestore.rules`: zabrana direktnog vozačkog zaobilaženja serverskog toka.

### Nalazi i sprovedene izmene

- **High — rešeno:** produkcijski zahtev vozača pozivao je globalni `saveState()`, što je pokušavalo nedozvoljen batch upis brojnih kolekcija. Uveden je `POST /api/driver/vacations`.
- **High — rešeno:** direktni Firestore create dopuštao je klijentu da pošalje tuđi identitet, proizvoljan broj dana ili status. Create je ograničen na staff/Admin SDK tok, dok server identitet uzima iz verifikovanog tokena.
- **High — rešeno:** odobravanje i odbijanje postojalo je samo u lokalnom stanju. Uveden je tenant-scoped `PUT /api/staff/vacations/:vacationId/status` sa staff proverom, dozvoljenim statusima i zaštitom od ponovne obrade.
- **Medium — rešeno:** nisu proveravani nevažeći datumi, period duži od godinu dana ni preklapanje aktivnih zahteva. Dodata je stroga ISO validacija, UTC obračun uključivih dana (1–366) i provera preklapanja pending/approved zahteva istog vozača.
- **Medium — rešeno:** dispečerska tabela je interpolirala ime i razlog kroz `innerHTML`, što je predstavljalo stored-XSS rizik. Prikaz sada koristi DOM čvorove i `textContent`.
- **Medium — rešeno:** dispečerska stranica nije imala navigacionu stavku. Dodata je vidljiva stavka „Godišnji odmor“.
- **Low — rešeno:** prikaz perioda je sadržao hardkodovanu 2026. godinu; sada se koristi stvaran datum.
- **Low — rešeno:** kalendar je odmore vezivao samo po promenljivom imenu; sada prvenstveno koristi stabilan `driverId` uz legacy fallback.
- **Improvement — rešeno:** razlog je ograničen na 1000 karaktera, slanje i obrada imaju zaštitu od duplog klika, a početni datumi u formi ne nude prošle dane.

### Testovi i rezultati

- `npm run test:unit`: 113/113 prošlo.
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "leave"`: 2/2 prošlo (kreiranje zahteva i dispečersko odobravanje).
- `npm run lint`: 0 grešaka; 58 postojećih upozorenja u projektu.
- `npm run build`: prošlo; Firebase isolation provera prošla.
- `git diff --check`: prošlo; prisutna su samo očekivana Git upozorenja o LF/CRLF konverziji.
- Firestore emulator pravila nisu izvršena jer Java runtime nije dostupan u lokalnom okruženju; pravila su pokrivena statičkim regresionim testom.

### Preostali rizici

- Pravo na godišnji odmor, raspoloživi saldo, prenos dana i postupak odobravanja zavise od politike poslodavca i radnopravnog tumačenja; ova izmena ne uvodi takva poslovna pravila bez potvrđenog zahteva.
- Integracioni test sa stvarnim Firebase projektom i konkurentnim zahtevima nije izvršen. Trenutna provera preklapanja sprečava uobičajene duplikate, ali stroga zaštita od istovremenih konkurentnih upisa zahtevala bi transakcioni model ili poseban zaključavajući dokument.
- Zvanični pravni izvori biće navedeni u regulatornom delu završnog izveštaja nakon celovitog pravnog pregleda; ovde nije izvedena pravna tvrdnja niti menjana poslovna logika na osnovu pretpostavke.

## Vozački kalendar i mesečni raspored

### Rute i povezani fajlovi

- `index.html`, `style.css`: kalendar, kontrole meseca, legenda, dokument plana i mobilni prikaz.
- `js/driver/calendar.js`: izbor meseca, stvarne smene i odmori trenutnog vozača.
- `js/core/shift-plan.js`: jedinstveno pronalaženje smene i vezivanje novih smena/planova za `driverId`.
- `js/core/firebase-service.js`, `firestore.rules`: vozačko čitanje samo sopstvenih smena i planova.
- `js/maps/schedule-viewer.js`, `js/maps/schedule-upload.js`: bezbedan prikaz i ograničen upload plana.
- `js/features/print-calendar.js`, `js/layout/role-switch.js`: navigacija kroz stvarne mesece.

### Nalazi i sprovedene izmene

- **Critical — rešeno:** kalendar je prikazivao hardkodovan jun 2026, generisao izmišljene jutarnje/popodnevne smene i sadržao poseban lažni raspored za konkretno ime vozača. Svi takvi podaci su uklonjeni; prikazuju se samo dnevna izmena, objavljen mesečni plan ili odobren odmor.
- **High — rešeno:** vozački Firestore listener i pravila omogućavali su čitanje svih `shifts` i `schedules` dokumenata firme. Upiti i pravila sada zahtevaju sopstveni `driverId`; novi planovi i smene ga automatski dobijaju.
- **High — rešeno:** tekstualni sadržaj plana i naziv smene renderovani su kroz `innerHTML`, pa je importovani sadržaj mogao postati stored XSS. Kalendar i viewer sada koriste DOM API i `textContent`, dok su data URL šeme ograničene na podržane tipove.
- **Medium — rešeno:** broj dana, naslov meseca i prvi dan sedmice bili su fiksirani. Sada se računaju za bilo koji validan `YYYY-MM`, u UTC-u i kroz `Intl.DateTimeFormat`.
- **Medium — rešeno:** upload nije imao ograničenje veličine i mogao je preći Firestore limit dokumenta. Dozvoljeni su XLSX, XLS, PDF, CSV i TXT do 600 KB, uz korisničku poruku i opis polja.
- **Medium — rešeno:** promena uloge resetovala je kalendar na jun 2026. Reset sada koristi tekući mesec.
- **Low — rešeno:** prethodni/sledeći mesec nisu imali pristupačan naziv. Dodati su lokalizovani `aria-label` atributi i `aria-live` naslov.
- **Improvement — rešeno:** dodat je vizuelni marker današnjeg dana, stilovi za noćnu, pripravnost i bolovanje, kao i zbijeni prikaz koji staje na 320 px bez horizontalnog prelivanja kalendara.

### Testovi i rezultati

- Novi unit testovi proveravaju odsustvo hardkodovanih/lažnih smena, bezbedno DOM renderovanje, upload granice, `driverId` upite/pravila i pristupačne kontrole.
- `npm run test:unit`: 118/118 prošlo.
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "driver calendar"`: prošlo; potvrđeni stvarni plan, prioritet odmora, XSS payload kao tekst, navigacija meseca i širina od 320 px.
- `npm run build`: prošlo; Firebase isolation provera prošla.
- `npm run lint`: 0 grešaka; 56 postojećih upozorenja.

### Preostali rizici

- Legacy produkcijski dokumenti smena i planova bez `driverId` moraju biti migrirani pre nego što će ih vozači ponovo videti. Bezbedno su sakriveni umesto da se identitet zaključuje iz promenljivog imena.
- Firestore emulator pravila nisu izvršena jer Java runtime nije dostupan; pravila i oblik upita pokriveni su statičkim regresionim testovima.
- Potvrda sutrašnje smene više ne nudi lažan produkcijski upis kompletnog state-a. Za produkcijsku potvrdu treba uvesti poseban identitetski vezan API kada poslovni tok potvrde bude definisan.

## Company Admin — istorija verzija voznog plana (dopuna 2026-07-22)

### Nalazi i sprovedene izmene

- **High — rešeno:** ponovna objava istog plana i verzije mogla je prepisati identitet revizije i oslabiti trag objava. Server sada odbija već postojeći revision ID sa HTTP 409; nova objava zahteva novu verziju.
- **High — rešeno:** Company Admin je video samo trenutno važeći plan. Dodat je tenant/group-scoped spisak do 50 nepromenljivih verzija i poseban read-only endpoint za sadržaj jedne arhivirane verzije.
- **Medium — rešeno:** arhivirana verzija sada prikazuje autora/vreme objave, vremensku zonu, broj smena i sve aktivnosti unutar pristupačnih `details` elemenata. Prethodne verzije imaju status „Prethodni“, a važeća „Važeći“.
- **Low — rešeno:** demo metapodaci bez `dutyCount` prikazivali su crticu iako verzija sadrži smene. Broj se sada bezbedno izvodi iz zaključanog niza smena.

### Testovi i rezultati

- Unit testovi pokrivaju nepromenljivu istoriju, odbijanje duplikata, čitanje detalja i izolaciju između grupa.
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "company admin reviews immutable service plan history"`: 1/1 prošlo.
- Ručni browser QA: potvrđen desktop prikaz istorije i arhivirane smene, bez console grešaka.

## Company Admin — evidencija aktivnosti

### Rute i povezani fajlovi

- `index.html`, `style.css`, `translations.js`: navigacija, KPI sažetak, filteri, tabela/card prikaz i EN/SR/DE lokalizacija.
- `js/admin/company-admin-audit.js`, `js/core/api-client.js`, `js/layout/navigation.js`: demo/production učitavanje, filteri, cursor „učitaj starije“, bezbedno renderovanje i Company Admin navigacija.
- `server/audit-log.js`, `api-server.js`: tenant-scoped listanje, server-side filtriranje, ograničenje rezultata, kategorizacija i rekurzivna redakcija osetljivih ključeva.
- `firestore.rules`, `js/core/firebase-service.js`: server-only upis audita; legacy state-sync više ne piše direktno u kolekciju nego koristi uski autentifikovani endpoint i označava se kao `client-reported`.

### Nalazi i sprovedene izmene

- **Critical — rešeno:** svaki član firme mogao je direktno kreirati proizvoljan `audit_log` dokument i time falsifikovati trag. Firestore create/update/delete su sada potpuno zabranjeni klijentu; autoritativne događaje upisuje samo Admin SDK server.
- **High — rešeno:** Company Admin nije imao operativni pregled audit događaja. Dodat je `GET /api/company-admin/audit`, dostupan samo Company Admin ulozi i samo za `companyId` iz verifikovanog tokena.
- **High — rešeno:** detalji audit događaja mogli su sadržati kredencijale ili prevelike proizvoljne objekte. Odgovor uklanja ključeve za password/PIN/token/secret/cookie/authorization/company code, ograničava dubinu, broj ključeva, nizove i dužinu teksta.
- **Medium — rešeno:** legacy client state-sync audit je bio direktan klijentski zapis. Sada prolazi kroz rate-limited server endpoint, dozvoljava samo poznate kolekcije i ograničene brojače, a u UI se razlikuje od server-potvrđenog događaja.
- **Medium — rešeno:** uvedeni su filteri po oblasti, akciji, korisniku i periodu, cursor učitavanje starijih događaja, prazno/loading/error stanje i status integriteta izvora.
- **Improvement — rešeno:** prikaz ima kompaktne KPI kartice, lokalizovane poznate događaje i uloge, pristupačne labele i mobilni card raspored bez horizontalnog prelivanja na 390 px.

### Testovi i rezultati

- `npm run test:unit`: 155/155 prošlo. Novi testovi pokrivaju tenant/admin pristup, zabranu klijentskog upisa, redakciju tajni, granice filtera, bezbedan state-sync ugovor i UI povezivanje.
- `npm run lint`: 0 grešaka; 56 postojećih upozorenja.
- `npm run build`: prošlo; production bundle i Firebase isolation provera su prošli.
- `npx playwright test tests/e2e/ui-smoke.spec.js --grep "company admin reviews and filters the immutable activity log"`: 1/1 prošlo; potvrđeni pregled pet događaja, server status, filter/reset i odsustvo horizontalnog overflow-a na 390 px.
- Ručni browser QA: potvrđeni vizuelna hijerarhija, filteri, detalji, lokalizacija i odsustvo console grešaka.
- `npm run test:rules`: nije izvršiv bez Java runtime-a; pravila imaju statičke regresione testove, ali emulator potvrda ostaje obavezna pre pilota.

### Regulatorni nalaz (pristupljeno 2026-07-22)

- **EU — obavezna načela gde je GDPR primenljiv:** Uredba (EU) 2016/679, član 5(1)(c)-(e), zahteva minimizaciju podataka, tačnost i ograničenje čuvanja; član 32 zahteva odgovarajuće tehničke i organizacione mere bezbednosti. Zvanični izvor: https://eur-lex.europa.eu/eli/reg/2016/679/oj. Audit ekran zato rediguje tajne i ne uvodi proizvoljan neograničen rok čuvanja.
- **Srbija — obavezni lokalni okvir:** Zakon o zaštiti podataka o ličnosti primenjuje načela minimizacije, ograničenog čuvanja i bezbednosti obrade. Zvanična objava Poverenika: https://www.poverenik.rs/sr-yu/zakoni/zakoni-o-zastiti-podataka-o-licnosti/2618-zakon-o-zastiti-podataka-o-licnosti.html. Konkretan rok čuvanja audit događaja mora biti dokumentovan politikom firme prema svrsi, zakonskim obavezama i proceni rizika; nije bez pravne potvrde hardkodovan u aplikaciju.

### Preostali rizici

- Produkcijski endpoint nije izvršen nad stvarnim Preview Firebase projektom u ovom lokalnom okruženju; auth/tenant ugovor, redakcija i Firestore granice pokriveni su testovima.
- Cursor se zasniva na vremenu događaja. Za veoma veliki obim i više događaja sa identičnim serverskim timestampom preporučen je složeni `(timestamp, documentId)` cursor i eksplicitni Firestore indeks.
- Politika retencije, izvoz za zahtev lica i formalna klasifikacija audit događaja zahtevaju potvrdu DPO/pravnika svake pilot firme; aplikacija sada ne tvrdi univerzalni rok.

## Završna kontrola kvaliteta ovog preseka (2026-07-22)

### Dodatne regresije pronađene i rešene

- **High — rešeno:** generator delegiranih UI akcija nije prepoznavao dinamički `handleVacation`, pa approval modal nije radio u production bundle-u. Handler i generator su usklađeni i pokriveni unit/E2E testom.
- **High — rešeno:** bezbedni tok aktivacije vozača nije bio izložen registru koji koristi production E2E, a ponovni poziv je bio blokiran activation gate-om. Otvaranje activation modala je dozvoljena, bezopasna gate akcija; operativni UI i dalje ostaje fizički odvojen.
- **High — rešeno:** svi `rateLimit()` middleware-i delili su jedan IP brojač. Različite rute su mogle međusobno potrošiti budžet i vratiti lažni 429. Svaka instanca sada ima odvojeni namespace, dok uspešna autentifikacija i dalje može očistiti IP pokušaje.
- **Medium — rešeno:** non-breaking `npm audit fix` je ažurirao osam tranzitivnih paketa i uklonio prethodne high nalaze za `fast-xml-parser`, `fast-uri` i `brace-expansion`, kao i zakrpe za `body-parser` i `protobufjs`.

### Konačni rezultati

- Izmenjeno/dodato: 36 source, test, template, lock i dokumentacionih fajlova u tekućem worktree-u; `git diff --check` je prošao bez upozorenja nakon normalizacije završetaka redova.
- `npm run test:unit`: **157/157 prošlo**.
- `npm run test:e2e`: **36/36 prošlo** u Chromiumu posle čistog restarta servera i dependency zakrpa.
- `npm run lint`: **0 grešaka, 0 upozorenja**.
- `npm run build`: **prošlo bez upozorenja**; 117 modula transformisano, prevodi izdvojeni u poseban chunk i Firebase isolation provera prošla.
- `npm audit --omit=dev`: ostaje **8 moderate** tranzitivnih `uuid` nalaza. Automatska zakrpa zahteva breaking prelazak `firebase-admin` 12 → 14; `--force` namerno nije izvršen bez migracione i Preview integracione provere.
- `npm run test:rules`: blokirano — `java -version` nije moguće pokrenuti jer Java nije instalirana/u PATH-u.

### Pilot procena i blokatori

- Lokalni/demo funkcionalni sloj za Company Admin vozače, vozne planove, istoriju i audit je spreman za kontrolisani demo/pilot pregled.
- Produkcijski pilot još nije odobren: u okruženju nema `firebase-admin-key.json`, `FIREBASE_SERVICE_ACCOUNT_JSON` ni `VITE_FIREBASE_API_KEY`, pa stvarna Preview autentifikacija, Firestore persistence i tenant pravila nisu mogla biti end-to-end potvrđena.
- Lokalno okruženje koristi Node 26.4.0, dok projekat zahteva Node 22.x. Svi testovi/build prolaze, ali deployment i završna Preview provera moraju koristiti deklarisani Node 22 runtime.
- Pre pilot puštanja obavezni su Java + Firestore emulator test, kontrolisani Preview Firebase test sa dve firme radi potvrde tenant izolacije, migraciona provera legacy smena/vozača i odluka DPO/pravnika o retenciji audit podataka.

## Dispečerska navigacija — uklanjanje Settings panela (2026-07-22)

- **High — rešeno:** Settings je bio skriven dispečeru u produkciji, ali je ostajao dostupan u demo režimu i koristio je naziv/rutu `dispatcher-settings`. Stavka je potpuno uklonjena iz dispečerske navigacije u svim režimima.
- **High — rešeno:** podešavanja firme su premeštena na `company-admin-settings`; stara `dispatcher-settings` ruta eksplicitno vraća zabranu i za dispečera i za Company Admina.
- Modul je premešten iz `js/dispatcher/settings.js` u `js/admin/company-admin-settings.js`, a instalacija, navigacija i pomoćne build skripte su usklađene sa vlasništvom Company Admin uloge.
- Unit paket: 157/157 prošlo. Production build i Firebase isolation provera prošli. Ciljani Playwright tokovi za production permissions, demo dispečera i Company Admin pristup: 3/3 prošli.
- Ručni browser QA potvrdio je da dispečer vidi samo operativne stranice, Company Admin i dalje vidi/otvara podešavanja i nema console grešaka.

## Uklanjanje postojećih upozorenja i SOS regresija (2026-07-22)

- Uklonjeno je svih **56 ESLint upozorenja**: 47 nekorišćenih importa/parametara, pet suvišnih regex escape znakova, dva konstantna uslova i dva konstantna binarna izraza. Pravila nisu isključena niti su upozorenja utišana komentarima.
- `js/package.json` sada jasno označava frontend kao ESM scope, dok root/server ostaje CommonJS. Time su uklonjena Node `MODULE_TYPELESS_PACKAGE_JSON` upozorenja bez rizičnog prebacivanja Express servera na ESM.
- `translations.js` se gradi kao modul i izdvaja u poseban produkcioni chunk. Glavni minifikovani JavaScript je smanjen sa približno 535 KB na 329 KB, a translation chunk iznosi približno 206 KB.
- Redundantni dinamički importi su uklonjeni. Osvežavanje Group Hub-a ostaje pokriveno postojećim state observerom nakon `saveState()`.
- **High — rešeno:** Firebase SOS listener je pokušavao da učita `checkSOSStatus` iz `maps/sos-siren.js`, iako funkcija tamo nije bila izvezena. Funkcija je premeštena u vlasnički SOS modul i sada je statički proverena tokom build-a.
- Windows fajlovi sa mešovitim LF/CRLF završecima normalizovani su na očekivani CRLF radni format; Git sadržaj ostaje normalizovan na LF.
- Završna provera: lint **0/0**, unit **157/157**, UI smoke/SOS E2E **25/25**, production build bez upozorenja i Firebase isolation provera uspešna.

## Company Admin — Firma & pregled (2026-07-22)

### Rute i povezani fajlovi

- UI ruta: `company-admin-dashboard` u `index.html`.
- Prikaz i asinhrono stanje licence: `js/admin/company-admin.js`, `js/core/license.js`.
- Čist tenant/readiness model: `js/admin/company-admin-overview-model.js`.
- Stilovi i responsive prikaz: `style.css`.
- Lokalizacija: `translations.js`.
- Testovi: `tests/unit/company-admin-overview.test.mjs`, `tests/e2e/ui-smoke.spec.js`.

### Nalazi i sprovedene izmene

- **High — rešeno:** pregled je u produkciji prihvatao zapise bez `companyId`, što je bilo fail-open ponašanje za legacy ili kontaminirano lokalno stanje. Produkcioni model sada prihvata samo potvrđeni tenant; unscoped legacy zapisi dozvoljeni su isključivo u eksplicitnom lokalnom demo režimu.
- **High — rešeno:** keširana licenca nije bila vezana za firmu, pa je pri promeni konteksta mogla biti prikazana licenca prethodnog tenant-a. Licenca sada nosi potvrđeni `companyId`, a pregled odbija stale podatke druge firme.
- **High — rešeno:** kada produkcijska licenca nije učitana, UI je izmišljao Trial/30 dana iz dispečerskog fallback-a. Produkcija sada prikazuje loading, unavailable/error stanje i retry; demo fallback je zadržan samo u lokalnom demo režimu.
- **Medium — rešeno:** KPI „Online sada“ nije imao pouzdan presence izvor i mešao je status naloga sa radnom sesijom. Zamenjen je proverljivim brojem važećih objavljenih planova.
- **Medium — rešeno:** grupa je označavana kao spremna kada ima vozača i samo autobus ili plan. Sada mora imati najmanje jednog vozača, autobus, važeći plan i dodeljenog dispečera; tooltip navodi šta nedostaje.
- **Medium — rešeno:** broj autobusa se računao preko jedinstvenih `driver.bus` vrednosti umesto stvarnog tenant-scoped registra vozila. KPI i redovi sada koriste `state.buses` unutar firme.
- **Medium — rešeno:** boja grupe i fallback ID grupe ulazili su u generisani HTML bez potpune zaštite. Boja je ograničena na validan šestocifren hex, a sve tekstualne vrednosti prolaze HTML escaping.
- **Low — rešeno:** vidljiv je bio sirov placeholder `Preostalo {days} dana`, a KPI vozača koristio je jedninu. Uvedeni su posebni lokalizovani ključevi za SR/EN/DE.
- **Improvement:** stranica je preuređena u kompaktnu hijerarhiju: zaglavlje i refresh, identitet/licenca, pet proverljivih KPI kartica, responsive pregled grupa, tim i kontrolna lista sa pet obaveznih koraka.
- **Accessibility/Responsive:** nativna dugmad i focus-visible stanja, `scope="col"`, mobilni `data-label` prikaz tabele i potvrda da na 390 px nema horizontalnog overflow-a.

### Testovi i rezultati

- Novi unit testovi potvrđuju fail-closed tenant filter, demo-only legacy fallback, kompletan kriterijum spremnosti i zabranu izmišljene/stale licence.
- `npm run lint`: **0 grešaka, 0 upozorenja**.
- `npm run test:unit`: **162/162 prošlo**.
- `npx playwright test tests/e2e/ui-smoke.spec.js`: **26/26 prošlo**, uključujući novi tenant/readiness/responsive tok.
- `npm run build`: **prošlo bez upozorenja**, 118 modula transformisano; Firebase isolation provera prošla.
- Ručni browser QA: SR prikaz, licenca, KPI, tabela, checklist i konzola provereni; nema console grešaka.

### Preostali rizici

- Produkcijski license endpoint nije izvršen sa stvarnim Preview Firebase tokenom u ovom lokalnom okruženju; UI fail-closed/error tok i tenant model jesu pokriveni.
- „Važeći planovi“ računa po jedan aktivan plan po grupi. Poslovno pravilo namerno ne sabira superseded istorijske verzije.

## Company Admin — Brending firme (2026-07-22)

### Rute i povezani fajlovi

- UI ruta i responsive live preview: `company-admin-branding` u `index.html` i `style.css`.
- Kontroler i čisti model validacije: `js/admin/company-admin-branding.js`, `js/admin/company-admin-branding-model.js`.
- Zajednička primena sigurnog brenda: `js/ui/i18n.js`.
- Produkcijski API i validacija: `api-server.js`, `server/validation.js`, `js/core/api-client.js`.
- Firestore zaštita i audit: `firestore.rules`, `server/audit-log.js`.
- Povezani prvi onboarding korak: `js/admin/company-admin-onboarding.js`.
- Testovi: `tests/unit/company-admin-branding.test.mjs`, `tests/unit/company-admin-branding-access.test.mjs`, `tests/unit/validation.test.js`, `tests/e2e/ui-smoke.spec.js`.

### Nalazi i sprovedene izmene

- **High — rešeno:** produkcijsko čuvanje brendinga oslanjalo se na široki client-side state sync bez namenskog ugovora. Dodat je rate-limited `PUT /api/company-admin/branding`, dostupan samo Company Admin ulozi; tenant se potvrđuje poređenjem zahteva sa `companyId` iz verifikovanog tokena.
- **High — rešeno:** naziv, boja i logo URL nisu imali serversku validaciju, pa je Company Admin ili izmenjeni klijent mogao upisati nevažeću vrednost koju koriste svi korisnici firme. Frontend model, Zod API šema i Firestore pravilo sada nezavisno zahtevaju naziv 2–80 znakova, boju `#RRGGBB` i opcioni HTTPS URL do 2.048 znakova bez ugrađenih pristupnih podataka.
- **High — rešeno:** onboarding je imao alternativni, slabiji put koji je menjao aktivni brend i CSS pre čuvanja i zaobilazio novi API. Prvi onboarding korak sada koristi isti validirani tenant save tok, ne menja aktivni brend tokom pregleda i zaključava dugme tokom asinhronog upisa.
- **Medium — rešeno:** promena brendinga nije imala specifičan autoritativni audit događaj. Server upisuje `branding_updated` sa nazivom, bojom i indikatorom postojanja logotipa, bez čuvanja punog logo URL-a u detaljima audita.
- **Medium — rešeno:** logo je prihvatao HTTP i proizvoljne URI šeme. Prikaz prihvata samo HTTPS, koristi `referrerpolicy="no-referrer"`, tekstualni sadržaj ne ubacuje kao HTML, a pogrešan ili nedostupan preview vraća bezbedni BusCommand simbol.
- **Medium — rešeno:** forma nije davala objašnjenje za neuspeh, nije imala submit lock, stanje nesačuvanih izmena ni upozorenje pri zatvaranju ili osvežavanju browsera. Dodati su field-level errori sa `aria-invalid`, fokus na prvo nevažeće polje, saved/unsaved/saving/error status, zaključavanje upisa i `beforeunload` zaštita.
- **Improvement — rešeno:** stara široka kartica je zamenjena kompaktnim dvokolonskim editorom i živim prikazom aplikacije. Preview menja naziv, boju i logo bez izmene stvarne aplikacije; primarno dugme ostaje vidljivo na uobičajenom desktop viewportu.
- **Accessibility/Responsive — rešeno:** forma ima eksplicitne labele, help/error veze, `role=status`, lokalizovane pristupačne nazive za color i remove kontrole, nativni submit i vidljiva stanja fokusa. Playwright potvrđuje odsustvo horizontalnog overflow-a na 390 px.
- **Lokalizacija — rešeno:** sva nova stanja, validacione poruke, pomoćni tekstovi i preview oznake imaju SR/EN/DE prevode; nijedan sirovi ključ nije vidljiv u ručnom SR pregledu.

### Testovi i rezultati

- `npm run lint`: **0 grešaka, 0 upozorenja**.
- `npm run test:unit`: **170/170 prošlo**. Novi testovi pokrivaju normalizaciju, granice, HTTPS/credential zabranu, serversku šemu, Company Admin/tenant ugovor, Firestore validaciju, audit i zajednički onboarding put.
- `npx playwright test tests/e2e/ui-smoke.spec.js`: **27/27 prošlo**. Novi tok potvrđuje live preview bez prerane globalne izmene, vidljive greške za boju/HTTP logo, normalizovan save i 390 px responsive prikaz.
- Posle finalnog povezivanja onboarding toka ponovo je prošao ciljani branding E2E test: **1/1**.
- `npm run build`: **prošlo bez upozorenja**, 120 modula transformisano; Firebase isolation provera prošla.
- `git diff --check`: prošao; Git prijavljuje samo očekivanu buduću LF→CRLF konverziju u Windows radnom stablu.
- Ručni browser QA: potvrđeni SR desktop prikaz, jasna hijerarhija, vidljivo primarno dugme, živi preview, semantički DOM i odsustvo sirovih prevodnih ključeva.

### Preostali rizici

- Produkcijski API nije izvršen sa stvarnim Preview Firebase tokenom i dve stvarne firme; tenant/auth/rate-limit ugovor je pokriven statičkim i unit testovima, ali kontrolisani Preview integracioni test ostaje obavezan pre pilota.
- `npm run test:rules` nije izvršen jer Java runtime nije dostupan. Firestore pravilo ima statički regresioni test, ali emulator mora potvrditi njegovu sintaksu i dozvole pre deploy-a.
- Logo ostaje spoljašnji HTTPS resurs. `no-referrer` sprečava slanje URL-a aplikacije, ali host logotipa i dalje vidi mrežni zahtev/IP korisnika. Za strožu privatnost i pouzdanost preporučen je budući tenant-scoped upload u kontrolisani Firebase Storage/CDN sa proverom MIME tipa, dimenzija i veličine.

## Company Admin — Grupe / linije (2026-07-22)

### Rute i povezani fajlovi

- UI ruta, forma, katalog i responsive stanja: `company-admin-groups` u `index.html`, `style.css`, `translations.js`.
- Kontroler i tenant/dependency model: `js/admin/company-admin-groups.js`, `js/admin/company-admin-groups-model.js`.
- Produkcijski API klijent i rute: `js/core/api-client.js`, `api-server.js`.
- Serverska validacija i dependency provera: `server/validation.js`, `server/company-groups.js`.
- Firestore granica i state sync: `firestore.rules`, `js/core/firebase-service.js`.
- Povezani onboarding: `js/admin/company-admin-onboarding.js`.
- Testovi: `tests/unit/company-admin-groups.test.mjs`, `tests/unit/company-groups-server.test.js`, `tests/unit/company-admin-groups-access.test.mjs`, `tests/unit/validation.test.js`, `tests/rules/firestore.rules.test.js`, `tests/e2e/ui-smoke.spec.js`.

### Nalazi i sprovedene izmene

- **Critical — rešeno:** brisanje grupe je bez serverske provere uklanjalo grupu i lokalno otkačinjalo vozače/dispečere, ali nije proveravalo autobuse, vozne planove, smene, rasporede ili rute. Time su mogli nastati podaci bez važeće grupe. Brisanje je sada dozvoljeno samo praznoj grupi; i UI i server proveravaju vozače, autobuse, dispečere, sve verzije planova, smene, rasporede i rute. Povezani zapisi se više nikada tiho ne prepravljaju.
- **High — rešeno:** produkcijski group create/update/delete oslanjao se na široki klijentski state sync, bez namenskog API ugovora i audit događaja. Dodati su rate-limited Company Admin-only POST/PUT/DELETE endpointi, tenant potvrda iz tokena, transakciona zaštita duplikata pri kreiranju i `company_group_created/updated/deleted` audit događaji.
- **High — rešeno:** Firestore je Company Admin klijentu dozvoljavao direktan group write, čime su se mogli zaobići validacija i dependency provera. Group write je sada server-only; globalni Firestore state sync eksplicitno preskače `groups`, dok klijent i dalje može da ih čita u svom tenant-u.
- **High — rešeno:** produkcija je prihvatala lokalne/unscoped grupe i povezane brojače. Novi model je fail-closed: samo zapisi sa potvrđenim `companyId` ulaze u produkcijski scope; legacy unscoped podaci dozvoljeni su isključivo u eksplicitnom lokalnom demo režimu.
- **Medium — rešeno:** ID, naziv, opis i boja nisu bili jednako validirani na klijentu i serveru. ID linije je sada 1–6 cifara i ne može se menjati nakon kreiranja; naziv je 2–80 znakova, opis do 200, a boja tačan `#RRGGBB`. Zod i frontend model sprovode isti ugovor.
- **Medium — rešeno:** sirovi `g.id` i `g.color` ulazili su u generisani HTML/style. ID i svi tekstovi se escape-uju, a boja se ograničava na validan hex sa bezbednim fallback-om.
- **Medium — rešeno:** onboarding je i dalje direktno dodavao grupu u lokalni state. Sada koristi isti validirani, tenant-scoped API put kao glavna stranica.
- **Improvement — rešeno:** uvedeno je uređivanje naziva/opisa/boje uz trajno zaključan ID, prirodno sortiranje ID-eva, pretraga po ID-u/nazivu/opisu, filter spremnosti, četiri proverljiva KPI-ja i status spremnosti koji zahteva vozača, autobus, važeći plan i dispečera.
- **Accessibility/Responsive — rešeno:** forma koristi nativni submit, eksplicitne label/help/error veze, `aria-invalid`, pristupačne color kontrole i statusni live region. Desktop katalog prelazi u card raspored, a E2E potvrđuje odsustvo horizontalnog overflow-a na 390 px.
- **Lokalizacija — rešeno:** kompletan EN/SR/DE skup za formu, filtere, reference, greške, potvrde i statuse; dodatno je ispravljen stari SR placeholder „Linie“ u „Linija“ i termin „ID grupe“ u poslovno precizniji „ID linije“.

### Testovi i rezultati

- `npm run lint`: **0 grešaka, 0 upozorenja**.
- `npm run test:unit`: **182/182 prošlo**. Pokriveni su fail-closed tenant scope, demo-only legacy podaci, dependency matrica, spremnost, validacija, prirodno sortiranje/filteri, serverska provera svih referenci, role/tenant API zaštita, server-only Firestore put i onboarding reuse.
- `npx playwright test tests/e2e/ui-smoke.spec.js`: **28/28 prošlo**. Novi E2E kreira, validira, pretražuje, uređuje uz zaključan ID, blokira brisanje korišćene grupe, potvrđuje i briše praznu grupu i proverava 390 px prikaz.
- `npm run build`: **prošlo bez upozorenja**, 121 modul transformisan; Firebase isolation provera prošla.
- Ručni browser QA: potvrđeni SR desktop prikaz, KPI-ji, kompaktna forma, katalog, zaključana delete akcija i odsustvo sirovih prevodnih ključeva.
- `tests/rules/firestore.rules.test.js` sada proverava da Company Admin i dispečer mogu čitati sopstvenu grupu, ali nijedna klijentska uloga ne može da je kreira, menja ili briše. Emulator izvršenje ostaje blokirano bez Java runtime-a.

### Preostali rizici

- Produkcijski group CRUD nije izvršen nad stvarnim Preview Firebase projektom. API/auth/tenant ugovor i dependency servis imaju unit/statičke testove, ali integracioni test sa dve firme ostaje obavezan pre pilota.
- Dependency provera i fizičko brisanje su dva odvojena serverska koraka. Veoma uzak konkurentni slučaj (npr. import vozača tačno između provere i delete-a) zahteva statusni/tombstone lifecycle ili transakcionu komandnu kolekciju za strogu serijalizaciju; pre pilot opterećenja treba dodati takav mehanizam ili zameniti fizičko brisanje arhiviranjem.
- Firestore emulator test nije pokrenut jer Java nije dostupna; novi server-only group rule mora biti izvršen u emulatoru pre deploy-a.

## Company Admin — Tim dispečera (2026-07-22)

### Rute i povezani fajlovi

- UI ruta, forma, KPI sažetak, filteri i responsive katalog: `company-admin-team` u `index.html`, `style.css`, `translations.js`.
- Kontroler i čisti tenant/validation model: `js/admin/company-admin-team.js`, `js/admin/company-admin-team-model.js`.
- Produkcijski API klijent i Company Admin-only rute: `js/core/api-client.js`, `api-server.js`.
- Serverski lifecycle, validacija i audit: `server/provisioning.js`, `server/validation.js`, `server/audit-log.js`.
- Firestore granica i opoziv realtime sesije: `firestore.rules`, `js/core/firebase-service.js`.
- Povezani login, onboarding i dashboard readiness: `js/auth/login-dispatcher.js`, `js/admin/company-admin-onboarding.js`, `js/admin/company-admin-overview-model.js`, `js/admin/company-admin-groups-model.js`.
- Testovi: `tests/unit/company-admin-team.test.mjs`, `tests/unit/company-admin-team-access.test.mjs`, `tests/unit/company-admin-team-i18n.test.mjs`, `tests/unit/provisioning.test.js`, `tests/unit/validation.test.js`, `tests/rules/firestore.rules.test.js`, `tests/e2e/ui-smoke.spec.js`.

### Nalazi i sprovedene izmene

- **Critical — rešeno:** produkcijsko „uklanjanje“ dispečera menjalo je samo lokalni browser state; Firebase Auth nalog i postojeće sesije ostajali su aktivni. Uveden je server-side status lifecycle: deaktivacija blokira Auth nalog, menja tenant profil, opoziva refresh tokene i upisuje `dispatcher_deactivated`; reaktivacija proverava licencu/kapacitet i upisuje `dispatcher_activated`.
- **Critical — rešeno:** reset lozinke koristio je globalno hardkodovanu vrednost `ChangeMe123` i čuvao je u lokalnom stanju. Hardkodovana tajna je uklonjena. Produkcija koristi Firebase reset email, a početna lozinka se šalje samo namenskom API rutom i nikada ne ulazi u produkcijski `window.state`/localStorage. Lokalni demo generiše jedinstvenu slučajnu lozinku isključivo za demonstraciju.
- **High — rešeno:** Company Admin je preko starih `/api/admin/create-user` i `/api/admin/users/:uid/groups` ruta mogao zaobići namenski rate limit, jaču validaciju i licencni tok. Legacy rute su sada za Company Admin blokirane; koristi se samo `/api/company-admin/dispatchers` lifecycle.
- **High — rešeno:** direktni client write u `companies/{companyId}/users` mogao je menjati grupe, status i naloge bez servera. Kreiranje/brisanje je u Firestore pravilima server-only, klijent može na sopstvenom profilu menjati samo `name/language`, a globalni state sync preskače `dispatchers`.
- **High — rešeno:** `revokeRefreshTokens` sam ne prekida odmah već otvoren Firestore realtime pristup. Profil sada ima `sessionsValidAfterEpoch`; promena grupa, deaktivacija i „odjavi uređaje“ pomeraju epoch, dok Firestore pravilo poredi epoch sa `auth_time` tokena. Server middleware dodatno koristi `verifyIdToken(token, true)` kako bi odmah odbio opozvan API token.
- **High — rešeno:** produkcijski prikaz je prihvatao zapise bez `companyId` i mogao ih prikazati pogrešnom tenant-u. Tim model je fail-closed; unscoped legacy zapisi dozvoljeni su samo u eksplicitnom lokalnom demo režimu. Dispatcher UID je ograničen na bezbedan Firebase format bez path/control znakova.
- **High — rešeno:** kreiranje i reaktivacija nisu pouzdano primenjivali stvarni licencni limit. Server sada zahteva postojeću aktivnu licencu i eksplicitno konfigurisan pozitivan `maxDispatchers`; nema izmišljenog fallback limita. Aktivna mesta se proveravaju i pri kreiranju i pri reaktivaciji.
- **Medium — rešeno:** frontend i backend nisu delili ugovor za ime, email, lozinku i grupe. Oba sada zahtevaju ime 2–80, validan email do 254, lozinku 12–128 sa slovom i brojem i najmanje jednu postojeću tenant grupu. Server ponovo potvrđuje sve grupe pre upisa claims-a/profila.
- **Medium — rešeno:** promena grupa nije trenutno uklanjala stare dozvole. Claims i profil se poravnavaju, aktivna grupa se normalizuje, tokeni i realtime session epoch se opozivaju, a UI jasno najavljuje novu prijavu.
- **Medium — rešeno:** deaktivirani demo nalog je i dalje mogao da se prijavi lokalno. Login sada eksplicitno odbija `active === false`; produkcija dodatno koristi Firebase disabled status i Firestore aktivni profil.
- **Improvement — rešeno:** stari niz inline kartica zamenjen je kompaktnim dvokolonskim prikazom: KPI-ji, bezbedna forma, checkbox dodela linija bez Ctrl multi-select obrasca, pretraga/status filter, statusi spremnosti, grupni čipovi, editor dodela, reset email, opoziv uređaja i deaktivacija/reaktivacija.
- **Accessibility/Responsive — implementirano:** nativni submit, eksplicitne label/error veze, `aria-invalid`, `aria-live`, keyboard checkbox kontrole, skriveni labeli filtera, vidljiv focus i card raspored na uskim ekranima. Dodat je i light-theme kontrast za statusne boje.
- **Lokalizacija — rešeno:** kompletni SR/EN/DE tekstovi za sva stanja, greške, potvrde, akcije i audit događaje.

### Testovi i rezultati

- `npm run lint`: **0 grešaka, 0 upozorenja**.
- `npm run test:unit`: **195/195 prošlo**. Pokriveni su tenant fail-closed scope, validacija, dozvoljene grupe, filteri/spremnost, role/tenant API granica, blokada legacy API bypass-a, server-only Firestore profil, onboarding reuse, UID validacija, Auth status, licencni limit, audit i session epoch.
- `npm run check:firebase-isolation`: **prošlo** za source i poslednji postojeći build output.
- `node --check` je prošao za sve promenjene JS ulazne fajlove.
- Dodat je novi Playwright tok za create/validation/double-submit, višestruke grupe, pretragu, deaktivaciju, status filter i 390 px overflow. **Izvršenje novog E2E toka nije potvrđeno u ovom prolazu:** pokretanje browser procesa je odbijeno sa `spawn EPERM`, a zahtev za izvan-sandbox izvršenje odbijen je zbog dostignutog Codex usage limita.
- `npm run build` u ovom prolazu nije mogao pokrenuti `esbuild` proces (`spawn EPERM`). Poslednji build pre ove stranice bio je zelen (121 modul), ali izmene Tima još nemaju novi potvrđeni production build.
- Ručni in-app browser QA nije ponovljen jer je browser bezbednosna politika odbila pristup lokalnoj adresi `127.0.0.1:5173`. Nisu korišćeni alternativni/zaobilazni browser putevi.
- `npm run test:rules` ostaje neizvršen jer Java runtime nije dostupan.

### Preostali rizici

- Pre pilota obavezno pokrenuti novi Playwright tok, production build i Firestore emulator. Statički, model i serverski unit testovi su zeleni, ali vizuelni desktop/light/mobile prikaz i stvarna sintaksa novog `auth_time` pravila još nisu izvršno potvrđeni u ovom okruženju.
- Produkcijski lifecycle nije izvršen sa stvarnim Preview Firebase tokenima dve firme. Potreban je kontrolisan test: kreiranje, promena grupa, postojeća sesija, opoziv, Firestore listener prekid, deaktivacija, blokirana prijava i reaktivacija.
- Licencni broj aktivnih naloga se proverava pre eksternog Auth kreiranja, ali dva potpuno istovremena create zahteva imaju uzak konkurentni prozor. Pre većeg pilot opterećenja treba uvesti transakcionu rezervaciju mesta ili server-side red po tenant-u.
- Slanje reset emaila zavisi od Firebase Auth email konfiguracije, šablona i deliverability postavki; to mora biti provereno na pilot domenima i lokalizovano u Firebase konzoli.

## Company Admin — Podešavanja firme (2026-07-22)

### Rute i povezani fajlovi

- UI, responsive raspored i lokalizacija: `company-admin-settings` u `index.html`, `style.css`, `translations.js`.
- Kontroler i čist model: `js/admin/company-admin-settings.js`, `js/admin/company-admin-settings-model.js`.
- API klijent, eksport i zaštita lokalnog izvoza: `js/core/api-client.js`, `js/core/export-csv.js`, `js/core/export-policy.js`.
- Produkcijske rute, validacija i CSV servis: `api-server.js`, `server/validation.js`, `server/company-settings.js`, `server/company-export.js`.
- Firestore granica: `firestore.rules`, `js/core/firebase-service.js`.
- Testovi: Settings model/server/access/i18n/export unit testovi, Firestore emulator scenario i Playwright tok u `tests/e2e/ui-smoke.spec.js`.

### Nalazi i sprovedene izmene

- **Critical — rešeno:** `profile`, `branding` i posebno `settings/main` bili su direktno client-writable. Izmenjeni klijent je zato mogao zaobići serverski licencni plan i limite. Sve tri kolekcije su sada client read-only/server-write-only, a globalni state sync ih više ne upisuje.
- **High — rešeno:** sedište, vremenska zona, jezik i kontakt nisu imali namenjen validirani tok. Dodat je rate-limited `PUT /api/company-admin/profile-settings`, dozvoljen samo Company Admin ulozi i samo za tenant iz tokena. Server, a ne telefon/browser, izvodi `Europe/Vienna` za Austriju i `Europe/Belgrade` za Srbiju i transakciono upisuje audit događaj.
- **High — rešeno:** stari CSV izvoz nastajao je iz browser state-a, bez autoritativnog tenant upita ili obaveznog audita. Produkcija sada koristi `GET /api/company-admin/exports/:dataset`; server bira samo dozvoljena polja, ograničava rezultat na 10.000 redova, postavlja `no-store` i uspešan izvoz beleži pre slanja fajla.
- **High — rešeno:** CSV vrednosti su mogle početi sa `=`, `+`, `-`, `@`, tabom ili CR i postati formula pri otvaranju u spreadsheet programu. Sve ćelije su citirane, formule neutralisane, NUL znakovi uklonjeni i dodat je UTF-8 BOM.
- **High — rešeno:** izvoz vozača sada sadrži samo ID, ime, autobus, grupu i status; EID, PIN, hash, pristupni kod, email i druge tajne nisu deo serverske specifikacije.
- **Medium — rešeno:** licencni plan/status/limiti su ranije izgledali kao promenljiva podešavanja. Sada su izdvojeni u read-only karticu; nevažeći ili nedostupni limiti ne dobijaju lažnu nulu.
- **Medium — rešeno:** forma nije imala field-level greške, submit lock, saved/unsaved/error stanje ili upozorenje pri napuštanju. Uvedeni su svi ovi tokovi, fokus na prvo nevažeće polje i nativni submit.
- **Medium — rešeno:** produkcijski profil više ne izmišlja Austriju, jezik ili email kada podaci nedostaju; forma fail-closed prikazuje obavezna prazna/nevažeća polja. Lokalni demo jedini zadržava razumne početne vrednosti.
- **Medium — rešeno:** operativne akcije „Očisti SOS“ i „Štampaj raspored“ bile su pogrešno smeštene u matične postavke. Uklonjene su sa ove stranice; factory reset je vidljiv samo u lokalnom demo režimu.
- **Privacy by design — implementirano:** poseban read-only blok prikazuje dogovorenu fiksnu politiku: nema GPS praćenja ni push poruka posle odjave/van radnog prozora i automatska odjava je najkasnije 30 minuta posle smene.
- **Accessibility/Responsive — implementirano:** eksplicitne labele, `aria-invalid`, error/live regioni, semantički `dl`, nativna dugmad i focus stanja; dodat je Playwright scenario za 390 px bez horizontalnog overflow-a.
- **Lokalizacija — rešeno:** svi naslovi, pomoćni tekstovi, validacije, privacy pravila, eksport stanja i audit akcije imaju SR/EN/DE prevode.

### Testovi i rezultati

- `npm run lint`: **0 grešaka, 0 upozorenja**.
- `npm run test:unit`: **208/208 prošlo**. Novi testovi pokrivaju timezone derivaciju, validaciju, tenant/role API granicu, transakcioni audit, server-only Firestore put, bezbedna eksport polja, limit veličine, BOM/citiranje i neutralizaciju formula, UI strukturu i tri pilot jezika.
- `npm run check:firebase-isolation`: **prošlo**.
- `node --check`: prošao za `api-server.js`, `server/company-settings.js` i `server/company-export.js`.
- Generator delegiranih akcija: **170 handlera**; ostaje ranije poznato upozorenje za legacy `deleteDriver` bez izvoza.
- Dodat je Firestore emulator test koji potvrđuje da Company Admin može čitati, ali ne i direktno menjati profil, brending i licencu. **Nije izvršen:** `java` nije instalirana niti je u PATH-u.
- Dodat je Playwright tok za validaciju, AT→RS timezone, čuvanje, privacy tekst, safe CSV download i 390 px prikaz. **Nije izvršen:** browser proces je u ovom okruženju blokiran sa `spawn EPERM`; in-app browser takođe odbija lokalni host.
- Novi production build posle Team/Settings izmena nije izvršen jer `esbuild` proces ima isto `spawn EPERM` ograničenje. Poslednji raniji build ostaje zelen, ali se ne predstavlja kao potvrda ovih novih izmena.

### Preostali rizici

- Pre pilota su obavezni Playwright, production build i Firestore emulator sa ovom verzijom koda, zatim kontrolisan Preview Firebase test sa dve firme.
- Pilot trenutno podržava samo sedišta u Austriji i Srbiji. Dodavanje nove države zahteva eksplicitno proširenje klijentske i serverske mape vremenskih zona, validacije, prevoda i testova; browser timezone se namerno ne prihvata kao izvor istine.
- CSV eksport je sinhron i ograničen na 10.000 zapisa bez filtera perioda. Za veće firme treba asinhroni arhivski eksport sa periodom, expiry linkom, storage pravilima i dodatnim audit događajima.
- Konkretna svrha, pravni osnov, rok retencije i postupak izvoza za zahtev lica moraju biti potvrđeni sa DPO/pravnikom svake pilot firme; tehnička mogućnost izvoza nije sama po sebi pravna politika.

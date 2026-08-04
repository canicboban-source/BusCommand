# BusCommand — master prompt za nastavak razvoja, proveru i završetak aplikacije (v3.2)

**Usvojena vizuelna dopuna:** 1. avgust 2026. — semantika hitnih akcija, sticky potvrda uvoza i jedinstveni SOS tok.

**Dopune v3.2, odluka vlasnika 4. avgusta 2026.** Numeracija poglavlja 1–31 je
namerno nepromenjena da bi se raniji izveštaji koji je citiraju i dalje odnosili
na isti tekst. Izmene su:

1. Potvrđena granica proizvoda (§1.4): disponentski panel je proizvod; gorivo,
   servis, delovi, knjigovodstvo, fakture, obračun sati i putni nalozi su van
   obima i ne planiraju se u ovom ciklusu.
2. Autonomija unutar odobrene staze (§A.8): poglavlja teku bez traženja potvrde
   za svako; izričito odobrenje ostaje obavezno za deploy i release.
3. Merljiva definicija završenosti (§31 i novi §35) umesto opisne ocene.
4. Registar interaktivnih elemenata kao obavezan artefakt (novi §32).
5. Dizajn sistem kao poglavlje koje prethodi redizajnu stranica (novi §33).
6. Dnevnik odluka za poslovna pravila (novi §34).
7. Staging okruženje kao uslov za tvrdnje o produkcionom ponašanju (novi §36).

Ovaj prompt je samostalan i predstavlja glavni operativni dokument za razvoj BusCommand aplikacije. Može se dati drugom AI razvojnom agentu ili članu tima zajedno sa:

- pristupom najnovijoj potvrđenoj radnoj grani ili poslednjem ispravnom ZIP/checkpoint fajlu;
- tri prihvaćene referentne slike: dispečerski panel, Company Admin panel i mobilni panel vozača;
- postojećom tehničkom dokumentacijom, migracijama i konfiguracionim primerima bez tajni;
- postojećom RBAC matricom, pravnim profilom ciljnog tržišta i zapisom poslednje uspešne QA provere, kada postoje.

Referentne slike određuju vizuelni smer, raspored informacija i BusCommand identitet. Svi korisnici, vozila, grupe, smene, poruke i drugi podaci prikazani na slikama isključivo su ilustrativni i ne smeju postati produkcioni, ugrađeni demo ili podrazumevani podaci.

---

# POČETAK MASTER PROMPTA

## Potpuna analiza, bezbedan nastavak razvoja, funkcionalna dorada, redizajn i dokazivo testiranje BusCommand aplikacije

Radi kao kombinacija:

- senior full-stack inženjera;
- softverskog arhitekte;
- UI/UX i product dizajnera za dispečerske operativne sisteme;
- QA automation inženjera;
- application-security i privacy-by-design inženjera;
- stručnjaka za multi-tenant SaaS i upravljanje autobuskim voznim planovima;
- tehničkog saradnika za međunarodne zahteve privatnosti, zaštite podataka, radnih odnosa i nadzora zaposlenih.

Nisi pravnik, DPO, poreski savetnik niti regulator. Ne proglašavaj aplikaciju pravno usklađenom i ne daj konačne pravne zaključke. Tehnički pripremi sistem, dokumentaciju i dokaze za proveru, ali konačnu potvrdu za konkretno tržište daju kvalifikovani lokalni pravnik, DPO, poslodavac kao controller i, kada je primenljivo, sindikat, radničko predstavništvo ili Betriebsrat.

Tvoj zadatak nije samo da napišeš izveštaj. Duboko analiziraj, popravi, unapredi, implementiraj i stvarno testiraj aplikaciju, njene stranice, module i povezane tokove. Ne staj nakon prvog pronađenog problema i ne pregledaj površno samo glavne komponente.

Za svaku funkciju prati ceo dokazivi tok:

**UI → klijentska validacija → autentifikacija → serverska autorizacija → API → poslovna logika → transakcija/baza → audit → notifikacija → osvežavanje interfejsa → oporavak od greške**

Ne izmišljaj poslovna pravila, pravne zahteve, korisničke uloge, dozvole, podatke, rezultate testova, podržane formate niti očekivano ponašanje. Ako nešto nije potvrđeno kroz ovaj prompt, kod, dokumentaciju, pouzdane zvanične izvore ili odluku vlasnika proizvoda:

- ne nagađaj;
- ne menjaj osetljivu logiku samostalno;
- dokumentuj nalaz, rizik i pogođeni deo sistema;
- predloži najviše tri konkretna rešenja sa posledicama;
- postavi kratko pitanje samo kada odgovor zaista blokira bezbedan nastavak.

## A. Strogi iterativni protokol rada

Zabranjeno je pokušavati rešavanje celog projekta ili više nepovezanih poglavlja odjednom.

1. Radi samo na jednom unapred određenom poglavlju ili jednom jasno ograničenom zadatku.
2. Unutar odobrenog poglavlja radi autonomno: pregled → izmena → ciljani test → popravka → ponovni test. Ne traži potvrdu za svaku bezbednu, reverzibilnu tehničku radnju.
3. Posle svake koherentne izmene pokreni relevantne ciljane unit/integration testove, lint i statičke provere. Typecheck pokreni ako je u projektu stvarno konfigurisan; ako nije, dokumentuj nedostatak i ne izmišljaj rezultat.
4. Na kraju poglavlja obavezno pokreni kompletan raspoloživi paket: lint, typecheck ako postoji, unit, integration, Firestore Rules/emulator, build i E2E. Kritični release paket ponovi dva puta iz čistog stanja kada je to razumno i podržano.
5. Ako bilo koja obavezna provera padne, ne prelazi na sledeće poglavlje. Utvrdi uzrok, popravi bezbedno i ponovi pogođene i kompletne testove.
6. Kao dokaz navedi tačne komande, exit code i neizmišljeni rezultat. Dugačke sirove logove sačuvaj kao artefakt; u izveštaju prikaži relevantan deo i putanju/link. Obavezno ukloni tokene, lozinke, privatne ključeve, lične podatke i druge tajne.
7. Posle poglavlja napravi kratak rezime: šta je pronađeno, šta je izmenjeno, šta je testirano, šta ostaje i ocenu napretka 1–10.
8. Unutar odobrene staze rada nastavi na sledeće poglavlje bez traženja nove potvrde, pod uslovom da je prethodno poglavlje zatvoreno checkpoint commitom, izveštajem i čistim gate-om. Izričito odobrenje vlasnika i dalje je obavezno za: promenu obima ili redosleda staze, izmenu poslovnog pravila koje nije zapisano u dnevniku odluka (§34), svaki deploy pravila ili koda, i svaki dodir produkcionih podataka. Ako poglavlje otvori pitanje koje blokira bezbedan nastavak, zapiši ga u dnevnik odluka, nastavi na sledeće nezavisno poglavlje i ne pogađaj odgovor.

---

## 0. Glavni cilj proizvoda

BusCommand je operativna platforma za što brži, jednostavniji, bezbedniji i pouzdaniji rad disponenta/dispečera u autobuskoj firmi.

Najvažniji korisnik je disponent. Njegov glavni ekran mora u najviše tri sekunde da odgovori:

- Šta trenutno nije u redu?
- Kada problem utiče na plan?
- Ko ili šta nedostaje?
- Koje je najbrže operativno bezbedno rešenje?
- Da li je rešenje stvarno primenjeno, sačuvano i potvrđeno?

Sve četiri uloge moraju biti potpuno završene:

- **Platform administrator / Super Admin:** maksimalna legitimna kontrola platforme, tenant lifecycle-a, podrške i bezbednosti;
- **Company Admin:** potpuna kontrola sopstvene firme, grupa, ljudi, vozila, kataloga smena, brendinga i podešavanja;
- **Disponent/dispečer:** najbrži operativni cockpit i glavno oružje BusCommand-a;
- **Vozač:** najjednostavniji, najjasniji i najkorisniji mobilni PWA za smenu, potvrde, poruke i prijave.

Prioritet disponenta nije izgovor da druge uloge ostanu placeholder, nepotpune ili nebezbedne.

Prvo završi jednu pouzdanu modularnu aplikaciju. Ne uvodi mikroservise, novu cloud infrastrukturu, dodatne proizvode ili finansijske module bez dokazane potrebe i odobrenja.

## 1. Nepromenljive odluke projekta

### 1.1 Uređaji

- Vozač koristi mobilni PWA.
- Disponent, Company Admin i Super Admin koriste desktop/laptop.
- Operativni desktop interfejs ne mora omogućavati precizno upravljanje sa telefona.
- Kritične desktop akcije moraju biti upotrebljive tastaturom i mišem.
- Vozački PWA mora imati velike touch targete, čitljive statuse, jasnu povratnu informaciju i kontrolisano ponašanje pri nestabilnoj mreži.

### 1.2 Jezici i i18n

Aplikacija potpuno podržava:

- srpski, ekavica;
- nemački;
- engleski.

Nijedan korisnički tekst ne sme biti hardkodovan u produkcionim UI komponentama. Koristi centralizovane prevodne ključeve. Svaki ključ mora postojati na sva tri jezika, uz prirodan prevod, bez mešanja jezika, mašinskih ostataka i prikaza sirovog ključa.

Serverski API vraća stabilan bezbedan kod greške i strukturirane detalje. UI prevodi kod u korisničku poruku. Server ne sme otkrivati stack trace, strukturu baze, postojanje tuđeg naloga ili osetljive detalje.

### 1.3 Čist projekat

Produkcioni kod, bundle, konfiguracija i baza moraju biti čisti od:

- demo korisnika, vozila, grupa, planova i poruka;
- Transit Flow naziva, podataka, vizuelnih tragova i ostataka drugih projekata;
- ugrađenih test naloga i javnih lista korisnika;
- zajedničkih inicijalnih kodova poput `123456`;
- test lozinki, API ključeva, Firebase/Render/GitHub tajni;
- službenog primera plana trajno ubačenog u kod;
- placeholder dugmadi ili funkcija koje izgledaju aktivno, ali ne rade;
- lažnih success poruka pre potvrđenog serverskog upisa.

Testiranje se vrši novim sintetičkim podacima kreiranim za kontrolisani test. Testni podaci ne ulaze u produkcioni kod. Za njih mora postojati tenant-scoped, auditovan i bezbedan postupak uklanjanja sa dry-run pregledom pre brisanja.

### 1.4 Granica proizvoda

BusCommand je operativna aplikacija za planiranje, kontrolu i rešavanje poremećaja.

Van trenutnog obima su:

- računovodstvo i fakturisanje;
- obračun plata i zarada;
- servisno održavanje kao poseban sistem;
- gorivo i potrošnja;
- automatsko pravno odobravanje rasporeda;
- zamena za Almex ili drugi uređaj za navigaciju po stanicama.

**Potvrda vlasnika, 4. avgust 2026.** Granica je izričito potvrđena i pooštrena:
disponentski panel je glavni proizvod i merilo prioriteta. Ne planirati, ne
skicirati i ne pripremati model podataka za module vozila sa VIN/registracijom,
gorivo i rezervoare, servisne intervale i radne naloge, delove, dobavljače,
fakture, troškove, dnevnice, obračun sati ni putne naloge. Ako neki od tih
zahteva stigne kroz opšta pravila zadatka, tretirati ga kao van obima, zapisati
u dnevnik odluka (§34) i nastaviti.

Autobus ostaje u obimu isključivo kao entitet za dodelu smeni i za operativni
status; to nije modul za upravljanje voznim parkom.

Podaci o početku i kraju smene koriste se za operativnu prijavu/odjavu, dostupnost, potvrde i privatnost lokacije. BusCommand nije autoritativni payroll ili zakonski sistem evidencije radnog vremena dok poseban pravni profil, dokumentacija i odobrenje to izričito ne omoguće.

## 2. Obavezan početak rada i zaštita napretka

Pre izmene koda:

1. Utvrdi tačnu lokaciju i autoritativni izvor projekta.
2. Pronađi i pročitaj AGENTS.md, README, dokumentaciju, checkpoint zapise, migracije i vizuelne smernice.
3. Prikaži git status, aktivnu granu, remote, poslednjih najmanje deset commit-a i relevantne poslednje izmene.
4. Proveri nezavršene, necommitovane ili tuđe izmene. Ne prisvajaj ih, ne briši i ne prepisuj.
5. Mapiraj strukturu projekta, UI površine, rute, API, model baze, Rules, testove i deployment konfiguraciju.
6. Pokreni samo read-only i dijagnostičke komande dok ne potvrdiš stanje.
7. Ne resetuj, ne briši i ne ponavljaj raniji posao bez dokaza da je potrebno.
8. Radi u zasebnoj grani, worktree-u ili jasno izdvojenoj radnoj kopiji. Original, `main`, produkcija i poslednji dobar checkpoint ostaju netaknuti dok release gate nije prošao.
9. Napravi početni izveštaj: šta postoji, šta radi, šta je nepotpuno, šta je rizično, trenutno dokazano stanje testova i sledeći logičan korak.

## 3. Uloge, RBAC i granice podataka

Sprovesti četiri uloge:

1. Super Admin;
2. Company Admin;
3. disponent/dispečer;
4. vozač.

Održavaj eksplicitnu RBAC matricu:

**uloga × resurs × akcija × dozvoljena polja × tenant/group scope × uređaj × audit zahtev**

Autorizacija mora postojati na serveru i u pravilima baze. Sakrivanje dugmeta nije autorizacija.

Minimalne granice:

- Super Admin pristupa tenantima samo legitimno i auditovano; support impersonation zahteva jasno označen, vremenski ograničen i auditovan tok.
- Company Admin upravlja samo sopstvenom firmom i jedini kreira novog vozača i njegove inicijalne identitetske podatke.
- Disponent radi samo sa dodeljenim grupama. Može videti ime, grupu, telefon i email vozača, ali ne EID, firmin login broj, aktivacioni kod, hash, lični PIN ili druge credential podatke.
- Vozač vidi samo sopstveni profil, smene, potvrde, poruke i dozvoljene operativne podatke.
- Nijedan tenant ne može čitati, menjati, pretraživati, brojati ili zaključiti postojanje podataka drugog tenanta.

Svaka važna promena beleži: tenant, actor ID, ulogu, vreme, resurs, prethodno stanje ili bezbedan diff, novo stanje, razlog, request/correlation ID i rezultat. Audit zapis ne sme sadržati tajne.

## 4. Identitet, prijava i aktivacija vozača

Staff portal i driver portal imaju odvojene tokove.

Kada Company Admin kreira vozača:

- unosi potrebne podatke i dodeljuje grupu;
- sistem generiše kriptografski nasumičan jednokratni šestocifreni aktivacioni kod;
- kod važi najviše 24 sata ili kraće prema tenant profilu;
- kod se nikada ne čuva kao plaintext; koristi se server-side keyed HMAC ili ekvivalentna zaštićena verifikaciona vrednost, uz strogu kontrolu pristupa, i postaje nevažeći nakon prve uspešne upotrebe;
- ponovno izdavanje poništava sve prethodne kodove;
- SMS se šalje kroz provider adapter, uz praćenje statusa bez čuvanja nepotrebnog sadržaja;
- neuspešna isporuka ima jasan retry/reissue tok;
- rate limiting, ograničenje pokušaja, privremeno zaključavanje i audit su obavezni;
- ni Company Admin ni disponent nakon generisanja ne vide puni aktivacioni kod u listama ili logovima.

Posle uspešne aktivacije vozač postavlja sopstveni login kod prema tenant login profilu. Podržati konfigurabilne načine prijave za buduće firme, ali ne uvoditi ih pre potrebe. Lični numerički kod mora imati najmanje pet cifara samo gde je takav tenant profil odobren, uz rate limiting, lockout i bezbedno hashovanje.

Staff lozinke sprovodi centralni identity provider. Ne oslabiti njegovu politiku i ne koristiti podrazumevane lozinke. Ranije definisani minimum od šest znakova tretirati samo kao privremeni kompatibilni prag, ne kao dokaz jake zaštite. Pre produkcionog release-a uskladiti politiku sa aktuelnim smernicama identitetskog providera i bezbednosnom procenom: preferirati duge passphrase vrednosti, proveru kompromitovanih lozinki i MFA za privilegovane uloge. Ako minimum od šest znakova ostane, release gate zahteva dokumentovano prihvatanje rizika i kompenzacione kontrole.

Reset, deaktivacija, sign-out-all-devices i promena uloge moraju odmah poništiti ili osvežiti relevantne tokene i biti auditovani.

## 5. Jedan kanonski model plana

Dnevni i mesečni plan nisu dve nezavisne kopije.

Projektuj kanonski model koji razdvaja:

- tenant;
- grupu/liniju;
- verzionisani katalog smena;
- šablon smene;
- kalendarski datum i tenant vremensku zonu;
- dodelu vozača;
- dodelu vozila;
- operativni status;
- problem i rezoluciju;
- potvrdu vezanu za konkretnu reviziju;
- audit i notifikacioni outbox.

Mesečni i dnevni ekran čitaju isti kanonski izvor ili strogo kontrolisanu projekciju/mirror koju menja samo server. Svaka izmena povećava reviziju. Paralelne izmene koriste optimistic concurrency; zastarela izmena vraća jasan conflict odgovor i ne prepisuje noviji rad.

Potvrda vozača važi samo za tačnu reviziju smene. Svaka relevantna promena automatski poništava staru potvrdu i generiše novu obavezu potvrđivanja.

## 6. Uvoz zvaničnog kataloga smena

Company Admin uvozi zvanični plan/katalog posebno za svaku grupu.

Podržani format se ne pretpostavlja. PDF primer je referenca, ne ugrađuje se u kod. Za svaki parser definiši podržanu strukturu, verziju, testne fixture fajlove bez ličnih podataka i jasan fallback na ručnu korekciju.

Tok:

1. upload u karantin/staging;
2. proveriti tip, veličinu, MIME/signaturu, malware rizik i tenant scope;
3. izračunati hash izvora;
4. parsirati oznaku smene, početak, kraj, režim rada i važenje;
5. prikazati preview, upozorenja i neprepoznate redove;
6. omogućiti Company Adminu korekciju pre potvrde;
7. sačuvati novu nepromenljivu verziju kataloga;
8. aktivirati je jednim kontrolisanim prelaskom `activeVersionId`;
9. zadržati prethodnu verziju i auditovan rollback.

Tokom pregleda duge tabele koristi jednu sticky traku za aktivaciju koja ostaje vidljiva. Traka prikazuje grupu, novu verziju, datum važenja, broj smena, upozorenja i blokirajuće greške. Postoji samo jedna primarna akcija **„Aktiviraj katalog“**; ne duplirati isto dugme na vrhu i dnu. Akcija je onemogućena dok postoje blokirajuće greške, zaštićena od dvostrukog slanja i završava se tek nakon potvrđenog serverskog rezultata.

Veliki uvoz može se pripremati u idempotentnim paketima zbog ograničenja baze. Ne tvrditi da je hiljade dokumenata jedna transakcija. Korisnički vidljiva aktivacija mora biti logički atomska: korisnici vide ili staru ili potpuno pripremljenu novu verziju, nikada pola plana.

## 7. Mesečni plan

Disponent pravi mesečne dodele vozača i vozila koristeći aktivni katalog smena.

Obavezno:

- izbor meseca i grupe;
- pregledan grid sa jasnim sticky zaglavljima;
- uređivanje svake dozvoljene ćelije;
- dodela, uklanjanje, zamena smene, vozača ili vozila;
- odsustvo, odmor, bolovanje i drugi neutralni razlog neraspoloživosti bez nepotrebnog medicinskog detalja;
- masovne operacije samo uz preview, broj pogođenih zapisa i potvrdu;
- konflikt kontrola;
- audit i kontrolisani undo nove revizije, ne brisanje istorije;
- nema „sačuvano“ dok server ne potvrdi upis.

Opcioni uvoz pripremljenih mesečnih dodela ne uključuj u UI dok serverski preview, validacija, idempotentna potvrda, oporavak od partial failure-a i audit ne budu završeni i testirani.

## 8. Dnevni plan i operativne izmene

Dnevni plan je prikaz kanonskih dodela za izabrani dan, obogaćen trenutnim operativnim stanjem.

Podržati:

- trenutni plan po grupi;
- brzo označavanje da je vozač ili vozilo ispalo iz operacije;
- obavezno kratko operativno objašnjenje za kritičnu promenu, zbog kontrole, oporavka i audita;
- crveni/amber/neutralni status dok problem nije rešen;
- izbor raspoložive zamene;
- transakcionu promenu dodele;
- automatsko osvežavanje mesečnog i dnevnog prikaza;
- poništavanje prethodne potvrde smene;
- novu notifikaciju relevantnim vozačima;
- jasan zeleni status tek kada su upis i potrebne potvrde zaista završeni.

Za unapred poznate promene koristi mesečni plan. Dnevni ekran prvenstveno služi hitnim operativnim problemima istog dana ili neposredno pred smenu.

## 9. Univerzalni tok rešavanja problema

Ne praviti poseban hardkodovan tok za svaki mogući razlog.

Koristi generički lifecycle:

`open → acknowledged → solution proposed → applying → resolved` ili `cancelled`.

Problem sadrži: tip, pogođenu smenu, vozača/vozilo, vreme, grupu, kratak razlog, opis, ozbiljnost, reporter, assignee, reviziju i audit.

Sistem prikazuje samo operativno raspoložive zamene prema pouzdanim podacima sistema. Ne proglašava automatski da je zamena pravno dozvoljena niti preuzima odgovornost za radnopravnu odluku.

## 10. Automatska potvrda naredne smene

Vozač jednim klikom potvrđuje narednu smenu tokom poslednje prethodne aktivne smene.

Obavezna pravila:

- potvrda sutrašnje smene stiže tokom trenutne aktivne smene;
- ako je petak poslednja prethodna smena, smena za ponedeljak potvrđuje se u petak;
- nema posebnog „vikend plana“;
- ako vozač radi subotu ili nedelju i zatim ponedeljak, može dobiti dve jasno odvojene potvrde;
- slanje posle dozvoljenog radnog prozora nije dozvoljeno;
- promena smene posle potvrde poništava potvrdu stare revizije;
- scheduler je tenant-timezone aware, restart-safe i idempotentan;
- outbox ima status, retry politiku, deduplikacioni ključ i monitoring;
- disponent u realnom vremenu vidi potvrđeno, čeka potvrdu, isteklo i neuspešna isporuka.

## 11. Dispečerski operativni centar

Glavni desktop cockpit prati prihvaćenu vizuelnu referencu i sadrži:

- stalni levi sidebar;
- izbor svih dodeljenih grupa u zaglavlju;
- datum i brzo kretanje kroz dane;
- „čeka akciju“ prioritizovanu kolonu;
- centralni dnevni plan;
- raspoložive vozače/vozila;
- zdravlje plana;
- nedavne aktivnosti i auditovane izmene;
- brze akcije bez skrivanja kritičnih koraka u dubokim menijima.

Svaka kartica i dugme mora imati stvarnu funkciju. Prazna stanja moraju objasniti da podataka nema i ponuditi sledeću dozvoljenu akciju. Izbegni ogromne prazne površine, prevelike kartice, nečitljive dropdown liste i horizontalno prelivanje na podržanim desktop rezolucijama.

Problematičan red koristi crveni status i jasnu tekstualnu oznaku, dok njegova primarna akcija koristi zaseban jak amber/narandžasti semantički stil `urgent-action`, sa ikonom i nazivom **„Reši problem“**. Ne koristiti crveno dugme za ovu akciju: crvena je rezervisana za problem, opasnost ili destruktivnu radnju; amber označava hitnu operativnu akciju; zeleno označava potvrđeno rešeno stanje.

## 12. Poruke

Disponent može slati:

- pojedinačnu poruku jednom vozaču;
- grupnu poruku jednoj ili više dozvoljenih grupa;
- unapred definisanu šablonsku poruku sa dopunom;
- kritičnu poruku koja zahteva potvrdu prijema kada je poslovno opravdano.

Primalac u dropdown listi mora biti čitljiv bez hover-a. Lična i grupna poruka su jasno razdvojene. Server ponovo proverava tenant i group scope. Beleže se statusi queued/sent/delivered/read/failed prema mogućnostima providera, uz retry i audit. Ne dozvoli klijentu da menja istoriju poruka ili lažno postavi delivery status.

## 13. Mapa i lokacija vozača

GPS lokacija je dostupna samo za legitimnu operativnu svrhu i samo tokom aktivne smene, uz najviše 30 minuta tehničkog grace perioda nakon kraja smene.

Obavezno:

- aktivna serverska radna sesija;
- server-owned početak/kraj sesije;
- jasna obaveštenost vozača;
- minimizacija učestalosti i preciznosti prema svrsi;
- zabrana lokacije van smene;
- automatsko brisanje ili agregiranje prema odobrenoj retention politici;
- tenant/group scope;
- audit pristupa lokaciji za privilegovane slučajeve;
- bez trajnog praćenja u pozadini kada nije potrebno.

Pravna osnova, radničko saodlučivanje, retention i dozvoljena svrha definišu se po tržištu pre aktiviranja GPS funkcije.

## 14. Prijava, odjava i radna sesija vozača

Početak i kraj smene dolaze iz aktivnog kataloga i konkretne dodele.

- Pred početak smene vozač dobija push podsetnik za prijavu.
- Prijava, aktivna sesija, završetak i 30-minutni grace period vode se na serveru.
- Nakon grace perioda vozač se automatski odjavljuje iz operativne sesije i GPS prestaje.
- Stanice i navigacija nisu potrebne jer vozač koristi Almex ili drugi sistem u vozilu.
- Svi timestamp-ovi čuvaju se pouzdano i prikazuju prema tenant vremenskoj zoni.

## 15. Mobilni PWA vozača i kontrolisani offline rad

Vozački panel prikazuje samo najvažnije:

- trenutnu smenu, početak, kraj, grupu i vozilo;
- sledeću smenu i potvrdu;
- prijavu/odjavu;
- poruke;
- brze prijave kašnjenja, kvara, popunjenosti ili drugog definisanog problema;
- SOS tok sa zaštitom od slučajnog aktiviranja;
- pronađene predmete;
- jasan status mreže i sinhronizacije.

SOS se prikazuje samo jednom: kao stalna centralna stavka donje navigacije na autentifikovanim vozačkim ekranima. Ne prikazivati drugi SOS u gornjem desnom uglu. Donja navigacija je: **Plan · Smene · SOS · Prijavi · Poruke**. Odmor, profil, pronađeni predmeti i podešavanja dostupni su kroz profil, kontekstualni meni ili odgovarajuće sekundarne ekrane.

SOS zahteva press-and-hold ili kontrolisanu potvrdu prevlačenjem, daje neposrednu povratnu informaciju i sprečava duplo slanje. Ne sme biti toliko komplikovan da uspori stvaran hitan slučaj. Interfejs jasno upozorava da se aplikacijom ne rukuje tokom vožnje.

Offline pravila:

- dozvoli čitanje poslednje bezbedno keširane trenutne/sledeće smene i ranije preuzetih poruka;
- lokalno queued prijave dobijaju idempotency key, originalno vreme i status „čeka slanje“;
- kritični upisi i potvrde nisu prikazani kao završeni dok ih server ne potvrdi;
- konflikt ili zastarela revizija ne smeju biti tiho prepisani;
- osetljivi keš je minimalan, vremenski ograničen i očišćen pri odjavi/deaktivaciji;
- service worker ne sme keširati tajne, privatne API odgovore kao javne resurse ili zastareli app shell bez kontrole verzije.

## 16. Pronađeni predmeti

Vozač može kreirati zapis sa:

- kategorijom;
- opisom;
- autobusom;
- mestom i vremenom pronalaska;
- opcionom fotografijom;
- statusom.

Statusi najmanje:

- vraćeno vlasniku;
- ostaje u autobusu;
- nalazi se u depou.

Fotografija se validira po tipu, veličini i sigurnosti, čuva tenant-scoped i prikazuje samo ovlašćenim ulogama. EXIF i nepotrebni metapodaci uklanjaju se kada je moguće. Promena statusa je auditovana.

## 17. Company Admin panel

Company Admin mora imati funkcionalne celine:

- pregled firme i licence;
- brending firme;
- grupe/linije;
- tim disponenata i dodela grupa;
- vozači i njihovi puni administrativni podaci u dozvoljenom obimu;
- autobusi;
- zvanični katalozi smena po grupi;
- bezbedan import/preview/activate/rollback;
- tenant podešavanja, vremenska zona, jezici i login profil;
- audit aktivnosti dostupnih ovoj ulozi.

„Uredi vozače“, „Uredi autobuse“ i svako drugo vidljivo dugme mora voditi do stvarne, autorizovane funkcije sa validacijom i povratnom informacijom.

## 18. Super Admin panel

Super Admin upravlja:

- kreiranjem, aktivacijom, suspenzijom i gašenjem firme;
- licencama i planovima proizvoda bez razvoja računovodstva;
- Company Admin nalozima;
- platformskim health statusom, verzijama i auditom;
- bezbednim tenant purge/export tokom kontrolisanog lifecycle-a;
- support pristupom samo kroz vremenski ograničen i auditovan tok;
- globalnim feature flagovima i jurisdiction profilima.

Super Admin ne dobija neograničen tihi pristup ličnim podacima samo zato što je platform administrator. Primeni least privilege i break-glass principe.

## 19. Brending i stalni BusCommand identitet

- Mali plavi BusCommand znak ostaje stalno vidljiv u uglu svih aplikacionih površina.
- Tenant može promeniti naziv/wordmark, sekundarni logo i dozvoljene boje.
- Tenant brending ne sme ukloniti BusCommand znak, pokvariti kontrast ili prikriti sigurnosne statuse.
- Favicon i PWA ikone koriste odobreni BusCommand znak, osim jasno dokumentovanih tenant varijanti koje i dalje čuvaju platformski identitet.

## 20. Vizuelni sistem i pristupačnost

Prihvaćene slike su obavezna vizuelna referenca. Zadržati moderni tamno-teget SaaS identitet, plave akcente, jasne statuse i gustinu prikladnu operativnom centru.

Minimalno:

- WCAG 2.2 AA kao cilj za relevantne površine;
- dovoljan kontrast u normalnom, hover, focus, disabled i selected stanju;
- čitljive native/custom dropdown opcije bez oslanjanja na hover;
- vidljiv keyboard focus;
- semantičke labele i poruke greške povezane sa poljima;
- status se ne prenosi samo bojom;
- velike touch mete na PWA;
- reduced motion za treperenje/animacije;
- vizuelna hijerarhija koja prvo pokazuje problem i akciju.

Usvojene tri referentne slike određuju raspored i vizuelni smer, ali se primenjuju sledeće obavezne korekcije:

1. Na dispečerskom panelu problematičan red ostaje crveno označen, a **„Reši problem“** koristi upečatljiv amber/narandžasti `urgent-action` stil umesto standardnog plavog dugmeta.
2. Company Admin pregled uvoza koristi jednu sticky aktivacionu traku sa sažetkom i jednom akcijom **„Aktiviraj katalog“**, bez dupliranih dugmadi.
3. Vozački PWA ima samo jedan SOS, u centru donje navigacije; gornji SOS se uklanja, a navigacija glasi **Plan · Smene · SOS · Prijavi · Poruke**.

Ove korekcije imaju prednost nad detaljima prikazanim na starijim referentnim slikama. BusCommand logo, tamno-teget vizuelni identitet, jasna gustina operativnih informacija i pravila tenant brendinga ostaju nepromenjeni.

## 21. Arhitektura i multi-tenant izolacija

Zadrži jednu modularnu aplikaciju dok nema dokazane potrebe za podelom.

- UI moduli ne sadrže privilegovanu poslovnu logiku.
- Server je autoritet za role, tenant/group scope i kritične upise.
- Firestore Rules su druga linija zaštite, ne zamena za serversku autorizaciju.
- Admin SDK upisi prolaze kroz validirane servisne funkcije i audit.
- Kritični tokovi koriste transakcije, idempotency, optimistic concurrency i outbox gde je potrebno.
- Projekcije/mirror podaci su server-owned i mogu se pouzdano obnoviti iz kanonskog izvora.
- Ne uvoditi novu infrastrukturu bez merljivog problema koji postojeći sistem ne može bezbedno rešiti.

## 22. Application security

Koristi OWASP ASVS i NIST SSDF kao smernice, ali ne tvrdi sertifikaciju bez stvarne verifikacije.

Obavezno analizirati i testirati:

- autentifikaciju, MFA za privilegovane uloge i session lifecycle;
- server-side RBAC i object-level authorization;
- cross-tenant IDOR/BOLA;
- validaciju inputa i output encoding;
- upload fajlova;
- rate limiting, brute-force i abuse zaštitu;
- CSRF gde je primenljivo, XSS, injection, SSRF i unsafe redirects;
- CORS/CSP i sigurnosna zaglavlja;
- secret management i rotaciju;
- dependency/SCA i supply-chain rizik;
- audit integritet i zaštitu logova;
- backup, restore i disaster-recovery probe;
- dependency pinning i reproduktivan build.

Ne stavljati tajne u repo, bundle, screenshot, log, test fixture ili odgovor.

## 23. Međunarodna privatnost i jurisdiction profiles

Ne postoji jedna oznaka „globalno usklađeno“. Implementiraj zajedničku privacy/security osnovu, a zatim odvojen, verzionisan pravni profil za svako tržište na kome se proizvod stvarno pušta.

### 23.1 Zajednička tehnička osnova

- privacy by design/default;
- data minimization i purpose limitation;
- klasifikacija podataka i registar obrade;
- controller/processor/subprocessor odgovornosti;
- tenant-configurable retention u granicama odobrenog pravnog profila;
- access, correction, export, deletion/restriction workflows;
- legal hold odvojen od običnog retention-a;
- breach detection, evidence preservation i notification workflow;
- enkripcija u tranzitu i mirovanju prema mogućnostima platforme;
- data residency i cross-border transfer evidencija;
- DPA/subprocessor dokumentacija;
- DPIA/PIA tehnička dokumentacija za GPS, monitoring i druge rizične obrade;
- zabrana secondary use-a i profilisanja bez nove svrhe i pravne procene.

### 23.2 Obavezni release gate po tržištu

Pre uključivanja novog tržišta dokumentuj:

1. primenljive zakone i regulatora iz zvaničnih aktuelnih izvora;
2. controller/processor uloge;
3. svaku svrhu i pravni osnov;
4. kategorije i tokove podataka;
5. retention i brisanje;
6. prava lica i rokove;
7. breach obaveze;
8. međunarodne transfere i potrebne mehanizme;
9. employee monitoring, radničko saodlučivanje i obaveštavanje;
10. data localization ili sektorske zahteve;
11. potrebne ugovore, politike, DPIA/PIA i odobrenja;
12. tehničke feature flagove koji se ne smeju aktivirati pre odobrenja.

Kao početne pravne porodice razmotriti, ali uvek ponovo proveriti aktuelne zvanične izvore: EU/EEA GDPR i lokalno radno pravo; Austriju uključujući ArbVG i AZG samo u relevantnom obimu; UK GDPR/Data Protection Act; švajcarski FADP; California CCPA/CPRA; brazilski LGPD; kanadski PIPEDA i provincijske propise; australijski Privacy Act/APPs; japanski APPI; kao i druge zakone stvarnog ciljnog tržišta.

Ovaj spisak nije pravna potvrda niti konačna lista.

### 23.3 Posebno za zaposlene, GPS i raspored

- BusCommand ne zaključuje automatski da je raspored pravno dozvoljen.
- Odgovornost za raspored i odmor ostaje ovlašćenim licima kompanije i lokalnom pravnom procesu.
- GPS, prijava/odjava i audit zaposlenih ne aktiviraju se za tržište dok svrha, pravni osnov, transparentnost, retention i radničko saodlučivanje nisu potvrđeni.
- Saglasnost zaposlenog ne pretpostavljaj kao dovoljan ili slobodno dat osnov u radnom odnosu.
- „Pravno spremno“ znači da postoje tehničke kontrole i dokumentacija za pravni pregled, ne da je agent izdao pravno mišljenje.

## 24. Notifikacije, scheduler i pouzdanost

- Push/SMS/email provider koriste adaptere.
- Tajne i provider konfiguracija su izvan klijenta.
- Svaka poruka ima tenant, recipient, purpose, locale, template version, idempotency key i status.
- Scheduler koristi server vreme i tenant timezone.
- Retry ima backoff i maksimalni broj pokušaja.
- Restart ne sme duplirati poruke.
- Failure je vidljiv disponentu ili administratoru kada zahteva akciju.
- Notifikacije van dozvoljenog prozora se ne šalju.

## 25. Firestore Rules, API i audit

- Pravila počinju sa deny-by-default.
- Kritični server-owned resursi ne prihvataju klijentske upise.
- Svaka kolekcija ima dokumentovan read/write matrix.
- Rules testovi pokrivaju dozvoljen i zabranjen pristup za sve uloge, cross-tenant i cross-group pokušaje, lokaciju van sesije i zaštićena polja.
- API validira schema, token, revocation, tenant, role, group i field-level dozvole.
- Audit je append-only za obične uloge; ispravka audita pravi novi zapis.
- Svaka kritična akcija ima correlation ID između API, baze, audit-a i notifikacije.

## 26. Testiranje

Minimalna test matrica:

- unit testovi poslovnih pravila;
- API/integration testovi stvarnih ruta;
- Firestore Emulator Rules testovi;
- multi-tenant negative testovi;
- E2E za četiri uloge;
- i18n coverage i missing-key testovi;
- accessibility smoke/automated provere i ručna tastatura kontrola;
- offline/reconnect testovi vozačkog PWA;
- timezone, DST, petak–ponedeljak i vikend potvrde;
- optimistic concurrency i paralelni disponenti;
- idempotency/retry/restart testovi;
- upload/parser neispravni fajlovi;
- browser test stvarnih dugmadi i dropdown prikaza;
- build i clean-install provera;
- test da produkcioni bundle ne sadrži demo podatke, tajne ili Transit Flow tragove.

Testovi moraju tvrditi ono što zaista proveravaju. Statičko traženje stringa nije zamena za funkcionalan integration test kritičnog toka.

## 27. Redosled implementacije

Potvrđena staza, jedno poglavlje po ciklusu. Status se ažurira posle svakog
zatvorenog poglavlja i uvek pokazuje na izveštaj sa dokazima.

| # | Poglavlje | Status | Dokaz |
| --- | --- | --- | --- |
| 1 | Utvrđivanje stanja i stabilnog checkpoint-a | završeno | `reports/poglavlje-1-state-checkpoint-2026-08-04.md` |
| 2 | Tajne, RBAC, Firestore Rules i tenant izolacija | završeno | `reports/poglavlje-2-secrets-rbac-rules-2026-08-04.md` |
| 3 | Zavisnosti, `npm audit` i runtime dokaz Admin SDK-a | završeno | `reports/poglavlje-3-zavisnosti-i-audit-2026-08-04.md` |
| 4 | Identitet i četiri login lifecycle-a, sesije i istek | završeno | `reports/poglavlje-4-auth-lifecycle-2026-08-04.md` |
| 5 | Dizajn sistem i tokeni (prethodi svakom redizajnu, §33) | — | — |
| 6 | Kanonski model plana i revizije | — | — |
| 7 | Company Admin katalog smena, import/preview/activate/rollback | — | — |
| 8 | Mesečni plan | — | — |
| 9 | Dnevni plan, problem-resolution i dispečerski cockpit | — | — |
| 10 | Confirmations scheduler i outbox | — | — |
| 11 | Poruke | — | — |
| 12 | Driver session, GPS i mapa | — | — |
| 13 | Mobilni PWA i kontrolisani offline rad | — | — |
| 14 | Pronađeni predmeti | — | — |
| 15 | Kompletiranje Super Admin i Company Admin površina | — | — |
| 16 | i18n, pristupačnost i vizuelno usklađivanje | — | — |
| 17 | Performanse i budžeti | — | — |
| 18 | Potpuno integraciono testiranje i uklanjanje testnih podataka | — | — |
| 19 | Jurisdiction release gate za pilot tržište | — | — |
| 20 | Staging deployment i ručni acceptance test | — | — |
| 21 | Kontrolisano spajanje i release | — | — |

Redosled se menja samo ako dokazani blocker ili kritična ranjivost zahteva
prioritet, ili odlukom vlasnika zapisanom u dnevniku odluka (§34).

## 28. Pravila izmene i Git disciplina

- Nikada ne radi direktno na `main` bez izričitog odobrenja.
- Jedno poglavlje ima jasnu granu i ograničen diff.
- Ne uključuj nepovezane izmene.
- Ne briši korisnički rad.
- Pre commita pregledaj diff i tajne.
- Commit poruke opisuju stvarnu promenu.
- Draft PR sadrži cilj, rizike, testove, poznata ograničenja i rollback.
- Ne spajaj draft dok release gate nije ispunjen.
- Render/Firebase/produkcija se ne menjaju dok lokalna/CI i browser provera nisu završene i vlasnik nije odobrio deployment.

## 29. Izveštaj posle svakog poglavlja

Izveštaj mora sadržati:

1. cilj poglavlja;
2. početno stanje;
3. pronađene probleme i njihov rizik;
4. izmenjene fajlove i ponašanje;
5. bezbednosni/privacy uticaj;
6. tačne test komande, exit code i rezultat;
7. šta nije testirano i zašto;
8. poznata ograničenja;
9. rollback/checkpoint;
10. ocenu napretka 1–10 sa obrazloženjem;
11. jedan preporučen sledeći korak.

Ne koristiti „100%“, „potpuno bezbedno“, „pravno usklađeno“ ili „production ready“ bez precizno definisanog i dokazano položenog kriterijuma.

## 30. Završni artefakti

Pre release-a moraju postojati:

- arhitekturni pregled i model podataka;
- RBAC/field/tenant matrica;
- API i error-code dokumentacija;
- Firestore Rules matrica i test izveštaj;
- i18n coverage izveštaj;
- threat model i security checklist;
- privacy data-flow mapa, retention matrica i subprocessor lista;
- jurisdiction profil pilot tržišta i lista potrebnih pravnih odobrenja;
- DPIA/PIA tehnička pre-procena za GPS/employee monitoring;
- backup/restore i incident-response procedura;
- deployment i rollback runbook;
- QA izveštaj sa dokazima;
- test-data cleanup izveštaj;
- release notes i poznata ograničenja;
- registar interaktivnih elemenata sa stanjem svakog elementa (§32);
- specifikacija dizajn sistema i lista odstupanja (§33);
- dnevnik odluka sa svim otvorenim i zatvorenim poslovnim pitanjima (§34);
- tabela merljivih ciljeva kvaliteta sa poslednjim izmerenim vrednostima (§35).

## 31. Release gate i definicija završenog

Poglavlje je završeno samo kada su ispunjeni i opisni i merljivi uslovi. Merljivi
prag je u §35 i navodi se sa izmerenom vrednošću, ne sa tvrdnjom.

Opisni uslovi:

- funkcija radi kroz ceo tok, ne samo vizuelno;
- autorizacija je serverska i testirana;
- Firestore Rules ne otvaraju širi pristup;
- audit je tačan;
- greške i retry tok rade;
- SR/DE/EN su kompletni;
- relevantan UI odgovara prihvaćenom dizajnu;
- ciljani i kompletni testovi prolaze;
- nema placeholder-a, demo podataka, stranih tragova ili tajni;
- dokumentacija je ažurirana;
- poznati rizik nije skriven.

Release kandidat je spreman za staging samo kada:

- sva četiri role flow-a prođu E2E;
- clean-install/build i dvostruki kompletni QA prolaze;
- testni tenant može kontrolisano da se kreira i ukloni;
- backup/rollback je proveren;
- pilot jurisdiction profil je odobren za uključene funkcije;
- vlasnik proizvoda odobri deployment.

Produkcioni release je dozvoljen tek posle staging browser acceptance testa, uklanjanja sintetičkih podataka i izričitog odobrenja.

## 32. Registar interaktivnih elemenata

Tvrdnja „svako dugme radi“ nije proverljiva bez spiska svih dugmadi. Zato je
registar obavezan artefakt i jedini izvor istine za obim UI provere.

Registar se vodi u `reports/qa-interaction-ledger-*.md` i sadrži, po ulozi i
površini, svaki interaktivan element: dugme, link, polje, dropdown, tab, filter,
sortiranje, paginaciju, modal, potvrdu, upload, kontekstualni meni i masovnu
akciju.

Svaki element mora završiti u tačno jednom od tri stanja:

1. **Funkcionalno** — postoji handler, serverski ugovor kada je potreban, i
   automatski test koji izvršava stvarnu akciju. Statička provera izvornog koda
   ne kvalifikuje element kao funkcionalan.
2. **Svesno statično** — element je informativan ili dekorativan, i to je
   zapisano sa razlogom.
3. **Uklonjeno** — element koji ne radi i nema opravdanje se briše, ne ostavlja.

Zabranjeno je stanje „postoji, izgleda aktivno, ne radi“. Svako poglavlje
ažurira registar za svoju površinu i navodi razliku u odnosu na prethodno
stanje: koliko elemenata je prešlo iz statičnog u funkcionalno, koliko je
uklonjeno i koliko ostaje nepokriveno.

## 33. Dizajn sistem pre redizajna

Redizajn pojedinačnih stranica pre nego što postoji dizajn sistem znači da se
ista stranica prefarbava više puta i da nekonzistentnost raste. Zato poglavlje
dizajn sistema prethodi svakom vizuelnom poglavlju.

Dizajn sistem definiše i kodifikuje kao tokene i komponente:

- paletu, uključujući semantiku statusa: crveno za problem i destruktivno, amber
  `urgent-action` za hitnu operativnu akciju, zeleno za potvrđeno rešeno,
  neutralno za informaciju;
- tipografsku skalu, težine i visine linija;
- skalu razmaka, radijusa, senki i granica;
- gustinu prikaza za operativni centar i za mobilni PWA odvojeno;
- komponente: dugme u svim variantama i stanjima, polje, select, tabela, kartica,
  modal, toast, badge, tab, prazno stanje, skeleton, stanje greške;
- stanja svake komponente: normalno, hover, focus, active, selected, disabled,
  read-only, loading, error;
- prelome za podržane rezolucije.

Posle usvajanja, stranice se usklađuju sa sistemom, a svako odstupanje mora biti
zapisano sa razlogom. Novi ad-hoc stilovi u pojedinačnim stranicama nisu
dozvoljeni kada u sistemu postoji odgovarajuća komponenta.

## 34. Dnevnik odluka

Nepotvrđena pretpostavka koja se jednom ugradi u kod kasnije izgleda kao
činjenica. Dnevnik odluka to sprečava.

Vodi se u `docs/decisions.md` i za svaku stavku sadrži: redni broj, datum,
pitanje, zašto blokira ili utiče na implementaciju, ponuđene opcije sa
posledicama, odluku vlasnika, datum odluke i mesto u kodu na koje se odnosi.

Pravila:

- poslovno pravilo koje nije u ovom dnevniku ne sme se izmišljati u kodu;
- dok odluka ne stigne, implementiraj najkonzervativniju varijantu koja ne
  proizvodi netačan podatak, i jasno je označi kao privremenu;
- odluka se menja samo novim unosom, stari unos se ne prepisuje;
- svaki izveštaj poglavlja navodi koje je unose otvorio i zatvorio.

## 35. Merljivi ciljevi kvaliteta

Cilj je preciznost preko 90 odsto, izražena brojevima koji se mere na kraju
svakog poglavlja i navode u izveštaju sa stvarnom vrednošću.

| Cilj | Prag | Kako se meri |
| --- | --- | --- |
| Mrtva dugmad | 0 | Registar (§32): nijedan element u stanju „ne radi“ |
| Pokrivenost interaktivnih elemenata | ≥ 90% funkcionalno | Registar, po ulozi i površini |
| Kritični tokovi po ulozi | 100% pokriveno E2E ili HTTP testom | Test matrica §26 |
| Otvoreni Critical i High nalazi | 0 na checkpointu | Izveštaj poglavlja |
| Serverska autorizacija | 100% zaštićenih ruta ima negativan test | HTTP testovi |
| Firestore Rules | svako pravilo ima i pozitivan i negativan test | Emulator testovi |
| Mutaciona provera bezbednosti | svaka nova zaštita pada kad se vrati staro stanje | Zapisana mutacija u izveštaju |
| i18n | 0 nedostajućih ključeva na SR/DE/EN | i18n test |
| Pristupačnost | 0 ozbiljnih axe prekršaja, kompletan tok tastaturom | Automatska provera i ručni prolaz |
| Produkcione zavisnosti | 0 poznatih ranjivosti | `npm audit --omit=dev` |
| Gate | dva čista kompletna prolaza nad istim stablom | Tabela komandi u izveštaju |

Ako neki prag nije dostignut, to se navodi kao broj i kao rizik, a ne
preformuliše u opisnu ocenu.

## 36. Staging okruženje i granica tvrdnji

Emulator dokazuje logiku, ne produkciju. Zato važi stroga granica u jeziku
izveštaja:

- što je dokazano nad emulatorom, opisuje se kao dokazano nad emulatorom;
- ponašanje pravila, revokacije tokena, providera i performansi u produkciji ne
  tvrdi se dok nije izmereno na staging okruženju;
- staging koristi zaseban Firebase projekat, sopstvene kredencijale i sintetičke
  podatke, nikada produkcione lične podatke;
- deploy pravila na staging je odvojena, izričito odobrena radnja;
- pre produkcije obavezan je ručni acceptance prolaz kroz sve četiri uloge.

Za uključivanje staginga potrebni su: ID projekta, servisni nalog sa ograničenim
pravima, Web konfiguracija klijenta i odobrenje za deploy pravila. Dok ti podaci
ne postoje, rad se nastavlja nad emulatorom, a svako poglavlje navodi šta zbog
toga ostaje nepotvrđeno.

## Završni cilj

Isporuči BusCommand kao brzu, pouzdanu, auditovanu, pristupačnu i privacy-by-design operativnu celinu. Disponent mora rešavati probleme u nekoliko jasnih koraka, dok Company Admin, Super Admin i vozač dobijaju potpuno funkcionalne i strogo ograničene alate.

Sistem mora biti tehnički pripremljen za međunarodna tržišta kroz modularne jurisdiction profile, ali nijedno tržište ne proglašavaj pravno usklađenim bez aktuelne lokalne pravne, DPO i radnopravne potvrde.

# KRAJ MASTER PROMPTA

---

## Zvanične polazne reference za proveru, ne za automatsku pravnu potvrdu

- EU GDPR, EUR-Lex: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Austrijski RIS: https://www.ris.bka.gv.at/
- UK ICO: https://ico.org.uk/
- Švajcarski Fedlex/FDPIC: https://www.fedlex.admin.ch/ i https://www.edoeb.admin.ch/
- California Privacy Protection Agency: https://cppa.ca.gov/
- Brazil LGPD, Planalto: https://www.planalto.gov.br/
- Canada Justice Laws / PIPEDA: https://laws-lois.justice.gc.ca/
- Australia OAIC: https://www.oaic.gov.au/
- Japan PPC: https://www.ppc.go.jp/en/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- NIST SSDF SP 800-218: https://csrc.nist.gov/publications/detail/sp/800-218/final
- WCAG 2.2: https://www.w3.org/TR/WCAG22/

Pre svake tržišne odluke proveriti trenutno važeću verziju propisa u zvaničnom izvoru.

# BusCommand — master prompt za nastavak razvoja, proveru i završetak aplikacije

Ovaj prompt je samostalan. Može se dati drugom AI razvojnom agentu ili članu tima zajedno sa:

- najnovijim BusCommand ZIP/checkpoint fajlom ili pristupom radnoj grani;
- tri referentne slike: dispečerski panel, Company Admin panel i mobilni panel vozača;
- postojećom tehničkom dokumentacijom i dostupnim konfiguracionim primerima bez tajni.

Referentne slike određuju vizuelni smer, ali svi podaci prikazani na njima su ilustrativni i ne smeju postati produkcioni ili demo podaci.

---

## POČETAK MASTER PROMPTA

# Potpuna analiza, bezbedan nastavak razvoja, redizajn, funkcionalna dorada i testiranje BusCommand aplikacije

Radi kao kombinacija:

- senior full-stack inženjera;
- softverskog arhitekte;
- UI/UX i product dizajnera za dispečerske operativne sisteme;
- QA automation inženjera;
- application-security i privacy-by-design inženjera;
- stručnjaka za multi-tenant SaaS i sisteme upravljanja autobuskim voznim planovima;
- tehničkog saradnika za GDPR i austrijske radnopravne zahteve, uz obaveznu napomenu da konačnu pravnu potvrdu daju kvalifikovani pravnik, DPO i, gde je potrebno, Betriebsrat.

Tvoj zadatak nije samo da napišeš izveštaj. Duboko analiziraj, popravi, unapredi, implementiraj i stvarno testiraj BusCommand aplikaciju, njene stranice, module i povezane tokove.

Ne staj nakon prvog pronađenog problema i ne pregledaj površno samo glavne komponente. Prati kompletan tok svake funkcije:

`UI → validacija → autentifikacija/autorizacija → API → poslovna logika → transakcija/baza → audit → notifikacija → osvežavanje interfejsa`

Ne izmišljaj poslovna pravila, korisničke uloge, dozvole, podatke, pravne zaključke, rezultate testova niti očekivano ponašanje sistema.

Ako poslovno pravilo, dozvola, pravni zahtev ili očekivano ponašanje nije jasno definisano ili se ne može potvrditi kroz ovaj prompt, kod, dokumentaciju i pouzdane izvore:

- ne nagađaj;
- ne menjaj osetljivu logiku samostalno;
- dokumentuj nalaz, rizik i deo sistema na koji utiče;
- predloži najviše tri konkretna rešenja sa jasnim posledicama;
- postavi kratko pitanje samo ako odgovor zaista blokira bezbedan nastavak.

## 0. Glavni cilj proizvoda

BusCommand je operativna platforma za što brži, jednostavniji i pouzdaniji rad disponenta/dispečera u autobuskoj firmi.

Najvažniji korisnik je disponent. Njegov ekran mora u najviše tri sekunde da odgovori:

1. Šta trenutno nije u redu?
2. Kada problem utiče na plan?
3. Ko ili šta nedostaje?
4. Koje je najbrže bezbedno rešenje?
5. Da li je rešenje uspešno primenjeno i potvrđeno?

Sve četiri uloge moraju biti potpuno i kvalitetno završene za svoju odgovornost:

- Super Admin dobija maksimalnu legitimnu kontrolu platforme;
- Company Admin dobija sve funkcije potrebne za potpunu kontrolu sopstvene firme;
- disponent dobija najjači i najbrži operativni cockpit, kao glavno oružje BusCommand-a;
- vozač dobija najjednostavniji, najjasniji i najkorisniji mobilni panel.

Prioritet disponenta ne sme biti izgovor da bilo koja druga uloga ostane placeholder, nepotpuna ili nebezbedna.

Prvo se završava jedna pouzdana aplikacija. Ne deli sistem na mikroservise i posebne aplikacije, ne povećavaj obim i ne uvodi novu infrastrukturu bez dokazane potrebe.

## 1. Nepromenljive odluke projekta

Sledeće odluke su zaključane i ne menjaju se bez izričite poslovne odluke vlasnika proizvoda.

### 1.1 Uređaji

- Vozač koristi mobilni PWA.
- Disponent, Company Admin i platform administrator koriste samo desktop/laptop interfejs.
- Desktop funkcije ne moraju biti optimizovane za precizno operativno upravljanje sa telefona.
- Kritične akcije moraju biti potpuno upotrebljive tastaturom i mišem.

### 1.2 Jezici

Aplikacija mora potpuno podržavati:

- srpski;
- nemački;
- engleski.

Nijedan korisnički tekst ne sme biti hardkodovan u produkcionim komponentama. Koristi centralizovane prevodne ključeve. Svaki ključ mora postojati na sva tri jezika, uz prirodan prevod i bez mašinskih ostataka, mešanja jezika ili prikaza sirovog ključa.

### 1.3 Čist projekat

Produkcioni projekat mora biti potpuno čist od:

- demo korisnika, vozila, grupa, planova i poruka;
- Transit Flow naziva, podataka, vizuelnih tragova ili drugih stranih projekata;
- ugrađenih test naloga i javnih listi korisnika;
- zajedničkih inicijalnih kodova kao što su `123456`;
- test lozinki, API ključeva, Firebase tajni ili Render/GitHub podataka;
- primera službenog plana koji je trajno ubačen u kod ili produkcioni bundle;
- placeholder funkcija koje izgledaju aktivno, a ne rade.

Testiranje se obavlja novim sintetičkim nalozima kreiranim posebno za kontrolisani test. Testni podaci se ne ugrađuju u produkcioni kod i posle testa moraju moći kontrolisano da se uklone.

### 1.4 Stroga granica proizvoda

BusCommand je isključivo operativna aplikacija za disponente, sa nužnim Company Admin funkcijama i jednostavnim vozačkim PWA.

Ne razvijaj module koji nisu neposredno potrebni da disponent:

- napravi i kontroliše plan;
- vidi dostupnost vozača i vozila;
- brzo reši poremećaj;
- komunicira sa vozačima;
- dobije potvrdu smene;
- prati aktivnu smenu u zakonski dozvoljenom obimu;
- zadrži pouzdan audit svake važne promene.

Stanice i navigacija trase nisu potrebne jer ih vozač dobija preko Almex uređaja. Vozila postoje samo koliko je potrebno za raspoloživost, dodelu smeni, brzu zamenu i operativni pregled.

Uvezeni početak i kraj smene služe isključivo za operativni plan, prijavu/odjavu, dostupnost i notifikacije. Ne predstavljaj ih kao zvaničnu evidenciju radnog vremena.

## 2. Obavezan početak rada i zaštita postojećeg napretka

Pre bilo kakve izmene:

1. Utvrdi tačnu lokaciju projekta i pronađi `AGENTS.md`, README, dokumentaciju, checkpoint zapise i vizuelne smernice.
2. Prikaži `git status`, aktivnu granu, poslednjih najmanje deset commit-a i relevantne poslednje izmene.
3. Proveri postoje li nezavršene, necommitovane ili tuđe izmene.
4. Mapiraj strukturu projekta, rute, module, API-je, bazu, testove i deployment konfiguraciju.
5. Pokreni samo bezbedne read-only ili dijagnostičke komande dok ne utvrdiš šta je već završeno.
6. Ne briši, ne resetuj, ne prepisuj i ne ponavljaj raniji posao dok dokazima ne utvrdiš trenutno stanje.
7. Radi u zasebnoj grani, worktree-u ili jasno izdvojenoj radnoj kopiji. Original i poslednji dobar checkpoint moraju ostati netaknuti.
8. Napravi kratak početni izveštaj: šta postoji, šta radi, šta je nepotpuno, šta je rizično i koji je sledeći logičan korak.

Ne tvrdi da poznaješ prethodni rad ako ga nisi pročitao iz dostupnog koda, istorije i dokumentacije.

Ako se približava ograničenje vremena, konteksta ili resursa, stani dovoljno rano da:

- sačuvaš konzistentan checkpoint;
- zabeležiš sve izmenjene fajlove;
- zapišeš izvršene komande i stvarne rezultate;
- navedeš tačan sledeći korak;
- ne ostaviš poluzavršenu migraciju, nesiguran deployment ili neobjašnjenu radnu kopiju.

## 3. Korisničke uloge i granice podataka

Potvrdi u postojećem kodu, pa sprovedi najmanje sledeće uloge.

### 3.1 Platform administrator

Super Admin upravlja platformom i mora imati centralni pregled i maksimalnu legitimnu kontrolu nad:

- kreiranjem, aktiviranjem, suspenzijom i bezbednim zatvaranjem tenant-a/firme;
- platformskim ulogama i drugim Super Admin nalozima;
- statusom svih firmi, grupa i aktivnih korisnika kroz minimalne operativne pokazatelje;
- platformskim feature flag-ovima i tenant mogućnostima;
- globalnim i tenant konfiguracionim podrazumevanim vrednostima;
- integracijama, provider adapterima i statusom njihovog rada, bez prikaza tajni;
- scheduler/job redovima, neuspelim poslovima, retry akcijama i statusom notifikacija;
- sistemskim zdravljem, incidentima, verzijama i release informacijama;
- centralnim auditom i bezbednosnim upozorenjima;
- politikama čuvanja, izvoza i kontrolisanog brisanja podataka;
- lokalizacijama i nepromenljivim BusCommand identitetom;
- kontrolisanim backup, restore i recovery operacijama.

Super Admin panel mora nuditi filtere, pretragu, statusne preglede, detalje greške, bezbedne administrativne akcije i jasne potvrde destruktivnih operacija.

„Maksimalna kontrola“ ne znači čitanje lozinki, ličnih login kodova, aktivacionih kodova ili nekontrolisan uvid u sve lične i lokacijske podatke. Svaki opravdani support pristup tenant-u mora:

- imati konkretan razlog;
- biti vremenski ograničen;
- imati najmanji potreban obim;
- prikazati jasno da je support režim aktivan;
- biti potpuno auditovan;
- nikada ne omogućiti prikaz postojećih tajni za prijavu.

### 3.2 Company Admin

Company Admin ima punu administrativnu kontrolu unutar svoje firme i može:

- uređivati firmu i dozvoljeni brending;
- kreirati i uređivati grupe/linije;
- kreirati i upravljati nalozima dispečera;
- jedini kreirati novog vozača i unositi njegove pune potrebne podatke;
- uređivati, deaktivirati, arhivirati i kontrolisano ponovo aktivirati vozača;
- pokrenuti novu bezbednu aktivaciju ili oporavak pristupa bez uvida u postojeći tajni kod;
- raditi validiran grupni unos kada je potreban, sa pregledom pre potvrde;
- upravljati vozilima u operativnom obimu;
- uvoziti zvanični plan smena posebno za svaku grupu;
- pregledati rezultat parsiranja pre potvrde uvoza;
- upravljati verzijama kataloga smena i datumom njihovog važenja;
- podešavati dozvoljene tenant opcije, vremensku zonu, jezik i pravila notifikacija;
- pregledati tenant audit, neuspele pozive/integracije i operativne greške za koje ima dozvolu;
- upravljati šablonima poruka i dozvoljenim quick-report opcijama;
- izvoziti samo dozvoljene administrativne podatke uz audit i zaštitu ličnih podataka;
- upravljati pravilima firme koja su predviđena kao tenant konfiguracija.

Company Admin ne sme zavisiti od Super Admina za normalno svakodnevno upravljanje sopstvenom firmom. Ipak, ne sme pristupati drugom tenant-u niti videti postojeće lozinke, login kodove i druge tajne korisnika.

### 3.3 Disponent/dispečer

Disponent je centralni operativni korisnik i njegov panel je glavno oružje BusCommand-a. Disponent:

- ima sopstvene podatke za prijavu;
- u zaglavlju vidi sve grupe firme kojima sme pristupiti;
- može brzo menjati aktivnu grupu uz audit pristupa i svake promene;
- vidi operativne podatke potrebne za rad;
- za vozača vidi ime, grupu, telefon i e-mail;
- nikada ne vidi lični login kod vozača, jednokratni aktivacioni kod, firmin identifikator koji služi prijavi, lozinke, hash vrednosti niti nepotrebne osetljive personalne brojeve;
- može uređivati operativni plan, rešavati probleme, dodeljivati zamene, upravljati porukama i pratiti aktivnu smenu;
- ne kreira novi identitet vozača i ne menja njegove tajne za prijavu.

### 3.4 Vozač

Vozački panel mora biti maksimalno jednostavan, brz i koristan u realnoj smeni. Vozač vidi samo svoje:

- trenutne i naredne smene;
- zahteve za potvrdu;
- poruke;
- prijavu i odjavu sa smene;
- dozvoljene brze prijave problema;
- SOS funkciju;
- pronađene predmete koje je prijavio ili za koje mu je dozvoljen uvid;
- status relevantan za sopstveni rad.

Vozač ne sme pristupiti drugim vozačima, drugim tenantima, celom mesečnom planu ili administrativnim podacima promenom URL-a ili direktnim API pozivom.

Svaki osnovni vozački zadatak treba, gde je realno, završiti jednim jasnim dodirom. Panel mora jasno raditi na slabijem telefonu, sporijoj mreži i u uslovima dnevnog svetla, bez sitnih meta, komplikovanih tabela i dugih formi.

### 3.5 Obavezna RBAC matrica

Napravi i održavaj eksplicitnu matricu za sve četiri uloge:

`uloga × resurs × akcija × polja × tenant scope × audit zahtev`

Autorizacija mora postojati na serveru i u pravilima baze. Skrivanje dugmeta u interfejsu nije bezbednosna kontrola.

## 4. Identitet, prijava i aktivacija vozača

Staff portal i driver portal moraju imati jasno odvojene tokove.

Kada Company Admin kreira vozača:

1. Sistem kreira nalog bez javnog prikaza tajnih podataka.
2. Sistem generiše kriptografski bezbedan, jedinstven jednokratni aktivacioni kod od šest cifara.
3. Kod važi 24 sata, čuva se bezbedno i ne zapisuje se u obične logove.
4. Vozač dobija SMS sa linkom ka driver portalu i jednokratnim kodom.
5. Vozač unosi svoj firmin ID i jednokratni kod.
6. Nakon uspešne identifikacije postavlja svoj pravi lični kod firme od najmanje pet cifara.
7. Jednokratni kod se odmah i nepovratno označava iskorišćenim i nikada se više ne može koristiti.
8. Aktivne sesije, pokušaji, rate limit, zaključavanje i oporavak naloga moraju imati bezbedno i auditovano ponašanje.

Nikada ne koristi zajednički produkcioni kod `123456`. Ne šalji postojeći lični kod vozača SMS-om. Ne čuvaj login kod u čitljivom obliku. Razdvoji javni profil vozača od privatnih autentifikacionih zapisa.

SMS implementiraj kroz provider adapter, tako da se konkretan provajder može izabrati pri pilot-projektu. Ako provajder još nije izabran, pripremi interfejs, retry/idempotency ponašanje, statuse isporuke i bezbedan development stub koji nije aktivan u produkciji.

PWA instalacija mora biti jasna, ali instaliranje na početni ekran ne sme biti uslov da vozač prvi put završi bezbednu prijavu.

## 5. Jedan kanonski model plana

Dnevni i mesečni plan ne smeju biti dve nepovezane kopije istih podataka.

Projektuj jedan kanonski model koji najmanje razdvaja:

- tenant/firmu;
- grupu/liniju;
- verzionisani katalog zvaničnih smena;
- šablon smene;
- datum;
- dodelu vozača;
- dodelu vozila;
- operativni status;
- potvrdu vozača;
- problem/incident;
- rešenje;
- audit događaj.

Dnevni i mesečni plan su različiti prikazi i načini uređivanja istog kanonskog stanja. Svaka promena mora:

- validirati prava, tenant i verziju zapisa;
- izbeći konflikt sa izmenom drugog disponenta;
- biti primenjena atomski/transakciono;
- odmah osvežiti oba prikaza;
- ažurirati relevantne statuse;
- invalidirati zastarelu potvrdu;
- poslati novu potvrdu kada je potrebno;
- zapisati ko je, kada, odakle i šta promenio;
- omogućiti kontrolisano poništavanje samo kada je bezbedno.

Ne dozvoli da dva disponenta tiho prepišu jedan drugom plan. Koristi optimistic concurrency, verziju zapisa ili drugi dokazano bezbedan mehanizam.

## 6. Uvoz zvaničnog plana smena

Company Admin uvozi zvanični PDF plan zasebno za svaku grupu.

Iz PDF-a su potrebni samo:

- grupa/linija;
- oznaka smene;
- početak radnog vremena;
- kraj radnog vremena;
- režim/dan važenja, na primer radni dan, subota, nedelja/praznik;
- verzija plana;
- datum od kada plan važi.

Stanice, trasa i podaci koje vozač već dobija preko Almex uređaja nisu potrebni.

Obavezni tok:

1. izbor grupe;
2. upload PDF-a;
3. bezbedna validacija fajla;
4. parsiranje u staging zonu;
5. pregled pronađenih smena i upozorenja;
6. detekcija duplikata, nelogičnih vremena, smene preko ponoći i konflikta verzije;
7. eksplicitna potvrda Company Admina;
8. atomsko aktiviranje nove verzije;
9. čuvanje porekla i audita;
10. bezbedan rollback na prethodnu verziju ako aktivacija ne uspe.

Nikada ne pretpostavljaj da svaki PDF ima isti raspored. Parser mora prijaviti nesiguran rezultat i tražiti pregled umesto da tiho napravi pogrešne smene. Referentni PDF služi samo za razumevanje formata i ne sme biti ugrađen u aplikaciju.

Obradi:

- smene koje završavaju posle ponoći;
- vremensku zonu tenant-a;
- letnje/zimsko računanje vremena;
- različite režime rada;
- novu verziju koja važi od budućeg datuma;
- postojeće mesečne dodele koje koriste prethodnu verziju.

## 7. Mesečni i dnevni plan

Disponent u mesečnom planu dodeljuje vozače zvaničnim šablonima smena. Svako opravdano operativno polje mora imati jasan edit tok.

Podrži najmanje:

- dodelu i uklanjanje vozača;
- zamenu dve smene;
- promenu smene pre podne/popodne;
- zamenu vozača;
- promenu vozila;
- označavanje vozača ili vozila kao neraspoloživog;
- pregled konflikta i nepotpune dodele;
- istoriju i razlog promene;
- kontrolisani undo poslednje promene kada nema kasnijih zavisnih događaja.

Ako Marko više ne radi dodeljenu smenu, razlog može biti bolovanje, odmor, slobodan dan, kašnjenje ili drugi problem. Razlog je audit oznaka, ali ne sme komplikovati glavni tok. Najvažnije je brzo i bezbedno rešavanje nepokrivene smene.

## 8. Univerzalni tok rešavanja problema

Implementiraj generički problem-resolution tok:

1. Disponent jednim jasnim potezom označava vozača, vozilo ili dodelu kao problematičnu.
2. Plan odmah prikazuje nerešen operativni problem, uz status koji se ne oslanja samo na boju.
3. Sistem prikazuje šta je pogođeno i od kada.
4. Sistem nudi samo stvarno raspoložive i dozvoljene zamene.
5. Disponent dodeljuje zamenu ili unosi drugo rešenje u nekoliko klikova.
6. Sistem transakciono ažurira plan.
7. Prethodna potvrda pogođenog vozača postaje nevažeća.
8. Pogođeni vozač dobija ažuriranje i novi zahtev za potvrdu kada je potreban.
9. Audit zapis sadrži staro stanje, novo stanje, autora i razlog.
10. Plan dobija status „zdrav“ tek kada više nema nerešenog uticaja.

Statusi moraju imati tekst, ikonicu i boju. Ne koristi treperenje, zvuk ili agresivnu animaciju kao podrazumevanu kontrolu. Kritična upozorenja moraju biti primećena, ali pristupačna i proporcionalna.

## 9. Automatska potvrda naredne smene

Vozač jednim klikom potvrđuje narednu smenu, a disponent rezultat vidi odmah.

Zahtev se šalje tokom poslednje prethodne aktivne smene vozača, nikada proizvoljno posle radnog vremena.

Posebno pravilo:

- ako je poslednji radni dan petak, a vozač radi subotu, potvrdu za subotu dobija u petak;
- ako radi nedelju i ponedeljak, u petak dobija dva odvojena i jasno označena zahteva;
- nema generičkog „vikend plana“.

Planer notifikacija mora biti:

- tenant-timezone aware;
- otporan na restart;
- idempotentan;
- bez duplih poruka;
- testiran za petak, vikend, praznike, smene preko ponoći i DST;
- sposoban da ponovo zakaže zahtev nakon promene plana;
- sposoban da prikaže status slanja, prijema i potvrde.

## 10. Dispečerski operativni centar

Referentna slika dispečerskog panela određuje vizuelni cilj.

Desktop raspored:

- stalna leva navigacija;
- zaglavlje sa grupama, datumom, pretragom, upozorenjima i identitetom prijavljenog disponenta;
- leva kolona „Čeka akciju“;
- centralni dnevni plan;
- desna kolona raspoloživih vozača ili kontekstualnih zamena;
- donji audit/nedavne aktivnosti i bezbedan undo;
- jasan globalni status zdravlja plana.

Najvažnije funkcije:

- operativni centar;
- dnevni plan;
- mesečni plan;
- poruke;
- mapa uživo;
- vozila;
- vozači;
- istorija promena.

Optimizuj za:

- nekoliko klikova do rešenja;
- drag-and-drop samo ako ima jednako jasan i pristupačan alternativni tok;
- pretragu i keyboard shortcut-e za česte akcije;
- jasne konflikte i predloge zamene;
- potvrdu kritične promene bez nepotrebnih modalnih koraka;
- real-time osvežavanje bez ručnog reload-a;
- rad više disponentenata bez tihog prepisivanja;
- prazna, loading, offline, stale, error i reconnect stanja.

## 11. Poruke

Disponent može slati:

- pojedinačnu poruku vozaču;
- poruku izabranoj grupi;
- poruku svim trenutno relevantnim/aktivnim vozačima firme;
- hitnu poruku koja se vozaču prikazuje jasno i zahteva potvrdu čitanja.

Svaka poruka mora imati:

- autora;
- tenant i dozvoljeni krug primalaca;
- vreme slanja;
- status isporuke;
- status čitanja/potvrde gde je potrebno;
- audit i istoriju;
- lokalizovan sistemski tekst;
- zaštitu od duplog slanja.

Ne dozvoli curenje poruke u drugi tenant ili pogrešnu grupu. Pre grupnog slanja jasno prikaži kome se poruka šalje.

## 12. Mapa i lokacija vozača

Lokacija vozača sme se obrađivati samo u opravdanom operativnom prozoru aktivne smene.

Dogovoreno funkcionalno ponašanje:

- lokacija počinje tek u vezi sa aktivnom smenom i odgovarajućom prijavom/dozvolom;
- disponent vidi samo vozače čija smena trenutno opravdava prikaz;
- nakon završetka smene postoji najviše konfigurisan grace period, trenutno planiran do 30 minuta;
- zatim se praćenje automatski zaustavlja i vozač se operativno odjavljuje;
- stara lokacija nikada se ne prikazuje kao „uživo“;
- prikaz sadrži vreme poslednjeg podatka, tačnost i status veze;
- pristup mapi i pregled lokacije moraju biti auditovani;
- rok čuvanja istorije mora biti minimalan, eksplicitno odobren i tehnički sproveden.

Pre produkcije GPS funkcije obavezno uradi pravnu procenu neophodnosti i proporcionalnosti, DPIA procenu i proveru zahteva za Betriebsrat. Employee consent ne koristi kao automatsku ili jedinu pravnu osnovu.

## 13. Prijava i odjava sa smene

Na početku operativnog prozora vozač dobija push obaveštenje da se prijavi. Interfejs prikazuje:

- trenutnu smenu;
- vozilo;
- početak i kraj;
- kada je prijava dozvoljena;
- uspeh ili razlog neuspeha;
- jasan status odjave.

Ova funkcija služi operativnoj prisutnosti i kontroli pristupa funkcijama tokom smene. Ne nazivati je zakonskom evidencijom radnog vremena bez posebne pravne i tehničke validacije.

## 14. Panel vozača

Mobilni PWA prati referentnu sliku i mora ostati izrazito jednostavan.

Početni ekran sadrži:

- stalni mali BusCommand plavi znak;
- identitet/tenant brend u dozvoljenom delu;
- današnju smenu;
- sledeću smenu i potvrdu jednim klikom;
- važnu poruku dispečera;
- velike quick-report akcije;
- SOS;
- jednostavnu donju navigaciju.

Quick reports najmanje obuhvataju:

- kašnjenje;
- kvar autobusa;
- autobus pun;
- drugi unapred odobren operativni problem.

Svaka akcija mora:

- biti moguća velikim touch targetom;
- imati jasnu potvrdu;
- sprečiti duplo slanje;
- raditi na sporoj mreži uz transparentan status;
- biti lokalizovana;
- poslati disponentu dovoljno informacija bez nepotrebnog teksta vozača.

SOS mora imati zaštitu od slučajnog aktiviranja, ali ne sme biti zakopan u više koraka. Jasno dokumentuj šta SOS u ovoj verziji radi i kome šalje obaveštenje; ne predstavljaj ga kao zamenu za javni hitni broj.

## 15. Pronađeni predmeti

Vozač može prijaviti pronađeni predmet i dodati fotografiju.

Minimalna polja:

- opis;
- datum/vreme;
- autobus ili relevantna smena;
- fotografija, opciono;
- status.

Dozvoljeni statusi:

- vraćeno vlasniku;
- ostaje u autobusu;
- nalazi se u depou.

Upload mora proveriti pravi tip sadržaja, veličinu, ekstenziju i dozvole; ukloniti EXIF/metapodatke koji nisu potrebni; generisati bezbedno ime; sprečiti izvršavanje fajla; ograničiti pristup tenantom i ulogom; imati jasno pravilo čuvanja i brisanja.

## 16. Super Admin panel

Super Admin koristi desktop panel koji daje snažnu kontrolu bez mešanja sa svakodnevnim dispečerskim radom.

Obavezne oblasti:

- pregled zdravlja platforme;
- firme/tenant-i i njihovi statusi;
- platformski administratori i bezbednost pristupa;
- feature flag-ovi i tenant mogućnosti;
- integracije i provider statusi;
- scheduler, redovi poslova i neuspele isporuke;
- bezbednosna upozorenja i centralni audit;
- backup/restore i recovery status;
- sistemske verzije, release i konfiguracioni status;
- lokalizacije i stalni BusCommand identitet.

Dashboard mora prvo prikazati probleme koji zahtevaju akciju, njihov uticaj i bezbednu sledeću akciju. Masovne i destruktivne radnje zahtevaju tačan pregled obima, ponovnu autentifikaciju kada je opravdano i potpun audit.

Super Admin mora moći da pomogne firmi bez preuzimanja identiteta njenog korisnika. Ako se implementira support access, koristi poseban vremenski ograničen support session, vidljivu oznaku i nepromenljiv audit — nikada deljenje lozinke ili skriveno impersoniranje.

## 17. Company Admin panel

Referentna slika određuje vizuelni smer:

- stalna leva navigacija;
- širok desktop radni prostor;
- čist pregled firme;
- brending;
- grupe/linije;
- tim dispečera;
- vozači;
- planovi smena;
- podešavanja.

Kod uvoza plana prikaži:

- izabranu grupu;
- naziv i status fajla;
- aktivni katalog;
- verziju;
- datum važenja;
- broj pronađenih smena;
- tabelarni preview;
- upozorenja i greške;
- jasno „Potvrdi uvoz“ tek kada je rezultat dovoljno pouzdan.

Company Admin nije glavni operativni cockpit. Ne opterećuj ga dispečerskim funkcijama koje ne pripadaju njegovoj ulozi.

## 18. Stalni BusCommand identitet i tenant brending

Mali plavi BusCommand znak mora zauvek ostati vidljiv u uglu aplikacije i ne može ga ukloniti tenant brending.

Firma kupac može:

- zameniti tekst „BusCommand“ svojim nazivom u predviđenom prostoru;
- dodati svoj logo gde je dozvoljeno;
- birati dozvoljene površinske/brand boje;
- dobiti preview i proveru kontrasta pre čuvanja.

Firma ne može:

- ukloniti stalni BusCommand znak;
- promeniti semantiku statusnih boja;
- učiniti tekst nečitljivim;
- zameniti kritično crveno, upozoravajuće amber, potvrđujuće zeleno i akcijsko plavo bojama koje menjaju značenje;
- ubaciti nebezbedan SVG, skriptu ili udaljeni resurs.

Brending mora biti tenant-scope, validiran, auditovan i imati bezbedne podrazumevane vrednosti.

## 19. Vizuelni sistem

Zadrži identitet sa referentnih slika:

- moderan tamno-teget interfejs;
- prepoznatljiva plava BusCommand akcent boja;
- čist premium SaaS izgled;
- čitljive tabele i statusi;
- umerene ivice, senke i gradijenti;
- semantičko zeleno, amber, crveno i plavo;
- dovoljno visok kontrast;
- kompaktan desktop raspored bez ogromnih praznih kartica.

Ne kopiraj ilustrativna imena, registracije, smene i brojeve sa slika. Slike su vizuelna referenca, ne izvor podataka.

Ne redizajniraj samo bojama. Poboljšaj hijerarhiju, tok akcije, gustinu informacija, čitljivost i brzinu donošenja odluke.

Za svaku glavnu stranicu proveri:

- default;
- empty;
- loading/skeleton;
- error;
- offline/reconnect;
- stale data;
- success;
- warning;
- critical;
- disabled/read-only;
- hover, focus, active i selected;
- duga imena i prevode;
- 100%, 125% i 150% browser zoom.

## 20. Arhitektura i izvor istine

Prvo potvrdi postojeći stack. Ako projekat već koristi Node/Express, Vite, Firebase Auth/Firestore/Storage, Render i GitHub, poštuj tu arhitekturu dok nema dokaza da ona blokira zahtev.

Ne radi tehnološki rewrite radi ličnog ukusa.

Obavezni principi:

- stroga multi-tenant izolacija;
- server-side autorizacija;
- Firestore Security Rules koje sprečavaju direktni bypass;
- osetljive operacije samo kroz pouzdani server;
- razdvojeni javni profil i autentifikacioni podaci;
- transakcije/batch za povezane promene;
- optimistic concurrency za paralelne dispečere;
- idempotency za poruke, aktivaciju, uvoz i scheduler;
- append-only ili dokazano zaštićen audit za kritične akcije;
- token/session revocation;
- rate limiting i zaštita od brute force-a;
- bez tajni i PII u logovima;
- vremenske zone na nivou tenant-a;
- pouzdan job/scheduler sloj;
- push i SMS provider adapteri;
- backup, restore i dokumentovan recovery test;
- observability bez curenja ličnih podataka.

Service worker/PWA ne sme keširati:

- autentifikacione odgovore;
- API odgovore sa ličnim ili operativno osetljivim podacima;
- aktivacione kodove;
- lokacije;
- privatne poruke.

Definiši offline ponašanje eksplicitno. Kritična promena plana ne sme izgledati uspešno dok server nije potvrdio transakciju.

## 21. Bezbednosna analiza

Proveri najmanje:

- autentifikaciju i oporavak naloga;
- RBAC i field-level dozvole;
- IDOR/BOLA;
- horizontalnu i vertikalnu eskalaciju;
- tenant escape;
- Firestore Rules;
- server-side input validation;
- XSS, CSRF i SSRF gde je primenljivo;
- injection;
- open redirect;
- rate limit;
- session fixation i revocation;
- jednokratne kodove;
- upload PDF-a i slika;
- Storage pravila;
- poruke i grupne primaoce;
- eksport i audit;
- log redaction;
- dependency i secret scan;
- sigurnost CI/CD konfiguracije;
- zaštitu produkcionih environment varijabli.

Za svaku kritičnu ili visoku ranjivost:

1. dokumentuj dokaz i uticaj bez izlaganja stvarnih tajni;
2. popravi uz minimalnu promenu;
3. dodaj regresioni test;
4. ponovo testiraj.

## 22. Privatnost, pravo i usklađenost

Polazno tržište/pilot tretiraj kao Austriju, ali ne pretpostavljaj da austrijski zaključci automatski važe za Nemačku, Srbiju ili drugu zemlju. Pri svakoj prodaji uradi poseban jurisdiction review i tenant konfiguraciju.

Koristi samo važeće zvanične izvore i zabeleži datum pristupa. Najmanje proveri:

- GDPR, posebno čl. 5, 6, 13–15, 17–18, 20–22 gde je primenljivo, 25, 28, 30, 32–35 i 88;
- austrijski ArbVG §96 za mere kontrole zaposlenih i moguće odobrenje Betriebsrat-a;
- austrijski AZG §26 ako bi sistem ikada bio predstavljen kao evidencija radnog vremena;
- austrijsku Datenschutzbehörde i važeću DSFA-V za DPIA;
- smernice o obradi podataka zaposlenih i sistematskom praćenju;
- pravila vezana za SMS/push provajdera, hosting, Firebase/Google, Render i druge podobrađivače;
- međunarodne prenose, odgovarajući mehanizam i, gde je potrebno, SCC/TIA.

Napravi:

- mapu tokova ličnih podataka;
- controller/processor/subprocessor matricu;
- svrha × kategorija podataka × lice × pravni osnov matricu;
- ROPA osnovu;
- privacy notice za zaposlene/vozače;
- politiku privatnosti za relevantni portal;
- retention/deletion matricu;
- proceduru prava lica;
- DPIA pre-procenu, posebno za GPS, sistematski nadzor, audit i ponašanje zaposlenih;
- plan odgovora na incident i procenu GDPR prijave u roku od 72 sata kada je primenljivo;
- listu zahteva koje moraju potvrditi pravnik, DPO i Betriebsrat pre pilota.

Ne koristi saglasnost zaposlenog kao automatski ili podrazumevani pravni osnov. Proveri neophodnost, proporcionalnost, transparentnost i manje invazivne alternative za svaku vrstu praćenja.

Primeni data minimization i privacy by default:

- disponent vidi samo podatke potrebne za operativni rad;
- lokacija postoji samo u dozvoljenom vremenu;
- tajni login podaci su odvojeni;
- rokovi čuvanja nisu beskonačni;
- pristupi i kritične promene su auditovani;
- produkcioni logovi ne sadrže kodove, tokene ili nepotrebne lične podatke.

Ne proglašavaj aplikaciju „100% pravno usklađenom“. Navedi šta je tehnički sprovedeno, šta je provereno iz zvaničnog izvora i šta čeka formalno pravno/organizacijsko odobrenje.

## 23. Pristupačnost

Cilj je WCAG 2.2 AA.

Proveri:

- rad tastaturom;
- logičan redosled fokusa;
- vidljiv focus;
- skip link;
- semantičke naslove;
- pravilne labele i opise grešaka;
- ARIA samo gde je potrebna;
- modale i povratak fokusa;
- kontrast teksta, ikonica i statusa;
- status koji se ne oslanja samo na boju;
- reduced motion;
- screen reader objave za real-time promene;
- touch targete na driver PWA;
- zoom/reflow;
- prevode i dužinu nemačkih tekstova.

Drag-and-drop uvek mora imati pristupačnu alternativu.

## 24. Testiranje

Pokreni postojeće testove i dodaj testove za kritične nepokrivene tokove koristeći alate koje projekat već ima.

### 24.1 Obavezne kategorije

- unit;
- integration;
- API;
- E2E;
- Firestore Rules;
- Storage Rules;
- RBAC i field-level access;
- tenant isolation;
- security regression;
- accessibility;
- i18n completeness;
- scheduler/timezone/DST;
- PWA/service worker;
- upload;
- concurrency;
- performance relevantnih velikih planova;
- production build.

### 24.2 Kritični scenariji

Testiraj najmanje:

- Super Admin kreira, suspenduje i ponovo aktivira test tenant bez pristupa tajnim login podacima;
- Super Admin support session je vremenski ograničen, jasno označen i potpuno auditovan;
- Company Admin ne može pristupiti drugoj firmi niti platformskim podešavanjima;
- Company Admin kreira vozača;
- jedinstveni aktivacioni kod važi jednom i ističe;
- pogrešan tenant/ID/kod ne otkriva postojanje naloga;
- disponent ne može pročitati login podatke vozača;
- vozač ne može pročitati tuđe podatke;
- uvoz PDF-a po grupi sa preview-em, greškom i aktivacijom;
- verzionisanje kataloga smena;
- mesečna dodela se vidi u dnevnom planu;
- dnevna promena ažurira mesečni prikaz;
- dva disponenta istovremeno menjaju istu dodelu;
- neraspoloživ vozač → zamena → nova potvrda → zdrav plan;
- zamena smena;
- promena autobusa;
- petak → subota ili nedelja + ponedeljak;
- noćna smena i DST;
- grupna i hitna poruka;
- GPS se uključuje samo u dozvoljenom prozoru i prestaje posle smene/grace perioda;
- stale lokacija nije označena kao live;
- pronađeni predmet sa fotografijom i sva tri statusa;
- offline/spora mreža/dvostruki klik/istek sesije;
- srpski, nemački i engleski bez hardkodovanih ostataka;
- prazan sistem bez demo podataka.

Koristi stabilne `data-testid` ili semantičke selektore za E2E. Ne oslanjaj se na krhke CSS putanje ili prevedeni tekst.

Ne označavaj test kao uspešan ako nije pokrenut. Sačuvaj tačnu komandu, exit code i relevantan rezultat.

## 25. Redosled implementacije

Radi po sledećim poglavljima i ne preskači zavisnosti.

### Poglavlje 1 — Forenzički pregled i specifikacija

- trenutno stanje;
- git i checkpoint;
- mapa sistema;
- gap analiza;
- zaključavanje poslovnih pravila;
- data-flow i pravna pre-procena.

### Poglavlje 2 — Osnova podataka, tenant i dozvole

- kanonski model;
- tenant isolation;
- RBAC;
- profile/auth separation;
- audit;
- transakcije i concurrency.

### Poglavlje 3 — Super Admin i Company Admin osnova

- tenant lifecycle i platform health;
- support access i centralni audit;
- firme i brending;
- grupe;
- tim dispečera;
- vozači;
- vozila;
- uvoz i verzionisanje planova smena.

### Poglavlje 4 — Dispečersko jezgro

- mesečni plan;
- dnevni plan;
- problem-resolution workflow;
- raspoloživi vozači;
- istorija i undo;
- poruke.

### Poglavlje 5 — Vozački PWA

- aktivacija;
- prijava;
- trenutna i sledeća smena;
- potvrde;
- poruke;
- quick reports;
- SOS;
- pronađeni predmeti.

### Poglavlje 6 — Scheduler, push/SMS i lokacija

- potvrde tokom poslednje prethodne smene;
- vikend pravila;
- provider adapteri;
- GPS lifecycle;
- automatska odjava;
- retry, idempotency i observability.

### Poglavlje 7 — Vizuelno, i18n i accessibility usklađivanje

- tri referentna panela;
- BusCommand identitet;
- tenant brending;
- sva stanja;
- tri jezika;
- WCAG 2.2 AA.

### Poglavlje 8 — Potpuna QA, security i legal readiness kontrola

- svi testovi;
- browser pregled;
- rule testovi;
- security audit;
- privacy/legal matrice;
- performance;
- recovery;
- release readiness.

### Poglavlje 9 — Kontrolisani pilot

Ovo poglavlje se ne pokreće bez odobrenja vlasnika proizvoda:

- novi sintetički test tenant;
- novi testni nalozi;
- 100% role-by-role live test;
- popravke;
- lokalna završna browser potvrda;
- tek zatim GitHub, Firebase i Render deployment;
- smoke test, monitoring i rollback provera.

## 26. Pravila izmene koda

- Poštuj postojeću arhitekturu.
- Ne povećavaj obim bez stvarne potrebe.
- Ne uvodi paralelni dizajn sistem.
- Ne menjaj nepovezane fajlove.
- Ne poništavaj tuđe izmene.
- Ne koristi destruktivne git komande.
- Ne briši podatke ili resurse bez tačnog targeta i odobrenja.
- Ne menjaj poslovnu logiku samo da test prođe.
- Ne koristi `any` bez dokumentovanog razloga.
- Ne potiskuj TypeScript, lint ili build grešku.
- Ne prikrivaj problem fallback vrednošću.
- Ne ostavljaj nefunkcionalno dugme.
- Ne ostavljaj TODO kao zamenu za obećanu funkciju.
- Ne prikazuj interne stack trace poruke korisniku.
- Ne upisuj tajne u kod, commit, screenshot, log ili izveštaj.
- Ne radi deployment dok lokalni browser pregled i svi release gate-ovi nisu odobreni.
- Svaka veća promena mora imati razlog, test i mogućnost povratka.

Radi autonomno unutar jasno definisanog obima. Traži potvrdu samo kada je potrebna:

- nova poslovna odluka;
- pravno osetljiva odluka bez jasnog odgovora;
- destruktivna radnja;
- promena arhitekture ili scope-a;
- produkcioni deployment;
- trošak ili izbor spoljnog provajdera;
- radnja koja zahteva nove pristupne podatke ili ovlašćenje.

## 27. Izveštaj posle svakog poglavlja

Posle svakog završenog poglavlja daj kratak, istinit rezime:

- šta je analizirano;
- šta je implementirano;
- koji fajlovi su promenjeni;
- koje su komande pokrenute;
- koji testovi stvarno prolaze;
- šta nije moglo da se proveri;
- otvoreni rizici i odluke;
- tačan sledeći korak;
- ocena napretka tog poglavlja od 1 do 10;
- ukupna ocena spremnosti projekta od 1 do 10.

Ocena mora imati dokaz. Ne povećavaj je samo zato što je kod napisan. Funkcija bez testova, pravila baze, error stanja i browser potvrde nije završena funkcija.

Napravi checkpoint/commit samo kada je stanje konzistentno i testirano. Koristi jasan naziv i zabeleži commit SHA.

## 28. Timski rad tokom pet dana

Ako više ljudi radi paralelno, podeli rad po nezavisnim granama i vlasništvu fajlova:

### Dan 1

- forenzički pregled;
- business-rule matrica;
- arhitektura i model podataka;
- RBAC;
- privacy/legal gap analiza.

### Dan 2

- dispečerski cockpit;
- dnevni/mesečni plan;
- problem-resolution tok;
- vizuelni sistem.

### Dan 3

- backend autorizacija;
- transakcije;
- aktivacija vozača;
- scheduler;
- poruke.

### Dan 4

- driver PWA;
- Company Admin;
- import;
- GPS lifecycle;
- tri jezika i accessibility.

### Dan 5

- E2E;
- Firestore/Storage Rules;
- security;
- full browser QA;
- legal readiness paket;
- release/rollback plan.

Pre spajanja svake grane:

- rebase/merge konflikt rešava autor uz pregled;
- najmanje jedna druga osoba pregleda promenu;
- testovi moraju biti zeleni;
- nema demo podataka ni tajni;
- promena ne sme pokvariti drugi jezik ili ulogu;
- rezultat se proverava u browseru.

## 29. Obavezni završni artefakti

Kreiraj i održavaj:

- `reports/full-buscommand-audit-YYYY-MM-DD.md`;
- mapu stranica, ruta i servisa;
- arhitekturni pregled;
- ER/data model;
- RBAC i field-access matricu;
- state machine plana, problema i potvrde;
- threat model;
- data-flow mapu;
- retention/deletion matricu;
- DPIA pre-procenu;
- legal/open-decisions listu;
- test plan i stvarne rezultate;
- vizuelni acceptance checklist;
- deployment, rollback i recovery runbook;
- spisak environment varijabli bez njihovih vrednosti;
- listu preostalih rizika sa vlasnikom i prioritetom.

Prioriteti nalaza:

- `Critical`;
- `High`;
- `Medium`;
- `Low`;
- `Improvement`;
- `Business decision`;
- `Legal validation`.

## 30. Release gate i definicija završenog

BusCommand nije spreman za produkcioni pilot dok sve sledeće nije potvrđeno:

- nema poznatog Critical ili High security problema;
- tenant isolation i RBAC testovi prolaze;
- Firestore i Storage Rules testovi prolaze;
- nema javne liste vozača ili curenja login podataka;
- nema demo/Transit Flow/test podataka u produkcionom toku;
- dnevni i mesečni plan koriste isti kanonski model;
- paralelne izmene ne prepisuju podatke bez upozorenja;
- vozačka aktivacija je jednokratna i rate-limitovana;
- potvrde i scheduler prolaze vremenske, vikend i DST scenarije;
- GPS lifecycle je tehnički ograničen i čeka/ima potrebna pravna odobrenja;
- sve četiri uloge prolaze kritične E2E tokove;
- sva tri jezika su kompletna;
- WCAG kritične prepreke su rešene;
- typecheck prolazi;
- lint prolazi bez novih grešaka;
- testovi prolaze;
- production build prolazi;
- browser konzola nema neobjašnjene greške;
- backup i rollback su dokumentovani i provereni;
- pravna otvorena pitanja su jasno izdvojena;
- vlasnik proizvoda je odobrio lokalni browser pregled.

Tek nakon toga i posebne potvrde:

1. napravi nameran commit;
2. push na odobrenu GitHub granu;
3. deploy Firebase/Render konfiguracije;
4. pokreni migracije ili indekse kontrolisano;
5. uradi smoke test;
6. proveri logove bez PII;
7. potvrdi rollback plan.

## 31. Završni odgovor

Na kraju prikaži:

- trenutno stanje i procenat stvarne spremnosti;
- ukupan broj izmenjenih fajlova;
- završene stranice i module;
- najvažnija vizuelna poboljšanja;
- najvažnije funkcionalne i bezbednosne popravke;
- rezultate typecheck, lint, test i build komandi;
- rezultate lokalnog browser i role-by-role testa;
- stanje tri jezika i accessibility;
- pravne nalaze i šta još zahteva pravnika/DPO/Betriebsrat;
- lokaciju izveštaja i svih artefakata;
- commit/checkpoint identifikator;
- preostale rizike;
- tačan sledeći korak.

Ne tvrdi da je nešto završeno, bezbedno, pravno usklađeno, testirano ili spremno za deployment ako to nisi stvarno dokazao.

Krajnji cilj nije da aplikacija samo izgleda lepo. Krajnji cilj je da Super Admin pouzdano kontroliše platformu, Company Admin samostalno upravlja svojom firmom, disponent reši realan problem u nekoliko klikova, a vozač bez zabune vidi, potvrdi i prijavi sve što mu je potrebno. Sve četiri uloge moraju činiti jednu brzu, razumljivu, auditovanu, bezbednu i pravno spremnu celinu.

## KRAJ MASTER PROMPTA

---

## Minimalni zvanični pravni izvori za proveru

Ove izvore obavezno proveriti ponovo na datum svake pravne analize:

- GDPR, EUR-Lex: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng
- Austrijski ArbVG §96, RIS: https://www.ris.bka.gv.at/eli/bgbl/1974/22/P96/NOR40123095
- Austrijski AZG §26, RIS: https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Bundesnormen&Dokumentnummer=NOR40206209
- Austrijska Datenschutzbehörde — DPIA/DSFA: https://dsb.gv.at/rechte-pflichten/uestakk-v
- DSFA-V, RIS: https://www.ris.bka.gv.at/geltendefassung/bundesnormen/20010375/dsfa-v%2C%20fassung%20vom%2020.06.2021.pdf
- WP29 Opinion 2/2017 on data processing at work: https://ec.europa.eu/newsroom/document.cfm?doc_id=45631

Pravni deo prompta nije pravno mišljenje niti potvrda usklađenosti. Njegov cilj je da spreči tehničke odluke koje bi kasnije onemogućile zakonit pilot i da pripremi tačna pitanja, dokaze i dokumentaciju za kvalifikovanu pravnu proveru.

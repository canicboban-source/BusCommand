# BUSCOMMAND — ULTIMATE OPERATING CONTRACT (v2.1)

**Autoritet:** Vlasnik proizvoda  
**Namena:** Obavezni operativni ugovor za svakog AI agenta koji analizira, menja ili testira BusCommand.  
**Glavno pravilo:** Ne pretpostavljaj. Prvo proveri postojeći kod i ugovore, zatim napravi najmanju dokazano ispravnu promenu.

**Kill switch:** Ako nisi siguran da promena čuva tenant izolaciju, credential granicu ili all-or-nothing CA import — **STANI**. Jedno precizno pitanje vlasniku. Nula koda.

---

## 0) HIJERARHIJA AUTORITETA

Ako se instrukcije sukobe, primeni ih ovim redom:

1. bezbednost, privatnost, tenant izolacija i zabrana curenja credentials podataka
2. ovaj Operating Contract
3. konkretni Task Contract vlasnika za tekući zadatak
4. postojeći dokumentovani schema/API/domain ugovori projekta (kod + Rules + server ugovori)
5. `AGENTS.md` i postojeći obrasci arhitekture i koda
6. `docs/BusCommand-MASTER-PROMPT.md` — **referenca / istorija / dubina**  
   Ne nadjačava ovaj Contract. Citira se samo kada ovaj Contract traži postojeći ugovor, ili kada treba detalj (i18n proširenje, privacy profil, QA/release gate, poglavlja).
7. estetske i implementacione preferencije

Ako konflikt ne može bezbedno da se razreši, **zaustavi implementaciju i postavi jedno precizno pitanje vlasniku**. Ne biraj proizvoljno.

---

## 1) MISIJA I SEVERNA ZVEZDA

BusCommand je operativna mašina za disponenta u autobuskoj firmi.

UI mora u najviše 3 sekunde da odgovori:

1. Šta nije u redu?
2. Ko ili šta nedostaje?
3. Koje je najbrže bezbedno rešenje?
4. Da li je rešenje server stvarno sačuvao i potvrdio?

Severna zvezda:

> Disponent rešava stvarni poremećaj u jednom panelu i jednom jasnom akcijom, uz tačan serverski zapis, audit, refresh kanonskog stanja, bez credential leak-a i bez polusačuvanog stanja.

Ako funkcija ne ubrzava rešavanje poremećaja ili bezbedan CA uvoz, nije prioritet.

---

## 2) TEHNIČKI OKVIR

- Backend/runtime: postojeći Node.js / Express server.
- Frontend: postojeći klijentski stack.
- Desktop/Web parity samo tamo gde projekat već ima odvojene površine (staff desktop / driver PWA). Ne uvoditi Electron, native IPC sloj niti drugi desktop runtime.
- Baza i realtime: postojeća Firestore/db arhitektura i postojeći sync mehanizam.
- Ne uvoditi biblioteku, framework, servis, kolekciju, tabelu, transport ili novu zavisnost bez izričitog odobrenja vlasnika.
- Ne izmišljati schema polja, endpoint, event, indeks, claim, permission ili audit format.
- Ako dokumentacija i kod nisu saglasni, prijavi konkretan konflikt pre izmene.

WebSocket, GraphQL, nova IPC arhitektura, mikroservisi i paralelni state model su zabranjeni bez posebne odluke vlasnika.

---

## 3) GRANICA PROIZVODA

### U obimu

- mesečni i dnevni plan iz CA uvoza
- grupe/linije, vozači i autobusi kao operativni entiteti
- Dispo cockpit: signal i jedno mesto za rešenje
- potvrde vozača, poruke, SOS i prijave: kašnjenje, kvar, izgubljeno i postojeći podržani tipovi
- multi-tenant izolacija, RBAC, audit i i18n za SR/DE/EN

### Van obima

Ne graditi niti modelovati „za kasnije“:

- gorivo, servis, delove i fleet/VIN management
- knjigovodstvo, fakture, plate i putne naloge
- Almex zamenu
- mikroservise „jer će možda trebati“
- nove mape, timeline, drag-and-drop ili hotkey sistem bez dokazive operativne potrebe i odobrenja

Autobus u BusCommand-u je samo postojeći kanonski skup operativnih podataka potreban za dodelu, tipično broj + grupa + operativni status. Ne proširuj model bez odobrenja.

---

## 4) ULOGE I NEPREGOVORIVA PRAVILA

Uloge:

- Super Admin
- Company Admin (CA)
- Dispatcher (Dispo)
- Driver

Hard rules:

1. Rute i katalog smena (plan vožnje / V66) uvozi samo CA. Mesečne dodele vozača uvozi i uređuje Dispo. Dispo ne kreira rute. (D21, 2026-08-07; zamenjuje stariju formulaciju „mesečni plan uvozi samo CA“.)
2. Dispo nikada ne sme dobiti niti videti EID, PIN, aktivacioni kod, hash, login broj, credential, recovery ili ekvivalentni autentikacioni podatak — ni kroz UI, API response, log, export, error ili debug payload.
3. Dispo čita i menja samo podatke iz dodeljenih grupa i dozvoljenog tenant scope-a.
4. Tenant A ne sme ni posredno da sazna da podatak tenanta B postoji. Važi za API, query, Rules, count, ID, error, autocomplete, audit i realtime događaje.
5. Sakriveno ili disabled dugme nije autorizacija. Svaka mutacija zahteva serverski auth, tenant scope, RBAC, validaciju inputa i validaciju tranzicije.
6. Nema placeholder dugmadi, lažnog success-a, TODO stubova ili „implement later“ ponašanja u isporučenom toku.
7. Nema demo tenant-a, shared PIN-a, credentials ili tajni u kodu, fixture-u koji ulazi u produkcijski path, build outputu ili repozitorijumu.
8. Klijent ne određuje konačnu autorizaciju, dostupnost resursa, reviziju niti ishod konflikta. Server je autoritet.

---

## 5) KANONSKI MODEL I ZAŠTITA ŠEME

- Zabranjeno je preimenovanje postojećih polja, promena značenja ili tipa polja, promena strukture dokumenta, kao i kreiranje kolekcije/tabele bez izričitog odobrenja i schema ugovora vlasnika.
- Dnevni i mesečni ekran moraju čitati isti kanonski plan ili dokumentovanu serversku projekciju tog plana.
- Svaka promena plana ili dodele proizvodi novu reviziju prema postojećem projektnom mehanizmu.
- Svaka mutacija mora poslati očekivanu reviziju/version guard ako postojeći ugovor to podržava.
- Ako projekat već ima plan-edit lock, revision, ETag, optimistic concurrency ili ekvivalent — **koristi TAJ mehanizam**. Ne traži novi protokol i ne ignoriši postojeći.
- Stari write završava jasnim conflict rezultatom; nikada ne pregazi novije stanje.
- Potvrda vozača važi samo za tačnu reviziju. Relevantna promena automatski je poništava u istoj konzistentnoj operaciji.
- Ne uvoditi drugi „privremeni“ source of truth radi lakšeg UI-a.

Ako postojeći kod nema jasan revision/concurrency mehanizam, ne izmišljaj ga. Dokumentuj nalaz, rizik i traži odluku vlasnika pre promene šeme ili protokola.

---

## 6) OBAVEZNE DOMENSKE DEFINICIJE

Pre implementacije zadatka agent mora u postojećem kodu ili dokumentaciji pronaći kanonsku definiciju sledećih termina kada su relevantni:

- **slobodan vozač/bus:** nema konflikt sa dodelom u relevantnom vremenskom intervalu i ispunjava postojeće operativne uslove
- **neasigniran:** postoji u tenant-u, ali nema aktivnu grupnu/dnevnu dodelu prema postojećem modelu
- **dodeljena grupa:** grupa koju serverski authz scope dozvoljava konkretnom Dispo korisniku
- **aktivni problem:** problem koji prema kanonskom stanju još zahteva ljudsku akciju
- **rupa u pokriću:** planirana potreba bez validne dodele prema postojećim pravilima
- **konflikt:** server je odbio mutaciju zbog novije revizije, zauzetosti resursa, nevažeće tranzicije ili promene scope-a
- **vremensko preklapanje:** računa se isključivo prema postojećoj domain implementaciji i pravilima granica intervala

Ovo su semantički zahtevi, ne dozvola za novu šemu. Ako kanonska definicija nije pronađena ili postoji više različitih implementacija, postavi pitanje vlasniku pre menjanja poslovne logike.

---

## 7) CA UVOZ — ALL-OR-NOTHING UGOVOR

Obavezni tok:

`upload → validate → preview → confirm → atomic logical commit`

Zahtevi:

- samo CA može pokrenuti i potvrditi uvoz
- validacija mora dati tačan red, kolonu/polje i razlog greške bez otkrivanja tuđih podataka
- preview ne menja kanonsko stanje
- confirm mora ponovo proveriti authz, tenant, integritet i relevantnu reviziju
- jedan loš red u 10.000 znači da se nijedan poslovni podatak iz tog importa ne smatra uspešno uvezenim
- UI ne sme prikazati uspeh dok server nije potvrdio kompletan rezultat
- retry ne sme proizvesti duplikate
- audit mora zabeležiti ishod prema postojećem audit ugovoru

„Atomic logical commit“ znači all-or-nothing poslovnu garanciju. Ne pretpostavljaj da jedna Firestore transakcija može sadržati ceo import. Koristi samo postojeći, dokumentovani projektni mehanizam. Ako on ne može garantovati all-or-nothing ishod u potrebnom obimu, zaustavi se i prijavi tehnički gap; ne menjaj šemu bez odobrenja.

---

## 8) DISPO COMMAND SURFACE

Jedan panel „Needs attention“ rešava aktivne probleme. Ne lančati modale, ne zahtevati F5 i ne slati korisnika na mrtav ekran.

Za svaku podržanu stavku — nema busa, nema/bolestan vozač, pogrešan kod, prijava, rupa u pokriću i postojeći tipovi poremećaja — panel mora:

1. jasno pokazati problem, pogođenu vožnju/grupu i operativni uticaj
2. prikazati bezbedne dostupne opcije u istom panelu
3. omogućiti jednu jasnu Apply akciju
4. zadržati panel u pending stanju dok server ne odgovori
5. na uspeh prikazati potvrdu i osvežiti kanonsko stanje
6. na odbijanje vratiti optimistic UI, sačuvati kontekst i prikazati čitljivu grešku
7. na conflict ponuditi osveženo stanje i ponovni izbor, bez tihog overwrite-a

Health, banner i alert vode direktno do odgovarajuće stavke i akcije u ovom panelu.

### Pool redosled — vozači i autobusi

1. ova grupa — slobodni
2. firma — slobodni ili neasignirani
3. druge grupe — slobodni

Koristi postojeće podatke i `optgroup`/ekvivalentne pregrade postojećeg UI sistema. Najbliže bezbedno rešenje ide prvo. Kandidat koji nije stvarno raspoloživ prema serveru ne sme biti uspešno dodeljen čak i ako je prikazan zbog stale klijentskog stanja.

---

## 9) POUZDANOST I FAILURE SEMANTIKA

- Server blokira svaku nevažeću tranziciju deterministički.
- Isti vozač ili bus ne sme biti dvostruko dodeljen u konfliktnom intervalu.
- Race se rešava transakcijom, lock-om, revision guard-om ili drugim već postojećim projektnim mehanizmom — bez nove arhitekture.
- Optimistic UI je dozvoljen samo uz potpun rollback i jasan server rezultat.
- Realtime koristi postojeći sync mehanizam.
- Offline, timeout, spor odgovor i partial failure moraju imati različito i razumljivo ponašanje kada postojeći error ugovor to omogućava.
- Nikada ne prikazati „sačuvano“ na osnovu klijentske pretpostavke.
- Zatvaranje panela dozvoljeno je tek nakon potvrđenog uspeha ili eksplicitnog korisničkog odustajanja.
- Ne logovati tajne, credentials, cele osetljive payload-e niti podatke drugog tenant-a.

---

## 10) I18N I UX DISCIPLINA

- Nijedan novi user-facing string ne sme biti hardkodovan.
- SR, DE i EN ključevi dodaju se zajedno u postojećem i18n sistemu.
- Greška mora reći šta se desilo i koja je sledeća bezbedna akcija.
- Disabled stanje mora imati razlog kada razlog nije očigledan.
- Loading, success, error, conflict i empty state moraju biti stvarna stanja, ne vizuelna improvizacija.
- Ne uvoditi paralelni design system.
- Accessibility obrasci postojećeg projekta moraju ostati očuvani.

---

## 11) OBAVEZNI PRE-FLIGHT PRE KODIRANJA

### Pun Pre-flight (podrazumevano)

Pre prve izmene agent mora:

1. pročitati ovaj ugovor, konkretni Task Contract, `AGENTS.md` i relevantan kod
2. proveriti git granu, status i postojeće izmene; ne dirati tuđi rad
3. pronaći stvarni UI entry point, client validation, server endpoint/handler, auth/authz, persistenciju, audit i refresh/sync putanju
4. potvrditi postojeću šemu i nazive polja iz koda, tipova, Rules-a ili dokumentovanog ugovora
5. identifikovati relevantne testove i build/runtime odnos, uključujući da li runtime služi `dist/`
6. proveriti da li promena zahteva novu šemu, dependency, migraciju ili nejasnu poslovnu odluku

Zatim dati kratak Pre-flight izveštaj:

- **Našao sam:** relevantni fajlovi i stvarni tok
- **Menjam:** najmanji skup komponenti
- **Ne menjam:** schema/dependencies/out-of-scope delovi
- **Rizici/nejasnoće:** konkretno navedeni
- **Plan dokaza:** testovi i očekivani failure slučajevi

Ako je nejasnoća blokirajuća, postavi pitanje i ne kodiraj. Ako nije blokirajuća, navedi proverljivu pretpostavku i nastavi samo ako ne menja poslovni ugovor ili bezbednost.

### Kratki Pre-flight (dozvoljen izuzetak)

Dozvoljen je samo ako je istinito **sve**:

- jedna poznata greška ili jasno ograničen bugfix
- ≤1 fajl ili jedan već poznat tok
- bez schema / API ugovora / RBAC promene
- bez novog user-facing toka ili novog panela

Tada dovoljno: **Našao sam / Menjam / Dokaz**.  
Ako bilo šta od uslova nije ispunjeno — pun Pre-flight.

---

## 12) KOD DISCIPLINA

- Implementiraj najmanju koherentnu promenu koja rešava zadatak kroz ceo tok.
- Ne radi „ultimate rewrite“, masovni refactor ili dependency bump.
- Ne menjaj schema/API ugovor samo da bi UI bio lakši.
- Koristi postojeće tipove, validatore, error format, auth middleware, audit i sync.
- Svaka mutacija mora imati kompletan failure path.
- Ne gutaj exception i ne pretvaraj failure u success.
- Nema `TODO`, stub-a, no-op handlera, lažnog mock success-a ili mrtvog dugmeta u isporučenom toku.
- Ne koristiti `--no-verify`, ne skrivati failing test i ne menjati test samo da bi pogrešno ponašanje postalo zeleno.
- Posle relevantne JS/TS izmene pokreni `npm run build` ako runtime služi generisani `dist/`.
- Deploy, release, produkcijska migracija i push nisu dozvoljeni bez izričitog „da“ vlasnika.

---

## 13) DEFINICIJA „GOTOVO“

Zadatak nije gotov dok nije dokazano sve što je relevantno:

1. kompletan tok radi: UI → client validate → auth → server authz → domain logic → persist → audit → realtime/UI refresh
2. serverski RBAC i tenant scope su provereni, ne samo UI visibility
3. happy path radi
4. invalid input je odbijen jasnom greškom
5. stale revision/conflict i race ne proizvode overwrite ili dvostruku dodelu
6. unauthorized i cross-tenant pokušaji su odbijeni bez curenja postojanja podataka
7. network/server failure ne prikazuje lažni success i optimistic state se vraća
8. potvrda vozača se ponaša ispravno za tačnu reviziju
9. SR/DE/EN ključevi postoje za svaki novi tekst
10. relevantni unit/integration/E2E testovi prolaze
11. nema regresije na login, plan, Needs attention i CA import u obimu relevantnom za izmenu
12. nema secret/credential leak-a, naročito u Dispo UI/API/logovima
13. ako E2E koristi stale `dist/`, urađen je rebuild i test je ponovljen

Ako nešto nije moglo da se proveri, ne piši „gotovo“. Napiši tačno šta je provereno, šta nije i zašto.

---

## 14) OBAVEZNI ZAVRŠNI IZVEŠTAJ

Završni odgovor mora biti kratak i dokaziv:

- **Šta:** koje ponašanje je promenjeno
- **Zašto:** koji operativni problem rešava
- **Bezbednost:** kako su RBAC, tenant scope, conflict i credential granice očuvani
- **Dokaz:** svaka pokrenuta komanda, rezultat i exit code
- **Fajlovi:** relevantni promenjeni fajlovi
- **Rizik:** preostali rizik ili „nema poznatih“
- **Nije urađeno:** sve što je ostalo van scope-a

Ne tvrditi da je deploy/release urađen ako vlasnik nije izričito odobrio i ako nema stvarnog dokaza.

---

## 15) ZABRANJENI ANTI-PATTERNS

- rewrite umesto ciljane popravke
- Map/DnD/timeline/hotkey teatar bez potrebe
- fleet/fuel/payroll feature creep
- autorizacija samo kroz sakriveno dugme
- klient kao autoritet za availability ili tenant scope
- lažni green testovi, neopravdan skip i `--no-verify`
- hardkodovani demo ili credential podaci u produkcijskom path-u
- zatvaranje panela pre potvrđenog server success-a
- toast „sačuvano“ bez potvrđenog persist-a
- UI promena koja ne menja kanonski state
- silent overwrite pri stale revision-u
- delimični CA import predstavljen kao uspeh
- nova kolekcija, tabela, polje ili dependency bez odobrenja

---

## 16) TASK CONTRACT — POPUNITI ZA SVAKU ITERACIJU

Ovaj blok vlasnik dodaje ispod ugovora za konkretan zadatak:

```text
TASK CONTRACT

Naziv zadatka:
[kratak naziv]

Stvarni problem:
[šta danas ne radi ili usporava disponenta/CA]

Očekivano ponašanje:
[precizan rezultat za korisnika]

Uloga/e i scope:
[CA / Dispo / Driver / Super Admin; tenant/grupe]

Ulazna tačka:
[ekran, ruta, akcija ili poznati fajl — ako je poznato]

Acceptance kriterijumi:
1. [merljivo]
2. [merljivo]
3. [failure/conflict/unauthorized kriterijum]

Obavezni test slučajevi:
- happy path:
- invalid input:
- unauthorized/cross-tenant:
- conflict/race:
- network/server failure:
- relevantna regresija:

Dozvola za promenu šeme: NE
Dozvola za novu dependency: NE
Dozvola za deploy/release: NE

Posebne zabrane ili napomene:
[ako postoje]
```

Ako je bilo koja dozvola „NE“, agent ne sme da je zaobiđe. Ako je takva promena neophodna, mora stati, objasniti razlog i tražiti izričito odobrenje.

---

## 17) STARTNA KOMANDA AGENTU

Kada dobiješ ovaj ugovor i Task Contract:

1. Ne počinji kodiranjem.
2. Izvrši Pre-flight iz odeljka 11 (pun ili kratki, prema uslovima).
3. Ako postoji blokirajuća nejasnoća — ili aktivira se kill switch iz zaglavlja — postavi jedno precizno pitanje.
4. Ako je ugovor dovoljno jasan, implementiraj najmanju kompletnu promenu.
5. Testiraj ciljano, popravi, ponovi i navedi stvarne rezultate sa exit code-ovima.
6. Ne deploy-uj, ne release-uj i ne menjaj šemu bez eksplicitnog odobrenja vlasnika.

**Bez dokaza nije gotovo. Bez serverske potvrde nije sačuvano. Bez tenant izolacije nije prihvatljivo.**

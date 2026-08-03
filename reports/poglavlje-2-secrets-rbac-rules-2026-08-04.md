# Poglavlje 2 — tajne, RBAC, Firestore Rules i tenant izolacija

- Datum: 2026-08-04
- Grana: `work/ca-monthly-import` (radni direktorijum `BusCommand-ca-monthly-import`)
- Polazna tačka: checkpoint iz Poglavlja 1 (`reports/poglavlje-1-state-checkpoint-2026-08-04.md`)
- Okruženje: Node 22.23.2, Temurin JRE 21.0.12 (Firestore emulator), Playwright Chromium
- Master prompt: `docs/BusCommand-MASTER-PROMPT.md` v3.1

## 1. Sažetak

Poglavlje 2 je zatvorilo pet stvarnih propusnosti u autorizaciji i višekorisničkoj
izolaciji, klasifikovalo sve identifikatore i tajne u repozitorijumu i zamenilo
prioritetne „statičke“ access testove stvarnim HTTP i Rules testovima.

| Kategorija | Nađeno | Rešeno | Preostalo |
| --- | --- | --- | --- |
| High | 2 | 2 | 0 |
| Medium | 4 | 4 | 0 |
| Low / Improvement | 3 | 2 | 1 |

Najvažnije: SuperAdmin browser sesija je do sada mogla da piše po **svim**
tenant kolekcijama, uključujući `audit_log` koji je po dizajnu nepromenljiv.
To je zatvoreno i dokazano mutacionim testom.

## 2. Nalazi i izmene

### H1 — SuperAdmin wildcard pravilo je dozvoljavalo pisanje po celom tenantu

- Prioritet: **High**
- Fajl: `firestore.rules`
- Problem: pravilo `match /companies/{companyId}/{companyCollection}/{document=**}`
  je imalo `allow read, write: if isSuperAdmin()`. Firestore pravila su aditivna —
  `allow create: if false` na `audit_log` se time nadjačava. SuperAdmin klijent je
  mogao da kreira, prepiše i obriše audit zapise, da menja `settings/main`
  (licenca, limiti, feature flag-ovi), `support_sessions` i `users` bez validacije
  i bez audit traga.
- Izmena: wildcard je sveden na `allow read`, a `allow write: if false`. Sve
  promene i dalje idu kroz Admin SDK API koji validira tenant i piše audit zapis
  (Admin SDK po definiciji zaobilazi Rules, pa nijedna serverska funkcija nije
  izgubila pristup).
- Dokaz: `tests/rules/server-owned-writes.test.js` →
  „superadmin browser session cannot forge or erase server-owned tenant records“.
  Mutacioni test: sa vraćenim starim pravilom test pada (1 fail / 30), sa novim
  prolazi (30/30).

### H2 — Korenski dokument firme je bio klijentski upisiv za Company Admin

- Prioritet: **High**
- Fajl: `firestore.rules`
- Problem: `match /companies/{companyId}` je imao
  `allow write: if isSuperAdmin() || isCompanyAdmin(companyId)`. Korenski dokument
  nosi `name`, `slug`, `companyId` i `status`, pa je CA iz pretraživača mogao da
  promeni status firme i identitet tenanta bez validacije i audit zapisa.
- Izmena: `allow write: if false`; lifecycle ostaje na SuperAdmin/CA API-jima.
- Dokaz: „company root document is server-owned for every role“. Mutacioni test:
  sa starim pravilom pada, sa novim prolazi.

### M1 — Staff API je verovao samo token claims-u, bez provere tenant profila

- Prioritet: **Medium**
- Fajlovi: `server/staff-auth.js` (novo), `api-server.js`
- Problem: `requireCompanyStaff` i `requireCompanyAdmin` u `api-server.js` su
  proveravali samo dekodovan token. Vozačka površina (`server/driver-routes.js`)
  je već čitala tenant profil i odbijala neaktivan nalog, ali staff površina nije,
  pa je zaštita zavisila isključivo od `checkRevoked` mehanizma. Uz to je
  `/api/staff/service-plans/active` uzimao disponentske grupe iz claims-a, koji
  su snimak stanja u trenutku prijave.
- Izmena: izdvojen zajednički modul `server/staff-auth.js` koji:
  - verifikuje token sa `checkRevoked = true`,
  - čita `companies/{companyId}/users/{uid}` i odbija nepostojeći profil,
    `active === false` i profil čija se rola razlikuje od role u tokenu,
  - vraća **grupe iz profila** kao autoritativne (`req.staffUser.groups`),
  - na grešku u čitanju profila vraća 503, dakle fail-closed.
- Dokaz: `tests/unit/staff-auth-http.test.js` (13 testova preko stvarnog HTTP-a).

### M2 — SuperAdmin middleware nije proveravao opozvane tokene

- Prioritet: **Medium**
- Fajl: `server/superadmin-overview.js`
- Problem: `verifyIdToken(token)` bez `checkRevoked`, dok su ostali gate-ovi
  koristili `true`. Deaktivacija ili „odjavi sve uređaje“ nije odmah zatvarala
  najprivilegovaniji API, već tek po isteku ID tokena (do jedan sat).
- Izmena: `verifyIdToken(token, true)`.
- Dokaz: statička provera u `tests/unit/company-admin-team-access.test.mjs`
  pokriva oba gate-a; runtime ponašanje `checkRevoked` dokazuje HTTP test
  „staff API rejects unknown and revoked tokens with checkRevoked enabled“.

### M3 — `GET /api/license/:companyId` je bio neautentifikovan

- Prioritet: **Medium**
- Fajlovi: `api-server.js`, `server/staff-auth.js`
- Problem: bilo ko je mogao da pročita plan, status, broj preostalih dana,
  feature flag-ove i limite bilo koje firme, a razlika između 200 i 404 je
  služila kao orakl za nabrajanje postojećih `companyId` vrednosti.
- Izmena: dodat `requireCompanyMemberParam` — traži važeći token i poklapanje
  tenanta (SuperAdmin je izuzet), plus rate limit 60/min. Nepoznat i tuđi tenant
  daju isti odgovor (403), pa nabrajanje više nije moguće.
- Kompatibilnost: svi klijentski pozivi `checkCompanyLicense` su post-login sa
  potvrđenim tenantom (`js/bootstrap/init.js`, `js/auth/login-dispatcher.js`,
  `js/admin/company-admin.js`), a `ApiClient.apiFetch` već šalje ID token. Demo
  režim ne poziva endpoint. Bez Firebase-a endpoint i dalje vraća 503, pa
  `tests/e2e/api-smoke.spec.js` ostaje validan.
- Dokaz: „tenant metadata routes are members-only and never leak company existence“.

### M4 — Nove server-owned kolekcije bez eksplicitnih pravila

- Prioritet: **Medium**
- Fajl: `firestore.rules`
- Problem: `monthly_plan_imports`, `monthly_plan_import_locks`, `plan_locks` i
  `ops` nisu imale nijedno pravilo. Za tenant role su bile zatvorene samo
  implicitnim default-deny, a za SuperAdmin su bile upisive kroz H1.
- Izmena: eksplicitno `allow read, write: if false` za sve četiri, uz komentar
  zašto (stanje uvoza i zaključavanja služe konzistentnosti i klijent ih nikad
  ne čita direktno).
- Dokaz: „import locks, plan locks and job state stay invisible and untouchable
  for tenant clients“ (3 role × 4 kolekcije × read/write).

### L1 — Firebase Web API identifikator ugrađen u operativnu skriptu

- Prioritet: **Low** (klasifikacija: javni identifikator, nije tajna)
- Fajl: `scripts/l7-live-smoke.js`
- Klasifikacija: Firebase Web API key je po Google-ovoj dokumentaciji javni
  identifikator klijenta koji se isporučuje u browser bundle-u; zaštita je u
  Firebase Rules i App Check-u, ne u tajnosti ključa. Prave tajne
  (`FIREBASE_SERVICE_ACCOUNT_JSON`, `CONFIRMATION_JOB_SECRET`) su u `render.yaml`
  ispravno deklarisane sa `sync: false`, a `firebase-admin-key.json` i `.env*`
  su u `.gitignore`.
- Izmena: skripta više ne fiksira ni ključ ni ciljni URL ni tenant; čita
  `VITE_FIREBASE_API_KEY`, `L7_SMOKE_BASE_URL`, `L7_SMOKE_COMPANY_ID` i pada sa
  jasnom porukom ako ključ nije postavljen. Ključ ostaje deklarisan samo na dva
  mesta (`.env.example`, `render.yaml`) plus guard skripta.
- Dokaz: `tests/unit/repo-secrets.test.js` (5 testova): nema PEM/`private_key`
  materijala, `.gitignore` pokriva ključeve i env fajlove, ključ postoji samo u
  dozvoljenim fajlovima, platformske tajne su `sync: false`, smoke skripta čita
  konfiguraciju iz okruženja.

### L2 — Prioritetni access testovi bili su tekstualne provere izvornog koda

- Prioritet: **Improvement**
- Problem iz Poglavlja 1: `company-admin-*-access` testovi su regexom tražili
  imena middleware-a u `api-server.js`. Takav test prolazi i kad ponašanje pukne.
- Izmena: dodat `tests/unit/staff-auth-http.test.js` koji diže pravi Express
  server sa lažnim Admin SDK/Firestore slojem i proverava stvarne statuse:
  401 bez tokena, 401 za nepoznat i opozvan token, 403 za vozača i SuperAdmina na
  staff ruti, 403 za neaktivan/nepostojeći/„role drift“ profil, 403 za disponenta
  na CA ruti, 403 za tuđi tenant, 400 za neispravan `companyId`, 200 za vlasnika
  tenanta, grupe iz profila umesto iz claims-a, 503 kad Firebase nije podešen i
  503 kad čitanje profila padne. Statičke provere su preusmerene na novi modul
  i ostavljene samo kao provera ožičenja ruta.

### L3 — Osam moderate ranjivosti u produkcionim zavisnostima (nije rešeno)

- Prioritet: **Low**, svesno odloženo
- Stanje: `npm audit --omit=dev` → 8 moderate, 0 high, 0 critical. Sve osam imaju
  isti koren: `uuid < 11.1.1` (GHSA-w5hq-g745-h8pq, „missing buffer bounds check
  in v3/v5/v6 when buf is provided“) koji ulazi tranzitivno kroz
  `firebase-admin@12.7.0` → `@google-cloud/firestore`/`@google-cloud/storage`.
- Zašto nije rešeno u ovom poglavlju: jedini dostupni fix je major skok
  `firebase-admin` 12 → 14, što je promena ugovora Admin SDK-a i po master
  promptu (§8) zahteva zasebnu procenu rizika i migracioni test, ne popravku
  usput. Naša baza koda ne poziva `uuid` direktno (`require("uuid")` se ne
  pojavljuje nigde), a ranjivost zahteva poziv v3/v5/v6 sa korisnički zadatim
  `buf` argumentom, što se ne dešava u našem toku.
- Preporuka: posebno poglavlje za nadogradnju zavisnosti sa punim gate-om.

## 3. Šta je ostalo nepotvrđeno

- `requireUserProvisioner` i dalje propušta rolu `company_admin` na nivou
  middleware-a, iako oba handlera (`POST /api/admin/create-user`,
  `PUT /api/admin/users/:uid/groups`) tu rolu odbijaju sa 403 u telu funkcije.
  Nije bezbednosna praznina, ali je nepotrebna površina; čišćenje je odloženo jer
  postojeći test fiksira tu proveru u `api-server.js`.
- Rules testovi rade nad emulatorom, ne nad produkcionim projektom. Deploy
  pravila nije deo ovog poglavlja i zahteva eksplicitnu odluku o objavljivanju.
- `checkRevoked` ponašanje je dokazano lažnim Admin SDK slojem; stvarno
  Firebase opozivanje tokena zahteva živo okruženje i test naloge.
- Rate limit na licencnom endpointu je konfigurisan, ali nije mereno ponašanje
  pod stvarnim paralelnim saobraćajem.

## 4. Izmenjeni fajlovi

| Fajl | Svrha izmene |
| --- | --- |
| `firestore.rules` | SuperAdmin wildcard sveden na read-only; korenski dokument firme server-owned; eksplicitna pravila za `monthly_plan_imports`, `monthly_plan_import_locks`, `plan_locks`, `ops` |
| `server/staff-auth.js` | Novo: zajednički staff/CA/member gate sa proverom tenant profila, autoritativnim grupama i tenant vezivanjem |
| `api-server.js` | Middleware preseljen u `server/staff-auth.js`; licencni endpoint sada member-only i rate-limited; disponentske grupe iz profila |
| `server/superadmin-overview.js` | `verifyIdToken(token, true)` — opozvane SA sesije se odbijaju odmah |
| `scripts/l7-live-smoke.js` | Ciljni URL, tenant i Web API identifikator iz okruženja, sa fail-fast proverom |
| `tests/unit/staff-auth-http.test.js` | Novo: 13 HTTP testova autorizacije i tenant izolacije |
| `tests/unit/repo-secrets.test.js` | Novo: 5 testova koji drže klasifikaciju tajni i konfiguracije |
| `tests/rules/server-owned-writes.test.js` | +6 testova: SA read-only, korenski dokument, interne kolekcije, support sesije, audit log |
| `tests/unit/company-admin-audit.test.mjs`, `tests/unit/company-admin-team-access.test.mjs`, `tests/unit/service-plan-access.test.mjs` | Statičke provere preusmerene na zajednički modul |

## 5. Komande i rezultati

Gate je pokrenut dva puta u celini, oba puta čist:

| Komanda | Prolaz A | Prolaz B |
| --- | --- | --- |
| `npm run lint` | prolaz | prolaz |
| `npm run test:unit` | 452/452 | 452/452 |
| `npm run test:rules` | 30/30 | 30/30 |
| `npm run build` | prolaz, uključujući `check-firebase-isolation` | prolaz |
| `npx playwright test --project=chromium` | 56/56 | 56/56 |
| `npm audit --omit=dev` | 8 moderate, 0 high, 0 critical | isto |

Mutacione provere (dokaz da novi Rules testovi zaista hvataju staru propusnost):

| Mutacija | Rezultat |
| --- | --- |
| Vraćen `allow write: if isSuperAdmin()` na wildcard | 29/30, pada „superadmin browser session cannot forge or erase server-owned tenant records“ |
| Vraćen `allow write: if isSuperAdmin() \|\| isCompanyAdmin(companyId)` na korenskom dokumentu | 29/30, pada „company root document is server-owned for every role“ |

Rast pokrivenosti: unit 434 → 452 (+13 HTTP autorizacija, +5 tajne/konfiguracija),
Rules 24 → 30.

## 6. Eksterni izvori

| Izvor | URL | Datum pristupa | Nalaz |
| --- | --- | --- | --- |
| GitHub Advisory GHSA-w5hq-g745-h8pq (`uuid`) | https://github.com/advisories/GHSA-w5hq-g745-h8pq | 2026-08-04 (kroz `npm audit` metapodatke) | L3 — klasifikacija i odlaganje nadogradnje |

Napomena: klasifikacija Firebase Web API ključa kao javnog identifikatora
zasnovana je na postojećoj arhitekturi projekta (ključ se isporučuje u browser
bundle-u i već je deklarisan u `render.yaml`) i nije u ovom poglavlju ponovo
potvrđena kod Google dokumentacije. Pravnih ni regulatornih tvrdnji u ovom
poglavlju nema.

## 7. Ocena poglavlja i rollback

- Ocena: 9/10. Sve nađene propusnosti su zatvorene i dokazane testovima, uz dva
  mutaciona dokaza. Minus je L3 (odložena nadogradnja `firebase-admin`) i to što
  `checkRevoked` i deploy pravila nisu potvrđeni u živom okruženju.
- Rollback: sve izmene su u jednom checkpoint commitu na `work/ca-monthly-import`;
  `git revert` tog commita vraća prethodno stanje pravila i middleware-a.
- Rizik po korisnika: nema promene u UI-u niti u ugovorima API odgovora za
  ispravno autentifikovane sesije. Jedina vidljiva promena ponašanja je da
  licencni endpoint sada zahteva prijavu, što svi klijentski tokovi već imaju.

## 8. Predlog za Poglavlje 3

1. Životni ciklus prijave i sesija: PIN/EID tokovi, `mustChangeLoginCode`,
   istek sesije, `sessionsValidAfterEpoch` u praksi, ponašanje na refresh i
   browser back.
2. Zamena preostalih statičkih access testova (`company-admin-groups-access`,
   `company-admin-branding-access`, `company-admin-settings-access`,
   `dispatcher-report-access`) stvarnim HTTP testovima nad zajedničkim gate-om.
3. Zasebno poglavlje za nadogradnju `firebase-admin` 12 → 14 sa punim gate-om.

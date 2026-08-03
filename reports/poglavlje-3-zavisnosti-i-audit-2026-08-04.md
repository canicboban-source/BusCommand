# Poglavlje 3 — zavisnosti, `npm audit` i runtime dokaz Admin SDK-a

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import` (radni direktorijum `BusCommand-ca-monthly-import`)
- Polazna tačka: checkpoint iz Poglavlja 2 (`reports/poglavlje-2-secrets-rbac-rules-2026-08-04.md`, `f961576` / `3c9ccc6`)
- Checkpoint commit: `8becb8e`
- Okruženje: Node 22.23.2, Temurin JRE 21.0.12 (Firestore emulator), Playwright Chromium
- Master prompt: `docs/BusCommand-MASTER-PROMPT.md` v3.1

## 1. Sažetak

Zadatak je bio da se zatvori L3 iz Poglavlja 2 — osam moderate ranjivosti u
produkcionim zavisnostima — pre nastavka funkcionalnih poglavlja.

Pretpostavka sa kojom smo ušli u poglavlje bila je da je jedini put major skok
`firebase-admin` 12 → 14. **Ta pretpostavka je merenjem opovrgnuta.** Skok na 14
ne rešava nalaz, a uz to bi zahtevao prepisivanje svakog Admin SDK poziva u
projektu. Nalaz je rešen ciljanim `overrides` pinom `uuid` paketa, uz zadržavanje
`firebase-admin@12.7.0`.

| Metrika | Pre | Posle |
| --- | --- | --- |
| `npm audit --omit=dev` (produkcija) | 8 moderate | **0** |
| `npm audit` (uključujući dev alate) | 12 (7 moderate, 5 high) | 3 moderate, dev-only |
| Rules/runtime testovi | 30 | 39 |
| Unit testovi | 452 | 455 |
| Promene u izvornom kodu aplikacije | — | nijedna |

## 2. Merenja koja su promenila odluku

Sva merenja su izvedena u izolovanom probnom projektu (`%TEMP%\fbadmin-probe`),
bez diranja repozitorijuma, pa su ponovljiva.

### N1 — `firebase-admin@13` ne rešava nalaz

Verzija 13.10.0 je uklonila `uuid` iz samog SDK-a, pa je hipoteza bila da je
dovoljan minor skok. Rezultat: **8 moderate ostaje**, jer `uuid@9.0.1` ne ulazi
kroz `firebase-admin` nego kroz `@google-cloud/firestore` → `google-gax` i
`@google-cloud/storage` → `gaxios`/`teeny-request`.

### N2 — `firebase-admin@14.2.0` takođe ne rešava nalaz

`npm audit` prijavljuje `fixAvailable: { name: "firebase-admin", version: "14.2.0" }`.
Instalacijom tačno te verzije: **6 moderate ostaje** (`@google-cloud/storage`,
`gaxios`, `teeny-request`, `retry-request`, `uuid`, `firebase-admin`). npm-ova
preporuka je, dakle, netačna — major skok smanjuje broj nalaza sa 8 na 6, ali ne
daje čist audit.

### N3 — verzija 14 uklanja namespace API u runtime-u, ne samo u tipovima

Provera stvarnog eksporta na instaliranoj verziji 14.2.0:

```
auth fn: undefined
firestore fn: undefined
firestore.FieldValue: undefined
firestore.Timestamp: undefined
credential.cert: undefined
apps: undefined
initializeApp: function
```

Ceo naš server koristi upravo taj namespace: `admin.firestore.FieldValue`
(oko 60 poziva), `admin.firestore.Timestamp`, `admin.credential.cert`,
`admin.apps`, `admin.auth()`. Skok na 14 znači migraciju u `api-server.js`,
osam `server/*` modula i osam skripti — bez ikakve koristi za audit.

### N4 — ranjivost nije bila dostupna kroz naš tok

GHSA-w5hq-g745-h8pq se odnosi na `v3`/`v5`/`v6` kada pozivalac zada `buf`
argument. Provera stvarne upotrebe u bibliotekama koje uvlače `uuid`:

- `gaxios/build/src/gaxios.js:417` → `(0, uuid_1.v4)()` (multipart boundary)
- `teeny-request/build/src/index.js:135` → `uuid.v4()` (multipart boundary)

Koriste isključivo `v4`, koji advisory ne pokriva, a naš kod `uuid` ne poziva
nigde direktno. Stvarna izloženost je bila nula; problem je bio higijenski —
audit koji nije čist pravi šum u svakom narednom poglavlju.

## 3. Sprovedena izmena

### `overrides: { "uuid": "^11.1.1" }` u `package.json`

`uuid` se sada dedupira na 11.1.1 za sva tri potrošača
(`google-gax`, `gaxios`, `teeny-request`), a `firebase-admin` ostaje na 12.7.0.
Deklarisani opsezi zavisnosti nisu menjani — izmena je samo u `overrides` i u
razrešenim verzijama u `package-lock.json`.

Kompatibilnost je proverena, a ne pretpostavljena: uuid 11 i dalje izvozi `v4`
kroz CJS `require`, sve biblioteke se učitavaju, i pravi Firestore/Auth saobraćaj
prolazi (odeljak 4).

### `npm audit fix` za dev alate

Nerazorne popravke (bez `--force`, bez promene deklarisanih opsega) rešile su
devet dev nalaza: `undici`, `postcss`, `ip-address`, `brace-expansion`,
`fast-uri`, `tar`, `hono`, `@hono/node-server`, `@modelcontextprotocol/sdk`.

Preostaje **3 moderate, isključivo dev**: `firebase-tools` →
`@google-cloud/pubsub` → `@opentelemetry/core` („unbounded memory allocation in
W3C Baggage propagation"). npm kao „fix" predlaže `firebase-tools@14.23.0`, što
je **unazadna** promena sa naše verzije 15.24.0 i nije prihvatljiva. Reč je o
emulator CLI alatu koji se nikad ne isporučuje i ne pokreće u produkciji, pa je
nalaz svesno prihvaćen i dokumentovan.

## 4. Runtime dokaz — ovo je vrednost poglavlja

Pin transitivne zavisnosti klijentskih Google biblioteka se ne može potvrditi
time što se modul učita. Zato su dodata dva testa sa **stvarnim** saobraćajem
kroz Admin SDK protiv emulatora.

### `tests/rules/admin-sdk-runtime.test.js` (5 testova)

Firestore kroz Admin SDK: `FieldValue.serverTimestamp`, `Timestamp.fromDate`,
`FieldValue.arrayUnion`, `FieldValue.delete`, `runTransaction` sa read-then-write,
`batch` sa mešanim `set`/`delete`, `count()` agregacija, `select()` projekcija, i
provera da je razrešeni `uuid` iznad opsega iz advisory-ja. Testovi se preskaču
ako `FIRESTORE_EMULATOR_HOST` nije postavljen, pa nikad ne mogu pogoditi pravi
projekat.

### `tests/rules/admin-auth-runtime.test.js` (4 testa)

Dodat je Auth emulator (`firebase.json`, `test:rules` sada `--only firestore,auth`)
i time je **zatvoren otvoreni rizik iz Poglavlja 2** — do sada je `checkRevoked`
bio dokazan samo lažnim Admin SDK slojem.

- Životni ciklus naloga: `createUser` → `setCustomUserClaims` → `getUser` →
  `updateUser({disabled})` → `getUserByEmail` → `deleteUser`, uz proveru da
  posle brisanja `getUser` vraća `auth/user-not-found`.
- `createCustomToken` sa tenant claims-ovima → razmena za ID token preko
  emulatora → `verifyIdToken(token, true)` vraća `role`, `companyId`,
  `mustChangeLoginCode` i `auth_time` koji Rules zahtevaju.
- `revokeRefreshTokens` → `verifyIdToken(token, true)` odbija ranije izdat token
  sa `auth/id-token-revoked`. To je tačno mehanizam na kojem počiva trenutna
  deaktivacija staff i SuperAdmin naloga.
- Onemogućen nalog: `verifyIdToken` sa `checkRevoked` odbija postojeći token.

Ograničenje, pošteno zabeleženo: Auth emulator odbija opozvan token i **bez**
`checkRevoked`, pa u ovom okruženju nije moguće izolovati efekat same zastavice.
Test dokazuje odbijanje, ne razliku između dva režima; kod pravog Firebase-a
token bez `checkRevoked` ostaje čitljiv do isteka.

### `tests/unit/dependency-policy.test.js` (3 testa)

Odluka je zaključana testom, da ne može tiho da se izgubi:

- `overrides.uuid` mora biti `^11.1.1`, a nijedan `uuid` unos u
  `package-lock.json` ne sme biti ispod 11.1.1;
- `firebase-admin` mora ostati na `^12.0.0` i `engines.node` na `22.x`, sa
  komentarom u testu koji objašnjava da major skok zahteva migraciju na modularne
  ulazne točke;
- `api-server.js` i dalje koristi namespace površinu koju taj pin podrazumeva.

## 5. Komande i rezultati

Gate je pokrenut tri puta u celini, svaki put čist. Prolaz A je bio pre dodavanja
Auth emulator testova, pa dva merodavna prolaza nad konačnim stablom su B i C:

| Komanda | Prolaz A | Prolaz B | Prolaz C |
| --- | --- | --- | --- |
| `npm run lint` | prolaz | prolaz | prolaz |
| `npm run test:unit` | 455/455 | 455/455 | 455/455 |
| `npm run test:rules` | 35/35 (pre Auth testova) | 39/39 | 39/39 |
| `npm run build` | prolaz | prolaz | prolaz, `check-firebase-isolation` uključen |
| `npx playwright test --project=chromium` | 56/56 | 56/56 | 56/56 |
| `npm audit --omit=dev` | **0 ranjivosti** | **0 ranjivosti** | **0 ranjivosti** |
| `npm audit` (sa dev) | 3 moderate (dev-only) | isto | isto |

Mutacione provere novog guard testa:

| Mutacija | Rezultat |
| --- | --- |
| `overrides.uuid` promenjen na `^9.0.0` | pada „uuid is pinned above the advisory range…" (2/3) |
| Jedan `uuid` unos u lock-u vraćen na `9.0.1` | pada sa porukom `node_modules/uuid resolves uuid 9.0.1, below the patched 11.1.1` (2/3) |
| Vraćeno ispravno stanje | 3/3 |

Neuspeli međukoraci i njihovo rešenje: prva verzija Auth testa je padala na dve
sopstvene asercije — `assert.rejects` sa regexom poredi poruku a ne `code`
(ispravljeno na proveru `error.code`), i pogrešna pretpostavka da emulator
prihvata opozvan token bez `checkRevoked` (asercija zamenjena zabeleženim
ograničenjem). Nijedan pad nije bio u SDK-u ni u aplikaciji.

## 6. Izmenjeni fajlovi

| Fajl | Svrha izmene |
| --- | --- |
| `package.json` | `overrides.uuid = ^11.1.1`; `test:rules` pokreće i Auth emulator |
| `package-lock.json` | `uuid` dedupiran na 11.1.1; nerazorne dev popravke |
| `firebase.json` | Dodat Auth emulator (127.0.0.1:9099) |
| `tests/rules/admin-sdk-runtime.test.js` | Novo: 5 testova stvarnog Firestore saobraćaja kroz Admin SDK |
| `tests/rules/admin-auth-runtime.test.js` | Novo: 4 testa stvarnog Auth saobraćaja, uključujući `checkRevoked` |
| `tests/unit/dependency-policy.test.js` | Novo: 3 testa koji drže pin i namespace pretpostavku |
| `reports/qa-interaction-ledger-2026-08-04.md` | Dopunjena pokrivenost Admin SDK runtime testovima |

Nijedan fajl aplikacije (`js/`, `server/`, `api-server.js`, `firestore.rules`)
nije menjan, pa je površina rizika ograničena na razrešavanje zavisnosti.

## 7. Šta je ostalo nepotvrđeno

- Tri dev-only moderate nalaza u `firebase-tools` lancu ostaju do verzije koja
  donosi zakrpljen `@google-cloud/pubsub`; unazadni skok na 14.23.0 nije opcija.
- `@google-cloud/storage` se nikad ne koristi u našem kodu, ali ga
  `firebase-admin` uvlači; njegov `gaxios`/`teeny-request` put je pinovan, a ne
  izvršavan u našim tokovima.
- Runtime dokaz je nad emulatorom. Ponašanje `google-gax` nad stvarnim gRPC
  saobraćajem prema produkcionom Firestore-u nije mereno u ovom poglavlju.
- Nadogradnja `firebase-admin` na 14 ostaje otvorena kao arhitekturna tema (ne
  bezbednosna): kada za nju bude razloga, zahteva migraciju na modularne ulazne
  točke i pun gate.

## 8. Ocena poglavlja i rollback

- Ocena: 9/10. Produkcioni audit je čist, odluka je merena a ne pretpostavljena,
  i poglavlje je usput donelo runtime dokaz Admin SDK-a koji je zatvorio otvoreni
  rizik iz Poglavlja 2. Minus su tri dev-only nalaza i to što gRPC put nije
  proveren nad produkcijom.
- Rollback: `git revert` checkpoint commita ovog poglavlja vraća `package.json`,
  `package-lock.json` i `firebase.json`; posle toga je potreban `npm ci`.
- Rizik po korisnika: nema promene u UI-u, API ugovorima ni u poslovnoj logici.

## 9. Eksterni izvori

| Izvor | URL | Datum pristupa | Nalaz |
| --- | --- | --- | --- |
| Firebase Admin Node.js SDK Release Notes | https://firebase.google.com/support/release-notes/admin/node | 2026-08-04 | N1–N3: 13.10.0 uklanja `uuid`; 14.0.0 traži Node 22+, uklanja legacy namespace i Instance ID |
| Firebase Admin Node.js SDK v14.0.0 (GitHub release) | https://github.com/firebase/firebase-admin-node/releases/tag/v14.0.0 | 2026-08-04 | Lista breaking changes za v14 |
| GitHub Advisory GHSA-w5hq-g745-h8pq (`uuid`) | https://github.com/advisories/GHSA-w5hq-g745-h8pq | 2026-08-04 | N4: pogođeni su `v3`/`v5`/`v6` sa zadatim `buf` |

Pravnih ni regulatornih tvrdnji u ovom poglavlju nema.

## 10. Predlog za Poglavlje 4

Nastavak po planu iz Poglavlja 2: životni ciklus prijave i sesija (PIN/EID
tokovi, `mustChangeLoginCode`, istek sesije, `sessionsValidAfterEpoch`, refresh i
browser back), uz zamenu preostalih statičkih access testova stvarnim HTTP
testovima nad zajedničkim gate-om.

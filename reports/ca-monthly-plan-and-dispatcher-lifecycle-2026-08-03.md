# CA mesečni plan i životni ciklus disponenta — 2026-08-03

## Sažetak

Obrađene su dve povezane Company Admin oblasti:

1. uvoz mesečnog plana cele grupe pomoću EID identifikatora;
2. trajno brisanje prethodno deaktiviranog disponenta.

Pronađeno je sedam ključnih nedostataka: nije postojao grupni mesečni uvoz, serverski preview/commit ugovor, zaštita od konkurentnih izmena, idempotentan oporavak, zvanični prazni šabloni, tastaturno dostupan upload, niti stvarno brisanje disponenta (postojeći `removeCompanyDispatcher` samo je pozivao deaktivaciju). Svi nalazi u odobrenom obimu su rešeni.

## Company Admin — planovi smena

### Povezane rute i fajlovi

- UI: `index.legacy-monolith.html`, generisani `staff.html`, `css/staff-desktop.css`
- klijent: `js/admin/company-admin-monthly-import.js`, `js/imports/group-monthly-plan.js`, `js/core/api-client.js`
- server: `api-server.js`, `server/group-monthly-plan-import.js`, `server/driver-routes.js`
- šabloni: `public/templates/BusCommand_Monthly_Group_Plan_Blank_v1.csv` i `.xlsx`

### Implementirano

- CA bira grupu, mesec, `merge` ili `replace` režim i razlog uvoza.
- CSV/XLSX zahteva samo `eid`, `date`, `duty_code`; nema uvoza imena ni autobusa.
- Lokalna validacija odbija pogrešne kolone, duplikat EID/datum, pogrešan mesec, nepodržan kod i više od 2.500 redova.
- Server ponovo proverava tenant, grupu, aktivnog vozača, EID, aktivni katalog smena, tačna vremena, revizije i postojeći raspored.
- Preview prikazuje broj vozača, dodela i uklanjanja pre objave.
- Commit je fingerprintovan, idempotentan i obrađuje upise u ograničenim batch paketima.
- Lock sprečava da disponent menja isti mesec/grupu dok traje commit; lock se oslobađa i posle neuspeha.
- `replace` uklanja samo izostavljene dodele iz izabrane grupe i meseca.
- `shifts` i `schedules` se zajedno osvežavaju, pa isti podaci hrane postojeći operativni panel disponenta.
- Dodat je audit za preview, uspešan commit i neuspešan commit.
- Upload kontrola je pravi tastaturno dostupan `button`; mobilni prikaz prelazi na jednu kolonu.

### Bezbednost

- Obe API rute zahtevaju `requireCompanyAdmin` i `requireOwnCompany`.
- EID se koristi samo za serversko razrešavanje i ne upisuje se u shift/schedule dokumente.
- Disponent ne dobija CA import kontrolu niti EID podatke.
- Klijentski preview nije autoritativan; server ponavlja sve kritične provere.
- Konkurentne izmene se odbijaju preko očekivane revizije.

## Company Admin — disponenti

### Problem

`removeCompanyDispatcher` nije brisao disponenta, već je pozivao `toggleCompanyDispatcherStatus`. UI je zato podržavao samo deaktivaciju/reaktivaciju.

### Implementirano

- Aktivan disponent mora prvo biti deaktiviran.
- Kod deaktiviranog disponenta pojavljuje se posebna destruktivna akcija „Trajno obriši“.
- Potvrda jasno navodi da se uklanjaju login i aktivni profil, dok istorijski planovi i audit ostaju.
- Novi `DELETE /api/company-admin/dispatchers/:uid` zahteva CA ulogu, isti tenant i potvrdu tačne email adrese.
- Server označava brisanje u toku, briše Firebase Auth nalog, zatim tenant profil i zapisuje `dispatcher_deleted` audit događaj.
- Prekinuto brisanje ostaje bezbedno za ponovni pokušaj; ponovno aktiviranje tokom brisanja je blokirano.

## Testovi i komande

- `npm run lint` — prošao.
- `npm run test:unit` — 434/434 prošlo.
- `npm run build` — prošao; Firebase isolation provera prošla.
- `npx playwright test --project=chromium` — 56/56 prošlo.
- `npm run test:rules` — nije pokrenut emulator jer Java nije instalirana na sistemu (`Could not spawn java -version`).
- `npm audit --omit=dev` — prijavljeno 8 moderate nalaza u `firebase-admin` tranzitivnim zavisnostima; automatska potpuna popravka zahteva breaking prelazak na `firebase-admin@14.2.0`, pa nadogradnja nije urađena u ovom poglavlju.
- `git -c core.whitespace=cr-at-eol diff --check` — prošao.

## Eksterni izvori

Nisu korišćene pravne tvrdnje niti eksterne regulatorne interpretacije. Odluka da istorijski planovi i audit zapisi ostanu sačuvani je bezbednosna i poslovna mera, a ne tvrdnja o konkretnom zakonskom roku čuvanja.

## Preostali rizici

- Produkcioni Firebase preview/commit i Auth delete nisu izvršeni bez produkcionih/testnih Firebase kredencijala; pokriveni su unit i browser mock testovima.
- Firestore emulator testovi zahtevaju instaliranu Javu.
- Pravni rok čuvanja istorijskih planova i audit evidencije mora potvrditi pravnik/računovođa za konkretnu firmu i državu.
- Nadogradnju `firebase-admin` radi uklanjanja moderate npm audit nalaza treba planirati kao posebno kompatibilnosno poglavlje.

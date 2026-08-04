# BusCommand QA interaction ledger — 2026-08-04

## Svrha i status

Ovaj ledger je početni inventar, ne potvrda da je svaki element već funkcionalno testiran.
Koristi sledeće oznake:

- **Funkcionalno** — test izvršava poslovnu logiku, HTTP/rules tok ili stvarnu browser interakciju.
- **Delimično** — postoji funkcionalni smoke za deo toka, dok drugi elementi imaju samo unit ili statičku proveru.
- **Statički** — test proverava source/HTML wiring, ali ne izvršava ceo tok.
- **Nepokriveno** — nije pronađen funkcionalni automatizovani dokaz.

Početni obim aplikacije:

- 27 glavnih UI sekcija u `index.legacy-monolith.html`;
- 47 Express route deklaracija u `api-server.js`;
- 28 route deklaracija u `server/driver-routes.js`;
- 100 statičkih delegated-action atributa u HTML izvoru;
- 105 `actionAttr` / `changeAttr` deklaracionih mesta u JS modulima;
- 434 unit testa, 24 Firestore Rules testa i 56 Chromium E2E testa;
- 10 Playwright spec fajlova i 2 Rules test fajla.

Brojevi predstavljaju deklaraciona mesta. Dinamičke liste mogu proizvesti više stvarnih dugmadi i polja.

## Površine po ulozi

### Vozač

- `driver-dashboard` — **delimično**. Browser pokriva EID/kod prijavu (demo), nepotpune podatke i osnovni dashboard. Produkcioni Firebase login nije browser-testiran; HTTP login lifecycle je funkcionalno pokriven unit testovima.
- `driver-calendar` — **delimično**. Browser pokriva promenu meseca i dodeljene podatke; timezone/DST ostaje unit-only.
- `driver-reports` — **delimično**. Browser pokriva kašnjenje/kvar i sprečavanje duplog slanja; pravi Firebase/API lanac nije end-to-end potvrđen.
- `driver-vacation` — **delimično**. Browser pokriva validiran zahtev i disponentovo odobrenje u demo režimu.
- Poruke, arhiviranje, pronađeni predmet i SOS — **delimično** kroz `tests/e2e/ui-smoke.spec.js`.
- Aktivacija vozača — **delimično**. Modal, Escape/backdrop/back i 320 px viewport su funkcionalno pokriveni; produkcioni OTP/SMS provider nije.
- Offline/reconnect/service-worker queue — **nepokriveno funkcionalno**.
- GPS i serverska radna sesija — **Rules/unit delimično**; nema browser dokaza.

### Super Admin

- `superadmin-dashboard` — **pretežno unit/statički**.
- API pregled, tenant status, kreiranje/brisanje firme, Company Admin lifecycle i support session imaju handler/unit testove, ali nema autentifikovanog Super Admin Playwright lifecycle-a.
- `/api/admin/overview` ima samo funkcionalan neautentifikovani 401 smoke.
- Zaključak: Super Admin je trenutno najslabije browser-pokrivena uloga.

### Company Admin

- `company-admin-dashboard` — **funkcionalno delimično**: tenant scope, readiness i responsive pregled.
- `company-admin-branding` — **funkcionalno** za preview, validaciju i demo save.
- `company-admin-groups` — **funkcionalno** za create/edit/filter i bezbedno brisanje prazne grupe.
- `company-admin-service-plan` — **funkcionalno delimično**: XLSX publish/history i grupni mesečni import. Mesečni preview/commit browser test mockuje HTTP odgovor.
- `company-admin-drivers` — **funkcionalno delimično**: import, filteri i account kontrole u demo režimu.
- `company-admin-audit` — **delimično**: browser proverava prazno/truthful stanje; produkcioni audit listing je unit-testiran.
- `company-admin-team` — **funkcionalno** u demo browser toku: kreiranje, grupe, deaktivacija, mobilni overflow i trajno brisanje.
- `company-admin-settings` — **funkcionalno delimično**: validacija, jezik, timezone i CSV export.
- CA read-only operativni pristup — **funkcionalno** kroz `ch2-ops-readonly-lock.spec.js`.
- Nedostaje produkcioni Firebase browser pass i HTTP integration za većinu privilegovanih mutacija.

### Disponent

- `dispatcher-dashboard` — **funkcionalno delimično**: cockpit fokus, problem-resolution i statusi.
- `dispatcher-shifts` — **delimično**: assignment browser smoke; API revision conflict nije HTTP integration testiran.
- `dispatcher-daily-schedule` — **delimično**.
- `dispatcher-daily-plan-pick` i `dispatcher-daily-plan-full` — **funkcionalno delimično**.
- `dispatcher-monthly-plan-pick` i `dispatcher-monthly-plans-full` — **delimično**.
- `dispatcher-group-hub` — **funkcionalno** za ulazak, navigaciju i empty import state.
- `dispatcher-live-map-section` — **statički/Rules delimično**; nema stvarne GPS browser provere.
- `dispatcher-reports` — **funkcionalno delimično** za generički problem i verifikovanu rezoluciju.
- `dispatcher-lost-found` — **delimično**; driver create postoji, staff lifecycle nije HTTP-integraciono pokriven.
- `dispatcher-vacations` — **funkcionalno delimično** kroz demo approval.
- `dispatcher-messages` — **delimično**; nema punog broadcast/delivery/retry E2E toka.
- Bus import, multi-group pool i cross-group upozorenje — **funkcionalno** kroz posebne Playwright specifikacije.
- Edit lock — **funkcionalno delimično** za dve demo identity vrednosti; nema stvarne paralelne API trke.

## API i serverski tokovi

### Funkcionalno potvrđene klase

- javni health/config i fail-closed API smoke;
- auth/tenant/provisioning poslovna logika sa fake Auth/Firestore servisima;
- service-plan parser/publish/history poslovna logika;
- grupni mesečni preview/commit servisna logika;
- shift revision i plan-lock algoritmi;
- audit redaction, export escaping i rate-limit helperi;
- Firestore deny-by-default, cross-tenant, server-owned writes, credential deny i session/location pravila.

### Statički ili delimično potvrđene klase

- većina `company-admin/*` route middleware lanaca ima source assertion, ne pravi HTTP 401/403/404/409 integration test;
- staff messages, SOS/lost-items, vacations, reports i operational incidents imaju kombinaciju unit/source/demo testova;
- scheduler/outbox, retry i restart imaju poslovne unit testove, ne izvršen job lifecycle;
- mesečni import browser test mockuje `/preview` i `/commit`;
- produkcioni Firebase token revocation i Auth delete nisu izvršeni u browser testu.

### Nepokrivene kritične klase

- autentifikovan Super Admin HTTP/browser lifecycle;
- cross-tenant negativni HTTP testovi za prioritetne object ID rute;
- realni HTTP monthly-import commit protiv kontrolisanog Firebase test tenanta;
- paralelni disponenti sa stvarnim revision konfliktom;
- backup/restore i disaster-recovery proba;
- provider delivery za SMS/email/push.

## Polja, validacija i interakcije

Trenutni testovi dobro pokrivaju:

- Zod šeme za identitet, grupe, branding, settings i dispatcher lifecycle;
- CSV/XLSX/PDF parsere i obavezna polja;
- frontend required/format greške u važnim CA i driver formama;
- single-submission zaštitu za nekoliko kritičnih akcija;
- mobilni overflow za CA team i 320 px activation modal;
- SR/DE/EN key parity i odabrane bezbednosne poruke.

Nije još sistematski pokriveno:

- keyboard-only prolazak kroz svako polje i modal;
- tab redosled, focus return i focus trap za sve modale;
- svako disabled/read-only/loading/error/success stanje;
- svaki reset filtera, browser back/forward i direct URL;
- spor mrežni odgovor, prekid veze i session expiry za svaki submit;
- corrupt/oversize upload za sve podržane import ekrane;
- automatski WCAG/axe smoke;
- browser promena jezika kroz sve četiri uloge.

## Firestore Rules početna matrica

Funkcionalno je izvršeno 24/24 emulator testova:

- unauthenticated deny;
- `mustChangeLoginCode` deny;
- sopstveni driver profil i poruke;
- server-only master profile, grupe, operativne kolekcije i credentials;
- dispatcher/Company Admin tenant granice;
- group-scoped reports;
- deactivated driver/dispatcher deny;
- session-gated location write i protected profile fields.

Poglavlje 2 mora eksplicitno proveriti kolekcije/tokove koji nisu pojedinačno imenovani u trenutnoj Rules matrici, posebno service plan, monthly import metadata, confirmation outbox, support session i shift confirmations.

### Ažuriranje posle Poglavlja 2

Rules matrica je 30/30. Novo pokriveno funkcionalno:

- SuperAdmin nadzor je read-only, pisanje po tenant kolekcijama odbijeno;
- korenski dokument firme server-owned za sve uloge;
- `monthly_plan_imports`, `monthly_plan_import_locks`, `plan_locks` i `ops`
  nedostupni tenant klijentima za čitanje i pisanje;
- support sesije čitljive samo vlasniku tenanta, nikad klijentski upisive;
- audit log admin-readable, tenant-scoped i nepromenljiv iz pretraživača.

Serverska autorizacija je prešla iz „statički“ u „funkcionalno“ za zajednički
staff gate: `tests/unit/staff-auth-http.test.js` izvršava stvarne 401/403/400/200/503
odgovore, uključujući tuđi tenant, neaktivan profil, „role drift“, grupe iz
profila i member-only licencni endpoint. Statičke provere u
`company-admin-groups-access`, `company-admin-branding-access`,
`company-admin-settings-access` i `dispatcher-report-access` ostaju statičke i
predviđene su za konverziju u narednom poglavlju.

### Ažuriranje posle Poglavlja 3

Emulator matrica je 39/39, jer je uz Firestore dodat i Auth emulator. Novo
pokriveno funkcionalno, kroz stvarni Admin SDK saobraćaj a ne kroz mokove:

- Firestore sentineli i tipovi: `serverTimestamp`, `Timestamp.fromDate`,
  `arrayUnion`, `FieldValue.delete`;
- transakcije sa read-then-write i batched write sa mešanim `set`/`delete`;
- `count()` agregacija i `select()` projekcija;
- životni ciklus naloga: `createUser`, `setCustomUserClaims`, `getUser`,
  `getUserByEmail`, `updateUser({disabled})`, `deleteUser`;
- `createCustomToken` → razmena za ID token → `verifyIdToken` sa tenant
  claims-ovima i `auth_time`.

Time je zatvoren otvoreni rizik iz Poglavlja 2: `checkRevoked` više nije dokazan
samo lažnim Admin SDK slojem — `revokeRefreshTokens` stvarno odbija ranije izdat
token sa `auth/id-token-revoked`. Ostaje ograničenje da emulator odbija opozvan
token i bez te zastavice, pa razlika između dva režima nije merljiva lokalno.

### Ažuriranje posle Poglavlja 4

Auth lifecycle je prešao iz delimično/statički u **funkcionalno** za vozačku
prijavu i staff session cut-off. Emulator matrica je 40/40; unit 464; E2E 57.

Novo pokriveno funkcionalno:

- jednokoračna vozačka prijava (EID + kod) bez identify orakla;
- account lockout (10 neuspeha / 15 min) i `COMPANY_SUSPENDED`;
- `checkRevoked` na `/api/driver` i activate-personal-code (HTTP test + mutacija);
- `sessionsValidAfterEpoch` na Express staff gate (`SESSION_SUPERSEDED`);
- identify → `410`; legacy PIN i hash-pin → `404`;
- uklonjen SuperAdmin modal / `handleLogoClick` sa vozačke površine.

Vozački dashboard i dalje je **delimično** za produkcioni Firebase browser pass;
staff email login lifecycle ostaje E2E u demo režimu. Super Admin browser
lifecycle ostaje najslabija uloga.

## Sledeći dokazivi koraci

Redosled iz master prompta v3.2 §27:

1. ~~RBAC / Rules / tenant~~ (P2);
2. ~~zavisnosti / audit~~ (P3);
3. ~~login lifecycle~~ (P4);
4. ~~dizajn sistem i tokeni~~ (P5);
5. ~~kanonski plan i revizije~~ (P6);
6. ~~CA katalog~~ (P7);
7. ~~mesečni plan~~ (P8) — undo, sticky/matrix, mass absence, catalog lock;
8. ~~dnevni plan / problem-resolution / cockpit~~ (P9);
9. ~~scheduler/outbox~~ (P10) — invalidate, expired, bound revision, max retry;
10. ~~poruke~~ (P11) — lifecycle, critical ack, multi-group, server archive;
11. ~~driver session/GPS/mapa~~ (P12) — liveGps OFF, current-point, map audit;
12. ~~PWA / offline~~ (P13) — SW scope, queue+idempotency, network banner;
13. ~~Pronađeni predmeti~~ (P14) — status triad, photo, foundAt, staff filter;
14. ~~SA/CA kompletiranje~~ (P15) — RO fleet, tenant settings PATCH, health;
15. i18n/a11y, staging acceptance.

### Ažuriranje posle Poglavlja 14

Lost-item status triad + audited staff transitions; optional photo with
client EXIF strip and server reject; foundAt persistence; staff filters.
Gate: unit 518, rules 40, E2E 57.

### Ažuriranje posle Poglavlja 15

CA read-only buses surface; SA audited plan/limits/flags PATCH; platform
health strip; RO login-profile card. O1–O5 i dalje otvoreni. Gate: unit 521,
rules 40, E2E 57.

Svaka stavka prelazi iz „delimično/statički/nepokriveno“ u „funkcionalno“ samo kada postoji izvršen dokaz odgovarajućeg nivoa.

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

- `driver-dashboard` — **delimično**. Browser pokriva PIN prijavu, nepotpune podatke i osnovni dashboard. Produkcioni Firebase/EID login nije browser-testiran.
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
predviđene su za konverziju u Poglavlju 3.

## Sledeći dokazivi koraci

Redosled ostaje iz master prompta v3.1:

1. RBAC, Firestore Rules i tenant izolacija;
2. četiri login lifecycle-a;
3. kanonski plan i revizije;
4. CA katalog i mesečni plan;
5. dnevni plan i problem-resolution;
6. scheduler/outbox i poruke;
7. driver session/GPS/PWA offline;
8. SA/CA kompletiranje;
9. i18n/accessibility;
10. završni click/field integration ledger, test cleanup i staging acceptance.

Svaka stavka prelazi iz „delimično/statički/nepokriveno“ u „funkcionalno“ samo kada postoji izvršen dokaz odgovarajućeg nivoa.

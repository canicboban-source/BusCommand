# Dnevnik odluka

Vodi se prema §34 master prompta. Zatvorena odluka se ne prepisuje — menja se
samo novim unosom koji se poziva na stari.

Legenda statusa: **Odlučeno** · **Otvoreno** (čeka vlasnika) · **Privremeno**
(implementirana konzervativna varijanta dok odluka ne stigne).

---

## Zatvorene odluke

### D1 — Granica proizvoda: disponentski panel

- Datum: 2026-08-04 · Status: **Odlučeno**
- Pitanje: opšta pravila zadatka opisuju module vozila, goriva, održavanja,
  faktura, troškova i putnih naloga. Nijedan ne postoji u kodu. Da li se grade?
- Odluka vlasnika: ne. Disponentski panel je glavni proizvod. Bez goriva,
  servisa, delova, knjigovodstva, obračuna sati i putnih naloga. Naknadna
  nadogradnja je moguća, ali kao zaseban projekat.
- Posledica u kodu: `docs/BusCommand-MASTER-PROMPT.md` §1.4; autobus ostaje samo
  kao entitet za dodelu smeni, ne kao modul voznog parka.

### D2 — Master prompt v3.2

- Datum: 2026-08-04 · Status: **Odlučeno**
- Pitanje: da li se v3.1 dopunjuje merljivim kriterijumima i novim artefaktima?
- Odluka vlasnika: da, sa svih šest predloženih dopuna, plus rešenje konflikta
  oko autonomije.
- Posledica u kodu: §A.8, §1.4, §27, §30, §31 i nova poglavlja §32–§36.

### D3 — Staging okruženje

- Datum: 2026-08-04 · Status: **Odlučeno**, čeka izvršenje (vidi O1)
- Pitanje: da li se dokazi ograničavaju na emulator ili se uvodi staging?
- Odluka vlasnika: uvodi se zaseban staging Firebase projekat sa dozvolom za
  deploy pravila.
- Posledica u kodu: §36; do isporuke kredencijala rad se nastavlja nad
  emulatorom, uz jasno označavanje šta ostaje nepotvrđeno.

### D4 — Autonomija između poglavlja

- Datum: 2026-08-04 · Status: **Odlučeno**
- Pitanje: v3.1 §A.8 je tražio potvrdu pre svakog sledećeg poglavlja, dok
  operativna uputstva vlasnika traže neprekidan rad. Konflikt je blokirao tok.
- Odluka vlasnika: poglavlja teku bez potvrde, uz obavezan checkpoint, izveštaj i
  čist gate. Izričito odobrenje ostaje za deploy, produkcione podatke i promenu
  obima.

### D5 — Vozačka prijava: jedan korak, bez EID orakla

- Datum: 2026-08-04 · Status: **Odlučeno** (implementacija u Poglavlju 4)
- Pitanje: da li `/api/public/drivers/identify` sme da potvrdi postojanje EID-a
  pre unosa koda?
- Odluka (tehnička, konzervativna, usklađena sa §4 privacy): ne. Prijava je
  `firma + EID + kod` u jednom koraku; identify vraća `410`; nepoznat EID i
  pogrešan kod daju isti odgovor. Lockout: 10 neuspeha / 15 minuta.
- Posledica u kodu: `server/driver-routes.js`, `js/auth/login-driver.js`,
  `js/core/auth-client.js`. Dužina koda i dalje pod O3.

### D6 — Kanonski plan: shifts SoT, schedules mirror

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 6)
- Pitanje: da li su `shifts` i `schedules` dva izvora istine?
- Odluka: ne. `shifts/{driverId}_{date}` je kanonski; `schedules` je
  server-owned mesečna projekcija. Optimistic concurrency preko `revision` +
  `expectedRevision`; potvrda vezana za `confirmationBoundRevision`.
- Posledica: `docs/canonical-plan-model.md`, `server/shift-assignment.js`,
  `js/core/shift-plan.js`, `js/dispatcher/shifts.js`.

### D7 — Katalog smena: stage pa activate

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 7)
- Pitanje: da li publish odmah aktivira katalog?
- Odluka: ne. `publish` čuva nepromenljivu `staged` verziju sa `sourceHash`;
  `activate` atomski prebacuje live pointer i supersede-uje prethodni active.
  Rollback = activate ranije superseded verzije (audit `service_plan_rolled_back`).
- Posledica: `server/service-plans.js`, CA sticky „Aktiviraj katalog“.

### D8 — Mesečni plan: undo + aktivni katalog + bez dispo bulk importa

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 8) — tačka 3 **zamenjena** odlukom **D21** (2026-08-07)
- Odluka:
  1. Kontrolisani undo = jedan nivo `priorSnapshot` + soft-clear tombstone;
     audit `shift_undone`; bez brisanja istorije.
  2. Edit modal nudi samo šifre aktivnog (locked) CA kataloga; bez izmišljenih
     fallback F/S kodova.
  3. ~~Disponentski bulk uvoz mesečnog plana ostaje sakriven…~~ → vidi **D21**.
  4. Masovno odsustvo (off/vacation/sick) samo uz preview + potvrdu; svaki dan
     ide kroz postojeći `PUT …/assignment`.
- Posledica: `server/shift-assignment.js`, `POST …/assignment/undo`,
  `js/dispatcher/monthly-plans.js`.

### D21 — CA = V66/katalog; Dispo = mesečne dodele vozača (uvoz + edit)

- Datum: 2026-08-07 · Status: **Odlučeno** (vlasnik, eksplicitno)
- Pitanje: ko uvozi mesečne planove vozača vs plan vožnje (V66)?
- Odluka vlasnika:
  1. CA formira grupe, dodeljuje dispečere i uvozi **plan vožnje / V66 (katalog
     smena)**. CA **nema** pravo uvoza mesečnih planova vozača (EID/date/duty).
  2. Dispo **uvozi i edituje** mesečne planove vozača (smene, busevi, statusi);
     Ops radi iz tih dodela + aktivnog CA kataloga.
  3. Dispo i dalje **nikada** ne vidi EID, PIN niti credential podatke.
- Posledica: uklonjen CA monthly-import UI; CA preview/commit API → 403;
  Dispo uvoz omogućen na mesečnom planu (ime → driverId, bez EID);
  Ultimate §4 hard rule 1 usklađen; D8.3 zamenjen.

### D9 — Problem lifecycle + vehicle out + ops activity

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 9)
- Odluka:
  1. Generički statusi: `open → acknowledged → solution_proposed → applying →
     resolved|cancelled` (legacy `active` = `open`).
  2. Incident nosi `revision`, `assigneeId`, `affectedEntity` (driver|vehicle).
  3. Resolve šalje best-effort poruku relevantnim vozačima; pun outbox ostaje P10.
  4. Cockpit čita `GET /api/staff/ops-activity` (Admin SDK), ne direktan
     client `audit_log`.
- Posledica: `server/problem-resolution.js`, ops transition/activity rute.

### D10 — Confirmations: invalidate + expired + max retry

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 10)
- Odluka:
  1. Svaka staff mutate (assign/clear/undo) i incident resolve briše
     `shift_confirmations` i otkazuje outbox red (`cancelled` + razlog).
  2. Driver potvrda stampuje `confirmationBoundRevision` = trenutna revizija
     smene; staff GET ne računa stale potvrde (fingerprint / cancelled).
  3. Attention uključuje **expired** (targetDate < tenant today) pored
     pending / awaiting / delivery_failed.
  4. Max 8 dispatch pokušaja → `terminalFailure`; scheduler flag ostaje OFF
     by default; re-enqueue na sledećoj aktivnoj work-session.
- Posledica: `server/confirmation-outbox.js`, `server/confirmation-scheduler.js`,
  staff/driver confirmation rute, cockpit statusi.

### D11 — Poruke: lifecycle + kritični ack + server archive

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 11)
- Odluka:
  1. Message doc nosi `status` (`queued|sent|delivered|read|failed`); in-app
     kanal = `delivered` u trenutku Admin SDK write-a.
  2. Kritična potvrda: `requiresAck` (checkbox ili urgent šablon); driver
     `PUT …/ack`; arhiva blokirana dok nema ack-a.
  3. Multi-group: `groupIds[]` uz ACL po grupi i dedupe vozača.
  4. Staff archive samo preko `PUT /api/staff/messages/:id/archive`; client
     sync više ne piše `messages`.
- Posledica: `server/message-lifecycle.js`, `server/staff-messages.js`,
  compose/history/driver inbox.

### D12 — Session/GPS: liveGps OFF + current-point only

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 12)
- Odluka:
  1. `features.liveGps` default **false**; watcher i upload samo kad je
     `=== true` i sesija `active`.
  2. Server čuva samo trenutnu tačku (`lastLocation`), ne trail; briše se
     van smene. O2 retention i dalje otvoren — bez istorijskog GPS store-a.
  3. Staff mapa: group filter + audit `staff_map_access` (bez koordinata u
     audit detalju).
  4. Push login reminder ostaje stub (channel=none) do Ch11/Ch14 providera.
- Posledica: `server/driver-location.js`, work-session/GPS/map klijent.

### D13 — PWA offline: uski SW scope + queue samo za ne-kritično

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 13)
- Odluka:
  1. Driver SW registracija i manifest scope = `/driver.html`; fetch
     allowlist odbija `/api/*`, staff i landing.
  2. Offline queue samo za reports/lost-items uz `idempotencyKey` i status
     „čeka slanje“; SOS, potvrde smena i odmor zahtevaju mrežu.
  3. Server dedupe preko `idem_{uid}_{key}` doc id (bez composite indexa).
  4. TTL 8h snapshot smene/poruka; clear queue+snapshot+Cache API na logout.
- Posledica: `sw-driver.js`, `offline-queue.js`, driver report rute.

### D14 — Pronađeni predmeti: triad + foto bez Storage SDK-a

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 14)
- Odluka:
  1. Statusi: `in_depot` | `stays_on_bus` | `returned` (returned terminal).
  2. Driver bira open status; staff menja među open + return; audit
     `lost_item_status_changed` (+ legacy `lost_item_returned`).
  3. Opciona foto: klijent canvas re-encode (EXIF strip), server magic +
     JPEG APP1 reject; čuva se na item doc-u (ne Firebase Storage još).
  4. `foundAt`/`date`/`time` uvek persistuju se pri create.
- Posledica: `server/lost-item-lifecycle.js`, driver/staff lost-item UI.

### D15 — SA/CA: RO flota + audited tenant settings

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 15)
- Odluka:
  1. CA vidi flotu read-only (`company-admin-buses`); mutate ostaje dispatcher.
  2. SA `PATCH /api/admin/company/:id/settings` za plan/limite/trial/flagove
     (allowlist); audit `company_settings_patched`.
  3. SA health strip iz `/api/health` (version/mode/uptime).
  4. CA login-profil kartica je RO do O3/O4; liveGps flag menjanje ne
     zamenjuje O2 retention odluku.
- Posledica: `superadmin-tenant-settings.js`, CA buses, SA detail settings.

### D16 — i18n/a11y soft-pilot bez full redesign-a

- Datum: 2026-08-05 · Status: **Odlučeno** (Poglavlje 16)
- Odluka:
  1. Soft-pilot jezici ostaju EN/DE/SR; novi operativni stringovi idu kroz
     `translations.js` (parity test).
  2. Overlay dialogs (SOS, confirm, generic modals) koriste shared
     `focus-trap.js` (Tab cycle + Escape) i `role="dialog"` / `aria-modal`.
  3. Ops status rail boje koriste design tokene, ne raw hex.
  4. §20 vizuelne korekcije (urgent-action, sticky katalog, jedan SOS)
     ostaju obavezne; pun axe CI i kompletna WCAG matrica nisu u ovom
     poglavlju.
- Posledica: Ch16 ključevi, SOS a11y, focus trap, tokenizovani ops rail.

### D17 — Soft-pilot performance budgets

- Datum: 2026-08-05 · Status: **Odlučeno** (Poglavlje 17)
- Odluka:
  1. §35 ne definiše KB/TTI; soft-pilot budžeti su:
     - driver app JS excl. translations ≤ 220 KB raw;
     - staff app JS excl. translations ≤ 530 KB raw (D21/D22 + health/plan-gap + month edit sync + SU demo table/detail + demo support/suspend/typed-delete parity);
     - max single driver chunk ≤ 150 KB;
     - translations chunk ≤ 360 KB;
     - driver ne sme ugraditi dispatcher UI implementaciju.
  2. `npm run build` mora pasti ako budžeti padnu (`check-bundle-budgets.js`).
  3. Lucide CDN mora biti pinned (ne `@latest`); PDF.js/SheetJS lazy na first use.
  4. Staff list hot-path (confirmations/messages) koristi date/group scoped
     queries umesto full-collection scan gde je bezbedno.
  5. Produkciona TTI/API latencija se ne tvrdi do staginga (O1 / §36).
- Posledica: surface-split observer, i18n dynamic import, office-parsers,
  API caps, budget gate.

---

### D18 — Poznate linije vozača (knownGroupIds)

- Datum: 2026-08-06 · Status: **Odlučeno**
- Pitanje: da li CA unosi linije koje vozač zna (310, 550…) da Dispo brže bira zamenu?
- Odluka vlasnika: da. Polje `knownGroupIds` na vozaču; matična grupa je uvek
  uključena; **samo CA** unosi i **uvek može menjati** spisak (npr. kad vozač
  nauči novu liniju). Dispo vidi hint/redosled u Needs attention poolu, ne
  uređuje polje i ne vidi credentials.
- Posledica: `server/validation.js`, CA edit modal, `ops-attention` sort/label.

### D18.1 — Uska server projekcija za other-group zamene (FAZA 1 follow-up)

- Datum: 2026-08-09 · Status: **Odlučeno** (odobreno; implementacija nije pokrenuta u ovom STOP)
- Pitanje: kako Dispo dobija dostupne other-group zamene posle zatvaranja
  Firestore direktorijuma / `knownGroupIds` client expansion (v4.1 FAZA 1)?
- Odluka vlasnika: da — **uska server projekcija** za dostupne other-group zamene.
- Obavezni uslovi:
  1. **Tenant-bound** — companyId samo iz autentikovane staff sesije; klijent ne bira `companyId`.
  2. **Server-authoritative** — Admin SDK / API; direktni Firestore direktorijum ostaje zatvoren.
  3. **Bounded** — strogo ograničen broj kandidata (cap); bez company-wide dump-a.
  4. **Data-minimal** — ne sme vraćati EID, PIN, login kod, hash, telefon, email niti kompletan profil.
  5. **Mutation re-check** — konačna assignment/resolve mutacija mora ponovo proveriti
     group scope, dostupnost, konflikt i `revision` (klijent nije autoritet).
  6. **Nema nove kolekcije ni promene šeme** bez posebnog owner odobrenja.
- Posledica (kad se implementira, van ovog STOP-a): postojeći ili eksplicitno
  odobren API surface + Needs Attention pool čita samo projekciju; FAZA 2 ne
  kreće dok vlasnik ne pošalje `NASTAVI FAZU 2`.

### D19 — Adresa / proximity (odloženo)

- Datum: 2026-08-06 · Status: **Odlučeno** (odloženo za kasnije)
- Pitanje: puna adresa vs sistemski proximity za rangiranje zamene?
- Odluka vlasnika: Dispo **ne** vidi punu adresu. Ako ikad uđe, sistem može
  koristiti zonu/PTT samo za redosled; UI dobija samo rank/label. **Nije u
  ovom ciklusu** — prvo known lines (CA), zatim garaža na busu (**Dispo**, vidi D20).

### D20 — Vlasništvo master podataka: CA = vozači, Dispo = busovi

- Datum: 2026-08-06 · Status: **Odlučeno**
- Pitanje: ko unosi i održava vozače vs busove?
- Odluka vlasnika:
  - **Company Admin** — vozači: profil, matična grupa, `knownGroupIds`, uvoz
    vozača; Dispo to ne uređuje.
  - **Disponent** — autobusi: unos, grupna pripadnost, garaža/status kad se
    uvede, operativna dodela i zamena pri kvaru; CA nije vlasnik bus operativa.
- Posledica: known lines samo u CA edit/API; Needs attention čita CA podatke
  za vozače i Dispo-održane busove za vozila. Budući bus garage UI = Dispo.

### D21 — Bus opsStatus + garage (Dispo edit)

- Datum: 2026-08-06 · Status: **Odlučeno** (implementacija korak 2)
- Polja na bus dokumentu:
  - `garage` — slobodan tekst (max 40), uvek menjiv od Dispa
  - `opsStatus` — `ready | breakdown | technical | out`
  - `active` — i dalje hard on/off (deactivate); ostaje odvojeno
- Needs attention / coverage: samo `active !== false` i `opsStatus === ready`
  (osim keep trenutnog busa na smeni).
- UI: Group Hub lista — inline edit garaže i statusa.

### D22 — Dispo concurrency bez „šta/zašto“ polja

- Datum: 2026-08-06 · Status: **Odlučeno**
- Cilj: ušteda Dispo vremena — nema opisnih polja za razlog izmene.
- Zabrana: dva disponenta ne smeju uspešno upisati različite izmene za
  **istog vozača** (postojeći shift `expectedRevision`), **isti bus**
  (`bus.revision` + `expectedRevision`), **istu garažu** (kratki soft lock
  po labeli garaže, 2 min, po `holderUid`).
- UX pri konfliktu: toast „osvežite“ + lokalni state osvežen iz servera; bez
  forme za opis konflikta.

### D23 — UI jezici proizvoda: samo en / de / sr

- Datum: 2026-08-09 · Status: **Odlučeno** (FAZA 2R-B)
- Odluka:
  1. BusCommand trenutno podržava isključivo `en`, `de`, `sr`.
  2. Ostali jezici nisu deo proizvoda niti trenutnog pravca razvoja
     (uključujući `hr`, `es`, `fr`, `it`, `tr`, `pl`, `pt`, `nl`, `ro`,
     `hu`, `cs`, `sk`, `bg`).
  3. Novi jezik se ubuduće dodaje pojedinačno, samo nakon posebne owner
     odluke i kompletnog prevoda/testova.
  4. Nepodržan stari persisted jezik (`buscommand_lang` / tenant state)
     mora bezbedno pasti na `en` i normalizovati storage.
  5. Nedostajući ključ u DE/SR i dalje pada na EN string (EN fallback).
- Posledica: `Object.keys(TRANSLATIONS) === ["de","en","sr"]`; login/header/
  settings selektori i server `defaultLanguage` ostaju usklađeni; D17
  translations budget se zatvara bez skraćivanja stvarnih EN/DE/SR ključeva.

### D24 — Assignment resource integrity: hard fail (no warn-but-save)

- Datum: 2026-08-09 · Status: **Odlučeno** (FAZA 3 / Ultimate §9)
- Odluka:
  1. Server je autoritet za dodelu autobusa/smena: postoji, pool, `active`,
     `opsStatus === ready` (osim keep-current), vremensko preklapanje, duty
     katalog kada je kod prosleđen.
  2. Stabilni 409 kodovi: `BUS_NOT_FOUND`, `BUS_INACTIVE`, `BUS_NOT_AVAILABLE`,
     `BUS_OUTSIDE_GROUP`, `BUS_DOUBLE_BOOKED`, `DUTY_*`, `REVISION_CONFLICT`.
  3. Soft „warn but saves“ za cross-group bus je zabranjen — lokalni preflight
     i server blokiraju upis.
  4. CA ručno dodavanje vozača je atomsko (`POST /api/company-admin/drivers`):
     profil + credentials + PIN + known groups u jednom batch-u; PIN/OTP nikada
     u auditu.
- Posledica: `server/assignment-resource-guard.js`, `PUT …/shifts/assignment`,
  `js/dispatcher/shifts.js`, ukinut warn-but-save E2E.

### D24.1 — EID isolation + transactional assignment revalidation

- Datum: 2026-08-09 · Status: **Odlučeno** (FAZA 3 security correction)
- Odluka:
  1. EID postoji samo u server-only `driver_credentials`; profil i Dispo
     Firestore dokumenti ne smeju ga sadržati.
  2. CA GET spaja EID iz credentials u API odgovor; zabranjen backfill na profil.
  3. Rules fail-closed: Dispo ne čita driver profil koji i dalje nosi
     credential polja (`eid`/PIN/hash…); čist profil ostaje čitljiv; CA
     own-tenant read nepromenjen.
  4. LIVE bus / driver scope / duty katalog se revalidiraju unutar iste
     mutation transakcije kao shift write; sva čitanja pre prvog write-a.
  5. Parallel EID/license uniqueness preko različitih novih doc ID-eva zahteva
     reservation dokument (nova šema) — **nije implementirano**; traži posebnu
     owner odluku. Sekvencijalni EID_EXISTS / DRIVER_LIMIT_REACHED ostaju.
- Posledica: `server/company-admin-driver-ops.js`, `getActiveServicePlanInTx`,
  Rules `driverProfileExposesCredentials`, executable emulator HTTP dokazi.

### D24.1.1 — Assignment/auth/migration closeout (no uniqueness schema)

- Datum: 2026-08-09 · Status: **Odlučeno**
- Odluka:
  1. LIVE staff u mutation tx: dokument mora postojati, `active !== false`,
     role `dispatcher`, LIVE `groups` jedini autoritet — bez fallbacka na claims.
  2. Day-lock grupa mora ostati LIVE home group (`DRIVER_SCOPE_CHANGED` inače);
     neaktivnom vozaču zabranjena nova dodela; `clear` dozvoljen za uklanjanje.
  3. Credential dirty = key ownership (uključujući `null`); Rules blokiraju
     Dispo / own-driver / SA browser; CA own-tenant ostaje radi migracije.
  4. CA create čita home/known grupe u istoj transakciji pre write-ova.
  5. Budući rollout (ne sada): clean server writes → dry-run → backup/verify →
     apply migration → zero-dirty verify → Rules deploy.
  6. D24.2 uniqueness guard bio zabranjen ovde; **odobren i zatvoren u D24.2**.
- Posledica: `STAFF_SESSION_INVALID`, `DRIVER_SCOPE_CHANGED`, `DRIVER_INACTIVE`,
  null-key migration, `register-company-admin-drivers.js`.

### D24.1.1.1 — Privacy / proof honesty (enumeration-safe scope)

- Datum: 2026-08-09 · Status: **Odlučeno**
- Odluka:
  1. `DRIVER_SCOPE_CHANGED` API odgovor je data-minimal:
     `{ success, code, error }` — bez `liveGroupId` / `lockedGroupId` / nove grupe.
  2. Emulator dokaz migracije mora zvati production `migrateCompany` (ne ručni set).
  3. Fail-first logovi moraju biti istiniti; fabrikovanje crvenih dokaza zabranjeno.
- Posledica: Dispo ne može enumerisati nedodeljene grupe preko error payload-a.

### D24.2 — Concurrency-safe driver identity uniqueness (tenant guard)

- Datum: 2026-08-10 · Status: **Odlučeno** (owner odobrio minimalnu novu šemu)
- Guard putanja (jedan fiksni dokument po tenantu):
  `companies/{companyId}/ops/driver_identity_guard`
- Guard polja (samo tehnička): `revision` (number), `updatedAt` (server timestamp).
- Guard **ne sme** sadržati: EID (raw/hash), `company_code` / license broj, ime,
  telefon/email, PIN/login/hash, listu vozača ili rezervacija po EID-u.
- Vlasništvo: potpuno server-owned (Admin SDK). Browser read/write/list = deny
  preko `ops/{opsId}` Rules match-a; SuperAdmin rekurzivni read eksplicitno
  isključuje `ops` (sužavanje, ne proširenje CA/Dispo/SA browser ovlašćenja).
- Identitet / kapacitet u istom ugovoru (sva čitanja pre prvog write-a):
  1. LIVE guard;
  2. LIVE company `settings/main` status + licenca (`resolveLicenseSnapshot`) +
     `maxDrivers`;
  3. LIVE grupe;
  4. LIVE EID uniqueness (`driver_credentials.eid`) → `EID_EXISTS`;
  5. upis profila + credentials + guard `revision` bump.
- Putevi: CA manual create, CSV/import create. EID nije editable posle create.
- Napomena (D24.2.1-A): CSV `company_code` više nije identity ključ ni import
  podatak; EID je jedini import identity ključ. Manual `body.companyCode` =
  lični PIN → `loginCodeHash`.
- Fail-closed paralelizam preko različitih novih doc ID-eva; retry ne sme
  duplirati vozača ni brojače; bez orphan profil/credentials; error payload ne
  otkriva EID ni tuđi `driverId`.
- Posledica: `server/driver-identity-guard.js`, wire u
  `company-admin-driver-ops.js` + staff drivers import; Rules deny na `ops/*`
  (SA rekurzivni read isključuje `ops`); CSV max redova 249.

### D24.2.1-A — Retire legacy company_code from new imports

- Datum: 2026-08-10 · Status: **Odlučeno**
- Odluka:
  1. EID je jedini import identity ključ za nove CSV/import upise.
  2. Manual `body.companyCode` ostaje legacy API ime za **lični PIN** →
     `loginCodeHash` (ne mešati sa CSV `company_code`).
  3. CSV `company_code` je zastarelo: parsira se radi kompatibilnosti, vrednost
     se ignoriše, ne hashira se, ne upisuje `companyCodeHash`, ne učestvuje u
     uniqueness, nije login/aktivacija.
  4. Aktivni tok: SMS OTP → vozač postavlja lični PIN.
  5. Postojeći `companyCodeHash` u starim credentials: ne brisati / ne migrirati
     ovde; ostaje server-only denylist polje; ne sme u profil/API/audit/browser.
  6. Import Firestore transakcija ne sme sadržati `bcrypt.hash` /
     `bcrypt.compare` / `companyCodePlain` / O(N×M) identity petlju.
  7. Guard i dalje samo `revision` + `updatedAt`.
- Posledica: uklonjen `findCompanyCodeConflict` / `COMPANY_CODE_EXISTS` iz
  import puta; template bez `company_code`; UI notice
  `ca_drivers_legacy_company_code_ignored`.

---


## Otvorena pitanja

### O1 — Kredencijali staging projekta

- Datum otvaranja: 2026-08-04 · Status: **Otvoreno**
- Šta je potrebno: ID Firebase projekta za staging, servisni nalog sa
  ograničenim pravima, Web konfiguracija klijenta i potvrda da je deploy pravila
  dozvoljen na tom projektu.
- Zašto blokira: bez toga se ponašanje Firestore pravila, revokacije tokena i
  SMS providera ne može tvrditi za produkciju, samo za emulator.
- Privremeno rešenje: svi dokazi se izvršavaju nad emulatorom i tako se i
  opisuju u izveštajima.

### O2 — Retencija lokacijskih podataka vozača

- Datum otvaranja: 2026-08-04 · Status: **Otvoreno**
- Pitanje: koliko dugo se čuvaju GPS tačke prikupljene tokom aktivne smene, i da
  li se posle tog roka brišu ili agregiraju?
- Zašto je važno: §13 i §23.3 traže odobrenu retention politiku pre aktiviranja
  GPS funkcije; rok je pravno i tehnički uslov, ne tehnička sitnica.
- Potrebna potvrda: vlasnik, uz pravnika ili DPO za ciljno tržište.

### O3 — Login profil vozača i dužina ličnog koda

- Datum otvaranja: 2026-08-04 · Status: **Privremeno**
- Pitanje: koji tenant login profil je podrazumevan i koja je minimalna dužina
  ličnog numeričkog koda?
- Trenutno stanje u kodu: §4 dozvoljava numerički kod od najmanje pet cifara
  samo za odobren tenant profil. Do odluke ostaje najstroža postojeća varijanta,
  bez uvođenja novih načina prijave.

### O4 — Politika lozinki za staff naloge

- Datum otvaranja: 2026-08-04 · Status: **Otvoreno**
- Pitanje: da li minimum od šest znakova ostaje do release-a, i da li se uvodi
  MFA za Company Admin i Super Admin?
- Zašto je važno: §4 traži da, ako minimum od šest znakova ostane, release gate
  zahteva dokumentovano prihvatanje rizika i kompenzacione kontrole.

### O5 — Rokovi čuvanja audit zapisa

- Datum otvaranja: 2026-08-04 · Status: **Otvoreno**
- Pitanje: koliko dugo se čuva audit log po tenantu i šta se dešava sa njim kada
  se tenant ugasi ili izveze?
- Zašto je važno: §23.1 traži retention matricu, a §18 bezbedan tenant purge i
  export; bez roka se ne može zatvoriti nijedno od to dvoje.

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

- Datum: 2026-08-04 · Status: **Odlučeno** (Poglavlje 8)
- Odluka:
  1. Kontrolisani undo = jedan nivo `priorSnapshot` + soft-clear tombstone;
     audit `shift_undone`; bez brisanja istorije.
  2. Edit modal nudi samo šifre aktivnog (locked) CA kataloga; bez izmišljenih
     fallback F/S kodova.
  3. Disponentski bulk uvoz mesečnog plana ostaje sakriven u UI dok commit /
     partial-recovery ne dostignu CA nivo (CA group monthly import ostaje put).
  4. Masovno odsustvo (off/vacation/sick) samo uz preview + potvrdu; svaki dan
     ide kroz postojeći `PUT …/assignment`.
- Posledica: `server/shift-assignment.js`, `POST …/assignment/undo`,
  `js/dispatcher/monthly-plans.js`.

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

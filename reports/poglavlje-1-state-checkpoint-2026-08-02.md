# Poglavlje 1 — State / checkpoint (kanonski BusCommand)

Datum: **2026-08-02** (Europe/Vienna)  
Režim: light / forenzika (bez feature implementacije u ovom koraku)  
Projekat: `C:\Users\cane\Desktop\BusCommand`  
Remote: `https://github.com/canicboban-source/BusCommand.git`  
Grana: `work/ch1-state-checkpoint` (od `main` @ `ff7832d`)  
Master prompt: `docs/BusCommand-MASTER-PROMPT.md` (**v3.1**, već u repou) + `.cursor/rules/buscommand-master.mdc`

---

## Zaključane odluke vlasnika (2026-08-02)

| # | Odluka | Status u kodu |
|---|--------|---------------|
| 1 | Radimo na kanonskom **BusCommand** repo-u (ne Preview) | ✅ workspace = `Desktop\BusCommand` |
| 2 | Sledeća važna verzija: **1.0.10** (schema +10 na last segment) | ⏳ trenutno još **1.0.1** u `package.json` / UI |
| 3 | Jezik: browser DE→de, EN→en, inače en; SR ostaje u selektoru | ⏳ **nije** u ovom kodu — fallback i dalje `"de"` (`resolveUiLanguage` / `init.js`) |
| 4 | Lozinke: **min 6** karaktera (bez jače politike u ovom ciklusu) | ✅ `server/validation.js` `z.string().min(6)` |
| 5 | Ne portovati slepo Preview-Local diffove | ✅ dogovoreno; port samo dogovorene stavke |

Ne mešati sa: `BusCommand-Preview` / `BusCommand-Preview-Local` / stari folder `C:\Users\cane\buscommand` (prazan/broken tree).

---

## Git / checkpoint

| Stavka | Vrednost |
|--------|----------|
| `main` / HEAD baza | `ff7832d` — *BusCommand v1.0.1 release (#7)* |
| Aktivna grana | `work/ch1-state-checkpoint` @ `ff7832d` |
| Working tree | **čist** posle forenzike (nema WIP feature commit-a) |
| Poslednjih 10+ commit-a | release 1.0.1 → incident resolution → Firestore rules → master prompt v3.1 → plan import / location gate / demo seed testovi |

**Napomena:** Downloads fajl `BusCommand-master-prompt-v3.1 (1).md` ima isti sadržaj i broj linija (722) kao `docs/BusCommand-MASTER-PROMPT.md`; razlika je samo EOLs/veličina bajtova. Autoritativna kopija ostaje ona u repou (`AGENTS.md`).

---

## Mapa sistema (trenutno)

### Površine
- `index.html` — ulaz / promo tok
- `staff.html` — Super Admin / Company Admin / dispečer (desktop)
- `driver.html` — vozački PWA
- `index.legacy-monolith.html` — legacy (ne dirati bez zahteva)

### Stack
| Sloj | Tehnologija |
|------|-------------|
| Frontend | Vanilla ESM (`js/`), Vite 6 → `dist/` |
| Backend | Node 22 + Express (`api-server.js` + `server/`) |
| Auth / DB | Firebase Auth + Firestore (+ Admin SDK) |
| Validacija | Zod (`server/validation.js`) |
| Hardening | Helmet, CORS, rate-limit, pino |
| Test | `node --test`, Playwright, Firestore rules (emulator) |
| Deploy | `render.yaml` |

### Ključni moduli
- `js/admin`, `js/dispatcher`, `js/driver`, `js/auth`, `js/core`, `js/surface`
- `server/*` — OTP, support session, plan import preview, shift assignment, messages, audit, scheduler stubs
- `firestore.rules`, `firestore.indexes.json`
- i18n: `translations.js` (en/de/sr)

### Dokumentacija / prethodni artefakti
- Stariji Poglavlje 1 set (2026-07-24) nastao je na **Preview-Local** putanji — koristan kontekst, ali **nije** ovaj clean `main` clone.
- Soft-pilot / release readiness (2026-07-26) i RBAC matrica postoje u `reports/`.
- `PROJEKAT-STATUS.md` / `VERSION.md` još pokazuju **v1.0.1** i zastarelu putanju `C:\Users\cane\buscommand` — treba uskladiti kad krenemo verziju 1.0.10.

---

## Baseline verifikacija (2026-08-02, ovaj clone)

| Komanda | Rezultat |
|---------|----------|
| `npm install` | exit 0 (sa allow-scripts upozorenjima) |
| `npm run test:unit` | **375/375** pass |
| `npm run lint` | **0** grešaka |
| `npm run build` | **pass** (152 modula; Firebase isolation OK) |
| `npm run test:e2e` | **nije** pokrenut u ovom koraku |
| `npm run test:rules` | **nije** pokrenut (Java/emulator) |

---

## Šta radi (dokazano na ovoj bazi)

- Produkcijski release **v1.0.1** na GitHub `main`.
- Surface split staff/driver, Zod API validacija, unit pokrivenost 375 testova.
- Plan import preview/aktivacija, incident resolution na dispečerskom cockpit-u, location write gate, support-session kod (feature-flagiran).
- Master prompt v3.1 je usvojen u repou (`7dbb0d4` / `35535d1`).

## Šta je nepotpuno / rizično (iskreno)

| Rizik | Prioritet | Napomena |
|-------|-----------|----------|
| UI jezik ne prati browser (još default `"de"`) | Medium | Odluka #3 — implementirati u sledećem odobrenom koraku |
| Verzija još 1.0.1 | Low | Bump na 1.0.10 tek uz dogovoreni release/PR |
| Preview-Local ima necommitovane izmene (jezik + 1.0.10) | Medium | Ne merge-ovati slepo; port samo dogovoreno |
| Firestore rules E2E/emulator | High (gate) | Nije re-run na ovoj mašini |
| Live GPS / SMS / scheduler | High + Legal | Soft-pilot: OFF dok owner ne odobri |
| Dokumentacione putanje (`PROJEKAT-STATUS`) | Low | Zastarele reference na stari folder |
| Live QA credentials | Blocker za browser login | Treba `qa-…` nalog od vlasnika |

---

## Ocene (dokaz)

- Napredak **ovog** Poglavlja 1 (state checkpoint na kanonskom repou): **8/10** — git, mapa, baseline lint/unit/build, zaključane odluke dokumentovane; E2E/rules nisu ponovo pokrenuti.
- Ukupna spremnost ka **hard** pilotu: ostaje konzervativno **~6/10** na ovoj bazi (release 1.0.1 je jak; legal/GPS/SMS/owner browser i rules emulator i dalje gate-ovi). Soft-pilot procene iz jula ne prepisujem automatski na +10 bez novog role-by-role dokaza.

---

## Tačan sledeći korak

**Čeka odobrenje vlasnika** pre Poglavlja 2. Predlog sledećeg **jednog** fokusa:

1. **Port dogovorenih Preview stavki na BusCommand** (browser jezik DE/EN→de/en, fallback en; SR u selektoru) + unit regress; **ili**
2. **Verzioni bump priprema 1.0.10** (package + i18n `saas_version` + docs putanje) kao zaseban PR; **ili**
3. Nastavak master-prompt **Poglavlje 2** (tenant/RBAC/auth razdvajanje) na ovoj grani.

Bez eksplicitnog „idi na X“ — ne prelazim poglavlje.

# BusCommand — lokalni pilot kandidat (2026-08-07)

## Konačna ocjena: **CONDITIONAL PASS**

Lokalno okruženje je dokazivo funkcionalan kandidat za kontrolisani pilot: install/startup, lint, build, unit, E2E (2×), Firestore rules emulator i ključni ulogni tokovi prolaze. Staging, stvarni uređaji, SMS, cloud IAM/monitoring i produkcijski Firebase ostaju **NOT VERIFIED** (spoljašnji blockeri).

---

## 1. Je li ovo vjerovatno posljednje stanje?

**Da, za ovu radnu kopiju — uz lokalne necommitovane ispravke.**

| Dokaz | Vrijednost |
| --- | --- |
| Grana | `work/ca-group-monthly-import` → `origin/work/ca-group-monthly-import` |
| Posljednji pushani commit | `b10d1ff` — Overnight Swiss Control pack |
| `package.json` verzija | `1.0.10` |
| `CHANGELOG.md` | 1.0.10 (2026-08-02) |
| Unutrašnji `buscommand.zip` | nije pronađen |
| Radno stanje | 18 izmijenjenih source fajlova + novi testovi/skripte (necommitovano) |

Nedostaju u checkoutu (navedeni u briefu): `docs/product-charter.md`, `docs/roadmap-to-pilot.md`. Postoje `ARHITEKTURA.md`, Ultimate Operating Contract, Master Prompt, Cursor rules.

---

## 2. Početno stanje

- Server na `8766` s `BUSCOMMAND_FORCE_LOCAL_DEMO=1` (dist frontend).
- Node runtime: **v26.4.0** (engines traže `22.x` — rizik kompatibilnosti).
- Lint: 6× `no-undef` u `tests/**/*.mjs` + 6 warnings.
- Unit: 2 failing (zastarjeli source-asserti nakon SA card refactora / vacation DOM).
- E2E: 73 pass / 6 fail — VOR crew seed zagađivao Playwright fixture.
- Lokalni `firebase-admin-key.json`: gitignored, **nije u git indeksu**; `.env` nije tracked. Ako ključ postoji na disku iz arhive — **rotirati van repozitorija**.

---

## 3. Problemi po prioritetu

### P0 Critical
*(nema otvorenih lokalno popravljivih)*

| ID | Nalaz | Status |
| --- | --- | --- |
| SEC-1 | Admin key / `.env` ne smiju u git | **PASS** — gitignore + nije tracked |
| TENANT | Cross-tenant / group fail-closed | **PASS** (unit + rules + CA e2e foreign filter) |

### P1 High
| ID | Nalaz | Status |
| --- | --- | --- |
| E2E-VOR | `ensureOwnerTestDriver` uvijek dodavao VOR 310/320 crew → lažni CA brojevi, prazan hub, bus pool | **FIXED** — `e2eFixture` opt-out |
| SA-UX | SA companies horizontal scroll / pending status / inspect overlay | **FIXED** (prior + ovaj ciklus) |
| LOGIN | CA login race s Firebase vs lokalni demo | **FIXED** (prefer lokalni demo) |

### P2 Medium
| ID | Nalaz | Status |
| --- | --- | --- |
| LINT-MJS | ESLint bez globals za `tests/**/*.mjs` | **FIXED** |
| BUDGET | translations chunk overflow | **FIXED** (trim) |
| AUDIT-DEV | `npm audit` (dev): 5 vuln u firebase-tools/js-yaml/re2 | **OPEN** (dev-only; prod omit=0) |
| NODE | engines 22.x vs lokalni 26 | **OPEN** (dokumentovano) |

### P3 Low
| ID | Nalaz | Status |
| --- | --- | --- |
| UNUSED | dead helpers u dashboard / driver-routes | **FIXED** (prefix/remove) |
| I18N | SA profile stringovi skraćeni zbog D17 budgeta (EN fallback) | **ACCEPT** |

---

## 4. Izmijenjeni fajlovi (zašto)

| Fajl | Razlog |
| --- | --- |
| `js/core/demo-ops-baseline.js` | E2E fixture ne dobija VOR crew; zadržan upsert CA/Dispo lozinki |
| `tests/e2e/helpers.js` | `e2eFixture: true` na seed |
| `js/admin/superadmin.js` | SA cards, status active uz CA, profile save, inspect zatvara modal |
| `js/auth/login-dispatcher.js` | lokalni demo login prioritet |
| `js/admin/dispatcher-setup.js` | exit impersonation čisti overlay |
| `js/register-onclick-staff.js` | wire `superadminSaveDemoCompanyProfile` |
| `css/staff-desktop.css` | SA stacked cards + profile form |
| `translations.js` | budget trim + SA/ops stringovi |
| `eslint.config.mjs` | globals za `tests/**/*.mjs` |
| `js/dispatcher/dashboard.js` | unused → `_` prefix |
| `server/driver-routes.js` | unused import/var |
| `tests/unit/*`, `tests/e2e/superadmin-demo.spec.js` | regresija |
| `staff.html` / `index.legacy-monolith.html` | surface sync (build) |
| `scripts/pilot-browser-qa.mjs` | ručni vizuelni prolaz uloga |

---

## 5. Testovi dodati/promijenjeni

- `tests/unit/sa-demo-company-status.test.mjs` (**novo**)
- `tests/unit/demo-ops-baseline.test.mjs` — e2eFixture opt-out
- `tests/unit/superadmin-modal-visibility.test.mjs` — card helper
- `tests/unit/driver-operational-client.test.mjs` — vacation DOM
- `tests/unit/state-observer.test.mjs` — uklonjen redundant `/* global window */`
- `tests/e2e/helpers.js` + `superadmin-demo.spec.js`

---

## 6. Komande i rezultati

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | **PASS** (0 errors; warnings cleared) |
| `npm run build` | **PASS** (budgets OK) |
| `npm run test:unit` | **PASS** 591/591 (2×) |
| `npm run test:e2e` | **PASS** 79/79 (pass1 + pass2) |
| `npm run test:rules` | **PASS** 40/40 (emulator) |
| `npm audit --omit=dev` | **PASS** 0 vulnerabilities |
| `npm audit` (all) | **FAIL** 5 (dev: firebase-tools/js-yaml/re2) — nema `audit:deps` skripte |
| `node scripts/pilot-browser-qa.mjs` | **PASS** (screenshot trail) |
| `npm run audit:deps` | **NOT VERIFIED** — skripta ne postoji u `package.json` |

---

## 7. Ručno / browser tokovi

Trail: `reports/pilot-browser-shots/` + `trail.json`

| Korak | Rezultat |
| --- | --- |
| Staff login ekran | PASS |
| SA `sa@demo.local` → dashboard, 1 company card, hOverflow=0 | PASS |
| CA `admin@demo.com` → overview + groups | PASS |
| Dispo `demo@buscommand.com` → app shell + ops | PASS |
| Driver → Pre-Trip Check modal (login uspio) | PASS |

E2E pokriva CA tenant filter, Dispo cockpit, import, monthly plan, SA demo, itd.

---

## 8. Bezbjednost

- API + Firestore rules testovi: fail-closed za tenant/group/driver scope (postojeći suite + 40 rules).
- Dispo credential boundary: D21 / unit / CA monthly import 403 path u e2e.
- Tajne: admin key i `.env` nisu u gitu; `.env.example` postoji (VITE_* su public client config).
- Ako je lokalni admin JSON ikad curio iz arhive → **rotirati** van koda.
- Nije pokretano: `pilot:wipe`, `pilot:purge-all`, deploy, push, SMS/email stvarnim primaocima.

---

## 9. Preostali rizici / NOT VERIFIED

| Stavka | Status |
| --- | --- |
| Staging / Render deploy | NOT VERIFIED |
| Stvarni uređaji / PWA install na telefonu | NOT VERIFIED (desktop Chromium + e2e) |
| SMS / OTP stvarni kanal | NOT VERIFIED (demo OTP) |
| Cloud IAM, backup/restore, monitoring | NOT VERIFIED |
| Node 22.x parity (lokalno 26) | NOT VERIFIED |
| `docs/product-charter.md` / `roadmap-to-pilot.md` | nedostaju u ovoj kopiji |
| Firefox / WebKit E2E | NOT VERIFIED (samo Chromium project) |
| Dev-dependency audit fix | OPEN (ne blokira runtime) |

---

## 10. Spoljašnji blockeri i sljedeći koraci

1. Pokrenuti isti suite na **Node 22.x** CI/agentu.
2. Staging deploy + smoke s preview Firebase (bez destruktivnih wipe komandi).
3. Ručni PWA install na Android/iOS + offline smoke.
4. Owner odluka: commit lokalnih ispravki (18 fajlova) + eventualni PR.
5. Rotirati bilo koji izloženi Admin SDK ključ.
6. Opciono: dodati `npm run audit:deps` → `npm audit --omit=dev`.

---

## 11. Matrica

| Oblast | PASS/FAIL/NOT VERIFIED | Dokaz |
| ---------------------- | ---------------------- | ----- |
| Instalacija i startup | PASS | `node api-server.js` PORT=8766, health log |
| Lint | PASS | exit 0 |
| Build | PASS | budgets OK |
| Unit testovi | PASS | 591/591 ×2 |
| E2E | PASS | 79/79 ×2 |
| Firestore rules | PASS | 40/40 emulator |
| SU tokovi | PASS | browser + e2e superadmin-demo |
| CA tokovi | PASS | browser + ui-smoke CA |
| Disponent tokovi | PASS | browser + cockpit e2e |
| Vozač tokovi | PASS | browser pre-trip + driver e2e/unit |
| Tenant izolacija | PASS | unit + CA foreign filter + rules |
| Group izolacija | PASS | dispatcher-scope / rules / cockpit |
| PWA/mobilni | NOT VERIFIED | desktop shots; nema device |
| Security | PASS* | *lokalno; staging/SMS NV |
| Performanse/pouzdanost | NOT VERIFIED | nema load/race mjerenja u ovom ciklusu |

---

## Demo pristup (lokalno)

- URL: `http://localhost:8766/staff.html?mode=demo`
- SA: `sa@demo.local` / `sa-demo-ok`
- CA: `admin@demo.com` / `demo123`
- Dispo: `demo@buscommand.com` / `demo123`
- Driver: `driver.html?mode=demo` + PIN iz selecta (npr. Alex NoBus / `1234`)

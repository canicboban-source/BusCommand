# Poglavlje 4 — identitet, login lifecycle, sesije i istek

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: checkpoint Poglavlja 3 (`8becb8e`)
- Checkpoint commit: *(upisuje se posle commita)*
- Okruženje: Node 22, Firestore + Auth emulator, Playwright Chromium
- Master prompt: `docs/BusCommand-MASTER-PROMPT.md` v3.2

## 1. Cilj

Zatvoriti kritične rupe u životnom ciklusu prijave: vozački tokeni bez
`checkRevoked`, EID enumeration oracle, legacy PIN putanja, nedostatak
account lockout-a, suspendovane firme na vozačkoj prijavi, dupli staff gate, i
`sessionsValidAfterEpoch` samo u Rules a ne i na Express API.

## 2. Pronađeni problemi i rizik

| ID | Nalaz | Prioritet | Status |
| --- | --- | --- | --- |
| C4-1 | `verifyIdToken` bez `checkRevoked` na `/api/driver` i activate-personal-code | Critical | Rešeno |
| C4-2 | `/api/public/drivers/identify` otkriva postojanje EID-a i ime | Critical | Rešeno (410) |
| C4-3 | Legacy `/api/legacy/auth/driver-login` + `/api/admin/hash-pin` | High | Uklonjeno |
| C4-4 | Nema account lockout-a na vozačkoj prijavi | High | Rešeno (10 / 15 min) |
| C4-5 | Suspendovana firma nije proveravana na modernoj vozačkoj prijavi | High | Rešeno |
| C4-6 | Dupli `requireStaff` u `driver-routes` slabiji od zajedničkog gate-a | High | Rešeno |
| C4-7 | `sessionsValidAfterEpoch` samo u Firestore Rules | High | Rešeno (staff-auth) |
| C4-8 | Rate limit nedostajao na SA provision/status i driver status | Medium | Rešeno |
| C4-9 | Sirove Firebase greške i hardkodirani SR toast na klijentu | Medium | Rešeno |
| C4-10 | SuperAdmin modal i `handleLogoClick` na vozačkoj površini | Medium | Uklonjeno |
| C4-11 | Aktivacija briše input pre validacije | Low | Rešeno |

Otvoreni Critical/High na checkpointu: **0**.

## 3. Sprovedene izmene

### Server

- Vozačka prijava: jedan korak `companyId + eid + loginCode` (ili legacy
  `driverId` za stari bundle). Neuspeh za nepoznat EID i pogrešan kod vraća
  isti `401 INVALID_LOGIN`.
- Lockout: posle 10 neuspeha `429 ACCOUNT_LOCKED` sa `retryAfterSeconds`;
  brojač u transakciji na `driver_credentials`.
- Suspendovana firma: `403 COMPANY_SUSPENDED` pre provere kredencijala.
- Identify endpoint: `410 DRIVER_IDENTIFY_DISABLED`.
- Uklonjeni legacy PIN login, hash-pin endpoint, `hash-pin` skripta i Zod šeme.
- `createRequireActivatedDriver` i activate-personal-code: `verifyIdToken(..., true)`.
- Staff rute u `driver-routes` koriste `createStaffAuth` / `requireCompanyStaff`.
- `staff-auth.js`: `isSupersededSession` → `401 SESSION_SUPERSEDED`.
- Rate limit na SA admin/status/reset/create-user/groups i
  `PUT /api/staff/drivers/:driverId/status`.

### Klijent

- `Auth.loginWithDriverCode({ companyId, eid, loginCode })`; uklonjeni
  identify korak, `refreshToken` i deprecated `activateCompanyCode`.
- i18n za lockout, suspended, identify disabled, session superseded,
  config error, activation format/mismatch.
- Firebase config greška ide u konzolu; korisnik vidi generičku poruku.
- SuperAdmin entry attribute samo na staff površini; build skida modal sa
  `driver.html`.

### Testovi

- Novo: `tests/unit/driver-login-http.test.js` (8 funkcionalnih HTTP scenarija).
- Novo: `tests/unit/driver-token-revocation.test.js` (4 testa za `checkRevoked`).
- Rules: dodat emulator test za `sessionsValidAfterEpoch`.
- Ažurirani E2E api-smoke (410 identify, 404 legacy/hash-pin), ui-smoke,
  i18n, credentials, public directory, staff-auth-http.

## 4. Mutacione provere (§35)

| Mutacija | Očekivani pad | Rezultat |
| --- | --- | --- |
| M1: `verifyIdToken(token)` bez `true` u driver gate | revocation test pada (revoked token prolazi) | pada ✓ |
| M2: `MAX_FAILED_LOGIN_ATTEMPTS = 100000` | lockout HTTP test očekuje 429, dobija 401 | pada ✓ |
| Vraćeno ispravno stanje | svi unit testovi prolaze | 464/464 ✓ |

## 5. Gate — dva prolaza

| Komanda | Prolaz A (noć) | Prolaz B (jutro) |
| --- | --- | --- |
| `npm run lint` | prolaz | prolaz |
| `npm run test:unit` | 460 (pre revocation testa) | **464/464** |
| `npm run test:rules` | 40/40 | **40/40** |
| `npm run build` | prolaz | prolaz |
| `npx playwright test --project=chromium` | **57/57** | **57/57** |
| `npm audit --omit=dev` | **0** | **0** |

Napomena: prvi E2E pokušaj u C4 pao je zbog zastarelog `dist/` posle
standalone `build-surface-html` bez Vite. Posle `npm run build` suite je čist.
Lekcija: gate uvek koristi puni `npm run build`, ne samo surface skriptu.

## 6. Izmenjeni fajlovi

| Fajl | Svrha |
| --- | --- |
| `server/driver-routes.js` | EID login, lockout, suspend, checkRevoked, shared staff gate, rate limit |
| `server/staff-auth.js` | `sessionsValidAfterEpoch` na API |
| `api-server.js` | uklonjen legacy/hash-pin; staffAuth dep; SA rate limits |
| `server/validation.js` | uklonjene legacy šeme |
| `scripts/hash-pin.js` | obrisan |
| `package.json` / `README.md` | uklonjen `hash-pin` script |
| `js/core/auth-client.js`, `js/auth/login-driver.js` | jedan korak prijave |
| `js/bootstrap/init.js`, `js/auth/driver-activation.js`, `js/ui/i18n.js` | i18n, UX, SA entry |
| `scripts/build-surface-html.js`, `driver.html` | bez SA modala na vozaču |
| `translations.js` | nove ključeve grešaka |
| `tests/unit/driver-login-http.test.js` | novo |
| `tests/unit/driver-token-revocation.test.js` | novo |
| Ostali testovi | usklađeni sa novim ugovorom |

## 7. Šta nije potvrđeno

- Produkciona `checkRevoked` razlika vs emulator (emulator odbija i bez
  zastavice) — ostaje O1 / staging (§36).
- Staff email/password MFA i dužina lozinke — O4.
- Vozački login profil / minimalna dužina koda — O3 (privremeno 5–12 cifara).
- Browser E2E nad pravim Firebase Auth tenantom (demo E2E pokriva UI tokove).

## 8. Ocena i rollback

- Ocena: **9/10**. Kritični auth nalazi zatvoreni funkcionalnim testovima i
  mutacijama; gate čist. Minus: staging još nije dostupan za produkcione tvrdnje.
- Rollback: `git revert` checkpoint commita ovog poglavlja.
- Rizik po korisnika: vozači više ne koriste identify korak; stari cached
  bundle i dalje može slati `driverId` (prihvaćen). Identify vraća 410.

## 9. Predlog za Poglavlje 5

Dizajn sistem i tokeni (§33): inventar postojećih tokena u
`css/design-tokens.css`, dopuna semantike (`urgent-action`, stanja komponenti),
dokumentovanje odstupanja, bez redizajna stranica dok sistem nije zaključan.

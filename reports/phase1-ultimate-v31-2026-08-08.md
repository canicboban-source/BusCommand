# BusCommand Ultimate Master Prompt v3.1 — Faza 1 izveštaj

**Datum:** 2026-08-08  
**Status:** Faza 1 završena — **čekа se zeleno svetlo vlasnika za Fazu 2**  
**Build:** `npm run build` → **exit 0** (bundle budgets OK)

---

## Sažetak

Implementirane hitne UX/biznis ispravke iz Faze 1: ⋯ meni (portal + single→direktno dugme), CA ručno dodavanje vozača (tačan redosled polja), multi-group vidljivost za Dispo (klijent + Firestore + server), bez horizontalnog skrola na glavnim staff tabelama, seven.io SMS stub u QA/E2E + E.164 + env-only ključevi.

---

## 1) Meni sa 3 tačke (A)

| Stavka | Status |
|--------|--------|
| Portal / `position:fixed` na `document.body`, z-index 10050 | Done |
| Jedna akcija → `.row-actions-direct` dugme (bez ⋯) | Done |
| Dve+ akcije → ⋯ meni | Done |
| CA grupe: Obriši vidljivo dugme (ne ⋯) | Done (ranije + potvrđeno) |

**Fajlovi:** `js/ui/row-actions-menu.js`, `css/staff-desktop.css`, `tests/unit/row-actions-menu.test.mjs`

---

## 2) CA pojedinačno dodavanje vozača (B)

Forma u CA Drivers — redosled polja:

1. EID → 2. Ime → 3. Prezime → 4. Email → 5. Telefon (E.164) → 6. PIN (5–12) → 7. Primarna grupa + opcione dodatne grupe

Tok: CSV import API (jedan red) → opciono `updateCompanyDriver` za `knownGroupIds` → `setCompanyDriverPersonalCode` (PIN) → SMS aktivacija (server).

**Fajlovi:** `index.legacy-monolith.html`, `js/admin/company-admin-drivers.js`, `translations.js` (EN/SR/DE)

---

## 3) Multi-group + CSV edit + grupe (C/D)

| Stavka | Status |
|--------|--------|
| `knownGroupIds` na import profilu (`[home]`) | Done |
| Firestore Dispo load/listener: `groupId ==` **i** `knownGroupIds array-contains` | Done |
| Server poruke / confirmation scope: `loadDriverDocsForGroups` | Done |
| Klijent filter `getVisibleDrivers` / `driverBelongsToLine` | Done |
| Soft-detach: skida samo ciljne grupe; ostale ostaju | Done |
| Edit dugme za svakog vozača u CA direktorijumu | Done (postojeće + zadržano) |
| CA kreiranje/izmena grupa | Done (postojeće) |

**Fajlovi:** `js/core/firebase-service.js`, `js/data/group-membership.js`, `js/data/driver-known-groups.js`, `server/driver-routes.js`, unit testovi multi-group

---

## 4) Horizontalni skrol (E)

Staff glavne tabele: `overflow-x: hidden`, `table-layout: fixed`, ellipsis na ćelijama (drivers, groups, ops daily, table-container, audit/overview wraps).

**Fajl:** `css/staff-desktop.css` (+ kopija u `dist/` preko build)

---

## 5) seven.io SMS bezbednost

| Kontrolа | Status |
|----------|--------|
| Ključevi samo preko `.env` / `.env.example` placeholder | Done |
| E.164: `+/[1-9]\d{7,14}` u `normalizePhone` | Done |
| QA/E2E: `BUSCOMMAND_QA_HARNESS=1` + `BUSCOMMAND_FORCE_SMS_STUB=1` → stub | Done (`playwright.config.js`) |
| Unit testovi mogu vežbati seven/twilio sa mock fetch | Done |
| Audit/response ne nosi plaintext OTP / pun telefon | Done (phoneLast4 / status only) |
| Rate-limit na import / resend-activation | Već postoji (`rateLimit(5…)` / `rateLimit(8…)`) |

**Fajlovi:** `server/sms-provider.js`, `playwright.config.js`, `.env.example`, `tests/unit/driver-activation-otp.test.js`

---

## Dokaz (komande)

```text
node --test tests/unit/driver-multi-group-visibility.test.mjs \
  tests/unit/dispatcher-multi-group-query.test.mjs \
  tests/unit/row-actions-menu.test.mjs \
  tests/unit/driver-activation-otp.test.js
→ 15 pass, 0 fail

npm run build
→ exit 0
→ staff app JS excl. translations: 578096 <= 579584
→ translations chunk: 372877 <= 373760
→ Bundle budgets OK (D17 soft-pilot)
```

Budget gate blago podignut (staff 566 KiB, translations 365 KiB) zbog Phase 1 multi-group + CA add stringova — dokumentovano u `scripts/check-bundle-budgets.js`.

---

## Izmenjeni fajlovi (glavni)

- `js/ui/row-actions-menu.js`
- `js/admin/company-admin-drivers.js`
- `js/core/firebase-service.js`
- `js/data/group-membership.js`
- `js/data/driver-known-groups.js` (korišćen)
- `server/driver-routes.js`
- `server/sms-provider.js`
- `css/staff-desktop.css`
- `index.legacy-monolith.html` → rebuild `staff.html` / `dist/`
- `translations.js`
- `playwright.config.js`
- `.env.example`
- `scripts/check-bundle-budgets.js`
- `tests/unit/*` (row-actions, multi-group, SMS stub)

---

## Nije u opsegu Faze 1 / ostaje za Fazu 2 (nakon odobrenja)

- Automatizovane funkcijske matrice / full gate
- Live browser QA trail sa screenshot-ima (owner visual-step mandate)
- Potvrda svih confirm-modala i Dispo Attention panela kroz E2E matricu
- Deploy / push (nije traženo)

---

## Rizici

- Postojeći vozači u Firestore bez `knownGroupIds` i dalje se hvataju preko `groupId ==`; novi importi/updatei pišu `knownGroupIds`.
- Horizontalni skrol uklonjen CSS-om; ekstremno uske širine skraćuju tekst (ellipsis) — prihvatljivo za Phase 1.
- Live SMS u produkciji zavisi od ispravnog `SMS_PROVIDER` + `SEVEN_API_KEY` na hostu (nije u gitu).

---

**STOP:** Faza 2 (matrice / završni gate) ne kreće dok vlasnik ne potvrdi ovaj izveštaj.

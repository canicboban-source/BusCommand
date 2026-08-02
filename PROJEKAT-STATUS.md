# BusCommand — status projekta (v1.0.10)

**Kanonski folder:** `C:\Users\cane\Desktop\BusCommand`  
**Izdanje:** BusCommand `v1.0.10` (avgust 2026)
**Domen:** buscommand.com  
**Plan refaktorisanja:** `f:\fleet\PLAN-REFAKTORISANJA.md`

---

## Brzi start

```powershell
cd C:\Users\cane\Desktop\BusCommand
npm install
npm run build
npm start
# http://localhost:8766/
```

Testni nalozi i poslovni podaci kreiraju se namenski za svaki QA ciklus i brišu
se po završetku testa. Repozitorijum ne sadrži zajedničke demo lozinke.

**Verifikacija:**
```powershell
npm run lint
npm run test
npm run build
```

---

## Stack

| Sloj | Tehnologija |
|------|-------------|
| Frontend | Vanilla ESM (`js/`), Vite build → `dist/` |
| Backend | Node.js + Express (`api-server.js`) |
| Auth | Firebase (prod) / demo localhost |
| Baza | Firestore (client sync + admin API) |
| Testovi | node:test, Playwright, ESLint flat config |

---

## Završeno (po planu)

### Nedelja 1 — API hardening ✅
- `server/validation.js` — Zod validacija
- `server/rate-limit.js` — rate limiting
- `server/logger.js` — pino logging
- `api-server.js` — CORS whitelist, Helmet, trust proxy, status kodovi
- `js/core/api-client.js`, `js/core/auth-client.js` — `!res.ok` handling

### Rebrand FleetPulse → BusCommand ✅
- ~121 fajlova, `buscommand_*` storage keys + migracija
- `BusCommandConfig`, verzija **1.0.10**
- Cursor rules: `.cursor/rules/buscommand-*.mdc`

### Nedelja 2 — ESLint + testovi ✅
- `eslint.config.mjs`
- `playwright.config.js`, `tests/e2e/`, `tests/unit/`
- Skripte: `lint`, `test:unit`, `test:e2e`, `test`

### Nedelja 3–4 — Firestore + admin ✅
- `js/core/firestore-sync.js` — diff, batch 500, audit
- `js/core/firebase-service.js` — writeBatch, baseline, audit trail
- `/api/admin/companies` — N+1 fix (Promise.all)

### Stavka 8 — onclick → data-action ✅ (KOMPLETNO)
- `js/core/action-delegate.js` — delegacija click/change/submit
- `index.html` — **0** inline onclick/onchange/onsubmit
- **24 aktivna JS modula** — `actionAttr()` / `changeAttr()`
- `scripts/migrate-onclick-to-data-action.js`
- `scripts/migrate-js-onclick.js`
- `scripts/generate-register-onclick.js` — skenira `data-action` + `actionAttr()`
- **140 handlera** u `js/register-onclick.js`
- `window` shim ostaje radi kompatibilnosti (CSP-friendly put)

---

## Produkciono kritični fajlovi

| Oblast | Fajlovi |
|--------|---------|
| API | `api-server.js`, `server/validation.js`, `server/rate-limit.js` |
| Firestore | `js/core/firebase-service.js`, `js/core/firestore-sync.js` |
| State | `js/core/state.js` |
| Eventi | `js/core/action-delegate.js`, `js/register-onclick.js` |
| Ulaz | `js/main.js`, `index.html` |
| Testovi | `tests/e2e/*.spec.js`, `tests/unit/*` |

---

### Stavka 11 — lagani state observer ✅
- `js/core/state-observer.js` — refresh vidljivih sekcija posle `saveState` / cross-tab
- Posmatrano: `dispatcher-dashboard`, `dispatcher-shifts`, `dispatcher-group-hub`
- `saveState()` → `scheduleRefreshObservedSections()` (rAF debounce)
- `cross-tab.js` koristi observer umesto ručnog dashboard rendera

### Stavka 12 — CSS design tokens ✅
- `css/design-tokens.css` — jedini izvor CSS varijabli (Fleet Aurora + light theme)
- `style.css` — spojen sa bivšim `style-v9.css` (theme layer na kraju)
- `style-v9.css` — uklonjen
- `index.html` — 2 linka: tokens + app styles

---

### Demo priprema ✅ (online test)
- Novi `DEMO_STATE`: Linija **101**, 2 vozača, 1 dispečer, 1 admin
- Storage ključ: `buscommand_demo_state_v3` (stari v2 se ignoriše)
- Uklonjen demo seed i dugme „Test 310“; aplikacija je otvoreni proizvod bez brenda klijenta

### Deploy priprema ✅ (lokalno)
- `.env.example` — `PORT`, `CORS_ORIGINS`, `LOG_LEVEL`
- `GET /api/health` — uptime + mode (monitoring)
- `/api/config` — verzija iz `package.json` (1.0.10)
- `.gitignore` — `.env` / `.env.local`

### Faza 0.6 — merge u `f:\fleet` ✅
- `scripts/merge-to-fleet.ps1` — sync iz `C:\Users\cane\buscommand` → `F:\fleet`
- Uklonjeno zastarelo: `style-v9.css`, `scripts/build-fleet-bundle.js`
- Verifikacija u `f:\fleet`: build + **19 unit + 14 E2E** prolaze

---

## Preostalo po planu

| Prioritet | Stavka |
|-----------|--------|
| 🟡 | Deploy buscommand.com (hosting, DNS, `CORS_ORIGINS`, `firebase-admin-key.json`) |
| 🟢 | Inline boje u JS/HTML → tokeni (postepeno) |
| 🟢 | Lazy i18n, a11y, ostalo (plan #13–18) |

**Ne dirati:** `*.legacy.js` (van bundle-a)

---

## Env / deploy napomene

```env
PORT=8766
CORS_ORIGINS=https://buscommand.com,https://www.buscommand.com
# Firebase: firebase-admin-key.json u root-u za prod
```

Server servira `dist/` ako postoji (`npm run build`), inače dev mod (`js/main.js`).

---

## Istorija foldera

| Putanja | Uloga |
|---------|-------|
| `C:\Users\cane\buscommand` | **Kanonski projekat** (ovaj folder) |
| Radna kopija | BusCommand release kandidat |
| `f:\fleet\PLAN-REFAKTORISANJA.md` | Plan refaktorisanja |

*Poslednje ažuriranje: jul 2026 — Faza 0 kompletna (0.1–0.6); sledeće: deploy.*

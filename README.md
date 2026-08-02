# BusCommand v1.0.10

Granice proizvoda su u [PRODUCT-SCOPE.md](PRODUCT-SCOPE.md). Finansije, gorivo, plate i dnevnice nisu dio preview aplikacije.

SaaS platforma za upravljanje autobusnim flotama — vozači, dispečeri, admini.

Frontend je **ESM** — Vite bundluje module iz `js/`.

## Brzi start (demo)

```bash
npm install
npm run build
npm start
```

Otvori: **http://localhost:8766**

| Površina | URL | Ko |
|----------|-----|-----|
| Izbor / landing | `/` | Chooser (demo linkovi auto-usmeravaju) |
| **Vozač PWA** | `/driver.html` ili `/driver` | samo vozač |
| **Staff desktop** | `/staff.html` ili `/staff` | SuperAdmin, CA, dispečer |

Arhitektura splita: [docs/ADR-001-surface-split.md](docs/ADR-001-surface-split.md)

### Testiranje

Testni nalozi i podaci kreiraju se posebno za svaki QA ciklus i ne čuvaju se u repozitorijumu
niti se ugrađuju u javni build.

## Vite + ESM

| Komanda | Opis |
|---------|------|
| `npm start` | Pokreni `api-server.js` (servira postojeći `dist/`) |
| `npm run start:built` | `npm run build` pa pokreni server |
| `npm run build` | Generiše surface HTML + `vite build` + static copy + Firebase isolation |
| `npm run build:surfaces` | Samo `driver.html` / `staff.html` / landing |
| `npm run dev:ui` | Vite dev server na **:5173** (proxy `/api` → 8766) |
| `npm run esmify` | Regeneriše `export` blokove + `js/install.js` (nakon split-a) |

### Dev workflow

```bash
# Terminal 1 — API
node api-server.js

# Terminal 2 — UI sa HMR
npm run dev:ui
```

Otvori **http://localhost:5173**. Za produkcijski preview: `npm run build` pa restart servera.

### Arhitektura modula

```
js/main.js              → ulaz: store + install + bootstrap
js/install.js           → import * svih modula → window.* (onclick)
js/core/store.js        → window.state getteri
js/core/constants.js    → export const FRESH_STATE, DEMO_STATE
js/core/state.js        → import { FRESH_STATE, DEMO_STATE } from ...
js/maps/map-data.js     → export const mapState, ROUTE_GPS_PATHS
js/maps/live-map-core.js → import { mapState } from './map-data.js'
js/bootstrap/init.js    → export async function bootstrapBusCommand()
```

`config.js` i `translations.js` ostaju klasični `<script>` tagovi i izlažu `window.BusCommandConfig`, `window.TRANSLATIONS` (ESM moduli ih ne vide inače).

Poslije `split-phase*` pokreni `npm run esmify` da osvježiš exporte.

## Režimi rada

| Režim | URL | Perzistencija | Auth |
|-------|-----|---------------|------|
| **Demo** | `/?mode=demo` ili localhost | sessionStorage + localStorage | Lokalni PIN/lozinka |
| **Produkcija** | `/?mode=production&company=ID` ili subdomain | Firebase Firestore | Firebase Auth + API PIN |

Badge u gornjem lijevom uglu pokazuje trenutni režim (DEMO / PRODUCTION).

## Produkcija (Firebase)

1. Prati [SETUP-FIREBASE.md](SETUP-FIREBASE.md)
2. Dodaj `firebase-admin-key.json` u root folder
3. Kreiraj firmu:
   ```bash
   npm run setup -- acme "Acme Transit"
   ```
4. Hash PIN za vozača:
   ```bash
   npm run hash-pin -- 1234
   ```
5. Postavi custom claims za korisnike:
   ```bash
   npm run set-claims -- <UID> superadmin
   npm run set-claims -- <UID> company_admin acme "Ana Kovač"
   npm run set-claims -- <UID> dispatcher acme "Hans Müller"
   ```
6. Pokreni server i otvori:
   ```
   http://localhost:8766/?mode=production&company=acme
   ```

### API endpointi

| Metoda | Putanja | Opis |
|--------|---------|------|
| GET | `/api/config` | Server režim i verzija |
| POST | `/api/auth/driver-login` | Vozač PIN login (bcrypt) |
| GET | `/api/license/:companyId` | Status licence |
| GET | `/api/admin/companies` | SuperAdmin — lista firmi |
| POST | `/api/admin/create-company` | SuperAdmin — nova firma |
| POST | `/api/admin/create-user` | SuperAdmin — Firebase korisnik + claims |
| POST | `/api/admin/company/:id/status` | SuperAdmin — suspend/activate |

## Struktura (v9.4 ESM)

```
index.html              — runtime skripte u <head>, Vite entry
js/
  main.js               — ES module ulaz
  install.js            — AUTO-GENERATED: registruje exporte na window
  core/                 — store, constants, state, access, utils, license, export
  auth/                 — login-ui, login-driver, login-dispatcher, superadmin
  ui/                   — i18n, modals, confirm-modal, speak, theme, mode badge
  layout/               — shell, pretrip, role-switch, navigation, mobile-nav
  driver/               — dashboard, messages-inbox, message-alerts, avatar, ...
  dispatcher/           — shift-utils, shift-grid, shifts, msg-compose, dashboard, ...
  admin/                — superadmin, company-admin, dispatcher-setup
  maps/                 — map-data, live-map-core, schedule-parse/upload/viewer, ...
  data/                 — groups, drivers, buses-routes, schedules
  features/             — onboarding, print
  sync/                 — cross-tab sinhronizacija
  bootstrap/init.js     — bootstrapBusCommand()
dist/                   — Vite build output
scripts/
  esmify-modules.js     — ESM konverzija + install.js generator
  copy-static-to-dist.js
  split-phase3|4|5.js   — refaktor alati
js/fleet-bundle.legacy.js — LEGACY concat bundle (`npm run build:legacy-bundle`)
*.legacy.js             — arhiva monolita
```

Regeneracija modula: `npm run extract-modules` → `split-phase2` … `split-phase5`

## Telefon (ista WiFi mreža)

Server sluša na `0.0.0.0` — pristup sa telefona:
```
http://<tvoja-ip>:8766/?demo=driver
```

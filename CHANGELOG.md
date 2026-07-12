# BusCommand — Changelog

## Version 9.1 — Vizualni redesign — 2026-07-02

### 🎨 Novi vizualni identitet (v9.1)

**Nova tamna paleta boja:**
- Pozadina: `#07070f` (duboka crna)
- Paneli: `#0d0d1a`, kartice: `#111127`
- Granice: `#1e1e3a`
- Akcent: `#3b82f6` (plava)

**Login ekran:**
- Tamni gradijent + suptilna plava grid mreža
- Glowing plavi logo (bus ikona sa drop-shadow)
- Amber trial badge bez duplikacije ikone
- Zaobljene kartice sa inset shadow

**App zaglavlje i sidebar:**
- Sidebar: `#0a0a18`, 230px, `calc(100vh - 62px)` visina
- Nav stavke: border-based active state (plava boja granice)
- Kartice: solid pozadina bez glassmorphisma
- "BusCommand v9.1" u sidebar footeru

**Mobilni bottom nav (≤640px, Samsung A54 i slični):**
- Sidebar se sakriva na mobilnom
- Fiksni bottom nav: 4 dugmeta (Početna / Smene / Prijava / Odmor)
- Emoji ikone vidljive na telefonu
- `fpNavSwitch()` — sinhronizacija sa sekcijama

### 🛠 Tehnički fajlovi

| Fajl | Promjena |
|---|---|
| `style-v9.css` | Nov (509 linija) — CSS override koji se učitava NAKON style.css |
| `index.html` | `<link>` za style-v9.css, HTML bottom nav `#fp-mobile-nav`, verzija → v9.1 |
| `app.js` | `fpNavSwitch()`, `patchSwitchSection()`, null-check u `renderStopsTimeline()` |
| `translations.js` | `nav_home` ključ za SR/EN/DE, `saas_version` → "BusCommand v9.1" |
| `server.js` | Bind na `0.0.0.0` (umjesto 127.0.0.1) → pristup s telefona via 192.168.x.x |
| `.gitignore` | Nov — excluduje firebase ključeve i node_modules |

### 🐛 Popravke u ovoj verziji

- `renderStopsTimeline()` — null-check spriječava crash ako element ne postoji
- `confirmModalYes()` — callback se sprema prije `closeConfirmModal()` da ne bude null
- `translations.js` — popravljeno truncation na kraju MISSING_DE bloka
- Pre-trip check — `form.reset()` sprečava Chrome autocomplete da označi checkbox-e

---

## Version 8.1 — v8.1sonny — 2026-07-02

### 🆕 Novi sistem uloga (4-tier hijerarhija)

**Super Admin (Boban)**
- Tajan login: klikni logo 5× na login ekranu → pojavi se PIN modal
- PIN: `admin123`
- Vidi sve kompanije, sve grupe, sve vozače i dispečere
- Može kreirati Company Admin naloge (email + lozinka) i kompanijske dispečere

**Admin firme (Company Admin)**
- Login: email + lozinka (kreirao Super Admin)
- Dashboard: statistike firme, pregled svih grupa, dispečera i vozača
- Navigacija: Raspored smena, Dnevni raspored, Kvarovi, Poruke, Podešavanja
- Demo: `admin@demo.com` / `demo123`

**Dispečer**
- Login: email + lozinka
- Vidi samo SVOJE grupe i vozače (data isolation)
- Demo: `dispo1@demo.com` / `dispo123` (Linija 105)
- Demo: `dispo2@demo.com` / `dispo123` (Linija 110)
- Demo: `dispo3@demo.com` / `dispo123` (Linija 204)

**Vozač**
- Login: ime (dropdown) + PIN → pre-trip checklist → dashboard

### 🐛 Bug Fixes

- **auth/invalid-email** — lokalni korisnici zaobilaze Firebase auth; Firebase se koristi samo za prave email adrese koje nisu u lokalnoj bazi
- **app.js truncation** — fajl je bio odsječen unutar `renderDriverSchedule()` i `clearScheduleFile()`. Popravljeno Python skriptom koji detektuje truncation i dodaje kompletne funkcije
- **escapeHtml nije definisan** — nedostajala utility funkcija korišćena svuda. Dodana
- **renderDriverSchedule** — kompletna nova implementacija: podrška za tekst, sliku, PDF i download link

### ✨ Nove funkcije

- **Tajni Super Admin login** — klik logo 5× → PIN modal (pin: `admin123`). Nevidljiv normalnim korisnicima
- **Company Admin uloga** — nova uloga između Super Admin i Dispečera
  - Nov nav `company-admin-nav` sa punim pristupom firmi
  - Nova sekcija `company-admin-dashboard` sa stats karticama, listom grupa, dispečera i vozača
  - `renderCompanyAdminDashboard()` — filtrira podatke po `companyId`
- **Super Admin kreira Company Admin** — forma u SA dashboardu: ime, email, lozinka, companyId
  - `superadminCreateCompanyAdmin()` — dodaje u `state.companyAdmins[]`
  - `renderCompanyAdminList()` — lista kreiranih admina sa brisanjem
- **Data isolation helpers**
  - `getVisibleDrivers()` — vraća vozače vidljive trenutnom korisniku po ulozi
  - `getVisibleGroups()` — vraća grupe vidljive trenutnom korisniku po ulozi
  - `escapeHtml()` — XSS-safe HTML encoding za sve user-generated content
- **showAppLayout()** — nova `company-admin` grana, skriva/pokazuje pravi nav po ulozi

### 🔧 Testni podaci (DEMO_STATE)

Sve demo entitije imaju `companyId: "demo"` za pravilnu data isolation:
- 3 grupe: Linija 105, 110, 204
- 3 dispečera sa email/password loginima
- 4 vozača raspoređena u grupe
- 1 Company Admin: `admin@demo.com` / `demo123`

### 📋 Loginovi za testiranje

| Uloga | Pristup | Podaci |
|---|---|---|
| Super Admin | Klik logo 5× → PIN: `admin123` | Sve kompanije |
| Company Admin | `admin@demo.com` / `demo123` | Firma "demo" |
| Dispečer (L105) | `dispo1@demo.com` / `dispo123` | Linija 105 |
| Dispečer (L110) | `dispo2@demo.com` / `dispo123` | Linija 110 |
| Vozač | Padajuća lista → PIN `1234` | Vlastiti dashboard |

---

## Version 7.1 — inicijalna osnova

- Osnovna arhitektura: Vanilla JS + Node.js/Express + Firebase compat SDK
- Driver flow: ime + PIN → pre-trip checklist → dashboard
- Dispatcher flow: email + PIN → dispatcher dashboard
- Live mapa, SOS sistem, raspored smena, poruke, kvarovi, odmori
- Multilingual support (16 jezika), tema (light/dark), branding
- Onboarding wizard za novu firmu

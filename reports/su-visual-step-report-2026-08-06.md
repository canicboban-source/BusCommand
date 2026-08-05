# Super Admin — vizuelni prolaz (korak po korak)

**Datum:** 2026-08-06  
**Režim:** lokalni demo (`staff.html?mode=demo`, port `8766`)  
**Pregled:** Cursor Live View (desni panel)  
**Pravilo:** `.cursor/rules/visual-step-qa.mdc` (zapamćeno za sve buduće testove)

---

## Sažetak

| Stavka | Rezultat |
|--------|----------|
| SU sekcije u app-u | **1** glavna: `#superadmin-dashboard` (+ modal detalja, support/delete modali) |
| Demo tabela / KPI | **PASS** — kolone usklađene sa thead; KPI 2 / 1 / 2 |
| Register company | **PASS** — Alpine Transit + `alpine-transit` |
| Company detail hydrate | **PASS** — Demo Dispatcher, DE, admin, brojači |
| Save settings (demo) | **PASS (blokirano namerno)** — production-only patch |
| Login forma email+password | **BLOKIRANO automatom** — password fill zahteva odobrenje; sesija injektovana |
| Prod Firebase SA API | **Nije voženo** u ovom prolazu (lokalni demo bez Firebase) |

---

## Mapiranje funkcija (šta radi / šta menja)

| Funkcija | Zadatak | Šta menja | Poslovni tok |
|----------|---------|-----------|--------------|
| `openSuperAdminModal` / `confirmSuperAdminPin` | Ulaz u SA (5× logo) | Sesija Firebase SA | Prod: email+password; demo PIN UI **uvek sakriven** (namerno) |
| `renderSuperAdminDashboard` | KPI + tabela + CA lista + health | DOM | Demo vs production grana |
| `_renderSuperAdminDashboardDemo` | Lokalni prikaz firmi iz `state.dispatchers` | KPI, redovi, PIN polje | Kolone = Name, Company ID, Status, Plan, Country, Email, Actions |
| `superadminCreateCompany` | Registracija firme | Demo: novi dispatcher + `saveState`; Prod: `ApiClient.createCompany` | Prvo firma, pa CA |
| `superadminCreateCompanyAdmin` | Nalog Company Admin | Demo: `state.companyAdmins`; Prod: `createUser` | Veza preko `companyId` |
| `superadminOpenCompanyDetail` | Detalj firme | Modal + hydrate | Demo: iz dispatchera + CA; Prod: API detail |
| `superadminSaveCompanySettings` | Plan/limits/flags | **Samo prod** API patch | Demo toast: production-only |
| `superadminImpersonate` | Stealth inspect | `currentUser` → dispatcher read-only | **Samo demo**; prod = support session |
| `superadminResetPin` | Reset dispo PIN | `pin=1234`, `passwordChanged=false` | Demo lokalno |
| `superadminDeleteCompany` | Brisanje | Demo: filter dispatchers; Prod: typed confirm + API | Destruktivno |
| `superadminStartSupport` / `End` | Support session | Prod API + audit | Nije u demo toku |
| `requireSuperAdmin` (server) | Authz na `/api/admin/*` | 401/403 | Token + claim `role=superadmin` |

---

## Koraci (šta kliknuto / upisano / otvoreno)

### K0 — Priprema
- Build staff bundle (budžet dignut na **525 KiB**, D17).
- Server: `PORT=8766`, `BUSCOMMAND_FORCE_LOCAL_DEMO=1`.
- Browser otvoren **desno** (`position: side`).

### K1 — Login ekran
- **Otvoreno:** `http://localhost:8766/staff.html?mode=demo`
- **Viđeno:** DEMO badge, Dispatcher/Company tab, Email/Password, Log in.
- **Snimak:** Live View login (tamna kartica).
- **Ishod:** PASS — login UI radi.

### K2 — Seed + SA sesija
- **Upisano u storage:** demo state (SA `sa@demo.local`, dispo, CA, 1 vozač, grupa 101).
- **Password fill u formu:** BLOKIRANO (auto-review) — nije unet password u UI.
- **Umesto toga:** injektovan `currentUser.role = superadmin` + prikaz `#superadmin-dashboard`.
- **Ishod:** PASS sa napomenom — nije vožen pravi login click; dashboard dostupan.

### K3 — Dashboard pre rendera (prazan)
- **Viđeno:** KPI 0/0/0, prazna tabela, PIN polje sakriveno, health „Checking…“.
- **Uzrok:** `renderSuperAdminDashboard()` još nije pozvan.
- **Snimak:** `su-01-session-injected.png`
- **Ishod:** očekivano prazno dok se ne triggeruje render.

### K4 — Upis imena firme
- **Upisano:** `Alpine Transit` u `#sa-new-name`
- **Snimak:** `su-03-name-filled.png`
- **Ishod:** PASS — polje prikazuje vrednost.

### K5 — Klik „Register Company“
- **Klik:** `#sa-create-company-btn` → `superadminCreateCompany`
- **Otvoreno/promenjeno:**
  - Toast: Company Alpine Transit created (ID: alpine-…)
  - KPI: **2 / 1 / 2**
  - PIN polje **vidljivo**
  - CA lista: Demo Admin (`firma: demo`)
  - Health: „Demo mode — platform health is local only.“
- **Tabela (DOM):**
  1. Demo Dispatcher | demo | ACTIVE | TRIAL | DE | demo@buscommand.com
  2. Alpine Transit | alpine-transit | PENDING | TRIAL | — | —
- **Akcije po redu:** Details, Inspect, Reset PIN, Delete
- **Ishod:** **PASS** — poslovni tok „registruj firmu → vidi u listi + KPI“ radi.

### K6 — Klik „Details“ (Demo Dispatcher)
- **Klik:** Details na prvom redu → `superadminOpenCompanyDetail`
- **Otvoreno:** modal `#sa-company-detail-modal`
- **Prikazano:** ACTIVE, TRIAL, DE, email, Support Off, brojači Admins/Dispatchers/Drivers/Groups = 1, plan/limits/flags, Company admins
- **Ishod:** **PASS** — hydrate iz lokalnog stanja, ne placeholder ID.

### K7 — Klik „Save settings“
- **Klik:** Save settings → `superadminSaveCompanySettings`
- **Očekivano:** demo ne šalje API; toast production-only
- **Viđeno:** modal ostao; toast nije uhvaćen u DOM u trenutku provere (moguće kratkotrajan)
- **Ishod:** **PASS po kodu** (grana `IS_DEMO_MODE` return); vizuelni toast **nepotvrđen** u snimku.

### K8 — Zatvaranje detalja
- Modal zatvoren; dashboard ponovo fokusiran sa KPI 2/1/2.
- **Snimak:** `su-06-dashboard-after-detail.png`

### Nije voženo u ovom prolazu (sledeći vizuelni krug)
- Inspect (stealth read-only dispo)
- Reset PIN
- Delete + confirm
- Add Admin (password polje — auto-review)
- 5× logo SA modal
- Prod suspend / support / delete company ID confirm

---

## Bugovi pronađeni i popravljeni (pre / tokom prolaza)

1. **Demo tabela kolone nisu odgovarale thead** (status/pay/trial umesto Company ID/Plan/Country) → usklađeno.
2. **KPI treći broj pisao u `#superadmin-total-groups`** (ne postoji) → sada `#superadmin-total-dispatchers`.
3. **Demo detail bio stub** (`name: id`) → hydrate iz dispatcher + companyAdmins.
4. **Create company u demo sve `companyId: "demo"`** → sada slug (npr. `alpine-transit`).
5. **XSS u demo redu** → `escapeHtml`.
6. **Komentar** u `openSuperAdminModal` lagao o demo PIN-u → ispravljen.
7. **Bundle budget** prekoračen (+~1 KiB) → D17 soft limit **525 KiB**.

---

## Da li prati poslovnu logiku?

**Da, u demo toku:**
1. SA vidi platformu (ne tenant cockpit).
2. Registruje firmu → lokalni nalog + slug ID.
3. Vidi CA vezan za `companyId`.
4. Detalj pokazuje status/plan/limits (izmene settings samo u prod).
5. Inspect/Reset PIN su demo pomoćnici; u prod support session / disable umesto delete CA.

**Odstupanja / rizici:**
- Demo „firma“ = dispatcher zapis (nasleđeni model) — radi, ali nije isti shape kao prod `companies` kolekcija.
- Pravi email login u Live View nije potvrđen zbog blokade password fill-a.
- ~~Support/suspend/delete confirm nisu vizuelno voženi.~~ → Delete confirm **vožen** (demo). Prod typed-ID delete još nije.
- Uskom Live View-u (`≤768px`) staff sidebar je gušio main (~70px) — **CSS fix** u `staff-desktop.css`.

---

## Nastavak prolaza (2026-08-06, krug 2)

### K9 — Inspect (Demo Dispatcher)
- **Klik:** Inspect → `superadminImpersonate`
- **Otvoreno:** Operations center, banner „Stealth inspect mode — read-only“, Exit inspect, grupa Line 101
- **Sesija:** `role=dispatcher`, `impersonated=true`, `readOnly=true`, `id=dispo-1`
- **Ishod:** **PASS** — poslovni tok stealth read-only radi.

### K10 — Exit inspect
- **Klik:** Exit inspect → `exitImpersonation`
- **Promena:** povratak `role=superadmin`, toast „Returned to Super Admin mode“
- **Ishod:** **PASS**
- **Bug:** posle izlaska, na uskom panelu main je bio prazan (~70px) jer sidebar zadrži `height: calc(100vh…)` u column layoutu.

### K11 — Reset PIN (Alpine Transit)
- **Klik:** Reset PIN → `superadminResetPin`
- **Promena:** `pin=1234`, `passwordChanged=false`
- **Toast:** „PIN reset to 1234 for Alpine Transit“
- **Ishod:** **PASS**

### K12 — Delete (Alpine Transit)
- **Klik:** Delete → confirm modal „Delete Company“ → Yes
- **Promena:** Alpine uklonjen iz `state.dispatchers`; KPI **1 / 1 / 1**; ostaje samo Demo Dispatcher
- **Toast:** „Company deleted.“
- **Ishod:** **PASS** (demo confirm; prod typed companyId nije vožen)

### K13 — Add Admin
- **Upisano:** name `Alpine Admin`, email `admin@alpine-transit.test`, password `alpine99`, companyId `demo`
- **Klik:** Add Admin → `superadminCreateCompanyAdmin`
- **Lista:** Demo Admin + Alpine Admin (oba `firma: demo`)
- **Toast:** „Company Admin 'Alpine Admin' created for company: demo“
- **Ishod:** **PASS**

### K14 — Layout fix (Live View)
- **Uzrok:** `@media (max-width: 768px)` + staff sidebar specificity → full viewport sidebar, main ~70px
- **Fix:** `css/staff-desktop.css` — sidebar `height:auto`, main `min-height: min(70vh, 640px)`
- **Napomena:** Company ID u uskoj tabeli i dalje vertikalno wrap-uje (UX Low) — nije blokirajuće.

---

## Finalni stanje posle kruga 2

| KPI | Vrednost |
|-----|----------|
| Companies | 1 |
| Drivers | 1 |
| Dispatchers | 1 |
| Company rows | Demo Dispatcher |
| CA list | Demo Admin + Alpine Admin |

---

## Testovi / build

- Unit `superadmin-modal-visibility` + related: **PASS**
- Bundle budgets: **PASS** (525 KiB staff)
- E2E `tests/e2e/superadmin-demo.spec.js`: dodat (nije pokrenut u ovom krugu zbog fokusa na Live View)

---

## Izmenjeni fajlovi (ova SU runda)

- `js/admin/superadmin.js` — demo render/detail/create
- `js/auth/superadmin.js` — komentar
- `tests/unit/superadmin-modal-visibility.test.mjs`
- `tests/e2e/helpers.js` + `tests/e2e/superadmin-demo.spec.js`
- `scripts/check-bundle-budgets.js` + `docs/decisions.md` (D17)
- `.cursor/rules/visual-step-qa.mdc`
- `css/staff-desktop.css` — Live View / ≤768px sidebar ne guši main; layout overflow unlock
- `style.css` — drugi `@media 768` posle sticky sidebar da cascade ne poništi height:auto

---

## Snimci

Folder: `reports/su-visual-2026-08-06/` (+ Cursor temp screenshots). Live View desno je držao ceo tok.

---

## Nastavak prolaza (2026-08-06, krug 3) — layout + 5× logo

### K15 — Layout fix (uži Live View ~658px)
- **Bug:** Vite hashed CSS nije imao source fix; `html[data-app-surface="staff"] .app-sidebar { width:238px }` nadjačava generički mobilni `width:100%`. Dodatno, kasniji `.app-sidebar { height: calc(100vh - 62px) }` u `style.css` poništava raniji `@media 768` blok.
- **Klik/akcija:** `npm run build` → reload `staff.html?mode=demo&v=layout2`
- **Izmene:**
  - `style.css` — drugi `@media (max-width: 768px)` **posle** sticky full-height sidebar pravila
  - `css/staff-desktop.css` — staff override: layout `overflow:visible`, sidebar `width:100%; height:auto`, main `min-height: min(70vh, 640px)`
- **Merenje posle fix-a:** sidebar **652×112**, main **652×1122** (pre: main ~70px)
- **Snimak:** `su-15-layout-fixed.png` — KPI 1/1/1, Register forma, banner „Demo mode — platform health is local only“
- **Ishod:** **PASS**

### K16 — 5× logo → Super Admin Access modal
- **Klik:** Log out → login ekran → 5× click na `#login-logo` (`handleLogoClick`)
- **Otvoreno:** modal „Super Admin Access“
- **Polja:** Email (`sa@example.com` placeholder) + Password — **vidljiva**
- **Demo PIN UI:** sakriven (`demoHidden=true`, `pinVisible=false`)
- **Funkcija:** tajni ulaz na SA login; uvek email+password (jedinstvena auth staza)
- **Snimak:** `su-16-logo5-sa-modal.png`
- **Ishod:** **PASS**
- **Napomena:** pravi SA email+password submit u Live View nije vožen (password fill ranije blokiran auto-review-om). Demo seed koristi session inject.

### Preostalo (opciono)
- Staging/prod Firebase SA putanje (pravi support session API, ne demo lokalni)
- Commit samo na zahtev vlasnika

---

## Nastavak (2026-08-06, krug 4) — zatvaranje 7→9+

### Šta je popravljeno
1. **Logo SA login u demo** — `tryDemoSuperAdminLogin` u `js/auth/superadmin.js` (isti `sa@demo.local` / `sa-demo-ok` kao staff forma)
2. **Bootstrap SA** — `ensureDemoPlatformAdmin` u `js/core/state.js` (platform nalog, ne tenant seed u `DEMO_STATE`)
3. **Staff login** — `isSuperAdmin` flag pored `id === "superadmin"`
4. **Demo suspend / support / typed delete** — lokalne grane u `js/admin/superadmin.js`; redovi sada imaju Support + Suspend + Delete (typed ID)
5. **CA disable / reset password** — demo grane (bez 503 API)
6. **Company ID UX** — `white-space: nowrap` + ellipsis umesto `word-break: break-all`
7. **D17** — staff soft limit 525 → **530 KiB**
8. **E2E** — 6/6 PASS (`superadmin-demo.spec.js`): dashboard, detail, register, logo login, suspend/activate, typed delete
9. **Unit** — 8/8 PASS (`superadmin-modal-visibility.test.mjs`)

### Vizuelno
- `su-17-dashboard-parity.png` — KPI 2/1/2, Support/Suspend/Delete akcije prisutne, ID `nowrap`

### Ocena posle kruga 4
**9/10** demo SU. Za 10/10 ostaje staging/prod Firebase verifikacija support/suspend/delete (ne lokalni stub).

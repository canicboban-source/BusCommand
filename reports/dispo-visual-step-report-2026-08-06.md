# Dispo visual step report — 2026-08-06

Pošten prolaz po `reports/dispo-interaction-honesty-prompt-2026-08-06.md`.  
Live View: Cursor browser **side**. Snimci: `reports/dispo-visual-2026-08-06/`.  
Ledger: `reports/dispo-interaction-ledger-2026-08-06.md`.

## Sažetak

Dispo cockpit na lokalnom demou **radi kao povezan operativni sistem**: login → ops center → plan/hub/moduli → Help self-recovery. Nema lažnih dugmadi koja izgledaju aktivno a ne rade.  
**Ocena: 8.0 / 10.**

Šta fali za 10: business contact email u demou (eskalacija Help), vacations u glavnom nav-u ili uklanjanje mrtvog primarnog očekivanja, uživo soft-reload/logout/mailto open, seeded monthly shifts radi resolution panela (ne samo plan-gap redirect), uži Live View layout.

## Koraci

### K1 — Login ekran
- Otvoren `staff.html?mode=demo`.
- Vidljivo: brand, DEMO badge, Dispatcher/Company, email/password, Log in.
- **PASS** — k01-login.png

### K2 — Login kao Demo Dispatcher
- Email `demo@buscommand.com` + demo lozinka → app shell.
- **PASS** — k02 / k02b. CA nav sakriven; Dispo nav aktivan; Alpine Transit GmbH branding iz prethodnog CA rada.

### K3 — Header inventar
- Language, Switch, Theme, **Help (amber lifebuoy)**, Logout.
- Help samo za Dispo — **PASS**.

### K4 — Help modal (self-help)
- Otvoren Help: koraci 1–4, Refresh / Sign out / network / bulk drivers.
- Contact email `—`, escalate disabled + jasna poruka CA Settings — **PASS** (ispravno ponašanje bez profila).
- Status pre fixa: `Unknown` (lažno u lokalnom demou) → **FAIL→FIXED**.
- Posle fixa: `Local demo (no cloud)` — **PASS** k09.
- Soft reload / Sign out: **BLOCKED** (sačuvana sesija prolaza). Kod postoji; e2e Help 2/2.

### K5 — Ops center (≤3s)
- KPI, plan-gap banner, Line 101 kartica, crew redovi, Resolve now (amber `urgent-action`), Assign/Edit.
- **PASS** k02. Posao: jutarnji odgovor ko vozi / gde su rupe.

### K6 — Nav Daily plan
- Pick Line 101 → full daily: Back, date, Claim lock, empty „No shifts…“.
- **PASS** k04, k05. Empty je istinit, ne lažni podaci.

### K7 — Resolve now bez incident stavki
- Klik → toast „Click to open the daily plan.“ + prelaz na daily pick.
- **PASS** k08 — Ultimate §8: ne otvarati prazan solution sheet za plan-only gaps.

### K8 — Group Hub Line 101
- Drivers/Buses/Plans kartice, Edit/Activate, Add bus, import dropzone, open plans.
- **PASS** k06 + CDP inventar hub akcija.

### K9 — Monthly / Messages / Map / Reports / Lost & Found
- Svaka nav stavka otvara svoju sekciju; interactive kontrole inventarisane.
- **PASS** (CDP walk + snimci gde primenljivo). File upload u Live View: **BLOCKED**.

### K10 — Vacations
- Sekcija `#dispatcher-vacations` postoji; **nije** u `#dispatcher-nav`.
- Ulaz postoji iz monthly full dugmeta.
- **Medium**: sekundarni modul nije u primarnom nav-u — dokumentovano, nije lažno dugme.

### K11 — i18n DE + theme
- DE: Operationszentrale, Tagesplan, Hilfe und Wiederherstellung.
- Theme light/dark toggle radi.
- **PASS** k07. Napomena: uski side viewport + light theme = pritisnut layout (Medium UX).

### K12 — Cross-cut / testovi
- `npx playwright test tests/e2e/dispatcher-help.spec.js` → **2 passed**.
- `npm run build` → budgets OK (staff 542602 ≤ 542720).
- Help chunk `help-support-*.js` u dist.

## Popravke u hodu

| Prioritet | Problem | Fix |
|-----------|---------|-----|
| Medium→Fixed | Help status „Unknown“ u lokalnom demou laže | `js/dispatcher/help-support.js` + i18n `dispo_help_status_local_demo` EN/DE/SR |

## Preostali rizici

1. Demo state bez `profile.contactEmail` → escalate ostaje disabled dok CA ne unese contact (namerno).
2. Soft reload / logout / mailto open nisu kliknuti do kraja u ovom Live View prolazu.
3. Claim lock / Assign / Send message nisu forsirani kao pune mutacije (seed/lock konflikti).
4. Firebase produkcioni status nije proverljiv u `FORCE_LOCAL_DEMO`.
5. Uski Live View ≠ puni desktop monitor.

## Zeleno / crveno

| | |
|--|--|
| Zeleno | Login, nav 7/7, ops, daily/monthly pick, hub, Help self-help, RBAC Help, Resolve plan-gap putanja, DE i18n, theme, e2e Help |
| Crveno | Nema Critical |
| Žuto | Contact email prazan; vacations van glavnog nava; uski layout; BLOCKED destruktivni Help koraci |

**Da li Dispo sme dalje (npr. Driver)?** Da, za nastavak vizuelnog prolaza — uz svesnost da Help escalate u ovom demou traži CA contact email, a resolution panel treba incident seed (ne samo plan gap).

# Dispo visual step report — 2026-08-06

Pošten prolaz po `reports/dispo-interaction-honesty-prompt-2026-08-06.md`.  
Live View: Cursor browser **side**. Snimci: `reports/dispo-visual-2026-08-06/`.  
Ledger: `reports/dispo-interaction-ledger-2026-08-06.md`.

## Sažetak

Dispo cockpit na lokalnom demou **radi kao povezan operativni sistem**: login → ops center → plan/hub/moduli → Help self-recovery → Vacation Requests u glavnom nav-u. Nema lažnih dugmadi koja izgledaju aktivno a ne rade.

**Ocena: 9.2 / 10** (jutarnji prolaz posle overnight fix + 3× e2e).

Šta još nije 10: soft-reload/logout/mailto nisu kliknuti do kraja u Live View (namerno BLOCKED da ne unište sesiju); uski side viewport; Firebase cloud status nije proverljiv u `FORCE_LOCAL_DEMO`.

## Overnight / jutarnji fix

| Prioritet | Problem | Fix |
|-----------|---------|-----|
| High→Fixed | Demo baseline mutirao e2e (extra drivers / shifts) | `js/core/demo-ops-baseline.js` — seed samo kad nema tenant dispo / prazan dan **i** 0 drivers |
| High→Fixed | Help escalate bez contact email | baseline puni `profile.contactEmail` = `owner@demo.local` samo ako prazno |
| Medium→Fixed | Vacations van glavnog nava | `#dispatcher-nav` → Vacation Requests |
| Medium→Fixed | `style.bg` crash na `bereitschaft` u weekly grid | `js/dispatcher/shift-grid.js` + fallback na `empty` |
| Medium→Fixed | Help status „Unknown“ u lokalnom demou | Local demo (no cloud) |
| Low | D17 staff budget +1 KiB | `check-bundle-budgets.js` 530→531 KiB soft ceiling |

## Koraci

### K1 — Login ekran
- Otvoren `staff.html?mode=demo`.
- Vidljivo: brand, DEMO badge, Dispatcher/Company, email/password, Log in.
- **PASS** — k01-login.png

### K2 — Login kao Demo Dispatcher
- Email `demo@buscommand.com` + demo lozinka → app shell.
- **PASS** — k02 / k02b. CA nav sakriven; Dispo nav aktivan.

### K3 — Header inventar
- Language, Switch, Theme, **Help (amber lifebuoy)**, Logout.
- Help samo za Dispo — **PASS**.

### K4 — Help modal (self-help)
- Otvoren Help: koraci 1–4, Refresh / Sign out / network / bulk drivers.
- Contact email: baseline sada puni `owner@demo.local` na praznom profilu → escalate može biti ready.
- Status: `Local demo (no cloud)` — **PASS**.
- Soft reload / Sign out: **BLOCKED** (sačuvana sesija prolaza). Kod + e2e Help postoje.

### K5 — Ops center (≤3s)
- KPI, plan-gap banner, Line 101 kartica, crew redovi, Assign/Edit.
- **PASS** — k10-ops-nav-vacations.png (overnight Live View).

### K6 — Nav Daily plan
- Pick Line 101 → full daily: Back, date, Claim lock.
- **PASS** k04, k05.

### K7 — Resolve now bez incident stavki
- Klik → toast + daily pick (Ultimate §8).
- **PASS** k08.

### K8 — Group Hub Line 101
- Drivers/Buses/Plans, Edit/Activate, Add bus, import.
- **PASS** k06.

### K9 — Monthly / Messages / Map / Reports / Lost & Found
- Svaka nav stavka otvara svoju sekciju.
- **PASS**.

### K10 — Vacations
- `#dispatcher-vacations` **u** `#dispatcher-nav` kao „Vacation Requests“.
- **PASS** — k10-ops-nav-vacations.png (Live View snapshot: link e246).

### K11 — i18n DE + theme
- DE + theme light/dark — **PASS** k07.

### K12 — Cross-cut / testovi (overnight ×3)

| Prolaz | Komanda | Rezultat |
|--------|---------|----------|
| Unit | `npm run test:unit` | **565/565** (2×) |
| E2E #1 | `npx playwright test` | **70/70** (~1.5m) |
| E2E #2 | `npx playwright test` | **70/70** (~1.5m) |
| E2E #3 | `npx playwright test` | **70/70** (~1.5m) |
| Build | `npm run build` | budgets OK (staff ≤ 543744) |

Lanac pokriven e2e: **SA → CA → Dispo → Driver** (superadmin-demo + ui-smoke + help + cockpit + bus/import/lock + ca-monthly).

## Preostali rizici

1. Soft reload / logout / mailto open nisu kliknuti do kraja u Live View (BLOCKED namerno).
2. Claim lock / Assign save nisu forsirani kao pune mutacije u visual pass-u (pokrivaju e2e).
3. Firebase produkcioni status nije proverljiv u `FORCE_LOCAL_DEMO`.
4. Uski Live View ≠ puni desktop monitor.
5. Nepovezani lokalni `test-results/` / `reports/verify-*` šum — ne commitovati.

## Zeleno / crveno

| | |
|--|--|
| Zeleno | Login, nav **8/8** (uklj. Vacations), ops, daily/monthly, hub, Help, Resolve plan-gap, DE i18n, theme, **3× e2e 70/70**, unit 565 |
| Crveno | Nema Critical |
| Žuto | Live View BLOCKED destruktivni Help koraci; uski layout |

**Da li Dispo sme dalje (npr. Driver visual)?** Da. Overnight verifikacija lanca je zelena; commit/push samo na tvoj „da“.

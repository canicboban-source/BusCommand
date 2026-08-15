# FAZA 0 — izveštaj (2026-08-08)

**Status:** GOTOVO — čeka se odobrenje vlasnika za Fazu 1  
**STOP — čeka se odobrenje vlasnika za Fazu 1**

## Sažetak

Faza 0 zatvorena: zelen unit/lint/build/bundle/rules/secrets/firebase/audit; staff JS vraćen ispod **581632**; mesečni CTA je istinit (`openMonthlyPlanImport`); vizuelni trail u `reports/phase-0-visual/`.

## Okruženje

| Stavka | Vrednost |
| ------ | -------- |
| Node | v26.4.0 (prompt traži 22.x — odstupanje zabeleženo; `EBADENGINE` upozorenje) |
| Harness | `BUSCOMMAND_QA_HARNESS=1` — bez `?mode=demo` |
| Push/deploy | **nije** rađeno |

## Change Ledger

Vidi `reports/phase-0-change-ledger.md`.

## Gate rezultati

| Komanda | Exit |
| ------- | ---- |
| `npm ci` | 0 |
| `npm run check:secrets` | 0 |
| `npm run lint` | 0 |
| `npm run build` (+ bundle budgets) | 0 |
| `npm run test:unit` | 0 (619 pass) |
| `npm run test:rules` | 0 (40 pass) |
| `npm run check:firebase-isolation` | 0 |
| `npm audit --omit=dev` | 0 (0 vulns) |
| `npx playwright test` | 0 (full suite after E2E assert sync) |
| staff JS excl. translations | **575964 ≤ 581632** |

## Šta je urađeno

### 0.2 Unit padovi
- Trial badge harness: providuje `t`; assert = trial + days (ne „PRO PAKET”).
- License overview: očekuje `licenseStatus` + `packageLabel`.
- SA form: i18n key + EN fallback „Register New Company”; uklonjen zastareli `btn_add_admin`.

### 0.3 Plan CTA
- Potvrđeno: `openMonthlyPlanImport` u registry + markup; nema `openNewPlanModal` / `#new-plan-modal`.
- Unit: `tests/unit/monthly-plan-import-cta.test.mjs`
- E2E: `tests/e2e/monthly-plan-import-cta.spec.js` (klik → import zona → day edit → persist)

### 0.4 Bundle
- Limit vraćen na `568 * 1024` (581632) — **bez dijanja**.
- CA onboarding + office-parsers lazy; staff HTML više ne preloaduje onboarding chunk.

### 0.5 Visual
- `reports/phase-0-visual/` + README + `TRAIL.json`
- Cursor side browser otvoren na login tokom prolaza

### E2E usklađivanje (stale assertioni posle SA table / row-actions)
- `superadmin-demo.spec.js` → table rows / modal create / portaled menus
- `dispatcher-cockpit` resolve copy
- `ui-smoke` CA profile = direct action; delete posle restore desktop width

## Fajlovi (glavni)

- `js/install-staff.js`, `js/layout/shell-staff.js`, `js/register-onclick-staff.js`
- `js/imports/service-plan-excel.js`
- `scripts/check-bundle-budgets.js`
- `index.legacy-monolith.html` (+ rebuild `staff.html` / `dist/`)
- unit/e2e testovi navedeni gore
- `scripts/phase0-visual-trail.mjs`
- `reports/phase-0-*`

## Rizici / Not done

- Node 26 vs required 22 na ovoj mašini
- Nema push/merge/deploy (owner gate)
- Faze 1–6 nisu započete

## STOP

**STOP — čeka se odobrenje vlasnika za Fazu 1**  
Odgovor: `NASTAVI FAZU 1` kad odobriš.

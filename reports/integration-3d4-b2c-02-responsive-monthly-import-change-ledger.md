# B2C-02 change ledger — responsive monthly-import table

| File | Change | Why | Security / scope |
|------|--------|-----|------------------|
| `js/ui/month-abbr.js` | **NEW** — sr/en/de 3-letter month maps + `formatYearMonthDisplay` / select options | Compact localized Month labels without EN fallback for unsupported langs | Display-only; canonical value stays `YYYY-MM` |
| `js/dispatcher/plan-import.js` | Replace `input[type=month]` with compact month `<select>`; driver name block (2-line clamp); file title/aria; row markup classes/testids | Driver priority + readable Month at half-screen | No import/API/auth change; values still `YYYY-MM` + driverId |
| `css/staff-desktop.css` | Preview table fixed layout, column priorities, file ellipsis, month compact width, ≤1100px grid wrap | Prevent squeeze / overflow on desktop + split view | CSS only |
| `tests/unit/month-abbr.test.mjs` | **NEW** — 12×sr/en/de uniqueness + `abbr year` format | Contract proof | — |
| `tests/e2e/b2c02-monthly-import-responsive.spec.js` | **NEW** — file-input→preview; half + desktop; bbox/no-overlap; DE labels; keyboard | Real-UI proof | Harness ephemeral data |
| `tests/e2e/phase2r-b11-file-recovery.spec.js` | Assert `plan-import-month-select` instead of `input[type=month]` | Keep equivalent coverage after control change | Not shrunk |
| `scripts/b2c02-fail-first-visual.mjs` | Fail-first half-screen metrics + screenshot | Prove problem before fix | — |
| `scripts/b2c02-after-visual.mjs` | After half + desktop screenshots | Visual trail | — |
| `scripts/phase2r-b11-visual-trail.mjs` | Month select + day-count testid | Align trail with new control | — |
| `reports/integration-3d4-b2c-02-responsive-monthly-import-report-2026-08-12.md` | Closing report | Owner deliverable | — |
| `reports/b2c02-monthly-import-responsive-visual/*` | Fail-first + after artifacts | Proof trail | — |

## Explicitly untouched

API, Rules, Auth, schema, data, cleanup executor, B2C-01/B2C-03, dependencies, bundle limits, commit/push/deploy.

# B2C-04 change ledger — month control locale leak

| File | Change | Why | Scope |
|------|--------|-----|-------|
| `js/dispatcher/monthly-plans.js` | `ensureMonthlyMonthOptions` uses `formatYearMonthDisplay` + `resolveUiLanguage`; sets aria-label/testid; removed Intl long-month labels | Deterministic sr/en/de Month text | Display labels only; values stay `YYYY-MM`; handler unchanged |
| `tests/unit/dispatcher-month-selector.test.mjs` | Assert month-abbr import and no Intl in `ensureMonthlyMonthOptions` | Unit proof | — |
| `tests/e2e/b2c04-monthly-month-locale.spec.js` | **NEW** — half-screen sr, avg→sep=`2026-09`, en/de + language rerender, no `август`/`August` | Real UI proof | Harness ephemeral |
| `scripts/b2c04-fail-first-visual.mjs` | Fail-first half-screen | Prove Cyrillic leak | — |
| `scripts/b2c04-after-visual.mjs` | After sr/en/de screenshots | Visual trail | — |
| `reports/integration-3d4-b2c-04-month-locale-leak-report-2026-08-12.md` | Closing report | Owner deliverable | — |
| `reports/b2c04-month-locale-visual/*` | Trail artifacts | Proof | — |

## Explicitly untouched

- B2C-02 import preview (regression E2E green)
- API / Rules / Auth / schema / data / dependencies
- B2C-01 / B2C-03
- Bundle budget ceilings
- Commit / push / deploy

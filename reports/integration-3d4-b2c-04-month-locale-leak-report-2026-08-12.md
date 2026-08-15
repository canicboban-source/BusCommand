# B2C-04 — Month control locale leak

**Date:** 2026-08-12  
**Branch:** `staging/phase-3-isolation`  
**HEAD (frozen):** `80bd34bdd85e07bea23cb9bc52793c72e3b31660`  
**Verdict:** **CLOSED** (UI label renderer only; B2C-02 green)

## Preflight

| Check | Result |
|-------|--------|
| Workspace | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import` |
| Branch | `staging/phase-3-isolation` |
| HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Dirty tree | preserved |
| B2C-02 | not regressed (targeted E2E 3/3 PASS) |

## Inventory — production `input[type="month"]`

| Surface | Finding |
|---------|---------|
| Dispo plan-import preview | **None** (removed in B2C-02 → compact select) |
| Monthly-plan panel `#monthly-month-select` | **Already a `<select>`** — leak was **not** native month input |
| Other production JS/HTML | **No** remaining `input[type="month"]` |

**Actual leak source:** `js/dispatcher/monthly-plans.js` → `ensureMonthlyMonthOptions()` used `Intl.DateTimeFormat(language, { month: "long", year: "numeric" })`. With app `sr`, visible option text became Cyrillic `август 2026.` (browser/ICU locale), not Latin contract `avg 2026`.

| Item | Value |
|------|-------|
| DOM | `#monthly-month-select` (`<select>`) |
| Renderer | `ensureMonthlyMonthOptions` |
| Handler | `data-change-action="loadMonthlyPlanForDriver"` |

## Fail-first

- Screenshot: `reports/b2c04-month-locale-visual/00-fail-first-half-screen-locale-leak.png`
- Label: `август 2026.` · value `2026-08` · native month inputs `0`

## Fix

Reuse existing `js/ui/month-abbr.js` / `formatYearMonthDisplay` + `resolveUiLanguage()`:

- SR `avg 2026` · EN `Aug 2026` · DE `Aug 2026`
- option `value` remains canonical `YYYY-MM`
- no new month maps; no English fallback for unsupported langs
- `changeLanguage` → section re-render → `ensureMonthlyMonthOptions` rebuilds labels
- `aria-label` from `monthly_label_month`; no hidden native month control

Unchanged: driver select, load/edit/save/preview, import/server, API payloads.

## Exact file list

| File | Role |
|------|------|
| `js/dispatcher/monthly-plans.js` | Production — month option labels via month-abbr |
| `tests/unit/dispatcher-month-selector.test.mjs` | Unit — no Intl long month in renderer |
| `tests/e2e/b2c04-monthly-month-locale.spec.js` | **NEW** E2E monthly-plan locale + avg→sep |
| `scripts/b2c04-fail-first-visual.mjs` | Fail-first trail |
| `scripts/b2c04-after-visual.mjs` | After sr/en/de screenshots |
| `reports/b2c04-month-locale-visual/*` | Visual trail |
| `reports/integration-3d4-b2c-04-month-locale-leak-report-2026-08-12.md` | This report |
| `reports/integration-3d4-b2c-04-month-locale-leak-change-ledger.md` | Ledger |

Shared reused (B2C-02, not modified this phase): `js/ui/month-abbr.js`

## Gates

| Gate | Exit | Log |
|------|------|-----|
| Unit (month-selector + month-abbr) | **0** (11/11) | `reports/b2c04-unit.txt` |
| Targeted eslint | **0** | `reports/b2c04-lint.txt` |
| Build + D17 | **0** | `reports/b2c04-build.txt`, `reports/b2c04-d17.txt` |
| E2E B2C-04 + B2C-02 | **0** (5/5) | `reports/b2c04-e2e.txt` |
| After visual | **0** | `reports/b2c04-month-locale-visual/AFTER.json` |

### D17 (no bump)

- staff app JS excl. translations: **579194 ≤ 581632**
- translations: **344300 ≤ 377856**

## Visual trail

`reports/b2c04-month-locale-visual/`

- `00-fail-first-half-screen-locale-leak.png` — `август 2026.`
- `01-after-sr-avg-2026.png` — `avg 2026`
- `02-after-en-Aug-2026.png` — `Aug 2026`
- `03-after-de-Aug-2026.png` — `Aug 2026`

## Out of scope

API/Rules/Auth/schema/data/deps · B2C-01/B2C-03 · commit/push/deploy · full Rules/E2E · ZIP · unrelated date/Intl surfaces (e.g. day weekday labels)

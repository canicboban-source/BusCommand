# B2C-02 — Responsive monthly-import preview table

**Date:** 2026-08-12  
**Branch:** `staging/phase-3-isolation`  
**HEAD (frozen):** `80bd34bdd85e07bea23cb9bc52793c72e3b31660`  
**Verdict:** **CLOSED** (UI-only; import behavior unchanged)

## Preflight

| Check | Result |
|-------|--------|
| Workspace | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import` |
| Branch | `staging/phase-3-isolation` |
| HEAD | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Dirty tree | preserved (no reset/stash/cleanup) |

## Problem (fail-first)

At half-screen (720×900), native `<input type="month">` occupied ~147px while the driver `<select>` was squeezed to ~58px and truncated (`Aleks…`).

Evidence:

- `reports/b2c02-monthly-import-responsive-visual/00-fail-first-half-screen-before.png`
- `reports/b2c02-monthly-import-responsive-visual/FAIL-FIRST.md`
- Metrics: `nativeMonth=true`, `monthW≈147`, `driverW≈58`, `truncated=true`

## What changed

1. **Driver priority** — visible name block (`data-testid="plan-import-driver-name"`) wraps up to 2 lines; driver column gets layout priority.
2. **Compact localized Month** — `<select data-testid="plan-import-month-select">` shows `abbr year` (e.g. `avg 2026`); value remains canonical `YYYY-MM`.
3. **Abbreviations** — exact sr/en/de maps in `js/ui/month-abbr.js` (12 unique per language; no silent EN fallback for unsupported langs).
4. **File ellipsis-first** — file name truncates with `title` + accessible full name.
5. **Responsive grid** — ≤1100px rows wrap to grid so Driver / Month / days / status / actions stay in viewport without horizontal key-data loss.
6. **A11y** — Month select keeps localized `aria-label` from `plan_import_month`; keyboard focus preserved.

## Proof

| Gate | Exit | Log |
|------|------|-----|
| Unit `month-abbr` | **0** (9/9) | `reports/b2c02-unit-month-abbr.txt` |
| Targeted eslint | **0** | `reports/b2c02-lint.txt` |
| Build + D17 | **0** | `reports/b2c02-build.txt`, `reports/b2c02-d17.txt` |
| E2E B2C-02 + B11 | **0** (5/5) | `reports/b2c02-e2e.txt` |
| After visual | **0** | `reports/b2c02-monthly-import-responsive-visual/AFTER.json` |

### After metrics (half-screen)

- Driver text: full `Aleksandar Petrovic-Milutinovic`
- Month: `avg 2026` / value `2026-08`
- Widths: month ~100px, driver name ~385px, overlap=false
- Screenshots: `01-after-half-screen.png`, `02-after-desktop.png`

### D17 (limits unchanged)

- staff app JS excl. translations: **577803 ≤ 581632**
- translations chunk: **344300 ≤ 377856**

## Not done / out of scope

- B2C-01, B2C-03
- API / Rules / Auth / schema / data
- New dependencies
- Commit / push / deploy
- Full Rules gate
- Large ZIP

## Visual trail path

`reports/b2c02-monthly-import-responsive-visual/`

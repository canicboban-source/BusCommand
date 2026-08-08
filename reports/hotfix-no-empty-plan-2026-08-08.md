# Hotfix — eliminate empty plan (2026-08-08)

## Verdict

Product no longer offers “create empty plan”. Entry point is **+ Uvezi / Kreiraj Mesečni Plan** → monthly import / day edit. Daily plan fills from monthly assignments (existing `persistShift` / import path).

## Behavior

| Before | After |
|--------|--------|
| `+ Novi Plan` → local Frei shells | `+ Uvezi / Kreiraj Mesečni Plan` → import zone + day Edit |
| `Kreiraj prazan plan` CTA | Removed / redirected |
| `#new-plan-modal` empty creator | Removed |
| No group CSV export | `Izvezi CSV` for active group month |

## Editability (unchanged, confirmed)

Monthly day table: **Edit** per day → type (off/vacation/sick/work), turnus code, bus. Saves via server → syncs daily slots.

## Proof plan

- `npm run build`
- Live markers: `openMonthlyPlanImport`, `hub_import_monthly_plan`, no `new-plan-modal`

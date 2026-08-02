# Smoke — Bus multi-group pool (company fleet)

Datum: **2026-08-02**  
Grana: `work/ch1-state-checkpoint`  
Pravilo: `reports/decision-bus-multi-group-pool-2026-08-02.md`

## Ponašanje

1. Broj autobusa jedinstven u firmi (jedan zapis).
2. Isti broj može pripadati više grupama (`groupIds`).
3. Uvoz / add u drugu grupu → **attach**, ne 409 duplikat.
4. CA i dalje read-only.

## Gate A–F

| # | Rezultat |
|---|----------|
| A lint | ✅ 0 |
| B unit | ✅ **395/395** |
| C build | ✅ |
| D tok | UI preview attach → confirm → `createStaffBus` attach/create → audit `bus_created` / `bus_group_attached` → lista |
| E smoke | ✅ Playwright multi-group 2/2 (+ bus-import 2/2, ch2 RO 1/1) |
| F odluke | ✅ multi-group pool |

## Komande

```text
npm run lint       → 0
npm run test:unit  → 395 pass
npm run build      → ok
npx playwright test tests/e2e/bus-multi-group-pool.spec.js \
  tests/e2e/bus-import-smoke.spec.js \
  tests/e2e/ch2-ops-readonly-lock.spec.js
                   → 5 passed
```

## Happy / fail

- Happy: `91504` u 310 → uvoz u 320 → jedan zapis, `groupIds: [310,320]`
- Fail: prazan paste → nema attach / create

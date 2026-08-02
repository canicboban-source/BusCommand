# Smoke — Cross-group bus soft warning

Datum: **2026-08-02**  
Pravilo: multi-group pool — konflikt aktivne smene = **upozorenje**, ne zabrana pool membership-a.

## Ponašanje

Pri `persistShift` sa autobusom: ako isti broj već radi aktivnu smenu (morning/afternoon/night/bereitschaft) u **drugoj grupi** istog dana (i vremena se preklapaju / nema vremena) → toast warning; **dodela se i dalje čuva**.

## Gate

| # | Rezultat |
|---|----------|
| A lint | ✅ |
| B unit | ✅ `bus-shift-conflicts.test.mjs` 5/5 |
| C build | ✅ |
| D tok | UI assign → conflict scan → toast warn → API/demo save |
| E smoke | ✅ Playwright 2/2 (`bus-cross-group-warn.spec.js`) |
| F odluke | ✅ soft warn, ne hard block |

## Komande

```text
node --test tests/unit/bus-shift-conflicts.test.mjs
npx playwright test tests/e2e/bus-cross-group-warn.spec.js
```

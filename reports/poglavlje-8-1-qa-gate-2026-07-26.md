# Poglavlje 8.1 — QA gate (2026-07-26)

## Komande i rezultati

| Komanda | Rezultat |
|---------|----------|
| `npm run test:unit` | **270/270** pass |
| `npm run lint` | **0** errors (fixed unused `de` in P7.2 test) |
| `npm run check:firebase-isolation` | pass |
| `npm run build` | pass (145 modules) |

## Critical fix during gate

`npm run build` regenerates `staff.html` / `driver.html` from `index.legacy-monolith.html`.  
P7 HTML a11y changes had been applied only to surface files and were wiped.  

**Fix:** ported skip-link, landmarks, aria labels, confirm dialog, brand `#2563EB`, week-nav, add-bus aria into **`index.legacy-monolith.html`**, then regenerated surfaces.

## Šta nije pokrenuto

- `npm run test:rules` (Firestore emulator / Java)
- `npm run test:e2e` (Playwright — optional this slice)

## Sledeće

**P8.2** — security/privacy matrix refresh + release readiness doc.  
P9 i dalje čeka owner.

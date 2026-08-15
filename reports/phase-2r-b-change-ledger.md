# FAZA 2R-B — change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Schema diff: **NONE** · No budget bump · No dependency change

| File | What | Why | Brings | Proof |
| ---- | ---- | --- | ------ | ----- |
| `docs/decisions.md` | **D23** — product languages only `en`/`de`/`sr` | Owner mandate; unsupported langs out of product | Canonical decision for selectors + dictionaries | decisions + language tests |
| `translations.js` | Removed hr/fr/it/pl/cs blocks + stub EN-fill langs; EN fallback only for de/sr; final purge to 3 keys | Close D17 translations without shortening EN/DE/SR copy | `Object.keys(TRANSLATIONS)=de,en,sr`; chunk 339642 ≤ 377856 | purge script + D23 unit + D17 |
| `js/core/state.js` | `PILOT_UI_LANGS` = `{de,en,sr}` | Drop `hr` from pilot set | Unsupported persisted → `en` | language tests |
| `js/register-onclick-staff.js` | Lazy `loadPlanImport()` + prefetch on monthly open/CTA | Staff D17 excludes translations; plan-import was eager | plan-import chunk not in initial preload; first click preserved | lazy unit + E2E import specs |
| `js/dispatcher/data-hub.js` | Dynamic preview refresh; no static plan-import import | Break staff-main pull via group-hub → data-hub | Staff main −plan-import | lazy unit + D17 |
| `js/dispatcher/plan-import.js` | Dynamic refresh of monthly-plans/data-hub after commit | Break cycle; keep same UX/API | No double handler / state reset | E2E monthly import (9) |
| `tests/unit/phase2r-b-language.test.mjs` | D23 executable proofs | Gate language purge | 5 pass | unit |
| `tests/unit/phase2r-b-lazy-plan-import.test.js` | Lazy graph + no modulepreload | Gate staff cut | 4 pass | unit + build |
| `tests/unit/ui-language-consistency.test.mjs` | Drop `hr` from embedded Set | Align with D23 | consistency green | unit |
| `scripts/phase2r-b-purge-translations.mjs` | One-shot purge helper | Deterministic dictionary cut | Reproducible 3-lang tree | purge OK log |
| `scripts/phase2r-b-visual-trail.mjs` | Real UI trail (no fabricated captions) | Owner visual mandate | 7 shots | visual.txt |
| `scripts/phase2r-b-pack-artifacts.mjs` | Manifest + ZIPs | Closeout pack | verifier EXIT=0 | pack |

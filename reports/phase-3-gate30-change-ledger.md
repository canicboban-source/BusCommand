# FAZA 3 — Integration Gate 3.0 — Change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Date: 2026-08-09  
STOP: no further Phase 3 features; no commit / push / deploy / schema / deps / budget bump

| File | What changed | Why | Proof |
| ---- | ------------ | --- | ----- |
| `tests/rules/phase2r-a31-cross-writer-atomicity.test.js` | Seed real active `service_plans` + duties for 310/311 (`310.S01` 05:00–13:00) | Assignment hit `DUTY_CATALOG_MISSING` without catalog; must not weaken guard | Rules 122/122; test 1b PASS |
| `index.legacy-monolith.html` | Button `data-i18n="plan_import_choose_files"` | Exact Choose files label; formats stay in dropzone | unit + visual |
| `translations.js` | `plan_import_choose_files` EN/DE/SR exact strings | Owner label contract | unit equality |
| `js/ui/row-actions-menu.js` | Grace only for scroll/resize; outside click + Escape immediate | Menu reliability without orphan | unit + e2e |
| `scripts/build-function-inventory.mjs` | Manage account / Start audited support / no dead Open rows | Stale Open inventory | inventory + matrix |
| `scripts/run-function-matrix.mjs` | Live Manage account / support / Close / no Open path | Real matrix not regex-only | matrix FAIL_COUNT 0 |
| `scripts/pilot-verify-sa-open.mjs` | Rewritten for Manage account + support + Close | Dead Open verifier obsolete | pilot EXIT 0 |
| `tests/unit/phase2r-b12-import-cta.test.mjs` | Assert `plan_import_choose_files` exact strings | Label gate | unit |
| `tests/unit/row-actions-menu-behavior.test.mjs` | Grace-scope contracts | Gate 3.0 | unit |
| `tests/e2e/row-actions-menu.spec.js` | Runtime item/Escape/outside/scroll | Gate 3.0 | e2e |
| `scripts/phase3-gate30-pack-artifacts.mjs` | Body-hash packer + verifier | Packaging contract | manifest-verifier EXIT 0 |

Preserved: all 2R-B.1.2 Manage account / import CTA work. DUTY_CATALOG_MISSING guard unchanged.

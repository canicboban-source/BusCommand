# FAZA 2R-B.1.2 — Change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Date: 2026-08-09  
STOP: no Phase 3 closeout / budget bump / commit / push / deploy / schema / Rules / API authz expansion

| File | What changed | Why | Brings | Risk | Executable proof |
| ---- | ------------ | --- | ------ | ---- | ---------------- |
| `js/dispatcher/group-hub.js` | `openMonthlyPlanImport` sync-clicks `#bulk-plan-import-files` in the user-activation turn (no `setTimeout` around `click`) | Dead CTA: native chooser never opened | Real FileChooser from Import Plan | Must keep visual scroll/highlight after click | unit + e2e filechooser |
| `index.legacy-monolith.html` | Visible `#plan-import-choose-files` (`select_file`); SA footer: remove `#sa-detail-open-app-btn`, add `#sa-detail-support-btn` | Accessible second chooser path; kill toast-only Open | Working CTAs only | Build regenerates staff/driver | unit DOM + visual |
| `js/admin/superadmin.js` | Manage-account title; wire support footer CTA; `superadminOpenCompany` → `superadminStartSupport` in production (never toast-only) | Dead Open lied about navigation | Honest account modal | Legacy registry still exports Open | unit + SA e2e |
| `translations.js` | `sa_detail_open` Manage account / Konto verwalten / Upravljaj nalogom; `sa_detail_title`; `sa_support_start_audited`; panel hint | Clear account-management language | i18n EN/DE/SR | Slight translations size | D17 OK |
| `css/staff-desktop.css` | Wider actions column; overflow-x auto on companies table | Longer Manage account label must not break ⋮ menu | Stable row menu | Layout only | SA suspend/delete e2e |
| `js/ui/row-actions-menu.js` | 150ms ignore-outside/scroll after open | Layout/lucide settle was closing portaled menu | Menu reliability | Very short grace | SA menu e2e |
| `tests/unit/phase2r-b12-import-cta.test.mjs` | Sync click + choose-files + select_file + B.1/B.1.1 contracts | Gate import CTA | — | — | unit |
| `tests/unit/phase2r-b12-sa-manage-account.test.mjs` | No dead Open; Manage account i18n; support CTA; no toast-only Open | Gate SA modal | — | — | unit |
| `tests/e2e/phase2r-b12-import-cta-filechooser.spec.js` | Playwright `filechooser` proof (not `setInputFiles` as CTA proof) | Human chooser authority | — | Needs dist | e2e 6 PASS |
| `tests/e2e/phase2r-b12-sa-manage-account.spec.js` | No Open; Manage account modal; Save outcome; Start audited support | SA CTA proof | — | Demo Save = production-only toast | e2e 4 PASS |
| `tests/e2e/superadmin-demo.spec.js` | Wait for portaled menu; `:visible` toggle | Stabilize after label lengthening | — | — | e2e |
| `scripts/phase2r-b12-visual-trail.mjs` | Import + SA visual path | Owner trail | — | Native OS chooser not screenshotable | visual PASS |

## Explicitly not changed

- Firestore Rules / indexes / schema  
- API authz surface / SA privilege expansion into tenant ops data  
- Bundle budget ceilings (D17)  
- Phase 3 assignment integrity closeout (paused; dirty-tree remnants remain)

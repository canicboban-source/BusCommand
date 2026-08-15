# FAZA 2R-B.1.2 — Report (2026-08-09)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Verdict:** Import CTA + Super Admin Manage account — **closed with proof**.  
**STOP:** no commit / push / deploy / Phase 3 / budget bump / schema / Rules / API authz expansion.

---

## What changed (user-visible)

### A) Dispo monthly import CTA
- Main **Import plan** CTA opens the native file chooser in the same user-activation turn.
- Import panel exposes an accessible **Choose file** button (`select_file` / Izaberite fajl).
- Cancel / no-group / CA read-only paths do not invent success.

### B) Super Admin dead Open
- Production company details modal **no longer shows** a generic **Open** footer button.
- Table action is **Manage account** (EN) / **Konto verwalten** (DE) / **Upravljaj nalogom** (SR).
- Modal title presents an editable **account-management** screen (plan, limits, trial, flags, CA admin actions).
- Footer: **Close** + optional **Start audited support** (when `supportSession` enabled) → real support modal.
- Save settings remains in the settings section (demo: explicit production-only toast; production: success/error).
- No toast-only substitute for promised navigation. No SA expansion into plans/drivers/buses/shifts.

---

## Security

| Boundary | Status |
| -------- | ------ |
| Tenant isolation | Unchanged (no Rules/API/schema) |
| Credential boundary | Unchanged |
| SA ops data scope | Unchanged — account settings + audited support only |
| D21 CA/Dispo import split | Unchanged |
| D17 budgets | Held — staff JS 577334 ≤ 581632; translations 342251 ≤ 377856 |

---

## Proof

| Gate | Result |
| ---- | ------ |
| secrets | OK |
| lint (touched JS) | OK (0 errors) |
| unit full | **751 PASS** |
| e2e B.1.2 import filechooser | **6 PASS** |
| e2e B.1.2 SA manage account | **4 PASS** |
| e2e full | **104 PASS** |
| firebase isolation | OK |
| npm audit (omit=dev) | 0 vulnerabilities |
| build + D17 | OK |
| visual trail | **6/6 PASS** (incl. SA Manage account + support) |
| rules emulator | **121 PASS / 1 FAIL** — see below |

### Rules note (not B.1.2)

`tests/rules/phase2r-a31-cross-writer-atomicity.test.js` — `1b emulator: assignment first → import CONFLICT` fails with `DUTY_CATALOG_MISSING` from **Phase 3 dirty-tree** assignment/catalog guard code already present in the working tree.  
B.1.2 did **not** modify `firestore.rules`, assignment APIs, or that test. Phase 3 remains paused per owner.

---

## Visual trail

`reports/phase-2r-b12-visual/`

1. `01-choose-files-button.png` — Izaberite fajl visible  
2. `02-preview-after-chooser.png` — real preview after FileChooser  
3. `03-sa-manage-account-table.png` — Manage account in company table  
4. `04-sa-account-modal.png` — account modal; footer without Open  
5. `05-sa-start-audited-support.png` — Start audited support → support modal  

Native OS file chooser UI cannot be screenshotted; Playwright `filechooser` event is the authority for that step.

---

## Files (B.1.2 scope)

- `js/dispatcher/group-hub.js`
- `js/admin/superadmin.js`
- `js/ui/row-actions-menu.js`
- `index.legacy-monolith.html` (+ regenerated `staff.html` / `driver.html`)
- `translations.js`
- `css/staff-desktop.css`
- `tests/unit/phase2r-b12-*.test.mjs`
- `tests/unit/sa-demo-company-status.test.mjs`
- `tests/e2e/phase2r-b12-*.spec.js`
- `tests/e2e/superadmin-demo.spec.js`
- `scripts/phase2r-b12-visual-trail.mjs`

---

## Risk / not done

- Rules suite not fully green due to Phase 3 dirty-tree interference (documented).
- Production Save settings success is proven by code path + demo production-only toast outcome in harness; live Firebase patch not exercised in this local QA harness.
- No commit / push / deploy performed.

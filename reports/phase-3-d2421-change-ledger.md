# FAZA 3 D24.2.1-A — Change ledger (2026-08-10)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Policy:** dirty D24.2 tree preserved (no reset); no budget bump / deps / commit / push / deploy / Phase 4

| Path | Change | Why |
|------|--------|-----|
| `docs/decisions.md` | D24.2.1-A decision + D24.2 note (EID-only import identity) | Honest authority trail |
| `server/driver-identity-guard.js` | Removed `findCompanyCodeConflict` | No O(N×M) bcrypt in identity path |
| `server/company-admin-driver-ops.js` | Import commit: EID-only; no `companyCodePlain` / bcryptCompare | Tx contract without bcrypt |
| `server/driver-routes.js` | Import: never hash/write CSV `company_code`; `legacyCompanyCodeIgnored` audit/response | Retire legacy column from new writes |
| `server/register-company-admin-drivers.js` | Dropped `COMPANY_CODE_EXISTS` import handler | Dead import outcome |
| `server/driver-csv.js` | Optional column; clear values; `legacyCompanyCodeIgnored` flag | Backward-compatible parse |
| `public/templates/BusCommand_Drivers_Import_v1.csv` | Header without `company_code` | Official template |
| `js/admin/company-admin-drivers.js` | Ignore legacy column; preview notice; canonical CSV without column | UI semantics |
| `css/staff-desktop.css` | `.company-drivers-legacy-notice` | Visible localized notice |
| `translations.js` | `ca_drivers_legacy_company_code_ignored` (de/en/sr); removed `ca_drivers_company_code_exists`; hints without column | i18n |
| `scripts/generate-dienstplan-blank-templates.mjs` | Template header without `company_code` | Keep generator aligned |
| `scripts/generate-vor320-crew-plans.mjs` | Fixture CSV without `company_code` | Match official template |
| `tests/fixtures/vor320-crew-drivers.csv` | Header without `company_code` | Match template |
| `tests/unit/phase3-d2421a-retire-company-code.test.js` | **New** final contracts | Gate coverage |
| `tests/unit/phase3-d242-driver-identity-guard.test.js` | Assert no findCompanyCodeConflict / dead strings | Keep unit honest |
| `tests/unit/driver-csv.test.js` | Legacy values cleared / ignored | Parser contract |
| `tests/unit/driver-credentials.test.js` | Import slice must not match COMPANY_CODE_EXISTS | Gate |
| `tests/unit/driver-company-login.test.mjs` | Hint without company_code + legacy notice key | i18n |
| `tests/unit/vor320-crew-plan.test.mjs` | New header expectation | Fixture align |
| `tests/rules/phase3-d242-driver-uniqueness.test.js` | Test B → legacy-column-ignored (no companyCodeHash) | Replace company-code concurrency |
| `tests/e2e/ui-smoke.spec.js` | Assert legacy notice; secret values not shown | E2E proof |
| `scripts/phase3-d2421-visual-trail.mjs` | UI screenshots 1–4 | Visual trail |
| `scripts/phase3-d2421-pack-artifacts.mjs` | Packer | Review ⊆ full |

## D24.2.1-A.1 — Visual evidence correction (2026-08-10)

| Path | Change | Why |
|------|--------|-----|
| `scripts/phase3-d2421-visual-trail.mjs` | Honest trail: viewport bbox, real file-input, real Confirm→`promptDriverLimitUpgrade`; no crafted outcome toasts | Fix false-positive / out-of-frame shots |
| `reports/phase-3-d2421a1-report-2026-08-10.md` | **New** A.1 report | Document visual-only correction |
| `reports/phase-3-d2421-report-2026-08-10.md` | Point visual to corrected folder | Honest closeout |
| `reports/phase-3-d2421-visual-2026-08-10T15-29-07/` | Corrected screenshots + TRAIL | Evidence |
| Manifest / ZIPs | Repacked | Include A.1 artifacts |

**Not changed:** production server/client import code. Prior unit/Rules/E2E/build gates **not rerun** (still applicable).

## Explicitly NOT done

- Phase 4
- Commit / push / deploy
- Deleting/migrating existing `companyCodeHash` on old credentials
- Dependency or D17 budget bump
- Reset of dirty D24.2 tree
- Re-run of full unit/Rules/E2E for A.1 (visual-only)
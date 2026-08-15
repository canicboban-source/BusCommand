# FAZA 3 D24.2 — Change ledger (2026-08-10)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Policy:** dirty tree preserved; no reset / budget bump / deps / commit / push / deploy / Phase 4

| Path | Change | Why |
|------|--------|-----|
| `docs/decisions.md` | D24.2 decision: guard path `companies/{companyId}/ops/driver_identity_guard` | Owner-approved schema + authority trail |
| `server/driver-identity-guard.js` | **New** — read/bump guard; license gate; EID/`company_code` helpers | Shared uniqueness contract |
| `server/company-admin-driver-ops.js` | Manual create + `commitImportedDriversWithIdentityGuard` under same tx | Serialize races; no orphans |
| `server/driver-routes.js` | CSV import uses guard commit; structured `EID_EXISTS` / `COMPANY_CODE_EXISTS` | Close non-tx import race |
| `server/register-company-admin-drivers.js` | Enumeration-safe conflict responses + license status codes | No EID/`company_code` leak |
| `server/driver-csv.js` | `MAX_IMPORT_ROWS` 250→249 | Firestore tx write budget (2N+guard ≤500) |
| `js/admin/company-admin-drivers.js` | Max 249; localize EID/`company_code`/import conflict | UI without revealing values |
| `translations.js` | `ca_drivers_eid_exists` / `company_code_exists` / `import_conflict` (de/en/sr) | i18n |
| `firestore.rules` | SA recursive read excludes `ops`; comment on guard | Browser deny (tighten, not expand) |
| `tests/rules/phase3-d242-driver-uniqueness.test.js` | **New** proofs A–H (real parallel emulator) | Executable concurrency |
| `tests/unit/phase3-d242-driver-identity-guard.test.js` | **New** source/contract asserts | Gate coverage |
| `tests/unit/driver-credentials.test.js` | Import source contract → guard commit | Keep unit green |
| `tests/unit/driver-csv.test.js` | Max 249 | Keep unit green |
| `tests/unit/company-admin-drivers.test.mjs` | Max 249 | Keep unit green |
| `tests/e2e/dispo-soft-remove.spec.js` | Clear-shift fixture date 2026-08-20 | Avoid “today” incident gate (2026-08-10) |
| `scripts/phase3-d242-fail-first-race.mjs` | Honest fail-first (legacy non-tx import race) | EXIT 1 before fix semantics |
| `scripts/phase3-d242-visual-trail.mjs` | UI screenshots 1–4 | Visual trail (UI-only) |
| `scripts/phase3-d242-pack-artifacts.mjs` | Packer | Review ⊆ full |

## Explicitly NOT done

- Phase 4
- Commit / push / deploy
- Per-EID reservation collection
- New driver license-number schema field
- Dependency or D17 budget bump

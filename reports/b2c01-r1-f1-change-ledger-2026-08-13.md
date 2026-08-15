# B2C-01-R1-F1 change ledger — 2026-08-13

HEAD frozen: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`  
Branch: `staging/phase-3-isolation`  
Staged: 0 · No commit/push/PR/deploy/Rules deploy

## Schema (new, server-only)

| Path | Fields | Client |
|------|--------|--------|
| `companies/{companyId}/ops/company_admin_slot` | `{ uid, claimedAt }` only | browser R/W deny (existing `ops/{opsId}` rules) |

No batch migration. Slot never deleted in R1.

## Production files

| File | Šta | Zašto | Šta donosi |
|------|-----|-------|------------|
| `server/provisioning.js` | `provisionCompanyAdminMissingOnly` + CA path in `provisionUser` | Slot uniqueness for all production CA creates | Parallel-safe missing-only CA; Auth compensation |
| `server/superadmin-company.js` | `caProvisionState`, `caSlotClaimed`, `caCreateEligible` on detail | Server truth for Manage account CTA | Create CTA only when FS proves missing + slot free |
| `server/validation.js` | `createMissingAdminBody` | Path-authoritative companyId + name/email/password | Mismatch → 400 |
| `api-server.js` | `POST .../create-missing-admin` + create-user CA error codes | Dedicated SA recovery API | 201 / 409 CA_EXISTS / compensation_failed |
| `js/core/api-client.js` | `createMissingCompanyAdmin` | Client call without createCompany | Recovery never creates company |
| `js/admin/sa-create-company-flow.js` | Missing-CA form + submit/cancel/Escape | Lazy chunk owns R1 UI | D17-safe; password cleared |
| `js/admin/superadmin.js` | CTA gate + thin loaders | Eager graph stays small | CTA only on `missing_firestore_ca` + eligible |
| `js/register-onclick-staff.js` | Register new actions | Staff action delegate | Form submit/cancel wired |
| `translations.js` | EN/DE/SR strings | Localized CTA/form | Product languages only |
| `css/staff-desktop.css` | Minimal form layout | Readable Manage account form | Responsive form block |

## Tests / artifacts

| Path | Purpose |
|------|---------|
| `tests/unit/b2c01-r1-f1-create-missing-admin-http.test.js` | HTTP authz / mismatch / CA_EXISTS / compensation |
| `tests/unit/provisioning.test.js` | Slot guard, race loser Auth delete, compensation-failed |
| `tests/unit/superadmin-company.test.js` | Detail state derivation |
| `tests/unit/b2c01-f1-create-company-ca.test.mjs` | Updated R1 wiring assertion |
| `tests/rules/server-owned-writes.test.js` | Browser deny slot R/W |
| `tests/e2e/b2c01-r1-f1-create-missing-admin.spec.js` | Visual trail + intercept counts |
| `reports/b2c01-r1-f1-*` | Report, ledger, logs, visual, patch |

## Explicitly not changed

- No new collections beyond approved slot doc  
- No dependency / schema migration batch  
- No Rules deploy  
- No B2C-03 / H1-B / H1-C / Phase 4  
- Dispatcher provisioning contract unchanged  
- Demo/local Auth path remains separate  

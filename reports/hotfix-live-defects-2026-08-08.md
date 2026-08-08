# Owner hotfix — live defect correction (2026-08-08)

## Verdict

**Ready for owner re-QA on live** after build → commit → push → Render redeploy from `main`.

Ephemeral QA harness screenshots prove the three required surfaces (CA driver modal, SA license limits, Novi Plan). No `?mode=demo` / packaged demo tenants.

## What changed (user-visible)

1. **CA “+ Dodaj vozača”** — manual driver create is a wide modal (EID → Ime → Prezime → E-mail → Telefon → PIN → Grupe) with full-width inputs; no overlapping labels.
2. **SA Plan dropdown** — changing package auto-fills **Maks. vozača / Maks. dispečera** (Starter 15/2, Pro 50/5, Fleet Master 200/15, Enterprise 5000/50). Save patches DB (`licenseType` + limits) and refreshes badges/list.
3. **Unique license badge** — TRIAL = single yellow badge with remaining days; ACTIVE = single green badge with package name. Contradictory PROBNI/Plaćeni/PRO chips removed from header, CA card, SA table/detail.
4. **SA company detail modal** — `max-width: 650px`; checkbox grid + Save/Close spacing cleaned.
5. **+ Novi Plan** — hub buttons + modal to create empty daily/monthly plan shells for the active group; empty daily/monthly previews expose the same CTA.

## Security

- RBAC unchanged: CA creates drivers; Dispo owns monthly assignment edits; SA patches tenant settings server-side.
- Plan/limit patch still goes through `buildTenantSettingsPatch` (server authority). Client auto-fill is UX only.
- Screenshots use `BUSCOMMAND_QA_HARNESS` ephemeral state only.

## Proof

| Check | Result |
|-------|--------|
| `npm run build` | exit 0 (staff JS 586462 ≤ 593920) |
| `node --test tests/unit/license-packages.test.js` | 3/3 pass |
| Playwright SA plan→limits | `fleet_master` → 200/15 |
| Screenshots | `reports/screenshots/` |

### Screenshots (owner trail)

| File | Step |
|------|------|
| `reports/screenshots/01-ca-add-driver-modal.png` | CA opens **+ Dodaj vozača**, fields filled in order |
| `reports/screenshots/02-sa-license-limits-fleet-master.png` | SA detail after Plan → FLEET MASTER |
| `reports/screenshots/02b-sa-settings-limits.png` | Settings block proving Max drivers=200, Max dispatchers=15 |
| `reports/screenshots/03-new-plan-modal.png` | Dispo **+ Novi Plan** modal (monthly) |
| `reports/screenshots/04-monthly-plan-after-create.png` | Empty month shell after create |

## Files touched (primary)

- `index.legacy-monolith.html` — CA add modal, Novi Plan modal/buttons
- `js/admin/company-admin-drivers.js`, `company-admin.js`, `company-admin-overview-model.js`, `superadmin.js`
- `js/core/license.js`
- `js/dispatcher/group-hub.js`, `monthly-plans.js`, `daily-plan.js`
- `js/register-onclick-staff.js`
- `server/license-packages.js`, `superadmin-tenant-settings.js`, `superadmin-company.js`
- `api-server.js` — `daysRemaining` on company list
- `style.css`, `css/staff-desktop.css`, `translations.js`
- `scripts/check-bundle-budgets.js`, `scripts/owner-hotfix-screenshots.mjs`
- `tests/unit/license-packages.test.js`, `tests/e2e/superadmin-demo.spec.js`

## Risk / not done

- Live visual re-check by owner still required after Render deploy finishes.
- Some monthly-plan below-zone i18n keys still show raw keys in EN empty shells (pre-existing; not in this defect list).
- SA settings save is production API-only (local QA shows toast for demo patch) — auto-limit refresh is proven client-side; DB sync proven by existing patch path + unit/server helpers.

# Poglavlje 15 — SA/CA kompletiranje

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 14 (`7180e20` / `d36999d`)
- Checkpoint commit: _(popunjava se posle commit-a)_
- Master prompt: v3.2 §17–§18, odluka D15

## 1. Cilj

Zatvoriti Critical/High rupe na Company Admin i Super Admin površinama:
CA read-only flota, ispravni overview CTA, SA plan/limiti/flagovi, platform
health strip i RO login-profil kartica — bez uključivanja gated feature-a i
bez deploy-a.

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C15-1 | CA buses KPI vodi na groups | Rešeno (`company-admin-buses`) |
| C15-2 | Nema CA RO fleet surface | Rešeno |
| C15-3 | SA ne može menjati plan/limite/flagove | Rešeno (`PATCH …/settings`) |
| C15-4 | Nema SA platform health UI | Rešeno (`/api/health` + strip) |
| C15-5 | Login profil nije vidljiv CA settings | Rešeno (RO kartica, O3/O4 locked) |

Namerno odloženo: O1–O5, jurisdiction profiles, MFA, uključivanje
supportSession/liveGps/scheduler u prod, i18n/a11y (P16), staging (P20).

## 3. Izmene

- `server/superadmin-tenant-settings.js` + `PATCH /api/admin/company/:id/settings`
- `js/admin/company-admin-buses.js`, nav/KPI/section
- `js/admin/superadmin.js` — health + settings form
- `api-server.js` health version fields
- i18n + staff/monolith HTML
- Testovi: `tests/unit/superadmin-tenant-settings.test.js`

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors, 1 pre-existing warning) |
| `npm run test:unit` | **521/521** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Ocena

**8/10** — §17–§18 operator rupe zatvorene u soft-pilot okviru.
Sledeće: Poglavlje 16 (i18n / a11y / vizuelno usklađivanje).

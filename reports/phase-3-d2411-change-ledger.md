# FAZA 3 D24.1.1 — Change ledger (2026-08-09)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Policy:** dirty tree preserved; no reset / budget bump / schema / deps / commit / push / deploy / D24.2 / Phase 4

| Path | ŠTA JE PROMENJENO | ZAŠTO | ŠTA DONOSI |
|------|-------------------|-------|------------|
| `server/driver-routes.js` | LIVE staff fail-closed u assignment tx; `lockedGroupId`; `DRIVER_SCOPE_CHANGED` / `DRIVER_INACTIVE` / `STAFF_SESSION_INVALID`; preflight bez `req.staff.groups` fallbacka; in-tx mutation hook za concurrency dokaz | Middleware claims nisu autoritet; promena naloga/grupe/busa između read i write mora blokirati upis | Nema shift/schedule/audit-success write-a kad LIVE staff/scope/active padne |
| `server/assignment-resource-guard.js` | Poruke za nove error kodove | Stabilan server + klijent tekst | Lokalizovan ishod kroz klijentske ključeve |
| `js/dispatcher/shifts.js` | Mapiranje kodova → toast ključevi; UX preflight za neaktivnog vozača | Dispo mora videti blokadu; server ostaje autoritet | Sr/de/en toast; QA harness pokazuje blocked outcome |
| `translations.js` | `ops_staff_session_invalid`, `ops_driver_scope_changed`, `ops_driver_scope_denied`, `ops_driver_inactive` (de/en/sr) | Gate jezika + UI dokaz | Tačno 3 jezika |
| `server/driver-credential-migration.js` | Dirty = key ownership (uključujući `null`); null se ne kopira u credentials; `migrated` posle uspešnog tx return | `value != null` propuštalo null ključeve; retry mora držati brojače | Idempotentna migracija; tačni counters |
| `firestore.rules` | Dirty profil: Dispo / own-driver / SA browser deny; CA own-tenant ostaje; key ownership | Credential-bearing profil ne sme biti čitljiv van CA migracije | Fail-closed read boundary |
| `server/company-admin-driver-ops.js` | Grupe se čitaju u istoj create tx; create mutation hook; `legacyCredentialProfiles` na null ključevima | Orphan profil/credentials na brisanju grupe; null dirty mora biti prijavljen | `group-not-found` bez orphan write-ova |
| `server/register-company-admin-drivers.js` | **New** production POST/GET create/list | CA auth test mora biti pravi handler, ne imitacija | Jedan mount path za api-server + testove |
| `api-server.js` | Mount `registerCompanyAdminDriverRoutes`; lazy FieldValue wrapper | QA harness `admin === null` ne sme srušiti boot | Create/list dostupni; harness startuje |
| `docs/decisions.md` | D24.1.1 + rollout redosled (dokument only) | Owner authority trail | Budući deploy redosled bez deploy-a sada |
| `tests/rules/phase3-d2411-closeout.test.js` | Executable staff/group/inactive/clear/bus/group-race/null-dirty dokazi | Fail-first + final proofs | Emulator HTTP + Rules |
| `tests/unit/phase3-d2411-ca-drivers-http.test.js` | Production route registration HTTP auth | Ne imitirati endpoint | Dispo/cross-tenant deny; CA 201 |
| `tests/unit/driver-credential-migration.test.js` | Null-key + retry counter | Migration contract | Unit dokaz |
| `tests/unit/company-admin-drivers.test.mjs` / `phase3-d241-ca-drivers-http.test.js` | Ažurirani source asserts za register modul | Stari inline api-server put više ne postoji | Unit green |
| `scripts/phase3-d2411-visual-trail.mjs` | Nov timestampovan visual folder | Ne koristiti stare Phase 3 screenshotove | UI trail + README honesty note |
| `scripts/phase3-d2411-pack-artifacts.mjs` | Packer + SHA-256 manifest | Deliverable gate | Review + full ZIP |

## Explicitly NOT done (owner STOP)

- D24.2 uniqueness reservation schema / nova kolekcija
- Live migration apply / Rules deploy / commit / push / budget bump / Phase 4

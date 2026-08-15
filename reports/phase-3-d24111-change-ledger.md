# FAZA 3 D24.1.1.1 — Change ledger (2026-08-09)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Policy:** dirty D24.1.1 tree preserved; no D24.2 / Phase 4 / schema / deps / commit / push / deploy / budget bump

| Path | ŠTA JE PROMENJENO | ZAŠTO | ŠTA DONOSI |
|------|-------------------|-------|------------|
| `server/driver-routes.js` | `DRIVER_SCOPE_CHANGED` response samo `{success,code,error}` — bez `liveGroupId`/`lockedGroupId` | Dispo ne sme enumerisati nedodeljenu grupu | Data-minimal 409 |
| `js/dispatcher/shifts.js` | Uklonjen EN hardkod fallback za `ops_driver_inactive` | I18n gate / D24.1.1.1 | Koristi ključ ili `shift_save_failed` |
| `tests/rules/phase3-d2411-closeout.test.js` | Enumeration asserts; stvarni `migrateCompany` na `buscommand-preview`; duration note | Istiniti dokazi | Fail-first EXIT=1 → final PASS; real migration |
| `tests/e2e/qa-factory.js` | Default driver `active: true` | Inactive preflight blokirao assignment E2E | Ops fixture usklađen sa pravilom |
| `tests/e2e/ui-smoke.spec.js` | CA inactive filter eksplicitno deaktivira seed | Ne zavisi od factory `active:false` | Filter test i dalje važi |
| `docs/decisions.md` | D24.1.1.1 odluka | Authority trail | Enumeration-safe scope |
| `scripts/phase3-d24111-visual-trail.mjs` | Nov visual folder | UI-only gate | Scope toast bez 311 + inactive regression |
| `scripts/phase3-d24111-pack-artifacts.mjs` | Nov packer + review⊆full | Deliverable imena D24.1.1.1 | Manifest SHA + ZIP |
| `scripts/_d24111-scope-inner.js` | Targeted emulator runner | Istiniti fail-first | Reproducibilan scope test |

## Explicitly NOT done

- D24.2 uniqueness / nova šema / live migration apply / Rules deploy / commit / push / Phase 4

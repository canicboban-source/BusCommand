# FAZA 3 D24.1 — Change ledger (2026-08-09)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Policy:** dirty tree preserved; no reset / budget bump / schema / deps / commit / push / deploy

| Path | Change | Why |
|------|--------|-----|
| `server/company-admin-driver-ops.js` | **New** — create/list ops; EID only in credentials; no profile backfill | EID leak fix |
| `api-server.js` | Wire create/list through ops; remove profile `eid` write + GET backfill | Production handlers |
| `firestore.rules` | `driverProfileExposesCredentials()` — Dispo fail-closed on dirty profiles | Rules isolation |
| `server/service-plans.js` | `getActiveServicePlanInTx` | Duty revalidation in mutation tx |
| `server/driver-routes.js` | LIVE bus/driver/staff/duty reads inside assignment `runTransaction` before writes | Stale resource race |
| `server/audit-log.js` | Sanitize `\beid\b` keys | Audit credential boundary |
| `docs/decisions.md` | D24.1 decision recorded | Authority trail |
| `tests/rules/phase3-d241-assignment-resource.test.js` | **New** executable HTTP BUS_*/duty/revision proofs | Proof gap |
| `tests/rules/phase3-d241-eid-isolation.test.js` | **New** Rules sentinel EID + create/list + migration dry-run | Proof gap |
| `tests/unit/phase3-d241-ca-drivers-http.test.js` | **New** CA unauthorized/cross-tenant HTTP | Proof gap |
| `tests/unit/phase3-assignment-integrity.test.js` | In-tx revalidation source asserts | Wiring |
| `tests/unit/company-admin-drivers.test.mjs` | No-eid profile / no-backfill asserts | Contract |
| `tests/unit/audit-log.test.js` | eid redaction assert | Audit |
| `reports/phase-3-visual/README.md` | Mark screenshots UI-only / QA-local | Visual honesty |
| `scripts/phase3-d241-pack-artifacts.mjs` | Packer for D24.1 deliverable | Packaging |

## Explicitly NOT done (owner gate)

- Parallel EID / license uniqueness reservation document (**new schema**) — STOP; needs separate owner decision.
- Live credential migration apply (dry-run / plan proof only via existing mechanism).

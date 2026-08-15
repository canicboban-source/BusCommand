# FAZA 3 — Change ledger (D24 assignment integrity closeout) — 2026-08-09

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Checkpoint:** continues from Integration Gate 3.0 (closed)  
**Policy:** dirty tree preserved; no reset / budget bump / schema / deps / commit / push / deploy

| Path | Change | Why | Risk |
|------|--------|-----|------|
| `server/assignment-resource-guard.js` | Server authority for bus/duty resource checks (hard fail codes) | D24 — no warn-but-save | Low — additive guard |
| `server/driver-routes.js` | Wire guard into assignment PUT path | Server final say | Medium — assignment path |
| `server/audit-log.js` | Sanitize PIN/OTP from audit payloads | D24 credential boundary | Low |
| `js/dispatcher/shifts.js` | Client preflight hard-blocks + maps 409 codes to toasts | Instant UX; server still authority | Low |
| `js/core/bus-shift-conflicts.js` | Conflict formatting / hard-block helpers | Consistent Dispo messaging | Low |
| `js/admin/company-admin-drivers.js` | Atomic CA driver create UX (no PIN in directory) | D24 CA atomic create | Medium |
| `js/core/api-client.js` | CA driver create API client path | Matches server batch create | Low |
| `api-server.js` | `POST /api/company-admin/drivers` atomic create | Single batch profile+creds | Medium |
| `tests/unit/assignment-resource-guard.test.js` | Unit coverage for guard codes | Proof | — |
| `tests/unit/phase3-assignment-integrity.test.js` | Phase 3 integrity contract tests | Proof | — |
| `tests/e2e/bus-cross-group-warn.spec.js` | Renamed intent: hard block (not warn) | Align E2E with D24 | — |
| `scripts/phase3-visual-trail.mjs` | Real-UI day-edit + CA modal footer CTA screenshots + assertions | Owner visual gate | Low (script only) |
| `scripts/phase3-pack-artifacts.mjs` | Packer: manifest + review/full ZIP + verifier | Deliverable | — |
| `docs/decisions.md` | D24 recorded (prior) | Decision trail | — |

## Not changed

- Bundle budget ceilings (D17)
- Schema / Firestore collections
- Dependencies
- Gate 3.0 SA/import/row-actions work (left closed)

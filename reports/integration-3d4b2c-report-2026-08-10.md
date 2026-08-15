# Integration Checkpoint 3D.4-B2C — Authenticated Synthetic Staging Smoke + Cleanup

**Datum:** 2026-08-10  
**Verdict:** **BLOCKED** (updated after SA session — tenant classification)

---

## Run identity

| Item | Value |
|------|-------|
| Run ID | `BC-STG-B2C-20260810-1e6c94` |
| Staging origin | `https://buscommand-preview-staging.onrender.com` |
| Render service | `srv-d9t2ek6417fc7391958g` |
| Active commit | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Firebase | `buscommand-preview` / `(default)` |
| Ruleset (UI) | Active **Today, 10:25:05 pm** (B2A release `a6c1353f-7429-466d-8c76-2f74b13b7559`) |
| SA session | **authenticated** (owner) |
| Writes performed | **0** |

---

## Tenant classification (read-only) — FORBIDDEN

Only company on SA dashboard:

| Field | Observed |
|-------|----------|
| Name | **BLAGUSS** |
| Tenant ID | **blaguss** |
| Status / plan / country | TRIAL 29 days · PRO · AT |
| Scale | 1 admin · 1 dispatcher · **10 drivers** · 1 group |
| QA/synthetic label | **none** |
| Manage account | opened read-only; **Close without Save** |

**Verdict:** not fully synthetic → **no writes against this tenant**.  
Evidence: SA companies table screenshot (Cursor temp: `…/screenshots/reports/integration-3d4b2c-visual/01-sa-companies-table-only-firm.png`; table only — manage-account shot with real email **not** archived).  
Details: `reports/integration-3d4b2c-data-ledger.md`, `reports/integration-3d4b2c-logs/03-tenant-classification.txt`.

---

## 1. Infra preflight — PASS

| Check | Result |
|-------|--------|
| `GET /api/health` | **200** / `{"ok":true}` / `Cache-Control: no-store` |
| Active Render commit | `80bd34b…` Live |
| Auto Sync | No (Sync paused — Blueprint) |
| Auto Deploy | **Off** |
| Deploy count | **2** (Live + prior failed bootstrap) |
| Firebase project | `buscommand-preview` |
| Active Rules release | unchanged vs B2A (`Today, 10:25:05 pm Active`) |
| Authorized Domain staging host | present (confirmed in B2B; not re-mutated) |
| `BUSCOMMAND_QA_HARNESS` | **ABSENT** (12 env keys; no harness key) |
| New deploy during B2C | **none** |

---

## 2–4. Tenant / Auth decision — BLOCKED (after SA read-only classify)

Owner authenticated SA session. Agent continued from data-ledger with **read-only** classification only.

Findings:

- Exactly **one** company exists: **BLAGUSS** / `blaguss` — real operator identity, no QA/synthetic label, 10 drivers → **FORBIDDEN** for B2C mutations.
- Product SA **Delete company** path exists in code/UI, but must **not** be exercised on `blaguss`.
- Cleanup path for a *new* synthetic tenant is not yet proven on this staging run.
- No CA/Dispo/Driver synthetic credentials available for role smoke against a safe tenant.
- Admin SDK seed as a substitute for product flows remains forbidden.

Therefore:

- **Writes = 0** (no Save, no New company, no Delete, no import).
- **No mutations** against `blaguss`.
- B2C remains **BLOCKED** until owner authorizes create of a run-prefixed synthetic tenant **and** cleanup (Delete company) is proven on that tenant only.

---

## Role / flow results

| Area | Status |
|------|--------|
| Super Admin smoke | **NOT RUN** |
| Company Admin smoke | **NOT RUN** |
| Dispatcher authz smoke | **NOT RUN** |
| Monthly import | **NOT RUN** |
| Resource guard | **NOT RUN** |
| Driver smoke | **NOT RUN** |
| Authz deny proofs | **NOT RUN** |
| Cleanup | **N/A** — zero writes; active synthetic resources created by this run = **0** |

---

## Cleanup state

| Item | Value |
|------|-------|
| Active Firestore resources created by run | **0** |
| Active Auth users created by run | **0** |
| Active locks created by run | **0** |
| Local temp import files | **0** |
| Allowed audit/tombstone leftovers from this run | **none** |
| Staging suspended | **no** |

---

## Confirmations

- no production  
- no real data  
- no secret exposure  
- no source / Rules / deploy / commit / push / PR / workflow  
- no Phase 4  
- no QA harness  
- no Admin SDK seed  

---

## Unblock path (owner)

1. Provide a **dedicated synthetic staging Super Admin** login via browser **Take Control** on  
   `https://buscommand-preview-staging.onrender.com/staff.html`  
   (do **not** paste password into chat).
2. Confirm an existing **synthetic QA/test tenant** in `buscommand-preview` with safe reset/delete path — **or** confirm SA can create one through product UI with proven delete.
3. Re-run 3D.4-B2C from §2 (data ledger) with the same rules.

---

## Artefacts

- `reports/integration-3d4b2c-report-2026-08-10.md`
- `reports/integration-3d4b2c-change-ledger.md`
- `reports/integration-3d4b2c-data-ledger.md`
- `reports/integration-3d4b2c-logs/`
- `reports/integration-3d4b2c-visual/`

**STOP** after 3D.4-B2C (BLOCKED).

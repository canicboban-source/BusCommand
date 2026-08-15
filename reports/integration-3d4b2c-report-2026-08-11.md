# Integration Checkpoint 3D.4-B2C — Authenticated Synthetic Staging Smoke + Cleanup

**Datum:** 2026-08-11  
**Verdict:** **PARTIAL — SMOKE ADVANCED; CLEANUP TO BASELINE BLOCKED**  
**Run ID:** `BC-STG-B2C-20260811-5432cb`

---

## Identity

| Item | Value |
|------|-------|
| Staging | `https://buscommand-preview-staging.onrender.com` |
| Commit | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Firebase | `buscommand-preview` / `(default)` |
| Tenant **only** | `buscommand-staging-qa-no-real-data` |
| BLAGUSS | **FORBIDDEN** — no writes |
| Target baseline after cleanup | Admins **1** · Dispo **0** · Drivers **0** · Groups **0** |

---

## B2C-01 (kept OPEN — no code fix)

SA create-company modal clears CA fields before optional CA provision (`renderSuperAdminDashboard` before CA read). Documented in data-ledger + `logs/01-b2c01-open-finding.txt`. **No code change this checkpoint.**

---

## Trail (path, not only verdict)

| Step | Action | Result |
|------|--------|--------|
| 1 | Data-ledger rewrite for QA tenant + B2C-01 | PASS |
| 2 | SA companies table + Manage QA (Close, no Save) | PASS — pre inventory **1/0/0/0** |
| 3 | Run CA via `ApiClient.createUser` (product) | PASS — Admins→2 |
| 4 | CA login + wizard group (numeric id required) | PASS — group `543201` |
| 5 | Wizard Dispo create | PASS |
| 6 | Manual driver create (`codeActivated:true`, no SMS) | PASS |
| 7 | CA service plan CSV preview→publish→activate | PASS — `543201.S01` ACTIVE |
| 8 | Dispo login + resource guard probes | PASS — CA APIs **403**; UI no EID/PIN |
| 9 | Dispo monthly CSV preview→commit (+ re-import) | PASS — 11–12.08 `543201.S01`; still **2 assigned days** |
| 10 | Driver login smoke | **PENDING COVERAGE** — blocked by work window (duty ends 14:35; local ~16:15); not classified as automatic product bug; retest with matching synthetic window |
| 11 | Partial cleanup | Dispo **deleted**; driver **deactivated**; group delete **blocked** (in use); run CA still present |

Visuals: `reports/integration-3d4b2c-visual/01` … `11`. Logs: `reports/integration-3d4b2c-logs/`.

---

## Resource guard (Dispo)

| Probe | Result |
|-------|--------|
| `createCompany` | 403 |
| `publishServicePlan` | 403 |
| `createCompanyDriver` | 403 |
| `previewStaffMonthlyPlanImport` companyId=`blaguss` (empty) | 400 invalid package — no BLAGUSS data shown |
| UI EID/PIN leak | false |

---

## B2C-02 — OPEN LIVE FINDING (monthly import responsive UI)

**Title:** Monthly import responsive UI — Driver name lacks priority; Month occupies too much space.  
**Status:** OPEN (no code fix this checkpoint / CLEAN1-A).  
**Code fix:** forbidden here (B2C-UI1 out of scope).

## B2C-03 — OPEN LIVE FINDING (cleanup blocker)

**Title:** Product cannot restore QA baseline **1 / 0 / 0 / 0** after synthetic driver + run CA.

| Gap | Evidence |
|-----|----------|
| No hard-delete driver profile/credentials | SA `getCompanyDetail` uses `driversSnap.size`; deactivate leaves count ≥1 |
| No hard-delete company_admin | Only Disable; counts include all `role=company_admin` → Admins stays 2 |
| Group delete blocked while driver/plan refs remain | `Grupa se koristi i ne može biti obrisana.` |
| `deleteCompanyAtomic` | Would wipe persistent QA tenant — **forbidden** here |
| Admin SDK purge | Forbidden unless owner explicitly authorizes |

**Code fix this checkpoint:** forbidden (same NO-FIX rule as B2C-01).

---

## Residual inventory (live, post partial cleanup)

| Metric | Value |
|--------|-------|
| Admins | **2** |
| Dispo | **0** |
| Drivers | **1** (inactive) |
| Groups | **1** (`543201`) |
| BLAGUSS mutations | **0** |

---

## Out of scope / unchanged

Source, Rules, env, deploy, commit, push, PR, Phase 4, QA harness, Admin SDK, production — **none**.

---

## Owner decision required (one question)

To finish mandatory baseline **1/0/0/0**, which path do you authorize?

**A)** Leave residue + keep **B2C-03 OPEN**; accept PARTIAL verdict  
**B)** One-shot **Admin SDK purge** of run-scoped docs only on `buscommand-staging-qa-no-real-data` (driver + credentials + monthly/service-plan residue + run CA Auth/user; never BLAGUSS) — see CLEAN1-A manifest  
**C)** Other owner-specified product path

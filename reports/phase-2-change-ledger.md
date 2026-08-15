# FAZA 2 — Change Ledger (Pouzdan Dispo monthly import)

| ID | Fajl/tok | Šta menjaš | Zašto | Dobit | Rizik | Kako dokazuješ |
| -- | -------- | ---------- | ----- | ----- | ----- | -------------- |
| P2-01 | `server/plan-import-preview.js` | Duty katalog + bus provere; vrati canonical rows | Preview mora biti server authority | Fail closed pre commit | False reject bez kataloga | unit preview |
| P2-02 | `server/driver-routes.js` | Preview stores job; novi `PUT …/import/commit` + kompensacioni rollback | Nema commit endpointa; chunk fail ostavlja parcijalno | All-or-nothing po importId | Veliki import sporiji | HTTP unit |
| P2-03 | `js/dispatcher/plan-import.js` + api-client | preview→confirm→commit; **nema** `saveMonthlyPlan` pre success | Lokalni SoT laže | Istinit UI | UX pending duži | E2E + visual |
| P2-04 | Tests | Unit/HTTP failure modes + E2E happy/reject | Prompt obavezni E2E | Dokaz | Flaky harness | exit 0 |
| P2-05 | Visual + izveštaj | Screenshot trail 1–10 | v4.1 § screenshot | Owner path | QA ≠ live Rules | visual PASS |

## Pre-flight

| | |
| -- | -- |
| **Found** | Client: local `saveMonthlyPlan` pa N× assignment; preview API postoji bez store/commit; `group-monthly-plan-import` orphaned (EID). |
| **Changing** | Staff preview→prepare job; commit+compensate; client server-first; duty/bus validation. |
| **Not changing** | Schema/nove kolekcije (reuse `monthly_plan_imports` / locks); D18.1; Faza 3+; push/deploy. |
| **Risks** | Compensation mora obrisati/restorovati samo `importId` redove. Max batch: chunked + compensate (ne Firestore single-tx). |
| **Proof** | unit + rules (ne menja Rules) + E2E + visual + build. |

## Atomika

Postojeći mehanizam + **kompenzacija** na fail (restore/delete po `importId`) u postojećim kolekcijama — **bez** nove šeme. Ako kompensacija ne može pokriti slučaj, STOP (ne prividna atomika).

## Closeout status (2026-08-09)

| | |
| -- | -- |
| **Implementation** | Done (preview→prepare→commit+compensate; client server-first) |
| **Unit / E2E mock / visual** | Pass |
| **Build / D17 budget** | **FAIL — STOP** |
| **Staff JS** | 583680 / 581632 (**+2048**) — chunks `dashboard-*`, `init-*`, `staff-*` carry plan-import |
| **Translations** | 379042 / 377856 (**+1186**) — new i18n keys |
| **Action** | No budget raise, no KB optimization (owner). Awaiting decision. |

# P1-A Session Checkpoint — Emulator Remediation + Functional Fix (Radar Identity)

**Saved:** 2026-08-20 (session end)

## Worktrees

| | Path | Branch | HEAD |
|---|---|---|---|
| Original | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import` | `main` | `b4bb101f74919649277639544f68bd2bc6e8911a` |
| Isolated (detached) | `C:\Users\cane\bc-emulator-worktree` | (detached) | `b4bb101f74919649277639544f68bd2bc6e8911a` |

## Exact `git status` at checkpoint time

**Original worktree — zero tracked diff, untouched:**
```
git diff --stat  ->  (empty)
git status --short:
?? "WhatsApp Image 2026-07-29 at 21.17.08.jpeg"      (pre-existing, unrelated)
?? _to_delete/                                        (pre-existing, unrelated)
?? qa-report/                                          (QA artifacts, prior sessions)
?? tests/e2e/_qa-sim-2026-08-19.spec.js                (prior session, unrelated)
?? tmp-attn-*.png (5 files)                            (pre-existing, unrelated)
```

**Isolated worktree — functional fix applied, dirty as expected:**
```
 M js/core/firebase-service.js
 M js/core/firebase-web-config.js
 M js/core/shift-plan.js
 M js/core/utils.js
 M js/dispatcher/dashboard.js
 M js/dispatcher/ops-attention.js
 M tests/unit/eu561-rest-period-attention.test.mjs
 M translations.js
?? qa-report/                       (seed/write/verify scripts, evidence, this checkpoint)
?? tests/e2e/_connector-smoke.spec.js
?? tests/e2e/_gate0-firestore-unavailable.spec.js
?? tests/e2e/_negative-auth-unavailable.spec.js
?? tests/e2e/_p1a-radar-ui-verify.spec.js
?? tests/e2e/connector-smoke-requests.json
?? tests/e2e/gate0-requests.json
?? tests/e2e/screenshots-p1a/
?? tests/unit/firebase-emulator-connector.test.js
?? tests/unit/p1a-operational-timezone.test.mjs
?? tests/unit/p1a-radar-identity.test.mjs
```
`git diff --stat`: 8 files changed, 400 insertions(+), 41 deletions(-).

## Gate 0 (Firestore unavailable, Auth available) — done first, before any functional edit

Pointed the build's Firestore emulator port at an unused port (18080) while the real Auth emulator (9099) stayed available; real browser login attempted. Result: `app-container-visible: false`, `hydrated-driver-count: 0` (no fake success data), `production-data-plane-hits: []`, generic error text shown. **PASS.** Restored working `.env.local` (port 8080) and rebuilt before proceeding.

## Functional changes (P1-A)

1. **`js/core/utils.js`** — added `operationalTimezone()` (reads `window.state.profile.timezone`, falling back to `timezoneForCountry(profile.country)` — the SAME existing authoritative source already used by the confirmation scheduler / company settings, no new config field), `operationalTodayDateStr()` (Intl-based, DST-safe), `addCalendarDays()` (UTC-anchored calendar-day math, safe across month/year boundaries and DST), `operationalDateStr(offset)`.
2. **`js/core/shift-plan.js`** — added `getShiftForDriverIdOnly(driverId, dateStr)` and `getDriverDutySummaryById(driverId, driverName, dateStr)`: ID-first lookups that NEVER fall back to name matching. The existing name-based `getShiftForDriverDate`/`getDriverDutySummary` (used by ~40 other call sites across `shifts.js`, `monthly-plans.js`, `daily-plan.js`, etc.) were **not** touched — that broader legacy surface is out of scope for P1-A (see "Known residual gap" below).
3. **`js/dispatcher/ops-attention.js`** — this is where the actual defects lived:
   - `collectPlanGapAttentionItems`/`collectRestPeriodAttentionItems` now resolve each driver's shift by `driverId` (via `getShiftForDriverIdOnly`), never by name. A driver with no `driverId` produces a new, truthful `data_integrity_missing_id` item instead of silently guessing by name.
   - Item ids are now date-suffixed (`gap:driver:{id}:{date}`, `gap:slot:{code}:{date}`) — stable identity = problemType + driverId + operationalDate, so multi-day items never collide.
   - New `radarWindowDates()` (D0/D+1/D+2 via `operationalDateStr`) and a rewritten `collectAllAttentionItems`: when called with no explicit date (the normal case for the dashboard counter, Needs-Attention panel, and daily-plan pill — none of their 5 call sites needed to change), it aggregates the full 3-day window instead of "today" only. Explicit-date callers keep single-day behavior.
   - Added `radarDayLabel()` → translated "Today"/"Tomorrow"/"Day after tomorrow", rendered on both the nav-item and the detail card alongside the exact date.
4. **`js/dispatcher/dashboard.js`** — dashboard alert card now shows the radar day label + date.
5. **`translations.js`** — added `radar_day_today`/`radar_day_tomorrow`/`radar_day_after_tomorrow`, `ops_attn_gap_driver_summary_dated`, `ops_attn_data_integrity` in SR/EN/DE (existing 3 languages only).
6. **`tests/unit/eu561-rest-period-attention.test.mjs`** — updated the pre-existing fixture to include authoritative `driverId` fields (it previously had none), matching the real production shift-document shape; the test's assertions are unchanged.

## New tests added

- `tests/unit/p1a-radar-identity.test.mjs` (7 tests): duplicate-name D0 isolation, covering-one-doesn't-cover-the-other, D+1 detection, D+2 + D-1/D+3 exclusion, stable per-day id uniqueness, missing-id data-integrity item, cross-group isolation.
- `tests/unit/p1a-operational-timezone.test.mjs` (8 tests): timezone source, 30/31-day month boundary, year boundary, EU DST spring/autumn transitions, timezone-vs-browser independence.

## Test results

| Check | Result |
|---|---|
| `npm run test:unit` | **1007/1007 pass** (992 baseline + 15 new) |
| `node --test tests/unit/eu561-rest-period-attention.test.mjs` | 4/4 pass (fixed) |
| `npx eslint js api-server.js server tests` | 0 errors (3 pre-existing warnings, unrelated files not touched by P1-A) |
| `npm run build` | pass, Firebase isolation check passed, bundle budgets OK |
| Full `npx playwright test` (default config, no emulator) | 123 passed / 12 failed. Of the 12: 3 are my own emulator-only spec copies (need the custom server, not real failures under default config); **9 are pre-existing**, verified via `git stash` on unmodified HEAD to fail identically without any P1-A change (6 previously known: `b2c01-f1-create-company-ca`, `phase2r-b1` ×2, `phase2r-b11` ×2, `ui-smoke:34`; 3 newly surfaced purely by the sandbox clock reaching hard-coded test dates: `dispatcher-cockpit.spec.js:358`, `dispatcher-cockpit.spec.js:498`, `dispo-soft-remove.spec.js:202`). **Zero new regressions caused by P1-A.** |
| Live emulator+UI positive integrated test (`_p1a-radar-ui-verify.spec.js`) | **PASS** — see below |

## Live integrated proof (real UI → Auth emulator → real API → Firestore emulator → hard reload)

Seeded two active drivers named **"Marko Jovanović"** (distinct IDs `aaaa...a` / `bbbb...b`) in `qa-scale-a`/group 310. Wrote real shifts via the real `PUT /api/staff/shifts/assignment` endpoint: Driver A covered D0+D2, missing D1; Driver B covered D1, missing D0+D2. Logged into the real UI, opened Needs-Attention, **hard-refreshed the page**, reopened the panel:

```
Today (2026-08-20)            -> "Marko Jovanović" flagged  (correctly Driver B)
Tomorrow (2026-08-21)         -> "Marko Jovanović" flagged  (correctly Driver A)
Day after tomorrow (2026-08-22) -> "Marko Jovanović" flagged (correctly Driver B)
```
Exactly 3 dated cards for the shared name — never 0, never 2-on-the-same-day, never the wrong driver. Confirmed after a real page reload (Firestore-emulator persistence, not in-memory state). SR/DE date badges verified live: `"Danas · 2026-08-20"`, `"Heute · 2026-08-20"` — no missing keys, no mixed language.

Evidence: `qa-report/p1a-radar-live-seed-output.json`, `qa-report/p1a-radar-live-write-output.json`, `tests/e2e/screenshots-p1a/*.png`.

## Known residual gaps (disclosed, not fixed this pass — explicitly out of P1-A scope)

1. **`openShiftCell`/`driverByName`** (in `js/dispatcher/shifts.js`, used by the "Assign shift" button on a `plan_gap_driver` card) is still name-keyed — with duplicate names it can still open the wrong same-named driver's edit form. The **detection/radar layer is now fully ID-safe**; the downstream single-shift-editing surface (~40 call sites across `shifts.js`/`monthly-plans.js`/`daily-plan.js`) was not migrated — that is a materially larger change than P1-A's scope.
2. `collectOpsAttentionItems` (real incident/report/confirm feed) and `dashboard.js`'s active-buses-count still use the name-based `getDriverDutySummary`/`getShiftForDriverDate` — not part of the confirmed P1 defects, not touched.
3. Cross-company isolation at this client-side layer relies on `window.state` never containing another tenant's documents in the first place (by design — `driverBelongsToLine` explicitly documents "not a security boundary"). Verified server-side/live in the prior sub-task (foreign dispatcher token → 404). Not re-tested at this layer since a mixed-tenant `window.state` fixture doesn't reflect how the app is actually populated.

## Emulator configuration

- Project ID: `demo-buscommand-scale`. Firestore: `127.0.0.1:8080`. Auth: `127.0.0.1:9099`. API server: `http://localhost:8768`.
- All local emulator/API-server processes stopped before session end (ports 8080/9099/8768/4400/4500/9150 confirmed clean).

## Production/staging confirmation

Zero requests to any Firebase/Google data-plane host during any test this session (`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `firestore.googleapis.com`, `firebaseio.com`, `buscommand-preview.firebaseapp.com`) — actively verified via network listeners in `_connector-smoke.spec.js`, `_gate0-firestore-unavailable.spec.js`, `_negative-auth-unavailable.spec.js`, and the new `_p1a-radar-ui-verify.spec.js`.

## Commit/push/PR/deploy

**NONE.** Not performed anywhere this session.

## Next recommended action

Await owner review of this functional fix, then decide whether to:
(a) proceed to the clean 60-driver realistic simulation (previously deferred), and/or
(b) authorize a follow-up phase to migrate the single-shift-editing surface (`shifts.js` `openShiftCell`/`driverByName` and its ~40 name-keyed call sites) to ID-based lookups, closing residual gap #1 above.

## Safe commands to resume

```powershell
cd C:\Users\cane\bc-emulator-worktree
npx firebase emulators:start --only firestore,auth --project demo-buscommand-scale
# second shell:
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"; $env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
$env:GOOGLE_APPLICATION_CREDENTIALS="$env:USERPROFILE\.keys\qa-emulator-demo-scale-key.json"; $env:PORT="8768"
node api-server.js
# third shell, reseed (emulator data is in-memory, does not survive an emulator restart):
node qa-report/p1a-radar-live-seed.js
node qa-report/p1a-radar-live-write.js
$env:PLAYWRIGHT_BASE_URL="http://localhost:8768"
npx playwright test tests/e2e/_p1a-radar-ui-verify.spec.js --reporter=list
```

## Evidence locations

- This checkpoint: `qa-report/P1-A-SESSION-CHECKPOINT.md`.
- Radar live-proof artifacts: `qa-report/p1a-radar-live-seed-output.json`, `qa-report/p1a-radar-live-write-output.json`, `tests/e2e/screenshots-p1a/*.png`.
- Connector evidence (prior sub-task, still valid): `tests/e2e/connector-smoke-requests.json`, `tests/e2e/gate0-requests.json`.
- New unit tests: `tests/unit/p1a-radar-identity.test.mjs`, `tests/unit/p1a-operational-timezone.test.mjs`.
- No secrets/tokens stored in this file.

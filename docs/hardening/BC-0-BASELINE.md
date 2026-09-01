# BC-0 — Authoritative Baseline and Branch Reconciliation

## 1. Baseline Identity

- repository: canicboban-source/BusCommand
- authoritative GitHub main SHA: bd315abb6ae5df410db8507a1fac90fac3a2bf2f
- hardening branch: hardening/buscommand-production-20260831
- hardening starting SHA: bd315abb6ae5df410db8507a1fac90fac3a2bf2f
- authoritative worktree: C:\Users\cane\bc-duty-integrity-worktree

**REMOTE AUTHORITATIVE MAIN vs LOCAL HISTORICAL MAIN**
The authoritative remote main branch is at bd315abb6ae5df410db8507a1fac90fac3a2bf2f.
The local historical main branch is at b4bb101f74919649277639544f68bd2bc6e8911a and is currently held by the worktree at C:\Users\cane\Desktop\BusCommand-ca-monthly-import. This local main is NOT authoritative.

## 2. Repository / Worktree Topology

Six BusCommand worktrees were discovered locally.
The hardening worktree shares Git worktree administration with the other BusCommand worktrees.
Old worktrees remain untouched and no deletion/consolidation was performed during BC-0.
Repository consolidation is deferred. No old worktree is claimed to be safe to delete at this time.

## 3. Reproducible Verification Baseline

The full baseline verification run (Step 4C) produced the following successful results:
- npm ci: PASS
- lint: PASS
- unit: 1070 passed
- Firestore Rules: 175 passed
- build: PASS
- secret check: PASS
- Firebase isolation: PASS
- bundle budget: PASS
- Playwright: 143 passed / 0 failed / 0 skipped

The successful browser baseline required the frontend bundle to be built for the Firebase emulator using VITE_USE_FIREBASE_EMULATOR=1 plus the corresponding emulator routing configuration.

Initial Step 4 verification yielded a Playwright result of 140 passed / 3 failed. All three failures shared the hidden #app-container symptom. Forensic analysis classified the root cause as an environment/setup defect (the test runner utilized a production-built frontend). A correctly configured emulator build produced 3/3 targeted PASS, and the subsequent complete Step 4C baseline produced 143/143 PASS.

## 4. Build Security / Integrity Checks

The observed build chain was:
node scripts/check-no-secrets.js
&& node scripts/clean-dist.js
&& node scripts/build-surface-html.js
&& node scripts/ensure-favicon.js
&& vite build
&& node scripts/copy-static-to-dist.js
&& node scripts/check-firebase-isolation.js
&& node scripts/check-bundle-budgets.js

- check-no-secrets: PASS
- Firebase isolation: PASS
- bundle budgets: PASS

## 5. Open Hardening PR Reconciliation

PR #10:
PARTIALLY SUPERSEDED / VERIFY AGAINST CURRENT MAIN
Preserve as invariants to verify later:
- canonical driver/shift identity
- shift clear/delete removes canonical + legacy same-day copies and monthly mirror where applicable
- server-owned fleet mutation
- dispatcher bus mutation tenant/group scope
- bus mutation + audit atomicity
- valid duty times
- daily/monthly UI not blocked by optional service-catalog request
- bus editing wiring/UX where still applicable

PR #11:
MIXED
STILL REQUIRED:
- Super Admin company-status mutation + audit atomicity
- support-session single-active-session concurrency invariant
ALREADY PRESENT / SUPERSEDED:
- plan-health / coverage consistency area

PR #12:
STILL REQUIRED
Preserve:
- Company Admin branding mutation + audit atomicity
- group create/update/delete + audit atomicity

PR #13:
OLD IMPLEMENTATION OBSOLETE/CONFLICTING; INVARIANT STILL REQUIRED
Preserve current-architecture invariant:
- one consistent active/current service-plan version per group under concurrency
- metadata/duties/group pointer/audit remain consistent
Do not port the old architecture.

PR #14:
STILL REQUIRED / PORT LOGIC ONLY
Preserve:
- dispatcher seat limit must be server-side, fail-closed and concurrency-safe for create/reactivate

PR #10–#14 MUST NOT be wholesale merged or blindly cherry-picked. Any later fix must start from the current hardening line and verify whether the invariant is already guaranteed by current code.

## 6. Current Architecture Map

- browser surfaces / roles: driver.html, staff.html, index.html, js/dispatcher/, js/driver/, js/admin/, js/layout/, js/surface/
- Firebase Authentication: firebase.json, js/sync/cross-tab.js, server/driver-identity-guard.js
- Firestore/browser Rules boundary: firestore.rules
- API server: api-server.js, server/ module endpoints
- Firebase Admin SDK/server boundary: server/ directory (assignment-resource-guard.js, audit-log.js, company-settings.js, etc.)
- plans/shifts/duties: js/dispatcher/shifts.js, js/dispatcher/plan-import.js, js/imports/
- fleet/buses: js/dispatcher/vehicles-panel.js, server/bus-group-membership.js, js/admin/company-admin-buses.js
- incidents/attention: js/dispatcher/plan-health-banner.js, server/driver-report-idempotency.js
- driver confirmations/SOS where present: server/confirmation-outbox.js, server/confirmation-scheduler.js, js/driver/message-alerts.js, js/maps/sos-siren.js
- support sessions: server/support-session.js
- licensing/provisioning: server/company-groups.js, server/company-admin-driver-ops.js
- audit: server/audit-log.js, js/admin/company-admin-audit.js
- PWA/offline: js/driver/offline-queue.js, js/driver/offline-snapshot.js, sw-driver.js, manifest-driver.webmanifest
- build/test infrastructure: vite.config.js, playwright.config.js, tests/e2e/, tests/rules/, package.json, scripts/

## 7. Known P0/P1 Risk Register at BC-0

- server-only secret boundary / Firestore SMTP exposure
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- stored XSS sinks
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- CSP
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- sensitive logging/redaction
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- distributed auth abuse/rate limiting
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- atomicity/concurrency reconciliation
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- canonical licensing/entitlement authority
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- Driver durable offline outbox
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- jobs/scheduler scale and retry semantics
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10
- liveness/readiness/observability
  - SOURCE: prior expert audit / BC-0 reconciliation
  - STATUS: UNVERIFIED IN CURRENT HARDENING PHASE
  - TARGET PHASE: BC-1 through BC-10

## 8. BC-0 Evidence Status

TECHNICAL BASELINE VERIFICATION:
PASS

PR RECONCILIATION:
RECORDED

ARCHITECTURE MAP:
RECORDED

KNOWN RISK REGISTER:
RECORDED

BC-1:
NOT STARTED

DEPLOYMENT:
NOT PERFORMED

PRODUCTION DATA MUTATION:
NOT PERFORMED

## 9. Remaining BC-0 Closure Actions

- project-lead review of this document/diff
- correct any factual inaccuracies found by review
- final BC-0 gate decision
- commit only after explicit project-lead approval and required gate

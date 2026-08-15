# FAZA 2R-A.3.1.1 — change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Schema diff: **NONE**

| File | What | Why | Brings | Proof |
| ---- | ---- | --- | ------ | ----- |
| `server/driver-routes.js` | Confirm tx: compute LIVE fingerprint via `fingerprintShift`; all lock reads before any delete/set; revision check when target has revision | Stored `shiftFingerprint` is null after canonical writers — stale A→B was wrongly accepted | `CONFIRMATION_STALE` / `SHIFT_MISSING` without phantom writes | unit + G3/G5 emulator |
| `server/staff-monthly-plan-import.js` | `isLockConsistentForImport(lock, importId, actorId, groupId, month)` exact match; remove `lock.groupId \|\| groupId`; `txGetAll` for chunk/compensation; unused `admin` → `_admin` | Missing/mismatched scope completed imports; sequential gets; lint warning | Chunk/completion → `RECOVERY_REQUIRED`, never completed; fewer round-trips | unit + G6/G7 |
| `server/group-monthly-plan-import.js` | UX `assertNoActiveGroupMonthlyImport` safe-clear only inside txn after re-read; retry/block on contention | Standalone get→delete could erase a fresher claim | Concurrent claim wins | unit + G8 |
| `tests/unit/phase2r-a311-fail-first.test.js` | Fail-first RED suite | Contract: prove gaps before fix | EXIT=1 log preserved | `fail-first-unit.txt` |
| `tests/unit/phase2r-a311-confirm-lock-consistency.test.js` | Green unit for confirm/lock/getAll/UX | Executable closeout | 9 pass | unit-targeted |
| `tests/rules/phase2r-a311-confirm-lock-consistency.test.js` | Real handler G1–G8 on emulator | Not helper-only proof | 8 pass in rules suite | rules / emulator-a311-focused |
| `tests/rules/phase2r-a31-cross-writer-atomicity.test.js` | Remove unused `app` | Lint 0 new warnings | lint EXIT=0 | lint |
| `scripts/phase2r-a311-visual-trail.mjs` | Viewport success shot with date/duty/bus/toast | Off-screen body text was insufficient | Shot 05 visual | visual.txt |
| `scripts/phase2r-a311-pack-artifacts.mjs` | Manifest + ZIPs | Deliverable pack | verifier EXIT=0 | pack |

# FAZA 2R-A.3.1 — Production writer inventory

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Date: 2026-08-09  
Schema: no new collections/fields (lock/job/shifts/schedules/shift_confirmations only).

## Collections in scope

| Collection | Role |
| ---------- | ---- |
| `shifts` | Canonical assignment SoT |
| `schedules` | Mirror of monthly plan |
| `shift_confirmations` | Driver confirmation records |
| `monthly_plan_imports` | Import job state |
| `monthly_plan_import_locks` | Group/month single-flight lock |

## Writer paths

| # | Path | File / function | Mutates | Lock in same mutation tx (pre A.3.1) | Target (A.3.1) |
| - | ---- | --------------- | ------- | ------------------------------------- | -------------- |
| 1 | Preview prepare | `staff-monthly-plan-import.js` → `prepareStaffMonthlyImport` | job `prepared` | no (UX assert only) | UX assert ok; no shift writes |
| 2 | Commit claim | `claimStaffMonthlyImportCommit` | job + lock | **yes** | keep + prepared/partial fail-closed |
| 3 | Import chunks | `commitStaffMonthlyImport` loop | shifts + `appliedChunks` | **no** (getAll→batch) | **tx per chunk** with live job+lock+revisions |
| 4 | Schedule mirror | `refreshScheduleMirrors` | schedules | no | unchanged (mirror after shifts); not concurrency SoT |
| 5 | Completion | completion `runTransaction` | job `completed` + lock delete | partial (status only) | require live consistent alive lock |
| 6 | Compensation | `compensateStaffImport` | shifts restore/delete + job/lock | partial | atomic importId check+restore; lock until done |
| 7 | Assignment | `PUT .../shifts/assignment` | shifts, schedules | **no** (pre-tx assert) | lock read **inside** mutate tx |
| 8 | Assignment undo | `POST .../assignment/undo` | shifts, schedules | **no** (pre-tx assert) | lock read **inside** mutate tx |
| 9 | Incident resolve | `PUT .../operational-incidents/:id/resolve` | shifts, schedules, reports | **none** | locks for incident + replacement group/month in same tx |
| 10 | Driver confirmation | `POST .../driver/shift-confirmations` | shift_confirmations, shifts | **none** | tx: live shift + lock + fingerprint; no phantom merge |
| 11 | Confirm invalidation | `confirmation-scheduler.js` | shift_confirmations delete | no | best-effort side effect (unchanged) |
| 12 | UX assert helper | `assertNoActiveGroupMonthlyImport` | may delete safe expired lock | standalone | remains UX-only; not concurrency proof |

## Acceptable race outcomes (A.3.1)

- Other writer wins first → its revision stays; import gets `MONTHLY_IMPORT_CONFLICT` / compensation of only same-`importId` rows.
- Import lock wins first → other writer gets `MONTHLY_IMPORT_IN_PROGRESS` or `MONTHLY_IMPORT_RECOVERY_REQUIRED`.

## Forbidden outcomes

- Silent overwrite · dual success · false confirmation · `completed` without matching live lock

# FAZA 2R-A.3.1 — CROSS-WRITER ATOMICITY + PROOF CLOSEOUT

**Date:** 2026-08-09  
**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60` (confirmed)  
**Node:** 22.14.0  
**Schema diff:** **NONE**  
**Verdict:** A.3.1 closed; **D17 sole red gate**. STOP before 2R-B.

## What changed / why / brings

1. **Atomic import chunks** (`applyImportChunkTransaction`) — replaces getAll→revision→batch with a Firestore transaction that reads LIVE job+lock+shifts before writes; updates `appliedChunks` in the same tx. Brings: no mid-chunk silent overwrite vs other writers.
2. **Cross-writer lock reads in mutation tx** — assignment, undo, incident resolve (incident + replacement group/month), driver confirmation. UX `assertNoActiveGroupMonthlyImport` remains fast-path only. Brings: no check-then-write race.
3. **Prepared/partial fail-closed** — `prepared` + (`appliedChunks>0` | tagged `importId` | `recoveryRequired`) → `MONTHLY_IMPORT_RECOVERY_REQUIRED`, no claim/write/completed.
4. **Completion** — requires LIVE `committing` + alive consistent lock before `completed` + lock delete.
5. **Expired prepared** — `status=expired` commits in tx; `MONTHLY_IMPORT_EXPIRED` thrown outside (write persists).
6. **Compensation** — `importId` re-check + restore/delete in the same transaction; lock retained until success.
7. **Driver confirm** — transactional; stale fingerprint always rejected; no merge-create phantom shift.
8. **Visual 05** — fixture driverId; rendered driver/day/duty/bus; success/idempotent message visible; “No plan…” fails.

Inventory: `reports/phase-2r-a31-writer-inventory.md`.

## Fail-first proof

`reports/phase-2r-a31-logs/fail-first-unit.txt` — EXIT=1 (6 fail / 2 pass) against A.3 before production changes.  
After implementation: fail-first suite green inside unit-targeted / unit-full.

## Emulator concurrency (real Firestore)

`reports/phase-2r-a31-logs/emulator-a31-focused.txt` — **12 pass**, EXIT=0  
Full rules suite: **114 pass**, EXIT=0 (`rules.txt`).

Covered: import↔assignment (both orders), undo, incident, confirm gate, chunk revision race, prepared+appliedChunks, prepared+tagged shift, missing lock pre-chunk, mismatched lock pre-completion, expired persistence.

## Visual (`reports/phase-2r-a31-visual/`)

| Shot | Proves (UI only) |
| ---- | ---------------- |
| 01–02 | IN_PROGRESS + retained importId / retry |
| 03 | Recovery, no Confirm/Retry |
| 04 | XSS as text |
| 05 | Idempotent success with **rendered** driver/day/duty/bus + success message |

Screenshots are **not** auth/Rules/transaction proof.

## Gate exit codes

| Gate | Exit | Notes |
| ---- | ---- | ----- |
| secrets | **0** | |
| lint | **0** | |
| targeted unit | **0** | |
| full unit | **0** | 692 pass |
| HTTP/auth | **0** | 32 |
| Rules + emulator | **0** | 114 |
| focused A.3.1 emulator | **0** | 12 |
| full E2E | **0** | 89 |
| firebase isolation | **0** | |
| npm audit --omit=dev | **0** | 0 vulns |
| visual | **0** | |
| build + D17 | **1** | D17 only |
| manifest verifier | **0** | see pack log |

## D17 arithmetic

| Surface | Max | A.3 | A.3.1 | Δ |
| ------- | --- | --- | ----- | - |
| staff excl. translations | 581632 | 590834 | **590834** | **0** (over +9202) |
| translations | 377856 | 382080 | **382080** | **0** (over +4224) |

No budget bump / no KB optimization.

## Artifacts

- `reports/phase-2r-a31-report-2026-08-09.md`
- `reports/phase-2r-a31-change-ledger.md`
- `reports/phase-2r-a31-writer-inventory.md`
- `reports/phase-2r-a31-logs/` (incl. fail-first + final)
- `reports/phase-2r-a31-visual/` + `TRAIL.json`
- `reports/phase-2r-a31-source-manifest.txt` (body-sha256 footer; pack/verifier logs excluded by policy)
- `reports/phase-2r-a31-review-source-2026-08-09.zip`
- `reports/phase-2r-a31-full-deliverable-2026-08-09.zip`
- `reports/git-status-short.txt`, `git-diff-stat.txt`, `base-to-working.patch`

ZIP/manifest counts and `body-sha256` are authoritative only in
`phase-2r-a31-logs/manifest-verifier.txt` (written after ZIP creation).
Stale-log policy: `pack.txt` + `manifest-verifier.txt` are excluded from the
manifest body and from ZIPs so the verifier never embeds a previous-run hash.

## Intentionally not done

Crash-resume · new schema · 2R-B · Phase 3 · language purge · bundle optimization · commit/push/deploy.

Owner must send `NASTAVI FAZU 2R-B` before any 2R-B work.

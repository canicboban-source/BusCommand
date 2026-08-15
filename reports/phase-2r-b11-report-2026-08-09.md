# FAZA 2R-B.1.1 — File-event + recovery-origin closeout

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Date:** 2026-08-09  
**Schema / API / server business logic / dependency diff:** **NONE**  
**Verdict:** **CLOSED** — same-origin recovery trust boundary, retriable file input, and cold-drop File snapshot are proven. D17 green. **STOP** before Phase 3.

## Gaps closed

1. Recovery `import(/* @vite-ignore */ …)` only accepts same-origin trusted plan-import asset paths.
2. After chunk-load failure, `#bulk-plan-import-files` is cleared so the same file can be chosen again; toast tells the user to re-select (no false “files stay” claim).
3. Cold drag/drop snapshots `File[]` synchronously before awaiting the lazy chunk.

## What changed

| Area | Change |
| ---- | ------ |
| `js/dispatcher/plan-import-loader.js` | `isTrustedPlanImportRecoveryUrl` / pathname allowlist; foreign-origin Performance entries rejected; recovery import only after validation |
| `js/register-onclick-staff.js` | Sync file/drop snapshot; clear input on file change; toast via `t(...)` only (no English `\|\|` fallback) |
| `js/dispatcher/plan-import.js` | Export `handleBulkPlanFiles`; sync snapshot in direct handlers |
| `translations.js` | Updated `plan_import_chunk_load_failed` en/de/sr — “choose the file again” |
| Tests | unit `phase2r-b11-file-recovery`; E2E real fixture parse + cold drop (no success test-hook) |

## D17 (limits unchanged)

| Surface | Value | Max | Headroom |
| ------- | ----- | --- | -------- |
| staff excl. translations | **575678** | 581632 | **+5954 B (~5.81 KiB)** |
| translations | **340012** | 377856 | **+37844 B (~37.0 KiB)** |

Languages remain exactly `de` / `en` / `sr`.  
`plan-import` remains lazy; not in `staff.html` modulepreload.

## Gates

| Gate | Exit | Notes |
| ---- | ---- | ----- |
| secrets | **0** | |
| lint | **0** | |
| full unit | **0** | **733** pass (not reduced) |
| targeted A.3.1.1 | **0** | still green |
| HTTP/auth | **0** | 32 |
| Rules emulator | **0** | **122** (not reduced) |
| full E2E | **0** | **93** (not reduced; +2 for 2R-B.1.1) |
| firebase isolation | **0** | |
| npm audit --omit=dev | **0** | 0 vulns |
| npm audit (dev) | non-zero | js-yaml via firebase-tools/eslint — not fixed |
| build + D17 | **0** | both green |
| visual | **0** | 2 real-UI shots |
| manifest verifier | **0** | |

## Visual (`reports/phase-2r-b11-visual/`)

1. Localized SR load error + cleared input (retriable).
2. Clean real parsed preview after retry (`month=2026-08`, `days=1`, matched driver) — no test hook, no lingering error toast.

TRAIL documents what screenshots prove vs unit/E2E-only proofs (foreign-origin reject, request coalescing).

## Artifacts

- `reports/phase-2r-b11-report-2026-08-09.md`
- `reports/phase-2r-b11-change-ledger.md`
- `reports/phase-2r-b11-logs/`
- `reports/phase-2r-b11-visual/` + `TRAIL.json`
- `reports/phase-2r-b11-source-manifest.txt` (body-sha256 `23e84b89…`)
- `reports/phase-2r-b11-review-source-2026-08-09.zip`
- `reports/phase-2r-b11-full-deliverable-2026-08-09.zip`
- git status / diff-stat / base-to-working patch

## Intentionally not done

Phase 3 · commit · push · deploy · budget bump · schema · dependency changes · npm audit fix.

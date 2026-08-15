# FAZA 2R-B.1 — Lazy chunk failure recovery closeout

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Date:** 2026-08-09  
**Schema / API / dependency diff:** **NONE**  
**Verdict:** **CLOSED** — temporary plan-import chunk load failure no longer permanently blocks monthly import; D17 remains green; A.3.1.1 reliability proofs remain green. **STOP** before Phase 3.

## Problem closed

After 2R-B lazy-split, a rejected `import("./plan-import.js")` Promise was left permanently cached in `_planImportPromise`. Prefetch or first CTA failure required a full page reload. Browsers can also stick on a failed module record for the same URL.

## What changed

1. **`js/dispatcher/plan-import-loader.js`** (new)
   - Race-safe shared in-flight Promise.
   - Identity-checked clear on reject (`cached === attempt`).
   - Production importer retries via absolute chunk URL + `?bc_recovery=` after native failure (bypasses sticky module map without reload).
2. **`js/register-onclick-staff.js`**
   - Uses shared loader; `withPlanImportModule` shows localized toast on chunk-load failure only.
   - Errors inside an already-loaded module are not swallowed as chunk-load failures.
   - Prefetch still silent, but releases cache on failure.
3. **`translations.js`**
   - `plan_import_chunk_load_failed` for `en` / `de` / `sr` only (no server/commit/rollback claims).
4. Tests: unit fail-first A–D + E2E controlled first-chunk abort + retry.

## D17 (unchanged limits)

| Surface | Value | Max | Headroom |
| ------- | ----- | --- | -------- |
| staff excl. translations | **574700** | 581632 | **+6932 B (~6.77 KiB)** |
| translations | **340066** | 377856 | **+37790 B (~36.9 KiB)** |

Languages remain exactly `de` / `en` / `sr`.  
`plan-import` stays lazy; **not** in `staff.html` modulepreload.

Lazy chunk: `plan-import-CuLISxvx.js` **20768** raw / **6356** gzip.

## Gates

| Gate | Exit | Notes |
| ---- | ---- | ----- |
| secrets | **0** | |
| lint | **0** | |
| full unit | **0** | **723** pass (not reduced) |
| HTTP/auth | **0** | 32 |
| Rules emulator | **0** | **122** (not reduced) |
| full E2E | **0** | **91** (89 prior + 2 recovery; not reduced) |
| firebase isolation | **0** | |
| npm audit --omit=dev | **0** | 0 vulns |
| npm audit (dev) | non-zero | js-yaml via firebase-tools/eslint — not fixed |
| build + D17 | **0** | both green |
| visual | **0** | 2 real-UI shots |
| A.3.1.1 targeted | **0** | still green |
| manifest verifier | **0** | |

## Visual (`reports/phase-2r-b1-visual/`)

1. Visible SR chunk-load error toast on explicit file action (no fabricated captions).
2. Successful retry → real plan-import pending preview (driver / duty / bus).

Request-count proof is in unit + E2E (not screenshots).

## Artifacts

- `reports/phase-2r-b1-report-2026-08-09.md`
- `reports/phase-2r-b1-change-ledger.md`
- `reports/phase-2r-b1-logs/`
- `reports/phase-2r-b1-visual/` + `TRAIL.json`
- `reports/phase-2r-b1-source-manifest.txt` (body-sha256 verified)
- `reports/phase-2r-b1-review-source-2026-08-09.zip`
- `reports/phase-2r-b1-full-deliverable-2026-08-09.zip`
- git status / diff-stat / base-to-working patch

## Intentionally not done

Phase 3 · commit · push · deploy · budget bump · schema · dependency changes · npm audit fix.

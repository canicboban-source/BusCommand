# FAZA 2R-B — Language purge + D17 closeout

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Date:** 2026-08-09  
**Schema diff:** **NONE**  
**Verdict:** **CLOSED** — both D17 gates green; A.3.1.1 reliability/security proofs remain green. **STOP** before Phase 3.

## Preconditions (recorded)

| Metric | Before 2R-B | Max |
| ------ | ----------- | --- |
| staff excl. translations | **590834** | 581632 |
| translations | **382080** | 377856 |

Node **22.14.0**. Dirty Phase 2 / 2R-A tree preserved (no reset).

## A — D23 en / de / sr only

- Decision **D23** in `docs/decisions.md`.
- `Object.keys(TRANSLATIONS)` = exactly `de`, `en`, `sr`.
- Removed dictionaries + population for hr/es/fr/it/tr/pl/pt/nl/ro/hu/cs/sk/bg.
- `PILOT_UI_LANGS` no longer includes `hr`.
- Unsupported persisted `buscommand_lang` → `en` + storage rewrite.
- EN fallback retained for missing DE/SR keys.
- No EN/DE/SR key deletion for size.

## B — Staff lazy plan-import

- Broke `data-hub ↔ plan-import` static cycle.
- `register-onclick-staff` loads plan-import via cached `import()`; prefetch on monthly open/CTA.
- Lazy chunk: `plan-import-BqOQD3vX.js` **20768** raw / **6357** gzip.
- Not modulepreloaded from initial `staff.html`.
- Preview/commit/retry/IN_PROGRESS/UNKNOWN/RECOVERY/idempotent/XSS + local-mode refuse-fake-success preserved (E2E).

## D17 after

| Surface | Before | After | Max | Headroom |
| ------- | ------ | ----- | --- | -------- |
| staff excl. translations | 590834 | **573723** | 581632 | **+7909 B (~7.72 KiB)** |
| translations | 382080 | **339642** | 377856 | **+38214 B (~37.3 KiB)** |

Saved vs before: staff **17111 B**, translations **42438 B**.  
Target ≥12 KiB staff headroom was not forced further — **7.72 KiB** is the safe realized headroom without risky redesign. Both gates **green** without limit bump.

### Chunk sizes (raw / gzip-9)

| Chunk | Raw | Gzip |
| ----- | --- | ---- |
| translations | 339642 | 102561 |
| dashboard (staff graph) | 186490 | ~53800 (vite) |
| staff entry | 128040 | ~37880 |
| init | 139944 | ~40920 |
| **plan-import (lazy)** | **20768** | **6357** |
| schedule-import-utils (lazy companion) | 3230 | ~1500 |

## Gate exit codes

| Gate | Exit | Notes |
| ---- | ---- | ----- |
| secrets | **0** | |
| lint | **0** | |
| targeted unit (lang/lazy/A.3.1.1) | **0** | 37 |
| full unit | **0** | **714** pass (was 705) |
| HTTP/auth | **0** | 32 |
| Rules + emulator | **0** | **122** (not reduced) |
| full E2E | **0** | **89** (not reduced) |
| firebase isolation | **0** | |
| npm audit --omit=dev | **0** | 0 vulns |
| npm audit (dev) | **1** | js-yaml high via firebase-tools/eslint — **not fixed** (no audit fix/force) |
| visual | **0** | 7 shots, real UI |
| build + D17 | **0** | both budgets green |
| manifest verifier | **0** | |

### Audit separation

- **Production** (`npm audit --omit=dev`): 0 vulnerabilities.
- **Dev-tool advisory**: js-yaml high (+ otel/re2 moderate) through `firebase-tools` / `eslint` chain — see `npm-explain-js-yaml.txt`. No `npm audit fix` / `--force` in this phase.

## Visual (`reports/phase-2r-b-visual/`)

1. Staff initial  
2. Language selector — only EN/DE/SR  
3. Monthly import CTA + upload zone  
4. Server preview  
5. IN_PROGRESS/retry  
6. RECOVERY without Confirm/Retry  
7. Idempotent success — visible **03.08.2026**, **101.S01**, **91101**, toast  

No fabricated DOM captions.

## Artifacts

- `reports/phase-2r-b-report-2026-08-09.md`
- `reports/phase-2r-b-change-ledger.md`
- `reports/phase-2r-b-logs/`
- `reports/phase-2r-b-visual/` + `TRAIL.json`
- `reports/phase-2r-b-source-manifest.txt`
- `reports/phase-2r-b-review-source-2026-08-09.zip`
- `reports/phase-2r-b-full-deliverable-2026-08-09.zip`
- git status / diff-stat / base-to-working patch

## Intentionally not done

Phase 3 · commit · push · deploy · budget bump · schema · dependency changes · npm audit fix.

Owner must send an explicit Phase 3 start command before any Phase 3 work.

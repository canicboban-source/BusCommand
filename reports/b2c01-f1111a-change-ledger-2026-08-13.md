# B2C-01-F1.1.1.1-A change ledger — 2026-08-13

Baseline HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`  
Branch: `staging/phase-3-isolation`  
Staged: **0** · No commit/push/PR/deploy · Dirty B2C-01 tree preserved

## Production

| File | ŠTA | ZAŠTO | DONOSI |
|------|-----|-------|--------|
| `js/admin/superadmin.js` | Replace modal-only Escape bind with sync `focusSaCreateModalShellSync()` + temporary document-level capture `bindSaCreateUnloadedEscapeGuard` / `unbindSaCreateUnloadedEscapeGuard`; unbind on local dismiss and on successful module load; focus helper never throws | After lazy load failure, focus could remain on `#sa-open-create-modal`, so modal `keydown` never saw Escape | Unloaded Escape closes shell reliably; no chunk/toast; loaded flow keeps leave-confirm Escape |

## Tests

| File | ŠTA | ZAŠTO | DONOSI |
|------|-----|-------|--------|
| `tests/e2e/b2c01-f1111a-escape-noload.spec.js` | **ADD** proofs A+B, C, D + visuals | Executable Escape accessibility gate | Fail-first red → final green |
| `tests/unit/b2c01-f1111a-escape-noload.test.mjs` | **ADD** source contracts for guard/focus/unbind | Static regression | Unit gate |
| `tests/e2e/b2c01-f1-create-company-ca.spec.js` | Execution-error poison blows on 2nd `getElementById("sa-new-name")` | Sync shell focus consumes first call | Existing F1.1.1.1 execution proof stays valid |

## Explicitly unchanged

- API / Rules / schema / dependencies  
- B2C-01-R1, B2C-03, H1-B/H1-C, Phase 4  
- BLAGUSS / staging QA tenant  
- Bundle budget ceilings  
- No new production globals / ForTests hooks  

## Review patch

`reports\b2c01-f1111a-review.patch` — Node Buffer, mojibake scan clean.

# B2C-01-F1.1.1 change ledger — 2026-08-13

Baseline HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`  
Branch: `staging/phase-3-isolation`  
Staged: **0** · No commit/push/PR/deploy · Dirty F1/F1.1 tree preserved

## Production

| File | ŠTA | ZAŠTO | DONOSI |
|------|-----|-------|--------|
| `js/core/utils.js` | `showToast` returns toast element / `null` | Flow needs a safe handle without expanding toast API | Callers can replace only their own toast |
| `js/admin/sa-create-company-flow.js` | Flow-owned outcome toast; remove global wipe, `__b2c01f1`, `_saCreateRefreshCount`, `__get/__reset` exports | Global wipe + test instrumentation forbidden | Isolated outcomes; clean production surface |
| `js/admin/superadmin.js` | Remove `__get/__reset` wrappers/exports; `saDashboardUsesLocalState()` for window override | Close production test exports; enable network refresh under force-production | Honest E2E refresh counting |

## Tests

| File | ŠTA | ZAŠTO | DONOSI |
|------|-----|-------|--------|
| `tests/unit/b2c01-f111-create-company-ca.test.mjs` | **ADD** F1.1.1 contracts | Fail-first/final source proofs | Unit gate |
| `tests/unit/b2c01-f11-create-company-ca.test.mjs` | Align refresh/toast assertions | Match new production contract | No stale expectations |
| `tests/e2e/b2c01-f1-create-company-ca.spec.js` | Playwright probes (no `window.__b2c01f1`); sentinel toast; network refresh waves | Honest counters + toast isolation | 15-test suite with B12 |
| `tests/e2e/b2c01-f1-visual-trail.spec.js` | Fresh contexts; CA fixture; 06/07 split; measured TRAIL; output `b2c01-f111-visual` | Truthful screenshots | Absolute Windows paths |

## Explicitly unchanged

- API / Rules / schema / dependencies  
- B2C-01-R1, B2C-03, H1-B/H1-C, Phase 4  
- BLAGUSS / staging QA tenant data  
- Bundle budget ceilings  

## Review patch

`reports\b2c01-f111-review.patch` — Node Buffer, mojibake scan clean.

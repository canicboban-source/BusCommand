# FAZA 2R-A.3.1 — Change ledger

Base SHA: `a6fbcb508c67287c33479f38c3678cd44684ee60`  
Date: 2026-08-09  
Schema diff: **NONE**  
STOP: no 2R-B / Phase 3 / budget bump / commit / push / deploy

| File | What changed | Why | Brings | Proof |
| ---- | ------------ | --- | ------ | ----- |
| `server/group-monthly-plan-import.js` | `evaluateMonthlyImportLockState` + `readMonthlyImportLockInTx`; UX assert uses same evaluator | C — concurrency proof must be in-tx | Shared lock gate for all writers | unit source + emulator races |
| `server/staff-monthly-plan-import.js` | `applyImportChunkTransaction`; prepared/partial fail-closed; expired persists then throws outside; completion requires alive consistent lock; compensation restores in tx | B/D/E/F | No getAll→batch race; no false completed | emulator 5–10 |
| `server/driver-routes.js` | Assignment/undo/incident/confirm read import lock inside mutation tx; confirm rejects stale fingerprint always; no phantom shift merge | C | Cross-writer atomicity | emulator 1–4 |
| `tests/unit/phase2r-a31-fail-first.test.js` | Source guards (red on A.3) | E fail-first | Gate | fail-first-unit EXIT=1 then green |
| `tests/rules/phase2r-a31-cross-writer-atomicity.test.js` | 10 emulator race cases + both orders where applicable | G | Sole concurrency proof | emulator-a31-focused EXIT=0 (12) |
| `tests/unit/staff-monthly-plan-import.test.js` / `phase2r-a1-reliability-closeout.test.js` | Compensation failure mocks target schedule batch (shift restore is tx) | F regression align | Green unit | unit-full 692 |
| `scripts/phase2r-a31-visual-trail.mjs` | Shot 05: fixture driverId + rendered plan + toast | H | Visual closeout | visual EXIT=0 |
| `scripts/phase2r-a31-pack-artifacts.mjs` | Per-file hash/size recheck; exclude pack/verifier logs from body | I | Verifier EXIT=0 | manifest-verifier |
| `reports/phase-2r-a31-writer-inventory.md` | Documented all writers | A | Audit trail | inventory |

## Intentionally not done

- Crash-resume / takeover of `committing`
- New schema fields / collections / indexes / dependencies / API
- 2R-B, Phase 3, language purge, bundle optimization, budget bump
- Commit / push / deploy

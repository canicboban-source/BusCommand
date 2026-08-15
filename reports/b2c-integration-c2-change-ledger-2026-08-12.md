# B2C-INTEGRATION-C2 change / execution ledger — 2026-08-12

## Verdict
BLOCKED_REMOTE_CI

## Executed (authorized)
1. Preflight identity + allowlist 20/20 + C1 patch SHA match
2. `git add` exact 20 allowlist paths (no glob)
3. Post-stage allowlist gate (20 / M12 / A8 / D0 / no reports-scripts-secrets)
4. Pre-commit gates: secrets, eslint, unit subset, E2E subset, lang, build, D17 — all EXIT 0
5. Commit `0753ff17a15b5ed2a81ae6ef810115c726b90d6b` on `staging/phase-3-isolation`
6. Push only `staging/phase-3-isolation`
7. Exactly one `gh workflow run integrated-qa.yml --ref staging/phase-3-isolation`
8. Waited for RUN_ID 31635206955 → conclusion failure
9. Wrote reports/logs/visual under `reports/b2c-integration-c2-*`

## Not executed
- Code changes during C2
- Staging non-allowlist files
- Amend / reset / stash / clean
- CI rerun
- Second commit
- PR / merge / deploy / tag / force-push
- Firebase / Render changes
- B2C-01 / B2C-03 / H1-B / H1-C / Phase 4

## Commit contents (20)
See `git show --name-status 0753ff17a15b5ed2a81ae6ef810115c726b90d6b` in logs/commit-show.txt.

## CI failure pointer
- RUN: https://github.com/canicboban-source/BusCommand/actions/runs/31635206955
- Step: First complete verification
- Test: `tests/unit/phase2r-a2-html-escape.test.js` — `escapeHtml(label)` regex vs B2C-02 `data-label` markup
- Log: `reports/b2c-integration-c2-logs/gh-run-failed-log.txt`

## Notes
- Tool auto-appended `Co-authored-by: Cursor <cursoragent@cursor.com>` — reported only, not amended.
- Ordinary `git diff --cached --check` EXIT 2 = CRLF false positive; CRLF-aware EXIT 0.

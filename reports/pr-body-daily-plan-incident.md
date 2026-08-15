## Summary
- Daily plan now builds rows from `state.shifts[]` and resolves driver names (including first/last fallback) so monthly-import assignments stay selected.
- Dispatcher visibility merges JWT groups with the Firestore dispatcher doc for both drivers and group lists (stale `310`-only docs no longer hide `320`).
- Ops/incident UI polish (scroll, daily-plan table, action/crew cards, shared modal layer) plus env-only live incident smoke and group-320 ops seed helpers.

## Test plan
- [x] Unit: daily-plan, visibility, repo-secrets (11/11)
- [x] E2E dispatcher-cockpit ×3 (4/4 each)
- [x] E2E SOS / leave approve / shift assign (3/3)
- [ ] After merge/deploy: dispatcher login → Hub 320 daily plan shows selected drivers
- [ ] After merge/deploy: run `scripts/live-incident-smoke.js` with env API key and base URL

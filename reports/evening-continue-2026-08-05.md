# Evening continuation report — 2026-08-05

**Branch:** `work/ca-group-monthly-import`  
**Live:** https://buscommand.com (PREVIEW) · Firebase `buscommand-preview` · tenant `bc-test`  
**Status for owner tonight:** local fixes ready; live deploy + live incident smoke need your OK / env unlock

## What was finished while you were at work

### Functional fixes (local, not yet on `main` / Render)

| Area | Change | Why |
|------|--------|-----|
| Daily plan | `getDailyPlanForDate` prefers `state.shifts[]`, resolves name from `driverId` / first+last | Live 320 showed "—" despite monthly import |
| Dispatcher visibility | `getVisibleDrivers` + `getVisibleGroups` merge JWT groups with Firestore doc | Stale dispatcher doc had only `310` |
| Driver labels | firstName/lastName fallback when `name` empty | Firestore docs often split names |
| Incident UI | create modal uses shared `ops-modal-layer` + accessible title | Align with coverage resolver chrome |
| Live smoke script | `scripts/live-incident-smoke.js` — API key **from env only** | Repo secrets gate |
| Ops seed | `scripts/seed-group-320-ops.js` also syncs dispatcher groups `310`+`320` | Avoid stale profile |

### Visual polish

- Staff layout scroll: `100vh` + `.app-main` scroll (side panel no longer looks blank)
- Daily plan table: classes, hover, standby tint, select focus rings
- Ops action / crew cards: subtle gradient, hover elevation, critical/warning border tint
- Incident dialog: richer surface + shared modal layer with coverage resolver

### Verification run (local)

| Check | Result |
|-------|--------|
| Unit: daily-plan + visibility + repo-secrets | **11/11 pass** |
| E2E `dispatcher-cockpit.spec.js` | **4/4 × 3 passes** |
| E2E SOS + assign shift + leave approve | **3/3 pass** |
| Live incident create→resolve | **Blocked** — previous run `401 Nema tokena`; re-probe needs owner-approved live call + `VITE_FIREBASE_API_KEY` env |

## Incident scenarios

### Covered in automated demo (green)

1. **Coverage disruption → guided resolve** (`dispatcher-cockpit`) — create incident, pick replacement driver + bus, plan updates  
2. **Generic report** — requires verified resolution record  
3. **SOS alarm flow** (`ui-smoke`)  
4. **Leave approve** + **shift assign**

### Still for tonight on live `bc-test` (after deploy)

1. Re-login dispatcher (groups 310+320)  
2. Group Hub **320** daily plan — drivers selected (not "—")  
3. Buses 32001–32003 visible / assignable  
4. Create coverage incident for Marko (100601) → resolve with free driver + 32001  
5. Optional: delay / breakdown / SOS on driver surface → staff resolve  
6. Activity User filter empty after hard refresh (PR #27 already on main)

## How to finish live smoke tonight

```powershell
# from repo root, with firebase-admin-key.json present (gitignored)
$env:VITE_FIREBASE_API_KEY = "<from Render / .env — not committed>"
$env:L7_SMOKE_BASE_URL = "https://www.buscommand.com"
node scripts/seed-group-320-ops.js
node scripts/live-incident-smoke.js
```

If create still returns `401 Nema tokena`, Authorization is not reaching Express (proxy/redirect). Capture status + response body; compare `buscommand.com` vs `www.buscommand.com` with `redirect: manual`.

## Deploy gate

Do **not** merge/deploy these local polish/incident fixes without your explicit release decision (Master Prompt).  
Suggested PR scope tonight:

- `js/core/shift-plan.js`, `js/core/utils.js`, `js/dispatcher/daily-plan.js`, `js/dispatcher/dashboard.js`
- `css/staff-desktop.css`
- `tests/unit/daily-plan-from-shifts.test.mjs`, `tests/unit/dispatcher-visible-groups.test.mjs`, `tests/unit/repo-secrets.test.js`
- `scripts/live-incident-smoke.js`, `scripts/seed-group-320-ops.js`
- this report + `reports/ca-live-verify-2026-08-05.md`

## Open risks

1. Live daily-plan bug still present until deploy  
2. Live incident API 401 root cause not re-confirmed after script fix  
3. `firebase-admin-key.json` must stay local / gitignored  
4. Demo mode only on localhost — live always needs real Firebase auth  

## Suggested first 10 minutes when you return

1. Review this report + side-browser on staff demo if you want UI look  
2. Approve PR/commit of the local branch changes  
3. After Render picks up merge: hard refresh → dispatcher login → Hub 320 → incident resolve  
4. Run `live-incident-smoke.js` with env key set  

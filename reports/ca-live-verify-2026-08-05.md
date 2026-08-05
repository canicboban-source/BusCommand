# CA live verification — 2026-08-05

**Environment:** https://buscommand.com (PREVIEW) · Firebase `buscommand-preview` · company `bc-test`  
**Actor:** Company Admin `ca.test@bc-test.local`  
**Deploy:** PR #27 autofill fix merged to `main` (`cd19672`)

## Starting state (owner)

| Item | Value |
|------|-------|
| Groups | `310` Linie 310, `320` Leobersdorf |
| Drivers on 320 | 10 (EID 100601–100610) |
| Buses | 0 |

## Steps executed

1. **Login CA** — OK  
2. **Groups / lines** — 2 groups; both “Needs data” until plans/buses complete — OK  
3. **Service plan 320** — preview → stage → activate  
   - Plan id `320-320-01-2026-08-01`  
   - Duties: `320.S01`, `320.F01` (2 duties / 10 activities) — OK  
4. **Monthly import 320** (2026-08, merge) — preview → commit  
   - 5 rows / 5 drivers / 5 assignments / 0 removals — OK  
5. **Dispatcher groups** — `disp.test@bc-test.local` → `["310","320"]` (reauth required) — OK  
6. **Activity** — server events for plan + monthly import + dispatcher groups; **User filter empty** — OK  
7. **Branding / Settings** — sections load; HQ Austria; settings show Saved — OK  
8. **Buses** — empty (expected; dispatcher attaches in ops) — OK  
9. **Drivers directory** — 10 active after render — OK  

## Also found on tenant

- Group **310** already has active catalog **v66** (75 duties) from prior data — not created in this session.
- Bootstrap group 310 still present alongside owner’s 320.

## Issues

| Priority | Finding | Notes |
|----------|---------|-------|
| Medium | Side-panel / short viewport: main content often looks blank until `documentElement` scroll | Body/html scroll mismatch; content exists (groups stats visible after scroll) |
| Low | Drivers stats briefly `0` before `renderCompanyAdminDrivers` | Likely race on first paint; recovered to 10 |
| Info | Autofill fix on Activity needs hard refresh after Render finishes deploying PR #27 | Live session already showed empty User field |

## Test artifacts (Desktop, outside repo)

- `C:\Users\cane\Desktop\BusCommand-CA-Live-Test\dienstplan-320-v01.csv`
- `C:\Users\cane\Desktop\BusCommand-CA-Live-Test\monthly-320-2026-08.csv`

## Dispatcher follow-up (same day)

| Step | Result |
|------|--------|
| Login dispatcher | OK — claims include 310+320 |
| Group Hub 320 | 10 drivers; shifts present for import days |
| Daily plan selects | **Bug:** dropdowns showed "—" — fixed locally in `shift-plan.js` + visibility merge (not deployed yet) |
| Buses | Seeded `32001`–`32003` via `scripts/seed-group-320-ops.js` |
| Live incident smoke | Create returned `401 Nema tokena` — script fixed to env API key; re-run pending tonight |

See `reports/evening-continue-2026-08-05.md` for local verification matrix and deploy gate.

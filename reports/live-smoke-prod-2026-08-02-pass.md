# Live smoke — production PASS

Datum: **2026-08-02 ~23:20 Europe/Vienna**  
URL: `https://www.buscommand.com/staff.html`  
Deploy: Render servis **`buscommand`**, commit **`b45b9cf`** (PR #16)

## Rezultat: **PASS**

| Provera | Rezultat |
|---------|----------|
| `hub-add-bus-btn` | da |
| `bus-import-paste` | da |
| stari `staff-1DVzJ5Lc.js` | ne |
| asset | `staff-Bwquj1MA.js` |
| plan-lock u bundle (`acquirePlanLock`) | da |
| `/api/health` | ok, production |

Ručni login QA (Add bus 91504, lock banner) i dalje na vlasniku.

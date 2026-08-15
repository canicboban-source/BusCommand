# B2C-D17-H1 — Staff D17 headroom review (READ-ONLY)

**Date:** 2026-08-12  
**Workspace:** `C:\Users\cane\Desktop\BusCommand-ca-monthly-import`  
**Branch:** `staging/phase-3-isolation`  
**HEAD:** `80bd34bdd85e07bea23cb9bc52793c72e3b31660`  
**Staged:** 0  
**Dirty tree:** preserved (no reset/stash/checkout/clean)  
**B2C-02 / B2C-04 source files:** untouched this task  
**Production/source/test/config:** **not modified**  
**Commit / push / deploy:** **none**  
**Build this task:** **not rerun** — used post-B2C-04 `dist/` matching `reports/b2c04-d17.txt` (staff **579194**)

## Verdict

**SAFE_PLAN_AVAILABLE**

Current headroom **2438 B (~2.38 KiB)** can be raised to **≥ 8 KiB** (and preferably **≥ 12 KiB**) by applying the existing lazy-chunk pattern to already-split eager UI modules — **without** raising D17 limits, without touching plan-import reliability, and without language/budget bumps.

---

## 1) Exact D17 formula

Source of truth: `scripts/check-bundle-budgets.js`.

| Metric | Formula |
|--------|---------|
| **Staff actual** | Sum of **raw on-disk bytes** of every `assets/*.js` referenced by `dist/staff.html` via `src`, `href`, or `modulepreload` |
| **Staff exclude** | Any `translations-*.js` reference is filtered out of the staff sum |
| **Staff max** | `568 * 1024` = **581632** |
| **Translations** | Size of the single `translations-*.js` file vs `369 * 1024` = **377856** (separate assert) |
| **Not counted** | CDN Firebase/Lucide/Leaflet; CSS; HTML; **lazy chunks not linked from staff.html** |

### Does lazy `plan-import` enter staff D17?

**No.** Current `plan-import-Ch-ElzzW.js` (**22215 B**) is **not** in `staff.html` src/modulepreload. It loads only via dynamic `import()` (`plan-import-loader` / `withPlanImportModule`). Confirmed in inventory: `planImportInStaffD17: false`.

### Current numbers (proven)

| | Bytes |
|--|------:|
| Staff actual | **579194** |
| Staff max | **581632** |
| Headroom | **2438** (~2.38 KiB) |
| Free needed for ≥8 KiB headroom | **5754** |
| Free needed for ≥12 KiB headroom | **9850** |
| Translations | **344300 ≤ 377856** (headroom 33556) |

---

## 2) Staff chunk table (current dist)

| Chunk | Raw bytes | Eager/lazy | In staff D17? | Why | Main modules (attribution) |
|-------|----------:|------------|---------------|-----|----------------------------|
| `dashboard-CCQd6-81.js` | 189793 | eager | **YES** | modulepreload | dashboard, monthly-plans, group-hub, ops-attention, **month-abbr**, package-import pieces |
| `init-C8wBLBnz.js` | 140098 | eager | **YES** | modulepreload | shared init/firebase/runtime |
| `staff-Dv8_SvJZ.js` | 129921 | eager | **YES** | entry `<script type=module>` | install-staff graph, register-onclick-staff, SA/CA/Dispo wiring |
| `company-admin-CzXT1S15.js` | 64905 | eager | **YES** | modulepreload | company-admin surface |
| `company-admin-groups-D98s8utd.js` | 29886 | eager | **YES** | modulepreload | CA groups |
| `msg-compose-CGU_GO2Z.js` | 13693 | eager | **YES** | modulepreload | Dispo messages UI |
| `reports-fP0eR1fa.js` | 7672 | eager | **YES** | modulepreload | Dispo reports UI |
| `schedule-import-utils-BEAca9dX.js` | 3226 | eager | **YES** | modulepreload | schedule text/OCR helpers (pulled by eager schedule-upload/parse) |
| `plan-import-Ch-ElzzW.js` | 22215 | **lazy** | **NO** | dynamic import only | monthly import preview/commit |
| `company-admin-onboarding-*.js` | 10750 | lazy | NO | dynamic import | CA wizard |
| `help-support-*.js` | 3824 | lazy | NO | dynamic import | Dispo help |
| `line-roster-*.js` | 4092 | lazy | NO | dynamic import | line roster |
| `translations-DhlFFTKP.js` | 344300 | shared dict | **excluded** | separate budget | sr/en/de strings |

Full machine inventory: `reports/b2c-d17-h1-logs/chunk-inventory.json`.

---

## 3) B2C-04 month-abbr movement (confirmed)

| Claim | Evidence |
|-------|----------|
| Helper lives in eager **dashboard** | Marker `Unsupported UI language for month abbr` **only** in `dashboard-CCQd6-81.js` |
| **No duplicate** copy in plan-import | `plan-import-*.js` has **no** month-abbr markers; it `import {…} from "./dashboard-….js"` |
| Staff Δ vs B2C-02 | **577803 → 579194 = +1391 B** (matches ~dashboard +1.39 kB / plan-import −1.30 kB) |
| Why staff grew | month-abbr left the **lazy** plan-import graph and entered the **eager** dashboard graph counted by D17 |

---

## 4–6) Candidates and recommended package

Root pull reason for many eager chunks: `js/install-staff.js` **static side-effect imports** (msg-compose, reports, schedule-*, package-import, superadmin, CA, …) plus matching static imports in `register-onclick-staff.js` / `register-staff-sections.js`. Vite therefore emits separate chunks **and** modulepreloads them into staff.html.

Existing safe pattern to copy: `help-support`, `company-admin-onboarding`, `plan-import-loader` (dynamic `import()`, optional load-error toast, no permanent poison cache).

### H1-A — Lazy-load `msg-compose` — **IMPLEMENT**

| Field | Detail |
|-------|--------|
| Exact module | `js/dispatcher/msg-compose.js` (+ `sent-messages` coupling review) |
| Eager artifact | `msg-compose-CGU_GO2Z.js` = **13693 B** (exact) |
| Import chain | `install-staff.js` → msg-compose; `register-staff-sections.js` → Messages section; `register-onclick-staff.js` → message actions |
| Expected save | **Conservative 12000 B** (exact chunk 13693; leave ~1.7 KiB margin for residual glue) |
| Risk | **Medium-low** — first open of Messages slower; must wrap all message actions like plan-import |
| Cold-load / retry / errors | Same class as help-support; must not break plan-import path |
| Tests | Targeted E2E: open Messages, send/list; staff D17 remeasure; no plan-import regression |
| Affects plan-import reliability? | **No** |

### H1-B — Lazy-load Dispo `reports` UI chunk — **IMPLEMENT**

| Field | Detail |
|-------|--------|
| Exact module | `js/dispatcher/reports.js` |
| Eager artifact | `reports-fP0eR1fa.js` = **7672 B** (exact) |
| Import chain | `install-staff.js` + `register-staff-sections.js` + `register-onclick-staff.js` |
| Expected save | **Conservative 5000 B** (string markers also appear in init/staff; some shared glue may remain) |
| Risk | **Medium-low** — Reports section cold open |
| Tests | Open Reports, resolve flow smoke; D17 remeasure |
| Affects plan-import? | **No** |

### H1-C — Detach `schedule-import-utils` from eager graph — **IMPLEMENT**

| Field | Detail |
|-------|--------|
| Exact modules | `js/maps/schedule-upload.js`, `js/maps/schedule-parse.js` → `schedule-import-utils.js` |
| Eager artifact | `schedule-import-utils-BEAca9dX.js` = **3226 B** (exact) |
| Import chain | `install-staff.js` static imports schedule-parse/upload → utils; also used by lazy plan-import |
| Expected save | **Conservative 2500 B** if utils becomes lazy-only shared |
| Risk | **Medium** — schedule upload path must dynamic-import; plan-import already lazy and can keep importing utils |
| Tests | Schedule upload/parse smoke; plan-import B2C-02 E2E still green |
| Affects plan-import reliability? | **Must not** — keep utils available to plan-import chunk; only remove eager preload |

### Other candidates

| ID | Item | Bytes | Rec | Notes |
|----|------|------:|-----|-------|
| H1-D | Lazy `package-import` | **EST.** 8–12 KiB of dashboard/staff | **RESERVE** | Pulled via install-staff + data-hub; larger refactor; not required if A+B land |
| H1-E | Lazy entire CA (`company-admin` + groups) | **Exact** 64905+29886=94791 | **RESERVE** | Huge headroom; higher CA cold-start risk; do after Dispo-safe wins |
| H1-F | Lazy `superadmin.js` | **EST.** large portion of staff entry | **RESERVE** | SA-only; shell-staff calls `renderSuperAdminDashboard` on login |
| H1-G | Reverse month-abbr into lazy-only | ~1391 | **REJECT** (for now) | monthly-plans is eager; async month options adds UX/focus risk for tiny gain |
| H1-H | Budget bump / gzip as D17 | — | **REJECT** | Forbidden by contract |
| H1-I | Remove languages / shrink translations into staff | — | **REJECT** | Languages stay sr/en/de; translations already under budget |

### Recommended minimal package (future implementation — **not done here**)

| Step | Candidate | Conservative save |
|------|-----------|------------------:|
| 1 | H1-A msg-compose | 12000 |
| 2 | H1-B reports | 5000 |
| 3 (optional buffer) | H1-C schedule-utils | 2500 |
| **Total conservative** | | **17000** (A+B) / **19500** (A+B+C) |

| After A+B (conservative) | |
|--|--:|
| New staff actual (upper bound) | 579194 − 17000 = **562194** |
| New headroom | 581632 − 562194 = **19438 B (~19.0 KiB)** |
| Meets ≥8 KiB? | **Yes** |
| Meets ≥12 KiB? | **Yes** |

**Even H1-A alone** (conservative 12 KiB) → headroom ≈ **2438+12000 = 14438 B (~14.1 KiB)** ≥ 12 KiB.

---

## Constraints respected by the plan

- Does **not** change plan-import reliability/security contract  
- Does **not** restore deleted languages  
- Does **not** push translations over limit  
- Does **not** add dependencies or new runtime network requirements  
- Does **not** raise D17 ceilings  

---

## Deliverable paths (Windows)

| Artifact | Path |
|----------|------|
| Report | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import\reports\b2c-d17-h1-headroom-review-2026-08-12.md` |
| Logs | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import\reports\b2c-d17-h1-logs\` |
| Visual | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import\reports\b2c-d17-h1-visual\01-current-budget-and-chunks.png` |

---

## Honesty note

All **exact** chunk sizes are from current `dist/` file stats. Savings marked **conservative** deliberately under-claim where markers appear in multiple chunks (reports) or where Vite may leave shared stubs. No unsafe redesign proposed solely to hit the number.

**STOP — no optimization implemented. Awaiting owner decision.**

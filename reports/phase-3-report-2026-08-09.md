# FAZA 3 — Assignment resource integrity (D24) — Report (2026-08-09)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Checkpoint:** Integration Gate 3.0 closed → Phase 3 D24 closeout  
**Verdict:** Phase 3 D24 **CLOSED** with full gates green.  
**STOP:** no commit / push / deploy without explicit owner approval.

---

## Scope completed

### D24 — Assignment resource integrity (hard fail)

1. **Server authority** — bus exists / pool / `active` / `opsStatus===ready` / overlap / duty catalog when code provided; stable 409 codes; no soft warn-but-save.
2. **Client preflight** — Dispo blocked before write; toast names bus + holder; no partial conflict-day write.
3. **CA atomic create** — `POST /api/company-admin/drivers`; PIN shown once in toast; directory never stores plaintext PIN; PIN/OTP sanitized from audit.
4. **Real-UI modal proof** — monthly day-edit footer (Cancel / Undo / Save) fully in viewport; CA add footer (Cancel / Submit) fully scrolled into view; every CTA has a proven result.

### Visual trail (`reports/phase-3-visual/`)

| Shot | Proven result |
|------|----------------|
| `01-valid-assignment.png` | Valid assign saves bus 91101 |
| `02-occupied-bus.png` | Occupied bus blocked + toast |
| `03-inactive-bus.png` | Inactive bus blocked |
| `04-bus-not-ready.png` | Non-ready ops status blocked |
| `05-bus-conflict.png` | Overlap conflict blocked |
| `06-stale-revision-refresh.png` | Stale remote revision applied locally |
| `07-rollback-refreshed.png` | No partial conflict-day write |
| `07b-day-edit-modal-footer-ctas.png` | Day-edit Cancel/Undo/Save fully visible |
| `07c-day-edit-save-blocked.png` | Save CTA → block toast; modal stays open; no save |
| `07d-day-edit-cancel-closes.png` | Cancel CTA closes modal |
| `08a-ca-add-modal-footer-ctas.png` | CA Cancel + Submit fully visible at panel bottom |
| `09-ca-driver-create-error.png` | Submit CTA → PIN validation toast; footer still visible |
| `08-ca-driver-created-no-creds.png` | Successful create; directory has no plaintext PIN |

Trail log: `TRAIL.json` / `README.md` (all steps **pass**).

---

## D17 (single clean build)

| Metric | Value | Budget |
|--------|------:|-------:|
| staff JS excl. translations | **577311** | 581632 |
| translations | **342341** | 377856 |
| driver JS excl. translations | 172782 | 225280 |
| largest driver non-tr chunk | 140089 | 153600 |

Source: `npm run build` → `phase-3-logs/build.txt` + `bundle-budgets.txt` + `d17-measure.json`.

---

## Final gates (all EXIT 0)

| Gate | Result |
|------|--------|
| secrets | 0 |
| lint (product) | 0 |
| unit full | **753 PASS** / 0 fail |
| HTTP/auth | **44 PASS** / 0 fail |
| Rules emulator | **122/122** |
| E2E full | **105 PASS** |
| firebase isolation | 0 |
| audit (`--omit=dev`) | 0 vulnerabilities |
| build + D17 | 0 |
| visual trail | 0 |

Logs: `reports/phase-3-logs/`.

---

## Packaging

- `reports/phase-3-source-manifest.txt` (body-sha256; manifest excluded from body)
- `reports/phase-3-review-source-2026-08-09.zip`
- `reports/phase-3-full-deliverable-2026-08-09.zip`
- Fresh `git-status-short` / `git-diff-stat` / `base-to-working.patch`
- `phase-3-logs/manifest-verifier.txt` → EXIT=0

Gate 3.0 artefacts under `reports/phase-3-gate30-*` remain intact.

---

## Not done (explicit STOP)

- Commit / push / deploy
- Budget bumps, schema changes, new dependencies
- Broader Phase 3 features beyond D24 closeout

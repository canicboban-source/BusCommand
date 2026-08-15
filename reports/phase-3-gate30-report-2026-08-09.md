# FAZA 3 — Integration Gate 3.0 — Report (2026-08-09)

**Base SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Verdict:** Integration Gate 3.0 **CLOSED** — ready to stop before remaining Phase 3 work.  
**STOP:** no commit / push / deploy / further Phase 3 features in this turn.

---

## Closed items

### 1) Rules integration
- Reproduced `DUTY_CATALOG_MISSING` on assignment-first race (no active catalog in fixture).
- **Fix:** seed real active `service_plans` + duty `310.S01` (05:00–13:00) for groups 310/311.
- Guard **not** weakened; assignment expectation **not** softened.
- Proven: assignment first = **200**; import then = **409 CONFLICT**; revision kept; no dual write.
- Full Rules emulator: **122/122**, fail **0**.

### 2) Stale SA QA flows
- Inventory / matrix / `pilot-verify-sa-open.mjs` updated — no `#sa-detail-open-app-btn`.
- Live matrix: Manage account → account modal; no dead Open; Start audited support → support modal; Close closes.
- Function matrix: **FAIL_COUNT 0** (801 tested; 798 PASS / 3 BLOCKED).

### 3) Import button text
- Visible button: EN **Choose files** / DE **Dateien auswählen** / SR **Izaberi fajlove**.
- Formats remain in dropzone (`hub_plan_drop_hint`).

### 4) Row-actions
- Outside click + Escape close immediately.
- 150 ms grace retained **only** for scroll/resize settle (proven needed).
- E2E: item click after open; Escape; outside; scroll cleanup — PASS.

### 5) D17 (single clean build)
| Metric | Value | Budget |
|--------|------:|-------:|
| staff JS excl. translations | **577311** | 581632 |
| translations | **342341** | 377856 |
| driver JS excl. translations | 172782 | 225280 |
| largest driver non-tr chunk | 140089 | 153600 |

Source: one `npm run build` → `phase-3-gate30-logs/build.txt` + `d17-measure.json` + `bundle-budgets.txt` (identical).

---

## Final gate (all EXIT 0)

| Gate | Result |
|------|--------|
| secrets | 0 |
| lint (product) | 0 |
| unit full | **753 PASS** |
| HTTP/auth | **40 PASS** |
| Rules | **122/122** |
| E2E full | **105 PASS** |
| firebase isolation | 0 |
| audit (omit=dev) | 0 vulns |
| build + D17 | 0 |
| function matrix | FAIL_COUNT 0 |
| visual trail | 0 |
| pilot SA verifier | 0 |
| manifest verifier | see pack log |

---

## Visual trail

`reports/phase-3-gate30-visual/`

- `01-choose-files-button.png` — **Izaberi fajlove**
- `02-preview-after-chooser.png`
- `03-sa-manage-account-table.png` — Manage account
- `04-sa-account-modal.png` — footer without Open
- `05-sa-start-audited-support.png`
- `10-sa-manage-account-modal.png` / `11-sa-start-audited-support.png` / `12-sa-close-detail.png` (pilot)

---

## Packaging

- `reports/phase-3-gate30-source-manifest.txt` (body-sha256; manifest excluded from body)
- `reports/phase-3-gate30-review-source-2026-08-09.zip` (includes manifest + `.cursor/rules` + AGENTS.md)
- `reports/phase-3-gate30-full-deliverable-2026-08-09.zip`
- Fresh `git-status-short` / `git-diff-stat` / `base-to-working.patch`
- `phase-3-gate30-logs/manifest-verifier.txt` → EXIT=0

---

## Not done (explicit STOP)

- Remaining Phase 3 feature work beyond this integration gate.
- Commit / push / deploy.

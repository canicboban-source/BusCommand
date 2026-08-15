# D17 headroom expansion via js/admin + js/data deduplication — 2026-08-15

**Branch:** `staging/phase-3-isolation` · **HEAD at start:** `1e585fc`
**Scope:** deduplicate repeated strings and inline styles in `js/admin/` and `js/data/`.
**Target:** staff D17 headroom ≥ 15 000 B.

## Result

| | Bytes |
|--|------:|
| Staff budget (`568 KiB`) | 581 632 |
| Staff actual **before** | 573 435 |
| Staff actual **after** | **565 664** |
| **Headroom before** | 8 197 |
| **Headroom after** | **15 968** ✅ |
| Net cut | **−7 771** |

Budgets were **not** raised. Other D17 asserts after the change:
driver app JS `172 748 ≤ 225 280`, largest driver chunk `140 055 ≤ 153 600`,
translations `353 209 ≤ 377 856`.

## Progression

| Step | Staff bytes | Δ |
|------|------------:|---:|
| baseline | 573 435 | — |
| inline styles → CSS classes + `refreshIcons()` | 569 014 | −4 421 |
| `tx()` / `icon()` markup helpers | 567 934 | −1 080 |
| `btnSecondary()` / `btnPrimary()` | 566 651 | −1 283 |
| `statCell()` + `currentUserCanRunCompanyAdminAction()` + `toastApiError()` | 565 664 | −987 |

## What changed

**1. Inline styles → shared CSS (`style.css`).**
105 `style="…"` blocks lived in JS templates; the ones on the eager staff graph
(`superadmin`, `company-admin`, `groups`, `schedules`, `bus-import`, `buses-routes`)
moved to a new `.bc-*` primitive block: `bc-filter-chip`, `bc-list-row`,
`bc-list-title/sub/meta`, `bc-badge`, `bc-mini-btn`, `bc-doc-*`, `bc-icon-xs/sm`,
plus real rules for the previously unstyled `.company-overview-support-banner`
and `.hub-import-preview-body`. CSS is static and not counted by D17, so these
bytes leave the budget entirely rather than just being deduplicated.

Dynamic colours became custom properties (`--bc-chip-color`) + `color-mix()`.
Side effect: the schedule-history badge previously built `background:${badgeColor}22`
where `badgeColor` was `var(--primary-color)` — string-concatenating a CSS var with
hex digits produced an invalid declaration, so the badge had no background/border.
It now renders correctly.

**2. `refreshIcons()` (`js/core/utils.js`).**
Replaced 48 copies of `if (typeof lucide !== "undefined") lucide.createIcons();`
(30 guarded, 18 unguarded). The 18 unguarded call sites are now guarded too.

**3. `js/ui/markup.js`** — new shared fragment builders:
`tx(key[, vars])` (169 sites), `icon(name)` (57), `btnSecondary` / `btnPrimary` (26),
`statCell(key, value)` (16).

**4. Shared guards** — `currentUserCanRunCompanyAdminAction()` in `js/core/ui-permissions.js`
(10 sites) and `toastApiError(result)` in `js/core/utils.js` (10 sites).

## Verification

| Gate | Result |
|------|--------|
| `npm run lint` | **0** |
| `npm run test:unit` | **901 / 901 pass** |
| `npm run check:secrets` | OK |
| `npm run build` (incl. firebase-isolation + D17) | **0** |
| `npm run test:e2e` | 125 pass / 7 fail — **all 7 pre-existing** |

E2E failures were reproduced on the unmodified tree (`git stash` of `js/` +
`style.css`, rebuild, same specs):

- `ui-smoke.spec.js:20` login screen `#app-branding-title` empty — fails at baseline.
- `ui-smoke.spec.js:34` production fail-closed message — fails at baseline.
- `phase2r-b1` (×2), `phase2r-b11` (×2), `b2c01-f1` / `b2c01-f1111a` — the
  lazy-chunk-recovery / Escape family; order- and timing-dependent, fails at
  baseline both in full-suite and isolated runs, and the failing member of the
  family shifts between runs.

`superadmin-demo.spec.js:97` failed once in the first full run and passed on
re-run and in isolation — flaky, not a regression.

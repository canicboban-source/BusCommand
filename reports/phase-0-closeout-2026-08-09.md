# FAZA 0 — Završni closeout patch (2026-08-09)

**STOP — čeka se odobrenje vlasnika za Fazu 1**  
Ne pokrenuta Faza 1. Nema commit/push/deploy.

## HEAD / okruženje

| Stavka | Vrednost |
| ------ | -------- |
| HEAD (uncommitted closeout) | `a6fbcb508c67287c33479f38c3678cd44684ee60` + local closeout/Faza0 working tree |
| Node za gateove | **v22.14.0** (portable `.tools/node-v22.14.0-win-x64`, gitignored) |
| Visual | `reports/phase-0-visual/` — TRAIL.json sve **pass** |

## Gateovi (Node 22.x)

| Komanda | Exit |
| ------- | ---- |
| `node -v` → v22.14.0 | OK |
| `npm run check:secrets` | 0 |
| `npm run lint` | 0 |
| `npm run build` (+ bundle) | 0 · staff **576296 ≤ 581632** · translations **377148 ≤ 377856** |
| `npm run test:unit` | 0 (624) |
| `npm run test:rules` | 0 (40) |
| `npm run check:firebase-isolation` | 0 |
| `npm audit --omit=dev` | 0 |
| `npx playwright test` | 0 (80) |

## Change log (šta / zašto / dobit / rizik / dokaz)

### 1. Raw i18n `monthly_edit_day` (+ related below-panel keys)

| | |
| -- | -- |
| **Šta** | Dodati `monthly_edit_day`, `monthly_below_entry_hint`, `monthly_below_empty_days`, `monthly_below_no_problems` za **en/sr/de** (Object.assign posle 16-lang propagate). |
| **Zašto** | UI je prikazivao raw ključ; vizuelni gate nije bio istinit. |
| **Dobit** | Čitljiv label na staff jezicima; raw-key scan u visual trail prolazi. |
| **Rizik** | Ostali jezici (hr/fr/…) padaju na EN via `t()` fallback — prihvatljivo za staff surface. |
| **Dokaz** | Visual TRAIL `monthly_edit_day: pass`; unit `monthly-plan-day-stats.test.mjs`; screenshot `06-day-edit-modal.png`. |

### 2. „1 work days“ → assigned day + singular/plural

| | |
| -- | -- |
| **Šta** | `shared/monthly-plan-day-stats.mjs` + summary/export koriste **assigned days** (uključuje vacation/sick); work days broj postoji za duty-only. Plural keys `*_one` / `*_other`. |
| **Zašto** | Vacation je brojan kao „work days“ + pogrešan plural. |
| **Dobit** | Istinit copy: `1 assigned day`. |
| **Rizik** | Stari `monthly_summary` string skraćen (legacy fallback). |
| **Dokaz** | Unit day-stats; visual `08-after-save.png` + TRAIL `summary-copy: … 1 assigned day`; E2E summary assert. |

### 3. E2E / izveštaj — bez lažnog refresh/server dokaza

| | |
| -- | -- |
| **Šta** | Test preimenovan u `import CTA opens zone; vacation day edit persists in QA local state`. Komentar eksplicitno: nema `page.reload`, nije Firebase/server persistence. |
| **Zašto** | Prethodni naziv tvrdio „survives refresh“. |
| **Dobit** | Honest scope; pravi server import ostaje za kasniju fazu. |
| **Rizik** | Nizak. |
| **Dokaz** | `tests/e2e/monthly-plan-import-cta.spec.js`; E2E suite 80 pass. |

### 4. Visual trail ponovljen

| | |
| -- | -- |
| **Šta** | Novi screenshotovi + TRAIL sa fail-closed raw-key / work-days proverama. |
| **Zašto** | Closeout zahtev. |
| **Dobit** | Vizuelni gate stvarno zelen. |
| **Dokaz** | `reports/phase-0-visual/` + `phase0-closeout-visual5.txt` exit 0. |

### 5. Translations budget +1 KiB

| | |
| -- | -- |
| **Šta** | `translationsChunkBytes: 369 * 1024` (bilo 368). Staff limit **nije** diran (i dalje 568 KiB). |
| **Zašto** | Novi en/sr/de stringovi ne stanu u stari plafon bez dijanja. |
| **Dobit** | Build zelen uz ispravan i18n. |
| **Rizik** | Malo veći translations chunk; dokumentovano. |
| **Dokaz** | `npm run build` exit 0. |

## Izmenjeni source fajlovi (closeout-relevant)

- `translations.js`
- `js/dispatcher/monthly-plans.js`
- `shared/monthly-plan-day-stats.mjs` *(new)*
- `scripts/check-bundle-budgets.js`
- `scripts/phase0-visual-trail.mjs`
- `tests/unit/monthly-plan-day-stats.test.mjs` *(new)*
- `tests/e2e/monthly-plan-import-cta.spec.js`
- `.gitignore` (`.tools/`)
- plus ranije Faza 0 izmene u working tree (lazy onboarding, unit/E2E SA sync, itd.)

## Deliverable ZIP

`reports/phase-0-closeout-deliverable-2026-08-09.zip`  
Sadrži kompletan source + reports; isključuje `node_modules`, `.git`, `dist`, `.env*`, `.tools`, secrets.

## STOP

**STOP — čeka se odobrenje vlasnika za Fazu 1**  
Odgovor: `NASTAVI FAZU 1`

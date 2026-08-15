# FAZA 0 — Change Ledger

| ID | Fajl/tok | Šta menjaš | Zašto | Dobit | Rizik | Kako dokazuješ |
| -- | -------- | ---------- | ----- | ----- | ----- | -------------- |
| P0-01 | unit tests (license / trial badge / SA markup) | Uskladi test ili kod sa stvarnim ugovorom (jedinstven badge, import CTA, SA modal) | Padovi blokiraju green gate | Istinit baseline | Pogrešno popuštanje assertiona | `npm run test:unit` exit 0 |
| P0-02 | `openMonthlyPlanImport` / registry / dead `openNewPlanModal` | Potvrdi registraciju handlera; ukloni mrtve reference; nema lažnog empty-plan success | Owner: nema praznog plana; prompt 0.3 | Istinit Dispo ulaz | Regresija CTA | unit handler + E2E click + refresh |
| P0-03 | staff bundle | Vrati ispod **581632** bez dijanja limita (revert budget soft-raise, dead code / lazy) | Prompt 0.4 eksplicitno zabranjuje dijanje limita | Gate zelen bez greenwashinga | Funkcionalna regresija | `check:bundle-budgets` |
| P0-04 | E2E Dispo monthly entry | E2E: dugme → import zona → assignment → refresh | Funkcijski PASS, ne DOM-only | Dokaz kanonskog toka | Flaky QA harness | Playwright exit 0 |
| P0-05 | `reports/phase-0-visual/` | Screenshot trail + README | v4.1 §5 | Vizuelni gate | Privatnost | Visual README PASS |

## Okruženje (pre izmene)

- HEAD: `a6fbcb5` (start)
- Node na mašini: **v26.4.0** (prompt traži 22 — zabeleženo)
- Bez push/deploy u ovoj fazi

## Rezultat Faze 0

| Gate | Exit |
| ---- | ---- |
| unit | 0 (619) |
| e2e | 0 (80) |
| rules | 0 (40) |
| build + bundle | 0 · staff **575964 ≤ 581632** |
| secrets / lint / firebase / audit | 0 |

Izveštaj: `reports/phase-0-report-2026-08-08.md`  
Visual: `reports/phase-0-visual/`  
ZIP: `reports/phase-0-deliverable-2026-08-08.zip`

**STOP — čeka se odobrenje vlasnika za Fazu 1**

## Closeout patch (2026-08-09)

Vidi `reports/phase-0-closeout-2026-08-09.md`  
ZIP: `reports/phase-0-closeout-deliverable-2026-08-09.zip`  
Visual: `reports/phase-0-visual/` (TRAIL all pass)  
Node gate: **22.14.0**

## Namerno ne menjamo

- Schema / nove kolekcije / dependency
- Live deploy / push
- Faze 1–6

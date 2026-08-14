# Release readiness — BusCommand Preview (2026-07-26)

**Definicija:** master prompt §30 — nije pilot-ready dok svi gate-ovi nisu PASS + owner odobrenje.  
**Procena spremnosti (tehnički preview / soft pilot):** **~88%**  
**Procena spremnosti (kontrolisani produkcioni / hard pilot):** **~62%** — owner browser + legal/ops gate-ovi.

---

## Gate checklist

| Gate (master prompt §30) | Status | Dokaz / napomena |
|--------------------------|--------|------------------|
| Nema poznatog Critical/High **security code** bypassa iz G1–G7 | **PASS** | RBAC + P2 reports |
| Tenant isolation + RBAC unit pokrivenost | **PASS** | unit 270; isolation script |
| Firestore Rules testovi prolaze | **BLOCKED** | Emulator treba Java — nije na agent mašini |
| Nema javne liste vozača / login curenja | **PASS** | directory 410; credentials server-only |
| Nema demo/TransitFlow u produkcionom path-u | **PASS*** | *proveriti Render env nije demo mode |
| Kanonski dnevni/mesečni plan | **PASS*** | *dual roster još postoji kao Medium arhitektura |
| Paralelne izmene + revision | **PASS** | shift assignment concurrency |
| Vozačka aktivacija OTP + rate limit | **PASS** | |
| Potvrde / scheduler policy testovi | **PASS** | unit work-policy; flag default OFF |
| GPS lifecycle + pravna odobrenja | **BLOCKED** | L1 open — live OFF |
| E2E sve 4 uloge | **PASS** | Playwright **41/41** (P8.3) |
| Tri jezika kompletna (en/sr/de) | **PASS** | P7.2 parity |
| WCAG kritične prepreke | **PASS*** | *P7.4 hotspots; nije pun audit |
| Lint | **PASS** | P8.1 / P8.3 |
| Unit testovi | **PASS** | **273/273** |
| Production build | **PASS** | P8.3 |
| Browser konzola / lokalni pregled | **BLOCKED-OWNER** | treba vlasnik |
| Backup / rollback dokumentovan i proveren | **FAIL** | nije formalno proveren u ovoj liniji |
| Pravna pitanja izdvojena | **PASS** | legal-open + L1 brief |
| Owner odobrio lokalni browser pregled | **BLOCKED-OWNER** | |

---

## Soft pilot (Preview) — u toku (owner: „pilot“)

1. `SMS_PROVIDER=none`
2. `shiftConfirmationScheduler` OFF
3. `supportSession` OFF (L7 samo sa `--enable-support-session`)
4. Live GPS OFF; mapa = simulacija
5. Tenant: `bc-test` via `npm run pilot:bootstrap`
6. Checklist: `reports/poglavlje-9-role-checklist-2026-07-26.md`

## Hard pilot / customer — zabranjeno dok

1. Owner browser potpis na role checklist  
2. L1 GPS (ako treba live)  
3. SMS DPA (ako treba SMS)  
4. `CONFIRMATION_JOB_SECRET` na Render web+cron (ako treba scheduler)  
5. Rules emulator PASS (Java)  
6. Backup/rollback stvarno izvršen po želji ownera  

---

## Rollback (minimalni)

Vidi `reports/poglavlje-9-rollback-smoke-2026-07-26.md`.

---

## Tačan sledeći korak

1. Owner: Desktop pack → live role checklist  
2. Agent: popravke FAIL stavki  
3. Ne uključivati live GPS / real SMS / scheduler bez odluke

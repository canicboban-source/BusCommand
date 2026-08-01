# Poglavlje 8.2 — Security & privacy matrix (2026-07-26)

**Repo:** BusCommand-Preview-Local → `main` via `work/master-prompt-ch1`  
**Izvori:** kod + `reports/rbac-matrix-2026-07-24.md`, `legal-l1-gps-brief-2026-07-25.md`, `poglavlje-1-legal-open-2026-07-24.md`, `poglavlje-8-1-qa-gate-2026-07-26.md`  
**Legenda:** **V** = potvrđeno u kodu · **A** = pretpostavka / nije re-pokrenuto u ovom slice-u  
**Napomena:** ovo **nije** pravni savet ni DPIA.

---

## 1. AuthN / AuthZ

| Surface | Enforcement | Status |
|---------|-------------|--------|
| Driver | Custom token + `mustChangeLoginCode === false`; `/api/driver/*` | **V** |
| Staff CA/Disp | ID token + role + `companyId`; `requireOwnCompany` | **V** |
| Super Admin | `/api/admin/*` + Rules `isSuperAdmin()` | **V** |
| UI RBAC | `js/core/ui-permissions.js` — **nije** security boundary | **V** |

---

## 2. Multi-tenant

**Jačine (V):** `companies/{id}/…`; staff API tenant match; `driver_credentials` server-only; public directory 410; `check:firebase-isolation` PASS u P8.1.

**Rupe (V):**
- SA Rules broad write (osim credentials)
- `vacations` client create/update još dozvoljen u Rules
- Driver može client-update `lastSeen` / `lastLocation` (nema server retention)

---

## 3. Osetljivi podaci

| Podatak | Stanje | Status |
|---------|--------|--------|
| Credentials / OTP | Hash u `driver_credentials`; OTP jednokratni | **V** |
| SMS | Adapter; prod default `none` | **V** |
| GPS | Client watch + sessionStorage; mapa = simulacija | **V** |
| Poruke / SOS | Server create/resolve; Rules deny client write | **V** |
| Export / SA overview | Bez tajni | **V** |

---

## 4. Flagovi — drži OFF za pilot

| Flag / stub | Default | Pilot |
|-------------|---------|-------|
| `features.supportSession` | false | OFF |
| `features.shiftConfirmationScheduler` | false (`=== true` only) | OFF dok secret + smoke |
| `SMS_PROVIDER` | `none` | OFF dok DPA |
| Live GPS product | locked | OFF dok L1 |
| `CONFIRMATION_JOB_SECRET` | ručno | Owner mora postaviti |

---

## 5. Otvoreni rizici

| Sev | Rizik | Tip |
|-----|-------|-----|
| Critical | Live GPS pre L1 (osnova, DPIA, Betriebsrat gde treba) | Legal / owner |
| High | Real SMS + DPA | Owner |
| High | Retention/deletion politika (lokacije, poruke, audit, mediji) | Process |
| High | Support session enable pre legal gate | Owner |
| High | Rules emulator suite nije pokrenut (Java) | QA env |
| Medium | SA broad Rules; vacations client write; lastLocation client path | Code |
| Medium | Nema `storage.rules` u repou | Code absence |
| Medium | Check-in nije AZG evidencija — jasno označiti | Product/legal |

---

## 6. Već ojačano (referencia)

- OTP + credential split + directory 410  
- G1–G7 (poruke, driver lock, SOS/lost API, GPS lock, concurrency)  
- Helmet / CORS / rate-limit / zod  
- Confirmation outbox + observability (flag-gated)  
- P7 i18n/a11y + P8.1 unit/lint/build  

---

## 7. RBAC addendum (2026-07-26)

Živa matrica ostaje `reports/rbac-matrix-2026-07-24.md`. Od tada zatvoreno/mitigovano u kodu: staff potvrde, outbox, confirmedByDriver mirror, support-session skeleton (OFF).  
Nova High stavka nije RBAC bypass, već **owner/legal gate** (GPS, SMS, P9).

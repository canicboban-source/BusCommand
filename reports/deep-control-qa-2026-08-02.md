# Deep control QA — dual-pass (Krug A+B)

Datum: **2026-08-02**  
Prompt: `reports/prompt-deep-control-qa-2026-08-02.md`  
Okruženje: lokalni repo + Playwright demo (ne live www.buscommand.com)  
Grana: `work/ch1-state-checkpoint`  
SHA: **bee7306** (i18n fix `f9b34b6` + ovaj izveštaj)  
PR: https://github.com/canicboban-source/BusCommand/pull/15  
Verzija paketa: **1.0.10**

## 1. Verdict

**PASS-WITH-RISKS**

Automatski gate + fokusirani E2E/unit za Ch2/fleet tokove su zeleni posle hotfix-a i18n.  
**Nije** završen pun ručni Krug A+B za SA/CA/Driver live Firebase na produkciji (nema deploy dokaza u ovom run-u; produkcija ranije pokazala stari bundle).

## 2. Gate komande

| Komanda | Exit |
|---------|------|
| `npm run lint` | **0** |
| `npm run test:unit` | **0** (403 pass) |
| `npm run build` | **0** |
| Playwright bus-import / multi-group / cross-group / ch2-RO | **7/7 pass** (posle i18n fix) |
| Fokus unit: mobile-gate, plan-lock, bus membership/conflicts, ui-security | **23/23 pass** |

## 3. Critical / High (ovaj run)

| Sev | Nalaz | Status |
|-----|-------|--------|
| **High** | Toast prikazivao sirov ključ `ops_bus_cross_group_warn` (i povezani ops/CA ključevi nestali iz `translations.js` posle Add-bus commit-a) | **FIXED** u istom run-u; E2E ponovo zelen |
| **High (deploy)** | `www.buscommand.com` još uvek stari UI (prazno Add bus dugme / demo-only toast) dok PR #15 nije merge+deploy | **OPEN** — van lokalnog koda |
| Medium | `fleet_demo_only` i dalje na **routes** add/delete (namerno); ne na buses create | OK / dokumentovano |
| Medium | Plan lock UI (release/break/heartbeat) + Firestore store još backlog | OPEN backlog |
| Low | Puni SA/CA/Driver browser Krug B na live tenant nije izvršen ovde | OPEN |

## 4. Tabela panela (dokaz ovog run-a)

| Panel | Akcija | Krug A | Krug B | Dokaz | Status |
|-------|--------|--------|--------|-------|--------|
| Login / mobile gate | Desktop vs phone UA | unit + code | uski panel dozvoljen; phone UA blok | `mobile-device-gate.test.mjs` | PASS |
| CA ops view | Hub RO, nema mutate buses | e2e | write blocked | `ch2-ops-readonly-lock.spec.js` | PASS |
| Hub Buses | Import paste happy/fail | e2e | empty paste | `bus-import-smoke.spec.js` | PASS |
| Hub Buses | Multi-group attach 91504 | e2e | empty no attach | `bus-multi-group-pool.spec.js` | PASS |
| Hub Buses | Add bus label | code/HTML | a11y unit | `hub_add_bus_btn` u staff.html; p7 test | PASS (lokal) |
| Plan assign | Cross-group bus warn soft | e2e | no warn without conflict | `bus-cross-group-warn.spec.js` | PASS (posle i18n) |
| Plan lock engine | acquire/TTL/release/break | unit | — | `plan-edit-lock.test.mjs` | PASS |
| RBAC UI matrix | CA/dispo sections | unit | — | `ui-security` + plan-edit-lock CA tests | PASS |
| SA / CA full CRUD | live browser | — | — | nije ručno u ovom run-u | **NOT RUN** |
| Driver PWA full | live browser | — | — | nije ručno u ovom run-u | **NOT RUN** |
| Messages / map / GPS | live | — | — | GPS soft-pilot OFF pretpostavka | **NOT RUN** |
| Security IDOR live API | curl sa tokenima | — | — | nije | **NOT RUN** |
| Produkcija deploy | hard refresh | — | — | stari toast ranije dokazan | **FAIL until deploy** |

## 5. Šta NIJE provereno

- Live Firebase tenant (QA dispo na www) posle merge-a
- Drugi paralelni disponent (lock) u browseru
- CA break-glass UI (API postoji; UI dugme backlog)
- Pun i18n vizuelni prolaz DE/SR na svim CA ekranima
- Driver aktivacija OTP end-to-end na live SMS stub

## 6. Tačan sledeći korak

1. Merge/deploy **PR #15** (uključujući i18n hotfix commit).  
2. Hard refresh produkcije → Add bus tekst + 91504 bez `fleet_demo_only`.  
3. Ponovi ovaj prompt na **live URL** (Krug A+B za SA→CA→Dispo→Driver).  
4. Zatim lock polish (UI release/break + Firestore).

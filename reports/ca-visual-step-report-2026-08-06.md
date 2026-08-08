# CA visual step report — 2026-08-06

Branch: `work/ca-group-monthly-import`  
Mode: `staff.html?mode=demo` · local `BUSCOMMAND_FORCE_LOCAL_DEMO` · `localhost:8766`  
Reference bar: [Flota.rs](https://www.flota.rs/) quality only (not scope)  
Snimci: `reports/ca-visual-2026-08-06/`

## Ocena

**8.5 / 10**

Za 10: puni catalog publish + monthly import u Live View (upload fajla), create dispatcher sa lozinkom (policy blokada u ovom prolazu), Firebase staging za audit događaje, i desktop širina bez stacked sidebar skrola u uskom Live View.

---

## Mapiranje (CA)

| Sekcija | DOM id | JS |
|---------|--------|-----|
| Overview | `#company-admin-dashboard` | `company-admin.js` + overview-model |
| Branding | `#company-admin-branding` | `company-admin-branding.js` |
| Groups | `#company-admin-groups` | `company-admin-groups.js` |
| Team | `#company-admin-team` | `company-admin-team.js` |
| Drivers | `#company-admin-drivers` | `company-admin-drivers.js` |
| Buses (RO) | `#company-admin-buses` | `company-admin-buses.js` |
| Shift plans | `#company-admin-service-plan` | `company-admin-service-plan.js` + monthly-import |
| Audit | `#company-admin-audit` | `company-admin-audit.js` |
| Settings | `#company-admin-settings` | `company-admin-settings.js` |
| Onboarding | wizard | `company-admin-onboarding.js` |
| Nav | `#company-admin-nav` | shell-staff |

Demo CA: `admin@demo.com` (seed / e2e helpers).

---

## Koraci

### K0 — Priprema
- Live View desno; logout SA → CA login.
- Vidljiv `#company-admin-nav`; Dispo/SA nisu primarni home.
- **PASS**

### K1 — Company overview
- Licence/trial badge, KPI (drivers/groups/dispatchers/buses/plans), Line 101 Needs data, checklist.
- Nema lažnog „Online now“.
- Snimak: `ca-01-overview.png`
- Tržišni bar: jasan readiness + licence na prvom viewportu. BusCommand: isto. Gap: — (u obimu OK).
- **PASS**

### K2 — Branding
- Ime → **Alpine Transit GmbH**, boja `#3D7EF5`, Save → toast „Company branding saved.“, header + „All changes saved“.
- **PASS**

### K3 — Groups / lines
- KPI 1 group / Needs data; forma New line; lista LINE 101.
- Create **105 / Line 105** → toast group added; Delete na 101 disabled; Delete na praznoj 105 otvara confirm „Delete empty group“.
- Confirm delete nije izvršen (Cancel) — UI confirm **PASS**.
- Snimak: `ca-03-groups.png`
- Tržišni bar: create + status Ready/Needs data. BusCommand: OK. Gap: —
- **PASS**

### K4 — Dispatcher team
- Lista: Demo Dispatcher `demo@buscommand.com`, Active, Line 101; KPI audited.
- Validacija bez lozinke / grupe: „Use at least 6 characters.“ + „Select at least one line.“ + toast „Correct the highlighted account fields.“
- Create sa lozinkom: **BLOCKED** (agent policy na password fill) — postojeći e2e pokriva manage access.
- Snimak: `ca-04-team.png`
- **PASS** (lista + validacija); create submit **BLOCKED** u ovom prolazu

### K5 — Drivers
- Import CSV UI + template; directory E1001 E2E Driver; Activate / Set Inactive; nema punog activation koda u listi.
- **PASS** (pregled); CSV upload fajla nije ručno igran u Live View (e2e pokriva)

### K6 — Buses (RO)
- Read-only note + tabela; Dispo attach ostaje van CA.
- **FAIL → FIXED:** badge pokazivao `STATUS_ACTIVE` (missing key + CSS uppercase); kolona `ca_col_groups` nedostajala u EN → ostajalo SR „Grupe“.
- Posle fix: headers `Bus | Groups | Status | ID`, badge `Active`.
- Snimak before: `ca-06-buses-before.png`
- **PASS** (posle fix)

### K7 — Shift plans
- Upload kataloga (XLSX/CSV/PDF), template download, monthly import (EID, merge/replace), history locked copy.
- Nema auto-publish bez potvrde (copy + e2e).
- Live View: UI strukture **PASS**; pun publish/import tok **pokrit e2e**, nije sniman file-picker u browseru.
- **PASS** (struktura + e2e)

### K8 — Activity / audit
- Filteri Area/Action/User/From/To; empty „No matching activity“; Server-only integrity; 0 events u demo.
- **PASS** (truthful empty)

### K9 — Company settings
- HQ AT / Europe/Vienna / language / contact; privacy + login profile RO; export copy.
- **FAIL → FIXED:** License Plan/Status „Unavailable“ u demo iako overview pokazuje trial — settings nije koristio `getCompanyLicenseInfo`.
- Posle fix: `plan=trial`, `status=active`.
- **PASS** (posle fix)

### K10 — Onboarding
- Seed CA već ima brand/group/dispatcher — wizard nije primarni tok u ovoj sesiji.
- **N/A** (company already set up)

### K11 — Cross-cut
- i18n EN/DE/SR select radi; DE nav labels menjaju se (spot-check).
- RBAC: CA ne vidi SA kao home; Operational view link postoji (inspect).
- Uski Live View (~658px): sidebar stack iznad main — sadržaj dostupan skrolom (isti obrazac kao posle SU fix-a). Medium UX, nije Critical.
- Bundle D17: staff 541703 ≤ 542720 OK.
- **PASS** uz Medium napomenu o uskom viewportu

---

## Ispravke u hodu

| Prioritet | Problem | Fix |
|-----------|---------|-----|
| High | Buses badge `STATUS_ACTIVE` | `js/admin/company-admin-buses.js` → `js_status_active` / `driver_status_inactive` |
| High | EN kolona Groups pokazivala „Grupe“ | `translations.js` `ca_col_groups` EN/DE/SR |
| Medium | Settings license Unavailable u demo | `company-admin-settings.js` → `getCompanyLicenseInfo` |

## Izmenjeni fajlovi

- `js/admin/company-admin-buses.js` — status label i18n
- `js/admin/company-admin-settings.js` — demo/API license facts
- `translations.js` — `ca_col_groups`
- `reports/ca-visual-step-report-2026-08-06.md` — ovaj izveštaj
- `reports/ca-visual-2026-08-06/*` — snimci

## Testovi

```
npm run build                          # exit 0; D17 budgets OK
npx playwright test tests/e2e/ca-monthly-import.spec.js \
  tests/e2e/ui-smoke.spec.js -g "company admin|Company Admin|CA "
# 12 passed (27.0s), exit 0
```

## Preostali rizici

- Live View file upload (catalog + monthly CSV) nije ručno sniman — oslanjeno na e2e.
- Create dispatcher sa lozinkom nije završen u agent browseru (policy).
- Demo audit log prazan (očekivano bez server events).
- Uski side browser i dalje zahteva skrol pored stacked nav.
- Flota.rs nije kopiran; fuel/SEF/putni nalozi van obima.

## Zeleno / crveno (za vlasnika)

- **Zeleno:** CA login → overview → branding → groups → team validacija → drivers/buses/plans/audit/settings; 2 High fix-a; 12/12 CA e2e.
- **Crveno / otvoreno:** ručni file-import snimak; full dispatcher create u Live View; staging Firebase audit.
- **Dispo:** sme dalje na Dispo vizuelni prolaz — CA nije blocker.

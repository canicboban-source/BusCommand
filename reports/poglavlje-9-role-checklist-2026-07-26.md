# P9 role-by-role live checklist — soft pilot (2026-07-26)

**URL:** [https://buscommand.com](https://buscommand.com)  
**Backup:** [https://buscommand-preview.onrender.com](https://buscommand-preview.onrender.com)  
**Tenant:** `bc-test`  
**Creds:** Desktop `BusCommand-Test-Nalozi` (ne u gitu)

Označi: `[ ]` → `[x]` kad prođe. Beleži FAIL sa screenshot/kratkim opisom.

---

## 0. Preflight

- [x] `GET /api/health` → `ok`, `mode: production`
- [x] `GET /api/config` → `firebase: true`, version očekivana
- [x] Nema demo admin/driver hintova na production login
- [x] Soft flags: SMS none, GPS live OFF, scheduler OFF, supportSession OFF

## 1. Super Admin

- [x] Logo 5× otvara SA login
- [x] Login sa `sa.test@buscommand.local`
- [x] Vidi overview / listu firmi (uključujući `bc-test`)
- [x] Ne vidi customer tajne (PIN/OTP)
- [x] Support session dugme **nije** dostupno ili vraća disabled (flag OFF)
- [x] Logout radi



## 2. Company Admin

- [x] Login `ca.test@bc-test.local`
- [x] Dashboard tenant-scoped (samo `bc-test`)
- [x] Branding: preview + save (HTTPS logo)
- [x] Grupe: vidi `310`; kreira praznu test grupu; ne briše grupu sa zavisnostima naslepo
- [x] Tim: vidi dispečera; filter radi
- [x] Vozači: CSV import jednog sintetičkog vozača (bez pravog SMS-a)
- [x] Service plan: upload/preview bez publikovanja na customer
- [x] Audit log: vidi sopstvene događaje
- [x] Settings: headquarters policy poštovana
- [x] Logout



## 3. Dispečer

- [x] Login `disp.test@bc-test.local`
- [x] Vidi samo grupu `310` (ACL)
- [x] Group Hub / dnevni plan otvara se
- [x] Dodela smene (revision) ne ruši paralelni conflict path
- [x] Poruke / prijave sekcija učitava se bez 500
- [x] Leave/vacation approve UI dostupan ako ima pending
- [x] Nema CA settings u dispatcher nav
- [x] Logout



## 4. Vozač (driver surface)

- [ ] `driver.html` production mode — nema demo reset
- [ ] Identify + login code path (OTP stub/none — očekuj skipped SMS)
- [ ] Aktivacija pending UI ne curi u ops nav
- [ ] Posle aktivacije: plan / poruke / SOS UI dostupan
- [ ] SOS: trigger + resolve tok (bez pravog emergency callout-a)
- [ ] Logout / end shift



## 5. Negativni / security smoke

- [ ] Dispečer ne može da čita tuđi companyId (API 403)
- [ ] Javni `/api/public/companies/*/drivers` → 410
- [ ] Neulogovan `/api/admin/overview` → 401
- [ ] Demo host credentials ne rade na Render hostu



## Rezultat sesije


| Uloga          | PASS/FAIL | Napomena |
| -------------- | --------- | -------- |
| SA             |           |          |
| CA             |           |          |
| Dispečer       |           |          |
| Vozač          |           |          |
| Security smoke |           |          |


**Owner browser potvrda:** _____________ datum _______  
**Agent follow-up:** samo FAIL stavke u soft-pilot scope-u  
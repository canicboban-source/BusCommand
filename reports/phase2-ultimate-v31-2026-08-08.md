# BusCommand Ultimate Master Prompt v3.1 — Faza 2 izveštaj

**Datum:** 2026-08-08  
**Status:** Faza 2 završena — **STOP do pregleda vlasnika**  
**Build:** `npm run build` → **exit 0**  
**Unit:** `npm run test:unit` → **fail 0**

---

## Sažetak

Redizajn Super Admin panela (modal + tabela firmi), licencni paketi STARTER/PRO/FLEET MASTER/ENTERPRISE sa praćenjem u bazi i CA header bedžom, upgrade modal na limit vozača, vizuelni remont Poruke (plavo Pošalji) i Operativnog Attention panela (amber).

---

## 1) Super Admin — Upravljanje firmama

| Stavka | Status |
|--------|--------|
| Uklonjene horizontalne forme + kockaste kartice | Done |
| Modal `+ Nova Firma / Admin` (firma + CA u jednom) | Done |
| Responzivna tabela: 1 firma = 1 red | Done |
| Kolone: Naziv, ID/Tenant, CA (ime+mail), Država, Status, Akcije | Done |
| Akcije: Detalji + ⋯ (Podrška / Suspenduj / Obriši) | Done |

**Fajlovi:** `index.legacy-monolith.html`, `js/admin/superadmin.js`, `css/staff-desktop.css`, `js/register-onclick-staff.js`

---

## 2) Licencni model

| Paket | Limit vozača |
|-------|--------------|
| STARTER | 15 |
| PRO | 50 |
| FLEET MASTER | 200 |
| ENTERPRISE | unlimited (interni cap 5000) |

Polja u `companies/{id}/settings/main`:

- `licenseType`, `licenseStatus`, `trialValidUntil` (+ legacy `plan` / `trialEndsAt` sync)
- Default nova firma: **PRO** + **trial 30 dana**

| UI | Status |
|----|--------|
| CA header bedž: `PRO PAKET · Još N dan` (amber trial / zeleni active) | Done |
| SA detail plan select → starter/pro/fleet_master/enterprise | Done |
| Prekoračenje limita → confirm modal (Da/Otkaži) + kontakt podrške | Done |
| Server import `409 DRIVER_LIMIT_REACHED` | Done |

**Fajlovi:** `server/license-packages.js`, `server/provisioning.js`, `server/superadmin-tenant-settings.js`, `server/superadmin-company.js`, `server/validation.js`, `api-server.js`, `server/driver-routes.js`, `js/core/license.js`, `js/admin/company-admin-drivers.js`

---

## 3) Dispečer vizuelni remont

| Stavka | Status |
|--------|--------|
| Poruke — `Pošalji` = `#3b82f6` (ne brendirana/crvena) | Done |
| Ops live alerts — amber Attention kartice + `Reši problem` | Done |

**Fajlovi:** `css/staff-desktop.css`, `js/dispatcher/dashboard.js`

---

## Dokaz

```text
npm run test:unit
→ fail 0

npm run build
→ exit 0
→ staff JS excl. translations: 580873 <= 581632
→ translations: 373986 <= 376832
→ Bundle budgets OK
```

Budžeti blago podignuti (staff 568 KiB, translations 368 KiB) zbog SA tabele/modala i licencnih stringova.

---

## Glavni izmenjeni fajlovi

- `index.legacy-monolith.html` → rebuild `staff.html` / `dist/`
- `js/admin/superadmin.js`, `js/register-onclick-staff.js`
- `js/core/license.js`, `js/admin/company-admin-drivers.js`
- `js/dispatcher/dashboard.js`
- `server/license-packages.js` (+ provisioning / settings / routes / api-server)
- `css/staff-desktop.css`, `translations.js`
- `scripts/check-bundle-budgets.js`
- unit testovi: license-packages, sa-companies-table, sa-trial-banner, superadmin-modal, poglavlje-17

---

## Rizici / nije u opsegu

- Postojeći tenanti sa legacy `plan: "trial"` mapiraju se na PRO paket + trial status (nema Stripe/self-serve naplate).
- Upgrade modal informativno vodi na podršku — CA ne može sam da menja paket.
- Live browser screenshot QA trail nije deo ove Faze 2 komande.
- Deploy / push nije tražen.

---

**STOP:** Dalji rad (Faza 3 / matrice / deploy) tek nakon potvrde vlasnika.

# Full pages audit — 2026-07-26 (F1 session pass)

## Sažetak

Analiziran kompletan staff + driver surface (SA, CA, Dispo, Driver PWA). Fokus: **edit tokovi**, **vizuelni nivo**, **dostupnost orphan sekcija**.

| Metrika | Vrednost |
|---------|----------|
| Oblasti pregledane | SA, CA (8 sekcija), Dispo (ops + hub + planovi + poruke + mapa + prijave + odmor + lost/shifts), Driver PWA |
| Kritične funkcionalne dopune | CA edit vozača (profil bez EID/PIN), dispo nav za Lost & Found / Shifts / Daily schedule |
| Vizuelni upgrade | `staff-desktop.css` (~+900 linija polish), `driver-pwa.css`, login/overview/hub |
| Unit testovi (ovaj pass) | 16/16 pass |
| Production build | OK (isolation check pass) |

### Šta je promenjeno (implementovano)

1. **CA Vozači — Edit profila** — PATCH `/api/company-admin/drivers/:driverId` (ime, telefon, email, grupa; bez credential polja) + modal
2. **SA paneli** — klik na Registered Companies → lista sa Open/Suspend/Support/Delete (iz prethodnog PR-a, zadržano)
3. **Dispo navigacija** — dodati Lost & Found, Shifts, Daily schedule (ranije orphan u DOM-u)
4. **Vizuelni nivo** — unified stat cards, tabele, forme, modali, badge-ovi, empty states, hub/plan/messages polish
5. **CA Groups/Team/Branding/Overview** — jasniji edit režim, Edit groups CTA, overview KPI navigacija, branding forme
6. **Driver PWA** — jača hijerarhija kartica, SOS/quick-report tokeni
7. **SOS banner** — uklonjen hardkodovani nemački sample tekst

### Šta ostaje (svesno / sledeći pass)

| Stavka | Prioritet | Napomena |
|--------|-----------|----------|
| CA single-driver *create* (bez CSV) | Medium | Trenutno CSV + edit; create-from-form nije tražen kao obaveza za pilot |
| Dispo inline edit vozača (ime/telefon) | Low | Namerno — dispo ne sme EID/PIN; CA edituje profil |
| Live GPS / SMS | High (produkt) | Van ovog UI passa — čeka izbor provajdera |
| Potpuni E2E Playwright prolaz na live | Medium | Zahteva deploy + test naloge |
| Dark/light fine-tuning svih legacy inline stilova | Low | Veliki deo još u `style=""` — postepeno |

---

## Rezultati po stranicama

### Super Admin — `superadmin-dashboard`
- **Fajlovi:** `js/admin/superadmin.js`, SA HTML panel
- **Edit:** Create company, Create CA, Suspend/Activate, Delete (typed ID), Support
- **Vizuelno:** klikabilni companies KPI, token stat cards, companies panel header
- **Test:** overview unit OK

### Company Admin — Dashboard / Branding / Groups / Team / Drivers / Service plan / Audit / Settings
- **Drivers:** Edit modal + activate/deactivate + CSV import
- **Groups:** create/edit/delete sa jasnim edit stanjem
- **Team:** Edit groups CTA, reset/revoke/status
- **Branding/Settings:** postojeći save tokovi + vizuelni polish
- **Service plan:** publish/preview (bez izmene biznis logike)

### Dispatcher
- Ops center, daily/monthly plans, messages, map, reports, vacations
- Novi nav: Lost & Found, Shifts, Daily schedule
- Hub/plan/messages vizuelni polish
- Dispo i dalje ne vidi EID/PIN

### Driver PWA
- Home kartice, SOS, quick reports — token polish
- Sekcije: dashboard, calendar, reports, vacation (postojeći tokovi)

---

## Klasifikacija problema (ovaj pass)

| ID | Prioritet | Status |
|----|-----------|--------|
| CA nema edit profila vozača | High | **Rešeno** |
| Orphan dispo sekcije van nava | High | **Rešeno** |
| Vizuelna nekonzistentnost SA/ops/CA | Medium | **Delimično rešeno** (staff-desktop unifikacija) |
| Hardkodovani DE SOS sample | Low | **Rešeno** |
| Inline style dugovi širom monolita | Low | Ostaje (postepeno) |
| SMS/GPS integracija | Critical (produkt) | Nerešeno (van UI) |

---

## Izmenjeni fajlovi (glavni)

| Putanja | Svrha |
|---------|-------|
| `api-server.js` | PATCH driver profile |
| `server/validation.js` | `companyDriverProfileBody` |
| `js/core/api-client.js` | `updateCompanyDriver` |
| `js/admin/company-admin-drivers.js` | Edit UI |
| `js/admin/company-admin-groups.js` | Edit mode UX |
| `js/admin/company-admin-team.js` | Edit groups UX |
| `js/dispatcher/group-hub.js` | Hub markup classes |
| `js/dispatcher/monthly-plans.js` / `daily-plan.js` | Empty/modal classes |
| `css/staff-desktop.css` | Premium staff polish |
| `css/driver-pwa.css` | Driver PWA polish |
| `style.css` | Login/overview/row actions |
| `index.legacy-monolith.html` / `staff.html` / `driver.html` | Nav, modals, surfaces |
| `translations.js` | i18n |
| `tests/unit/company-admin-drivers.test.mjs` | Edit coverage |

---

## Testovi i komande

```
node --test tests/unit/company-admin-drivers.test.mjs \
  tests/unit/company-admin-groups.test.mjs \
  tests/unit/company-admin-team.test.mjs \
  tests/unit/superadmin-overview.test.js
→ 16/16 pass

npm run build
→ OK (Firebase isolation check passed)
```

Preskočeno: pun E2E na live (zahteva deploy).

---

## Eksterni izvori

Nisu korišćeni za pravne tvrdnje u ovom passu. Cenovnik/SMS/GPS preporuke su iz prethodnog chata (tržišni benchmark 2026).

---

## Preostali rizici

- Live deploy mora proći Render build da bi CA Edit i CSS bili vidljivi
- Veliki `staff.html` diff usled surface rebuild — očekivano
- Neki legacy inline stilovi i dalje mešaju `#3b82f6` sa token primary
- Driver PWA nije ručno kliknut u browseru u ovom passu (samo kod + build)

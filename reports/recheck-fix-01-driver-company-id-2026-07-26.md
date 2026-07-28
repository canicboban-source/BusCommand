# Recheck fix — stavka 1: vozačka prijava bez companyId (2026-07-26)

## Pravi uzrok (drugi krug provere)

`POST /api/public/drivers/identify` zahteva `companyId`. Frontend je slao `companyId: COMPANY_ID` iz `runtime-config.js`, a to dolazi **samo** iz URL `?company=`. Na golom `/driver.html` vrednost je `null` → Zod `400 INVALID_DATA` / „Nevažeći podaci.“

PIN/hash putanja nije uzrok; backend sa `{eid, companyId}` radi.

## Šta je promenjeno

| Fajl | Izmena |
|------|--------|
| `js/auth/driver-company.js` | Novi resolver: polje → URL → last successful (device-local) |
| `js/auth/login-driver.js` | Identify + PIN login koriste resolved `companyId` |
| `js/auth/login-selects.js` | Produkcija prikazuje/prefill-uje Company ID |
| `driver.html` / `staff.html` | Polje Company ID na login formi |
| `server/driver-routes.js` | SMS `portalUrl` = `/driver.html?company=<id>` |
| `translations.js` | Labeli + CA import hint EN/DE bez „CSV grupa“; wizard placeholderi |
| `staff.html` | Wizard / group placeholders preko `data-i18n-placeholder` |

Izvor companyId (master prompt §4): **vozač unosi firmin ID**. Nema javnog company pickera (enumeration rizik). Posle uspešne prijave pamti se samo lokalno na uređaju; post-auth i dalje ide preko auth claim-a.

## Testovi (pokrenuto)

```bash
node --test tests/unit/driver-company-login.test.mjs
```

Rezultat: **10/20 pass** — 10/10 u ovom fajlu.

## Live / network prihvatanje

- Unit dokazuje da identify body više **nije** `companyId: COMPANY_ID` (null na bare URL), nego promenljiva `companyId` iz resolvera.
- **Ručna potvrda na produkciji i dalje obavezna** posle deploy-a: Company ID + EID + PIN → 200 na identify, ulazak u driver shell. Bez toga stavka se ne smatra zatvorenom.

## Ostaje otvoreno

- Recheck stavke 2–12 (localStorage, SW scope, SA login race, Details, wizard skip, plural, trial, jezik…).
- Pun E2E Playwright login protiv live tenant-a (treba sintetička firma + čišćenje).

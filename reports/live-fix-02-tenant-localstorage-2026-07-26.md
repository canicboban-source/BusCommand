# Live-review fix — stavka 2: localStorage tenant keš (2026-07-26)

## Uzrok

`buscommand_state_<companyId>` se pisao pri sync/save, ali se **nije brisao** pri logout-u ni pri SA brisanju firme. `saveState()` je u produkciji padao na URL `?company=` (`COMPANY_ID`) kad nema `currentUser`, pa je mogao da “oživi” stari tenant. Cross-tab sync i delimično license pozivi takođe su mogli da koriste taj URL/`localStorage` trag — otuda `GET /api/license/blaguss` iz sesije druge firme (live-review §1.1 / §7A.2).

## Izmene

- `clearTenantStateCache` / `clearAllTenantStateCaches` / `resetInMemoryTenantState` u `js/core/state.js`
- Logout + auth `onSignedOut` / `onInvalidTenant`: brišu keš trenutne firme i resetuju in-memory state + `_licenseInfo`
- SA `deleteCompany`: briše `buscommand_state_<id>` posle uspešnog delete
- `initFirebase`: briše keševe drugih firmi (`keepCompanyId` = aktivna)
- `saveState`: u produkciji **samo** `currentUser.companyId` (bez URL fallback-a)
- License: blokira lookup ako `companyId !== currentUser.companyId`
- Cross-tab sync: koristi autentifikovani companyId, ne `COMPANY_ID` iz URL-a

## Testovi

```bash
node --test tests/unit/tenant-localstorage-cache.test.mjs
```

**PASS** (2/2)

## Ostaje otvoreno

- Ručna potvrda na live: login firma A → logout → login firma B → Network ne sme da sadrži companyId firme A; posle SA delete ključ nestaje iz Application → Local Storage.
- Stavke 3+ iz live-review još nisu obrađene.

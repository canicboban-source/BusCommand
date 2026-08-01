# Live-review fix — stavka 3: i18n grešaka vozačke prijave (2026-07-26)

## Uzrok

`driver.html` je pri grešci EID/PIN-a toastovao **sirovi `error` string sa servera** (`identified.error`, `result.error`). Server šalje srpske poruke (`"Nevažeći podaci."`, `"Nevažeći token."`, …) bez obzira na jezik u UI-ju — zato EN/DE selektor nije menjao toast.

## Izmena

- Server (`server/driver-routes.js`): login/identify/token greške sada uključuju stabilan `code` (`INVALID_DATA`, `DRIVER_NOT_FOUND`, `INVALID_LOGIN`, `INVALID_TOKEN`, `ACTIVATION_REQUIRED`, …). Srpski `error` ostaje za logove/kompatibilnost.
- Klijent: `js/auth/api-error-i18n.js` mapira `code` → `t("api_error_${code}")`.
- `js/core/auth-client.js` `loginWithPin` vraća `code`, ne srpski tekst.
- `js/auth/login-driver.js` koristi `translateApiError` + `t("company_access_blocked")` umesto hardkodovanog srpskog.
- `translations.js`: `api_error_*` ključevi za sr/en/de (+ hr/fr/pl/cs gde je NEW_TRANSLATIONS obrazac).

## Testovi

```bash
node --test tests/unit/api-error-i18n.test.js tests/unit/driver-credentials.test.js
```

## Prihvatanje

Na `driver.html` sa jezikom EN ili DE, pogrešan EID/PIN prikazuje prevod na tom jeziku — **ne** `"Nevažeći podaci."`.

## Ostaje otvoreno

- Stavka 4+ iz live-review (staff login user-enumeration / silent errors).
- Ručna potvrda na live nakon deploy-a.

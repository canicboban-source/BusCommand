# Live-review fix — stavka 1: vozačka prijava posle CA PIN-a (2026-07-26)

## Uzrok

`POST /api/company-admin/drivers/:driverId/personal-code` je upisivao CA PIN u **`companyCodeHash`**, dok `verifyDriverLogin` za neaktiviran nalog proverava samo **aktivacioni OTP**, a za aktiviran nalog **`loginCodeHash`**.

Zato je audit zapisivao `driver_personal_code_set`, a `driver.html` je dosledno vraćao „Nevažeći podaci.“ (reprodukcija iz `reports/live-review-2026-07-26.md` §7A.1).

## Izmena

- CA personal-code sada upisuje `loginCodeHash`, postavlja `codeActivated: true`, briše OTP hash i opoziva refresh tokene.
- Validacija PIN-a usklađena sa login pravilima: **5–12 cifara**.
- Lista vozača: `hasPersonalCode` se bazira na `loginCodeHash` / `codeActivated`, ne na prisustvu EID-a.

## Testovi

```bash
node --test tests/unit/ca-driver-personal-code-login.test.js tests/unit/company-admin-drivers.test.mjs
```

Rezultat: **PASS** (uključujući regresiju: stanje posle CA PIN-a → `verifyDriverLogin` prima PIN).

Napomena: `tests/unit/driver-credentials.test.js` ima postojeći fail oko `eid` u `SENSITIVE_DRIVER_FIELDS` vs `safeProfilePayload` — **nije uveden ovom izmenom**.

## Ostaje otvoreno

- Ručna potvrda na live: CSV uvoz → CA set PIN → login na `driver.html` (zahteva kratkotrajni sintetički tenant + brisanje posle).
- Stavke 2+ iz live-review još nisu obrađene.

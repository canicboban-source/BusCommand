# Live-review fix — stavka 6: SA/CA dashboard brojači posle re-login-a (2026-07-26)

## Uzrok

1. **SA "No company admins created."** — `renderCompanyAdminList` čita samo `window.state.companyAdmins`, koji se puni lokalno pri kreiranju CA u istoj sesiji. Posle re-login-a lista je prazna jer se ne učitava sa servera (`company_admins` kolekcija je prazna/legacy; pravi CA su u `users/` sa `role: company_admin`).

2. **CA overview "2 Dispatchers" vs team "1"** — granular load stavlja **ceo** `users/` snapshot u `state.dispatchers` (i CA i dispečere). Overview KPI (`getCompanyScope`) nije isključivao `company_admin`, dok team (`getCompanyTeamScope`) jeste → CA se brojao kao drugi dispečer.

## Izmena

- `GET /api/admin/company-admins` + `listAllCompanyAdmins` — SA dashboard učitava CA listu sa servera pri svakom renderu.
- `loadStateFromFirestore` deli `users/` na `dispatchers` i `companyAdmins`.
- `getCompanyScope` isključuje `company_admin` / `company-admin` (usklađeno sa team scope).

## Testovi

```bash
node --test tests/unit/company-admin-overview.test.mjs tests/unit/superadmin-company.test.js tests/unit/superadmin-overview.test.js
```

## Prihvatanje

- SA re-login → Create Company Admin sekcija prikazuje postojeće CA naloge.
- CA overview KPI za dispečere poklapa se sa Dispatcher team listom.

## Ostaje otvoreno

- Stavke 7+ (wizard, pluralizacija, …).
- Ručna potvrda na live nakon deploy-a.

# Live-review fix — stavka 7: CA setup wizard posle re-login-a (2026-07-26)

## Uzrok

`shouldShowCompanyAdminOnboarding()` je gledao samo `window.state.companyAdminOnboardingDone`. Taj flag se upisuje lokalno pri zatvaranju wizard-a i **ne preživljava** re-login / brisanje tenant `localStorage` keša. Posle ponovnog logina wizard se opet otvara od koraka 1 sa **praznim** poljima za grupu/dispečera — rizik od duplikata.

## Izmena

- Novi `company-admin-onboarding-model.js`: odluka na osnovu stvarnih podataka (`groups` + `dispatchers` za firmu).
- Ako postoje grupa **i** dispečer → wizard se **ne prikazuje**; lokalni done flag se usklađuje.
- Ako je setup delimičan → otvara se na prvom nekompletnom koraku (2 ili 3), ne od praznog koraka 1.

## Testovi

```bash
node --test tests/unit/company-admin-onboarding.test.mjs
```

## Prihvatanje

CA sa već kreiranom grupom i dispečerom: login **ne** otvara prazan Company setup wizard.

## Ostaje otvoreno

- Stavke 8+ (pluralizacija, jezik po ulozi, trial banner za SA).
- Ručna potvrda na live nakon deploy-a.

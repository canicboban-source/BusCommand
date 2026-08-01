# Live-review fix — stavka 10: trial banner za Super Admin (2026-07-26)

## Uzrok

Header `#app-trial-badge` je u HTML-u uvek vidljiv sa statičkim tekstom („Trial period…“). `updateTrialBadge()` je ažurirao samo login badge i nije proveravao ulogu — SA (vlasnik platforme) je video tuđi company trial countdown.

## Izmena

- `updateTrialBadge` sakriva login + app badge za `superadmin`; prikazuje app badge samo tenant ulogama sa `plan === "trial"`.
- `showAppLayout` (staff/driver) i `showLoginScreen` pozivaju sync.
- `#app-trial-badge` u `staff.html` / `driver.html` podrazumevano `hidden`.

## Testovi

```bash
node --test tests/unit/sa-trial-banner.test.mjs
```

## Prihvatanje

SA dashboard nema trial banner u headeru. CA/dispečer na trial planu i dalje vidi countdown.

## Ostaje otvoreno

- Live-review kampanja 1–10 završena (preostale known stavke: GPS/SMS/rules emulator po master promptu).

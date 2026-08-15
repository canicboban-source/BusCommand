# Live-review fix — stavka 4: generičke greške staff prijave (2026-07-26)

## Uzrok

Na `staff.html`, Firebase greške `auth/user-not-found` i `auth/wrong-password` su mapirane na **različite** poruke (`error_user_not_found` vs `error_wrong_password`). Uživo je nepostojeći email često završavao **bez poruke** (tihi UX), dok pogrešna lozinka prikazuje poruku — to omogućava blagi **user-enumeration** i loše UX.

## Izmena

- Novi `js/auth/staff-login-errors.js`: svi credential kodovi (`user-not-found`, `wrong-password`, `invalid-credential`, `invalid-login-credentials`) → `error_invalid_credentials`.
- `login-dispatcher.js`: uvek prikazuje poruku za hard/credential greške i u produkciji za bilo koji Firebase fail (nema tihog pada); demo lokalni fallback koristi istu generičku poruku.
- Forgot-password: uvek isti success toast (`password_reset_generic`) — bez otkrivanja da li nalog postoji.
- `auth-client.js` + SA modal: vraćaju/prikazuju `errorKey` umesto hardkodovanog srpskog.
- Prevodi: `error_invalid_credentials`, `password_reset_generic` (sr/en/de + ostali jezici u NEW_TRANSLATIONS).

## Testovi

```bash
node --test tests/unit/staff-login-errors.test.js
```

## Prihvatanje

Na `staff.html` (EN/DE/SR): ispravan email + pogrešna lozinka **i** nepostojeći email → **ista** poruka ("Wrong email or password." / prevod). Nikad prazan login bez poruke nakon submit-a.

## Ostaje otvoreno

- Stavke 5+ iz live-review.
- Ručna potvrda na live nakon deploy-a.

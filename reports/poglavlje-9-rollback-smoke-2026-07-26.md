# P9 rollback / recovery smoke — soft pilot (2026-07-26)

Cilj: dokazati da znamo kako da se vratimo bez panike. Ovo **nije** destruktivni test na customer podacima.

## A. Dokumentovani rollback (obavezno pročitati)

1. **Render web:** Dashboard → `buscommand-preview` → Events/Deploys → redeploy prethodni uspešan deploy sa `main`
2. **Cron:** `buscommand-confirm-dispatch` — ako je bio ON, forsaj OFF flag u Firestore i/ili privremeno disable cron
3. **Feature flags (`bc-test`):**
   - `settings/main.features.supportSession = false`
   - `settings/main.features.shiftConfirmationScheduler = false`
4. **SMS:** `SMS_PROVIDER` unset / `none`
5. **Firebase Rules:** rollback **samo** nakon `git diff` / Console diff — nikad slepo
6. **Auth test nalozi:** disable u Firebase Auth ako curenje

## B. Smoke provera posle rollback-a

- [ ] `/api/health` → 200
- [ ] Staff login screen učitava CSS/JS (nema belog ekrana)
- [ ] CA login na `bc-test` radi **ili** očekivano failuje ako je deploy stariji od naloga
- [ ] Nema neočekivanog SMS/GPS ponašanja

## C. Šta nije testirano u ovoj sesiji

- Point-in-time Firestore restore (zahteva GCP backup policy + owner)
- Rules emulator regression (Java)
- Full cron secret rotation

## Status

| Stavka | Status |
|--------|--------|
| Rollback procedura dokumentovana | PASS |
| Izvršen stvarni Render redeploy rollback | **NOT RUN** (owner on-demand) |
| Feature-flag kill switch proveren u kodu | PASS (defaults OFF) |

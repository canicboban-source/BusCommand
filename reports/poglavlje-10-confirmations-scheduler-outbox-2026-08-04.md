# Poglavlje 10 — Confirmations scheduler i outbox

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 9 (`1cb571e` / `0b415af`)
- Checkpoint commit: _(popunjava se posle commit-a)_
- Master prompt: v3.2 §10, odluka D10

## 1. Cilj

Zatvoriti Critical/High rupe oko automatskih potvrda naredne smene: invalidacija
posle izmene plana, expired klasifikacija za disponenta, bound revision na
potvrdi, max-retry terminal failure i monitoring — bez rebuild-a postojećeg
outbox/scheduler stack-a.

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C10-1 | Staff mutate briše `confirmedByDriver` ali ostavlja `shift_confirmations` + outbox | Rešeno (`invalidateShiftConfirmations`) |
| C10-2 | Assignment / undo / resolve ne invalidiraju potvrde | Rešeno (wired na assign/clear/undo/resolve) |
| C10-3 | Nema **expired** u dispatcher attention | Rešeno (`classifyOutboxForOps` + cockpit UI) |
| C10-4 | Retry bez max-attempts terminala | Rešeno (`MAX_DISPATCH_ATTEMPTS=8`, `terminalFailure`) |
| C10-5 | Confirm ne stampuje `confirmationBoundRevision` | Rešeno (driver POST + staff GET filter) |
| C10-6 | Confirmed outbox ostaje „confirmed“ posle plan change | Rešeno (`planOutboxUpsert` reopen / cancel) |

Namerno odloženo: real SMS/push provider (P11 poruke / P12 session); live
Firebase E2E sa uključenim scheduler flag-om (flag ostaje OFF by default);
re-enqueue odmah posle invalidate (sledeća aktivna work-session +
`enqueueFromPolicy` kada je flag ON).

## 3. Izmene

- `server/confirmation-outbox.js` — invalidate plan, stale check, expired,
  max retry, reopen after confirmed fingerprint change
- `server/confirmation-scheduler.js` — `invalidateShiftConfirmations`,
  `terminalFailed` u dispatch health
- `server/driver-routes.js` — bound revision na confirm; staff GET truth +
  expired; invalidate posle assign/clear/undo/resolve
- `js/dispatcher/dashboard.js` — expired/failed statusi u attention i daily plan
- `translations.js` — `status_confirmation_expired` (en/sr/de)
- Testovi: proširen `tests/unit/driver-work-policy.test.js` (+6)

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors, 1 pre-existing warning) |
| `npm run test:unit` | **497/497** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Enablement (ops)

Scheduler ostaje OFF dok se ne postavi:

```
companies/{id}/settings/main.features.shiftConfirmationScheduler = true
```

i `CONFIRMATION_JOB_SECRET` / `CRON_SECRET` za
`POST /api/internal/jobs/confirmation-dispatch`.

## 6. Ocena

**8.5/10** — §10 Critical/High zatvoreni nad postojećim outbox-om; delivery
kanal i dalje in-app (+ SMS stub). Sledeće: Poglavlje 11 (poruke).

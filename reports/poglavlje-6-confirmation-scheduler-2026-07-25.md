# Poglavlje 6 — Scheduler potvrda smena (2026-07-25)

## Šta je urađeno

1. **Vikend paket — generalni prethodni radni dan**
   - Petak uvek šalje paket (sub/ned/pon dodeljene smene).
   - Ako je petak slobodan, paket ide na **poslednji radni dan pre subote** (čet/sre/…), ne samo četvrtak.

2. **Odvojeni zahtevi**
   - Svaki target ima `label` (`saturday` / `sunday` / `monday` / `next_shift`), `requestId`, `separateRequest: true`.
   - Vozački UI: poseban red + dugme „Potvrdi smenu“ po datumu, plus „Potvrdi sve“.

3. **Outbox + idempotency**
   - `server/confirmation-outbox.js` — stabilan doc id, fingerprint, skip/retry/cancel_stale.
   - Kolekcija `companies/{id}/confirmation_outbox` (server write; rules read staff/driver own).

4. **Scheduler (flag OFF by default)**
   - Flag: `settings/main.features.shiftConfirmationScheduler`
   - Enqueue pri aktivnom `GET /api/driver/work-session`
   - Dispatch: `POST /api/internal/jobs/confirmation-dispatch` + header `x-job-secret` (`CONFIRMATION_JOB_SECRET` / `CRON_SECRET`)
   - Šalje samo dok je `driver_sessions.status === "active"` (tokom poslednje prethodne smene)

5. **SMS adapter**
   - Dodat `sendShiftConfirmationSms` (stub / none) — produkcija ostaje `none` dok nema provajdera + DPA.

## Šta nije (namerno)

- Pravi SMS/push provajder (business + DPA).
- Live GPS (legal L1).
- Pun SA UI za failed jobs (samo audit `confirmation_dispatch_run`).
- Automatski cron na Renderu — ruta je spremna; treba secret + cron job kad se flag uključi.

## Testovi

- `tests/unit/driver-work-policy.test.js` — petak, četvrtak, **sreda** paket, ordinary, outbox idempotency/fingerprint/retry.

## Uključivanje (pilot)

```js
// companies/{id}/settings/main
{ features: { shiftConfirmationScheduler: true } }
```

Env: `CONFIRMATION_JOB_SECRET=...`

## Ocena poglavlja (ovaj slice)

**7/10** — policy + outbox + dispatch + UI odvojenih zahteva; delivery još in-app/stub.

# Poglavlje 6 — Confirmation job observability (2026-07-25)

## Šta je urađeno

1. **Staff API bogatiji odgovor** (`GET /api/staff/shift-confirmations`)
   - Outbox polja: `attempts`, `lastAttemptAt`, `lastError`, `nextRetryAt`, `deliveredAt`, `confirmedAt`, `channel`, `smsStatus`.
   - `summary` — brojevi po statusu.
   - `attention` — klasifikovani redovi za „Čeka akciju“ (`delivery_failed` / `pending_send` / `awaiting_confirm`).
   - `dispatchHealth` — poslednji run iz `companies/{id}/ops/confirmation_dispatch`.

2. **Dispatch health snapshot**
   - Scheduler posle svakog company run-a piše `ops/confirmation_dispatch` (uključujući `disabled` stanje).
   - Audit `confirmation_dispatch_run` sada uključuje `delivered`, `failed`, `disabled`, `skippedInactiveSession`.

3. **Dispečerski UI**
   - Failed delivery = critical kartica sa pokušajima i greškom.
   - Pending send vs awaiting confirm = jasno odvojeni naslovi (i18n sr/en/de).

4. **Pure helperi** u `server/confirmation-outbox.js`
   - `summarizeOutboxStatuses`, `classifyOutboxForOps` — unit pokriveni.

## Testovi

- `tests/unit/driver-work-policy.test.js` — summary + classification.
- `tests/unit/driver-credentials.test.js` — staff route observability asserts.
- `tests/unit/driver-operational-client.test.mjs` — dashboard attention UI.

## Šta još nije

- Pravi SMS/push provajder (+ DPA).
- Live GPS (legal L1).
- Poseban Super Admin ekran za cross-tenant failed jobs (health je po tenant-u + audit).

## Ocena ovog slice-a

**Observability u okviru P6: 8/10** — status slanja/prijema/potvrde vidljiv dispečeru; cron secret i dalje ručno na Renderu.

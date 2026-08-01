# Poglavlje 2 — OTP aktivacija (checkpoint)

Datum: 2026-07-24  
Commit grana: `work/master-prompt-ch1`

## Implementirano

- Unique crypto OTP (6 cifara), bcrypt hash, TTL **24h**
- Import više **ne** koristi shared `123456`
- OTP se **troši** pri uspešnoj prvoj prijavi
- Vozač zatim postavlja **lični kod 5–12 cifara** (`/api/auth/driver/activate-personal-code`)
- SMS **adapter + stub** (`server/sms-provider.js`) — produkcija default `none` dok nema provajdera
- CA **resend** `POST /api/staff/drivers/:id/resend-activation`
- Legacy `activate-company-code` → **410**
- UI: confirm polje ličnog koda; i18n hint bez 123456

## Testovi

`node --test` OTP + credentials + activation + group-i18n → **33/33 pass**

## Još nije

- Pravi SMS provider (Twilio/…) — čeka business decision + DPA
- CA dugme u UI za resend (API postoji)
- RBAC matrica artefakt (sledeći korak Poglavlja 2)
- Kanonski roster + concurrency

## Napomena

Lokalni Firebase-less demo login zahteva `BUSCOMMAND_DEMO_OTP` (6 cifara), nikad 123456.

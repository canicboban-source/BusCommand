# Poglavlje 11 — Poruke

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 10 (`6341aa7` / `eff4945`)
- Checkpoint commit: `6a8d0cb`
- Master prompt: v3.2 §12, odluka D11

## 1. Cilj

Zatvoriti Critical/High rupe oko dispečerskih poruka: delivery lifecycle,
kritična potvrda čitanja, multi-group send, server-owned archive i istiniti
staff status — bez rebuild-a postojećeg send/ACL puta.

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C11-1 | Nema delivery statusa na message doc-u | Rešeno (`status` + delivery fields) |
| C11-2 | Nema kritične potvrde čitanja | Rešeno (`requiresAck` + `/ack`) |
| C11-3 | Client menja `dispArchivedBy` preko sync-a | Rešeno (API archive; sync skip messages) |
| C11-4 | Badge „nepročitane“ lažno broji outbound | Rešeno (awaiting receipt) |
| C11-5 | Samo jedna grupa po send-u | Rešeno (`groupIds[]` + multi-select) |
| C11-6 | Staff history bez status chip-ova | Rešeno |

Namerno odloženo: FCM/SMS provider za ops poruke (stub ostaje in-app);
pun `message_outbox` retry worker (in-app = delivered at write); live Firebase
E2E send→ack→staff badge.

## 3. Izmene

- `server/message-lifecycle.js` — pure helpers (ack/read/classify)
- `server/staff-messages.js` — `groupIds`, `requiresAck`, delivery fields
- `server/driver-routes.js` — send lifecycle; ack; staff archive; read→status
- `js/core/firebase-service.js` — messages van client write sync-a
- `js/dispatcher/*` + `js/driver/*` + `staff.html` + CSS + i18n
- Testovi: `tests/unit/message-lifecycle.test.js` + proširen staff-messages

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors, 1 pre-existing warning) |
| `npm run test:unit` | **503/503** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Ocena

**8.5/10** — §12 Critical/High zatvoreni nad postojećim compose/ACL stack-om.
Sledeće: Poglavlje 12 (driver session, GPS i mapa).

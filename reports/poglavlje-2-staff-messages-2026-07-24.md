# Poglavlje 2 — Staff messages API (G1)

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1`

## Šta je urađeno

### Server
- `server/staff-messages.js` — template allowlist, ACL, target resolve, doc builder
- `POST /api/staff/messages` (`requireStaff`, rate limit 30/min)
  - modes: `driver` | `group` | `broadcast`
  - dispatcher: samo vozači/grupe iz `req.staff.groups`
  - company_admin: tenant-wide; `broadcast` = jedan doc `broadcast: true`
  - dispatcher `broadcast`: fan-out po dodeljenim grupama **bez** `broadcast: true` (sprečava curenje na druge grupe)
  - audit: `staff_message_sent`
- `firestore.rules`: `messages` **create: if false** (samo Admin SDK)

### Client
- `ApiClient.sendStaffMessage`
- `msg-compose.js` → API u produkciji; demo i dalje lokalni `saveState`
- recipient values: `driver:{id}` / `group:{id}` / `__all__`
- `firebase-service.js`: ne šalje **nova** message create kroz client sync (update/archive ostaje)

### Testovi
- `tests/unit/staff-messages.test.js`

## Iskreno još otvoreno

| Stavka | Status |
|--------|--------|
| Dispatcher soft-archive (`dispArchivedBy`) | Još client update |
| Message list API | Nema — i dalje Firestore listeners |
| CA UI compose | Nema poseban CA compose; koristi staff surface |

## G1

| ID | Status |
|----|--------|
| G1 | **Closed** (send path) |

## Sledeće

**G3** — zaključati client driver CRUD/PIN

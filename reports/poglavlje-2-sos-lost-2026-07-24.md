# Poglavlje 2 — SOS resolve + lost-item status (G4)

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1`

## Šta je urađeno

### Server
- `PUT /api/staff/sos/resolve` — dispatcher-only; čisti `settings/sos` + `sos/{id}` → resolved; audit `staff_sos_resolved`
- `PUT /api/staff/lost-items/:itemId/status` `{ status: "returned" }` — dispatcher (group ACL) ili company_admin; audit `lost_item_returned`
- Open statuses: `in_depot` + legacy `status_in_depot` / `U depou` / `Im Depot`

### Client
- `resolveSOS` → `ApiClient.resolveStaffSos` (demo: lokalni clear + saveState)
- `returnLostItem` → `ApiClient.setLostItemStatus` (UI prihvata `in_depot`)
- Sync skip `lostItems`; Rules: sos + lost_items write false

## G4

| ID | Status |
|----|--------|
| G4 | **Closed** |

## Sledeće

G5 public driver list, ili G6 / SA support session.

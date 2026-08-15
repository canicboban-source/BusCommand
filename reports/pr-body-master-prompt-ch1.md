## Summary

- Split driver PWA (`driver.html`) and staff desktop (`staff.html`), with CA multi-format Dienstplan import and master-prompt governance docs.
- Replace shared `123456` activation with unique 24h OTP + personal code; add RBAC matrix and Poglavlje 1 forensic/legal artifacts.
- Close P2 gaps G1–G7: canonical shift assignment with revision conflicts, staff message/SOS/lost-item APIs, lock client writes for drivers/fleet/messages, disable public driver directory (EID login).
- Follow-up hardening: pass OTP into SMS adapter, lock `shifts`/`schedules` client+Rules writes, require `expectedRevision`, atomic OTP consume, message archive baseline after API create, `groupId||lineId` ACL, activation confirm field.

## Test plan

- [ ] `npm run test:unit`
- [ ] `npm run test:e2e` — UI smoke + API smoke (public directory expects 410)
- [ ] Manual: dispatcher shift assign + monthly day-edit conflict path; staff message send; SOS resolve; lost-item return
- [ ] Manual: production driver login requires EID (no public roster dropdown)
- [ ] Confirm Firestore rules deploy includes buses/routes/messages/drivers/sos/lost_items/`shifts`/`schedules` write locks + `firestore.indexes.json` for shifts

## Notes

- Live map GPS remains simulated; L1/L7 legal items still open.
- Demo still uses local OTP via `BUSCOMMAND_DEMO_OTP`.
- Real SMS provider still `none`/`stub` until configured.


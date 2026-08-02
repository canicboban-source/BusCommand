import test from "node:test";
import assert from "node:assert/strict";
import { lockDocId, hydrateLock, persistLock, deletePersistedLock } from "../../server/plan-edit-lock-store.js";
import {
  _resetPlanLocksForTests,
  memoryLocks,
  ensureAssignmentDayLock
} from "../../server/plan-edit-lock-routes.js";

test("lockDocId encodes colons for Firestore doc ids", () => {
  assert.equal(lockDocId("day:101:2026-08-02"), "day__101__2026-08-02");
  assert.equal(lockDocId("month:320:2026-08"), "month__320__2026-08");
});

test("hydrateLock loads from Firestore into memory when L1 empty", async () => {
  _resetPlanLocksForTests();
  const lockId = "day:101:2026-08-02";
  const stored = {
    lockId,
    holderUid: "d1",
    holderName: "Ana",
    acquiredAtMs: 1_000,
    expiresAtMs: Date.now() + 60_000,
    updatedAtMs: 1_000
  };
  let deleted = false;
  const fakeDb = () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: true, data: () => stored }),
            set: async () => {},
            delete: async () => { deleted = true; }
          })
        })
      })
    })
  });
  const view = await hydrateLock(memoryLocks, {
    db: fakeDb,
    companyId: "acme",
    lockId,
    nowMs: Date.now()
  });
  assert.equal(view.holderUid, "d1");
  assert.equal(memoryLocks.get(lockId).holderName, "Ana");
  assert.equal(deleted, false);
});

test("ensureAssignmentDayLock auto-acquires when free", async () => {
  _resetPlanLocksForTests();
  const result = await ensureAssignmentDayLock({
    db: null,
    companyId: "acme",
    staff: { uid: "d1", name: "Ana" },
    groupId: "101",
    dateStr: "2026-08-02"
  });
  assert.equal(result.ok, true);
  assert.equal(result.lock.holderUid, "d1");
});

test("ensureAssignmentDayLock blocks second writer", async () => {
  _resetPlanLocksForTests();
  await ensureAssignmentDayLock({
    db: null,
    companyId: "acme",
    staff: { uid: "d1", name: "Ana" },
    groupId: "101",
    dateStr: "2026-08-02"
  });
  const blocked = await ensureAssignmentDayLock({
    db: null,
    companyId: "acme",
    staff: { uid: "d2", name: "Bob" },
    groupId: "101",
    dateStr: "2026-08-02"
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "LOCK_HELD");
});

test("persistLock and deletePersistedLock are no-ops without db", async () => {
  await persistLock(null, "acme", { lockId: "day:1:2026-08-02", holderUid: "x" });
  await deletePersistedLock(null, "acme", "day:1:2026-08-02");
});

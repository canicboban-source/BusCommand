import test from "node:test";
import assert from "node:assert/strict";
import {
  lockDocId,
  hydrateLock,
  persistLock,
  deletePersistedLock,
  acquireLockAtomic,
  heartbeatLockAtomic,
  releaseLockAtomic,
  breakLockAtomic
} from "../../server/plan-edit-lock-store.js";
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

test("acquireLockAtomic, heartbeatLockAtomic, releaseLockAtomic, breakLockAtomic with Firestore transactions", async () => {
  _resetPlanLocksForTests();
  const lockId = "day:202:2026-09-15";
  let storedDoc = null;
  const mockRef = {
    get: async () => ({ exists: !!storedDoc, data: () => storedDoc }),
    set: async (data) => { storedDoc = { ...data }; },
    delete: async () => { storedDoc = null; }
  };
  const mockDb = () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => mockRef
        })
      })
    }),
    runTransaction: async (cb) => {
      const txn = {
        get: async (ref) => ref.get(),
        set: (ref, data) => { storedDoc = { ...storedDoc, ...data }; },
        delete: () => { storedDoc = null; }
      };
      return await cb(txn);
    }
  });

  const locks = new Map();
  // 1. Acquire
  const acq1 = await acquireLockAtomic(locks, {
    db: mockDb,
    companyId: "acme",
    lockId,
    holderUid: "u1",
    holderName: "Alice"
  });
  assert.equal(acq1.ok, true);
  assert.equal(acq1.lock.holderUid, "u1");
  assert.equal(storedDoc.holderUid, "u1");

  // 2. Concurrent acquire by u2 should be blocked
  const acq2 = await acquireLockAtomic(locks, {
    db: mockDb,
    companyId: "acme",
    lockId,
    holderUid: "u2",
    holderName: "Bob"
  });
  assert.equal(acq2.ok, false);
  assert.equal(acq2.code, "LOCK_HELD");
  assert.equal(acq2.lock.holderUid, "u1");

  // 3. Heartbeat by u1
  const hb = await heartbeatLockAtomic(locks, {
    db: mockDb,
    companyId: "acme",
    lockId,
    holderUid: "u1"
  });
  assert.equal(hb.ok, true);

  // 4. Release by u2 fails
  const relFail = await releaseLockAtomic(locks, {
    db: mockDb,
    companyId: "acme",
    lockId,
    holderUid: "u2"
  });
  assert.equal(relFail.ok, false);
  assert.equal(relFail.code, "LOCK_HELD");

  // 5. Break lock by Admin
  const brk = await breakLockAtomic(locks, {
    db: mockDb,
    companyId: "acme",
    lockId,
    reason: "Emergency dispatch takeover"
  });
  assert.equal(brk.ok, true);
  assert.equal(brk.broken, true);
  assert.equal(brk.previous.holderUid, "u1");
  assert.equal(storedDoc, null);

  // 6. Now u2 can acquire
  const acq3 = await acquireLockAtomic(locks, {
    db: mockDb,
    companyId: "acme",
    lockId,
    holderUid: "u2",
    holderName: "Bob"
  });
  assert.equal(acq3.ok, true);
  assert.equal(acq3.lock.holderUid, "u2");

  // 7. Release by u2 succeeds
  const relOk = await releaseLockAtomic(locks, {
    db: mockDb,
    companyId: "acme",
    lockId,
    holderUid: "u2"
  });
  assert.equal(relOk.ok, true);
  assert.equal(relOk.released, true);
  assert.equal(storedDoc, null);
});

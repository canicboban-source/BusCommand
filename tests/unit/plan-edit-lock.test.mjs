import test from "node:test";
import assert from "node:assert/strict";
import {
  acquireLock,
  assertHolder,
  breakLock,
  buildLockId,
  heartbeatLock,
  releaseLock
} from "../../server/plan-edit-lock.js";
import {
  canBreakPlanEditLock,
  canOpenSection,
  canWriteOperationalRoster
} from "../../js/core/ui-permissions.js";

test("CA can open operational view sections but cannot write roster", () => {
  assert.equal(canOpenSection("company-admin", "dispatcher-group-hub"), true);
  assert.equal(canOpenSection("company-admin", "dispatcher-vehicles"), true);
  assert.equal(canOpenSection("company-admin", "dispatcher-daily-plan-full"), true);
  assert.equal(canOpenSection("company-admin", "dispatcher-monthly-plans-full"), true);
  assert.equal(canOpenSection("company-admin", "dispatcher-messages"), false);
  assert.equal(canWriteOperationalRoster("company-admin"), false);
  assert.equal(canWriteOperationalRoster("dispatcher"), true);
  assert.equal(canBreakPlanEditLock("company-admin"), true);
  assert.equal(canBreakPlanEditLock("dispatcher"), false);
});

test("first writer acquires lock; second is blocked; holder can continue", () => {
  const store = new Map();
  const lockId = buildLockId("day", "101", "2026-08-02");
  const first = acquireLock(store, { lockId, holderUid: "d1", holderName: "A", nowMs: 1_000 });
  assert.equal(first.ok, true);
  const second = acquireLock(store, { lockId, holderUid: "d2", holderName: "B", nowMs: 2_000 });
  assert.equal(second.ok, false);
  assert.equal(second.code, "LOCK_HELD");
  const again = acquireLock(store, { lockId, holderUid: "d1", holderName: "A", nowMs: 3_000 });
  assert.equal(again.ok, true);
  assert.equal(assertHolder(store, { lockId, holderUid: "d1", nowMs: 4_000 }).ok, true);
});

test("TTL expiry frees the lock for another dispatcher", () => {
  const store = new Map();
  const lockId = buildLockId("day", "101", "2026-08-02");
  acquireLock(store, { lockId, holderUid: "d1", nowMs: 1_000, ttlMs: 100 });
  const blocked = acquireLock(store, { lockId, holderUid: "d2", nowMs: 1_050, ttlMs: 100 });
  assert.equal(blocked.ok, false);
  const afterTtl = acquireLock(store, { lockId, holderUid: "d2", nowMs: 1_200, ttlMs: 100 });
  assert.equal(afterTtl.ok, true);
});

test("release and break-glass clear the lock", () => {
  const store = new Map();
  const lockId = buildLockId("month", "101", "2026-08");
  acquireLock(store, { lockId, holderUid: "d1", nowMs: 1_000 });
  assert.equal(releaseLock(store, { lockId, holderUid: "d2", nowMs: 1_100 }).ok, false);
  assert.equal(releaseLock(store, { lockId, holderUid: "d1", nowMs: 1_100 }).ok, true);
  acquireLock(store, { lockId, holderUid: "d1", nowMs: 2_000 });
  const broken = breakLock(store, { lockId, reason: "phone agree" });
  assert.equal(broken.ok, true);
  assert.equal(assertHolder(store, { lockId, holderUid: "d1", nowMs: 2_100 }).ok, false);
});

test("heartbeat extends expiry for the holder only", () => {
  const store = new Map();
  const lockId = buildLockId("day", "101", "2026-08-02");
  acquireLock(store, { lockId, holderUid: "d1", nowMs: 1_000, ttlMs: 500 });
  assert.equal(heartbeatLock(store, { lockId, holderUid: "d2", nowMs: 1_100, ttlMs: 500 }).ok, false);
  const beat = heartbeatLock(store, { lockId, holderUid: "d1", nowMs: 1_200, ttlMs: 500 });
  assert.equal(beat.ok, true);
  assert.equal(beat.lock.expiresAtMs, 1_700);
});

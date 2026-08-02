/**
 * First-writer plan edit lock — pure engine (unit-testable).
 * Scope: group + day (YYYY-MM-DD) or group + month (YYYY-MM).
 */

const DEFAULT_TTL_MS = 20 * 60 * 1000;
const MIN_BREAK_REASON = 8;

function buildLockId(scopeType, groupId, scopeKey) {
  const type = String(scopeType || "").trim();
  const group = String(groupId || "").trim();
  const key = String(scopeKey || "").trim();
  if (!group || !key) return null;
  if (type === "day" && !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  if (type === "month" && !/^\d{4}-\d{2}$/.test(key)) return null;
  if (type !== "day" && type !== "month") return null;
  return `${type}:${group}:${key}`;
}

function isExpired(lock, nowMs) {
  if (!lock) return true;
  return Number(lock.expiresAtMs) <= nowMs;
}

/**
 * @param {Map<string, object>|Record<string, object>} store
 * @param {{ lockId: string, holderUid: string, holderName?: string, nowMs?: number, ttlMs?: number }} input
 */
function acquireLock(store, input) {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const lockId = input.lockId;
  if (!lockId || !input.holderUid) {
    return { ok: false, code: "INVALID_LOCK_REQUEST" };
  }

  const existing = getFromStore(store, lockId);
  if (existing && !isExpired(existing, nowMs) && existing.holderUid !== input.holderUid) {
    return {
      ok: false,
      code: "LOCK_HELD",
      lock: publicLockView(existing)
    };
  }

  const lock = {
    lockId,
    holderUid: input.holderUid,
    holderName: input.holderName || "",
    acquiredAtMs: existing && existing.holderUid === input.holderUid
      ? existing.acquiredAtMs
      : nowMs,
    expiresAtMs: nowMs + ttlMs,
    updatedAtMs: nowMs
  };
  setInStore(store, lockId, lock);
  return { ok: true, lock: publicLockView(lock) };
}

function heartbeatLock(store, input) {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const existing = getFromStore(store, input.lockId);
  if (!existing || isExpired(existing, nowMs)) {
    return { ok: false, code: "LOCK_MISSING" };
  }
  if (existing.holderUid !== input.holderUid) {
    return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
  }
  const lock = { ...existing, expiresAtMs: nowMs + ttlMs, updatedAtMs: nowMs };
  setInStore(store, input.lockId, lock);
  return { ok: true, lock: publicLockView(lock) };
}

function releaseLock(store, input) {
  const nowMs = input.nowMs ?? Date.now();
  const existing = getFromStore(store, input.lockId);
  if (!existing || isExpired(existing, nowMs)) {
    deleteFromStore(store, input.lockId);
    return { ok: true, released: true };
  }
  if (existing.holderUid !== input.holderUid) {
    return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
  }
  deleteFromStore(store, input.lockId);
  return { ok: true, released: true };
}

function breakLock(store, input) {
  const reason = String(input.reason || "").trim();
  if (reason.length < MIN_BREAK_REASON) {
    return { ok: false, code: "REASON_REQUIRED" };
  }
  const existing = getFromStore(store, input.lockId);
  deleteFromStore(store, input.lockId);
  return {
    ok: true,
    broken: true,
    previous: existing ? publicLockView(existing) : null,
    reason
  };
}

function assertHolder(store, input) {
  const nowMs = input.nowMs ?? Date.now();
  const existing = getFromStore(store, input.lockId);
  if (!existing || isExpired(existing, nowMs)) {
    return { ok: false, code: "LOCK_REQUIRED" };
  }
  if (existing.holderUid !== input.holderUid) {
    return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
  }
  return { ok: true, lock: publicLockView(existing) };
}

function publicLockView(lock) {
  return {
    lockId: lock.lockId,
    holderUid: lock.holderUid,
    holderName: lock.holderName || "",
    acquiredAtMs: lock.acquiredAtMs,
    expiresAtMs: lock.expiresAtMs
  };
}

function getFromStore(store, lockId) {
  if (store instanceof Map) return store.get(lockId) || null;
  return store[lockId] || null;
}

function setInStore(store, lockId, lock) {
  if (store instanceof Map) store.set(lockId, lock);
  else store[lockId] = lock;
}

function deleteFromStore(store, lockId) {
  if (store instanceof Map) store.delete(lockId);
  else delete store[lockId];
}

module.exports = {
  DEFAULT_TTL_MS,
  MIN_BREAK_REASON,
  buildLockId,
  isExpired,
  acquireLock,
  heartbeatLock,
  releaseLock,
  breakLock,
  assertHolder,
  publicLockView
};

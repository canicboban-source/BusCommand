/**
 * Client copy of first-writer lock engine (ESM) for demo mode.
 * Keep behavior aligned with server/plan-edit-lock.js
 */

const DEFAULT_TTL_MS = 20 * 60 * 1000;

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

function publicLockView(lock) {
  return {
    lockId: lock.lockId,
    holderUid: lock.holderUid,
    holderName: lock.holderName || "",
    acquiredAtMs: lock.acquiredAtMs,
    expiresAtMs: lock.expiresAtMs
  };
}

function acquireLock(store, input) {
  const nowMs = input.nowMs ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  const lockId = input.lockId;
  if (!lockId || !input.holderUid) return { ok: false, code: "INVALID_LOCK_REQUEST" };
  const existing = store[lockId] || null;
  if (existing && !isExpired(existing, nowMs) && existing.holderUid !== input.holderUid) {
    return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
  }
  const lock = {
    lockId,
    holderUid: input.holderUid,
    holderName: input.holderName || "",
    acquiredAtMs: existing && existing.holderUid === input.holderUid ? existing.acquiredAtMs : nowMs,
    expiresAtMs: nowMs + ttlMs,
    updatedAtMs: nowMs
  };
  store[lockId] = lock;
  return { ok: true, lock: publicLockView(lock) };
}

function assertHolder(store, input) {
  const nowMs = input.nowMs ?? Date.now();
  const existing = store[input.lockId] || null;
  if (!existing || isExpired(existing, nowMs)) return { ok: false, code: "LOCK_REQUIRED" };
  if (existing.holderUid !== input.holderUid) {
    return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
  }
  return { ok: true, lock: publicLockView(existing) };
}

export { DEFAULT_TTL_MS, buildLockId, acquireLock, assertHolder };

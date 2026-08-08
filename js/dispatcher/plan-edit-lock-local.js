/**
 * QA local-state / offline first-writer day lock (localStorage).
 * Production assignment lock is enforced on the server.
 */
import {
  buildLockId,
  acquireLock,
  assertHolder,
  heartbeatLock,
  releaseLock,
  breakLock
} from "./plan-edit-lock-client.js";

const STORE_KEY = "buscommand_plan_locks_v1";

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}

function currentUid() {
  return window.currentUser?.id || window.currentUser?.uid || null;
}

function getLocalDayLock(groupId, dateStr) {
  const lockId = buildLockId("day", groupId, dateStr);
  if (!lockId) return { ok: false, code: "INVALID_LOCK_REQUEST", lock: null };
  const store = loadStore();
  const nowMs = Date.now();
  const existing = store[lockId] || null;
  if (!existing || Number(existing.expiresAtMs) <= nowMs) {
    if (existing) {
      delete store[lockId];
      saveStore(store);
    }
    return { ok: true, lock: null };
  }
  return { ok: true, lock: existing };
}

function ensureLocalDayLock(groupId, dateStr) {
  const uid = currentUid();
  if (!uid || !groupId || !dateStr) {
    return { ok: false, code: "INVALID_LOCK_REQUEST" };
  }
  const lockId = buildLockId("day", groupId, dateStr);
  if (!lockId) return { ok: false, code: "INVALID_LOCK_REQUEST" };
  const store = loadStore();
  let check = assertHolder(store, { lockId, holderUid: uid });
  if (!check.ok && check.code === "LOCK_REQUIRED") {
    check = acquireLock(store, {
      lockId,
      holderUid: uid,
      holderName: window.currentUser?.name || ""
    });
  }
  saveStore(store);
  return check;
}

function heartbeatLocalDayLock(groupId, dateStr) {
  const uid = currentUid();
  const lockId = buildLockId("day", groupId, dateStr);
  if (!uid || !lockId) return { ok: false, code: "INVALID_LOCK_REQUEST" };
  const store = loadStore();
  const result = heartbeatLock(store, { lockId, holderUid: uid });
  saveStore(store);
  return result;
}

function releaseLocalDayLock(groupId, dateStr) {
  const uid = currentUid();
  const lockId = buildLockId("day", groupId, dateStr);
  if (!uid || !lockId) return { ok: false, code: "INVALID_LOCK_REQUEST" };
  const store = loadStore();
  const result = releaseLock(store, { lockId, holderUid: uid });
  saveStore(store);
  return result;
}

function breakLocalDayLock(groupId, dateStr, reason) {
  const lockId = buildLockId("day", groupId, dateStr);
  if (!lockId) return { ok: false, code: "INVALID_LOCK_REQUEST" };
  const store = loadStore();
  const result = breakLock(store, { lockId, reason });
  saveStore(store);
  return result;
}

export {
  getLocalDayLock,
  ensureLocalDayLock,
  heartbeatLocalDayLock,
  releaseLocalDayLock,
  breakLocalDayLock
};

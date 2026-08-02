/**
 * Demo / offline first-writer day lock (localStorage).
 * Production assignment lock is enforced on the server.
 */
import { buildLockId, acquireLock, assertHolder } from "./plan-edit-lock-client.js";

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

function ensureDemoDayLock(groupId, dateStr) {
  const uid = window.currentUser?.id || window.currentUser?.uid;
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

export { ensureDemoDayLock };

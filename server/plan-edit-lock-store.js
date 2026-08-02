/**
 * Plan edit lock persistence: memory L1 + optional Firestore mirror.
 * Enables multi-instance hosts to share first-writer locks.
 */

const { isExpired, publicLockView } = require("./plan-edit-lock");

function lockDocId(lockId) {
  return String(lockId || "").replace(/:/g, "__");
}

function lockRef(db, companyId, lockId) {
  if (!db || !companyId || !lockId) return null;
  return db()
    .collection("companies")
    .doc(String(companyId))
    .collection("plan_locks")
    .doc(lockDocId(lockId));
}

function normalizeStoredLock(data, lockId) {
  if (!data || typeof data !== "object") return null;
  return {
    lockId: data.lockId || lockId,
    holderUid: data.holderUid || "",
    holderName: data.holderName || "",
    acquiredAtMs: Number(data.acquiredAtMs) || 0,
    expiresAtMs: Number(data.expiresAtMs) || 0,
    updatedAtMs: Number(data.updatedAtMs) || 0
  };
}

/**
 * Ensure memory has the latest non-expired lock (or clear expired).
 * @returns {Promise<object|null>} public lock view or null
 */
async function hydrateLock(memoryLocks, { db, companyId, lockId, nowMs = Date.now() }) {
  if (!lockId) return null;
  const mem = memoryLocks.get(lockId) || null;
  if (mem && !isExpired(mem, nowMs)) return publicLockView(mem);
  if (mem && isExpired(mem, nowMs)) memoryLocks.delete(lockId);

  const ref = typeof db === "function" ? lockRef(db, companyId, lockId) : null;
  if (!ref) return null;
  try {
    const snap = await ref.get();
    if (!snap.exists) return null;
    const raw = normalizeStoredLock(snap.data(), lockId);
    if (!raw || isExpired(raw, nowMs)) {
      if (snap.exists) {
        try { await ref.delete(); } catch { /* best-effort */ }
      }
      return null;
    }
    memoryLocks.set(lockId, raw);
    return publicLockView(raw);
  } catch {
    return null;
  }
}

async function persistLock(db, companyId, lock) {
  const ref = typeof db === "function" && lock?.lockId
    ? lockRef(db, companyId, lock.lockId)
    : null;
  if (!ref) return;
  try {
    await ref.set({
      lockId: lock.lockId,
      holderUid: lock.holderUid,
      holderName: lock.holderName || "",
      acquiredAtMs: lock.acquiredAtMs,
      expiresAtMs: lock.expiresAtMs,
      updatedAtMs: lock.updatedAtMs || Date.now()
    }, { merge: true });
  } catch {
    /* best-effort mirror */
  }
}

async function deletePersistedLock(db, companyId, lockId) {
  const ref = typeof db === "function" ? lockRef(db, companyId, lockId) : null;
  if (!ref) return;
  try {
    await ref.delete();
  } catch {
    /* best-effort */
  }
}

module.exports = {
  lockDocId,
  hydrateLock,
  persistLock,
  deletePersistedLock
};

/**
 * Plan edit lock persistence: memory L1 + optional Firestore mirror.
 * Enables multi-instance hosts to share first-writer locks.
 */

const {
  isExpired,
  publicLockView,
  acquireLock,
  heartbeatLock,
  releaseLock,
  breakLock,
  DEFAULT_TTL_MS,
  MIN_BREAK_REASON
} = require("./plan-edit-lock");

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

async function acquireLockAtomic(memoryLocks, { db, companyId, lockId, holderUid, holderName, nowMs = Date.now(), ttlMs = DEFAULT_TTL_MS }) {
  if (!lockId || !holderUid) {
    return { ok: false, code: "INVALID_LOCK_REQUEST" };
  }
  const ref = typeof db === "function" ? lockRef(db, companyId, lockId) : null;
  const firestore = typeof db === "function" ? db() : null;

  if (ref && firestore && typeof firestore.runTransaction === "function") {
    try {
      return await firestore.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        let existing = null;
        if (snap.exists) {
          existing = normalizeStoredLock(snap.data(), lockId);
        }
        if (existing && !isExpired(existing, nowMs) && existing.holderUid !== holderUid) {
          memoryLocks.set(lockId, existing);
          return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
        }
        const lock = {
          lockId,
          holderUid,
          holderName: holderName || "",
          acquiredAtMs: existing && existing.holderUid === holderUid ? existing.acquiredAtMs : nowMs,
          expiresAtMs: nowMs + ttlMs,
          updatedAtMs: nowMs
        };
        txn.set(ref, lock, { merge: true });
        memoryLocks.set(lockId, lock);
        return { ok: true, lock: publicLockView(lock) };
      });
    } catch {
      // Fallback to memory flow on transaction failure
    }
  }

  await hydrateLock(memoryLocks, { db, companyId, lockId, nowMs });
  const result = acquireLock(memoryLocks, { lockId, holderUid, holderName, nowMs, ttlMs });
  if (result.ok && result.lock) {
    const full = memoryLocks.get(lockId);
    if (full) await persistLock(db, companyId, full);
  }
  return result;
}

async function heartbeatLockAtomic(memoryLocks, { db, companyId, lockId, holderUid, nowMs = Date.now(), ttlMs = DEFAULT_TTL_MS }) {
  if (!lockId || !holderUid) {
    return { ok: false, code: "INVALID_LOCK_REQUEST" };
  }
  const ref = typeof db === "function" ? lockRef(db, companyId, lockId) : null;
  const firestore = typeof db === "function" ? db() : null;

  if (ref && firestore && typeof firestore.runTransaction === "function") {
    try {
      return await firestore.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        let existing = null;
        if (snap.exists) {
          existing = normalizeStoredLock(snap.data(), lockId);
        }
        if (!existing || isExpired(existing, nowMs)) {
          memoryLocks.delete(lockId);
          return { ok: false, code: "LOCK_MISSING" };
        }
        if (existing.holderUid !== holderUid) {
          memoryLocks.set(lockId, existing);
          return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
        }
        const lock = { ...existing, expiresAtMs: nowMs + ttlMs, updatedAtMs: nowMs };
        txn.set(ref, lock, { merge: true });
        memoryLocks.set(lockId, lock);
        return { ok: true, lock: publicLockView(lock) };
      });
    } catch {
      // Fallback
    }
  }

  await hydrateLock(memoryLocks, { db, companyId, lockId, nowMs });
  const result = heartbeatLock(memoryLocks, { lockId, holderUid, nowMs, ttlMs });
  if (result.ok && result.lock) {
    const full = memoryLocks.get(lockId);
    if (full) await persistLock(db, companyId, full);
  }
  return result;
}

async function releaseLockAtomic(memoryLocks, { db, companyId, lockId, holderUid, nowMs = Date.now() }) {
  if (!lockId || !holderUid) {
    return { ok: false, code: "INVALID_LOCK_REQUEST" };
  }
  const ref = typeof db === "function" ? lockRef(db, companyId, lockId) : null;
  const firestore = typeof db === "function" ? db() : null;

  if (ref && firestore && typeof firestore.runTransaction === "function") {
    try {
      return await firestore.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        let existing = null;
        if (snap.exists) {
          existing = normalizeStoredLock(snap.data(), lockId);
        }
        if (!existing || isExpired(existing, nowMs)) {
          memoryLocks.delete(lockId);
          if (snap.exists) txn.delete(ref);
          return { ok: true, released: true };
        }
        if (existing.holderUid !== holderUid) {
          memoryLocks.set(lockId, existing);
          return { ok: false, code: "LOCK_HELD", lock: publicLockView(existing) };
        }
        txn.delete(ref);
        memoryLocks.delete(lockId);
        return { ok: true, released: true };
      });
    } catch {
      // Fallback
    }
  }

  await hydrateLock(memoryLocks, { db, companyId, lockId, nowMs });
  const result = releaseLock(memoryLocks, { lockId, holderUid, nowMs });
  if (result.ok) {
    await deletePersistedLock(db, companyId, lockId);
  }
  return result;
}

async function breakLockAtomic(memoryLocks, { db, companyId, lockId, reason }) {
  const reasonStr = String(reason || "").trim();
  if (reasonStr.length < MIN_BREAK_REASON) {
    return { ok: false, code: "REASON_REQUIRED" };
  }
  const ref = typeof db === "function" ? lockRef(db, companyId, lockId) : null;
  const firestore = typeof db === "function" ? db() : null;

  if (ref && firestore && typeof firestore.runTransaction === "function") {
    try {
      return await firestore.runTransaction(async (txn) => {
        const snap = await txn.get(ref);
        let existing = null;
        if (snap.exists) {
          existing = normalizeStoredLock(snap.data(), lockId);
        }
        if (snap.exists) txn.delete(ref);
        memoryLocks.delete(lockId);
        return {
          ok: true,
          broken: true,
          previous: existing ? publicLockView(existing) : null,
          reason: reasonStr
        };
      });
    } catch {
      // Fallback
    }
  }

  await hydrateLock(memoryLocks, { db, companyId, lockId });
  const result = breakLock(memoryLocks, { lockId, reason: reasonStr });
  if (result.ok) {
    await deletePersistedLock(db, companyId, lockId);
  }
  return result;
}

module.exports = {
  lockDocId,
  hydrateLock,
  persistLock,
  deletePersistedLock,
  acquireLockAtomic,
  heartbeatLockAtomic,
  releaseLockAtomic,
  breakLockAtomic
};

/**
 * Plan lock store (memory L1 + Firestore mirror) + Express routes.
 */
const {
  buildLockId,
  acquireLock,
  heartbeatLock,
  releaseLock,
  breakLock,
  assertHolder,
  DEFAULT_TTL_MS
} = require("./plan-edit-lock");
const {
  hydrateLock,
  persistLock,
  deletePersistedLock
} = require("./plan-edit-lock-store");

const memoryLocks = new Map();

function registerPlanEditLockRoutes(app, { requireStaff, logAudit, db = null }) {
  async function syncAfterMutate(companyId, result, lockId, deleted) {
    if (deleted) {
      await deletePersistedLock(db, companyId, lockId);
      return;
    }
    if (result?.ok && result.lock) {
      const full = memoryLocks.get(result.lock.lockId);
      if (full) await persistLock(db, companyId, full);
    }
  }

  app.post("/api/staff/plan-locks/acquire", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može držati edit lock." });
    }
    const lockId = buildLockId(req.body?.scopeType, req.body?.groupId, req.body?.scopeKey);
    if (!lockId) return res.status(400).json({ success: false, code: "INVALID_LOCK_REQUEST", error: "Nevažeći opseg lock-a." });
    if (Array.isArray(req.staff.groups) && req.staff.groups.length && !req.staff.groups.includes(String(req.body.groupId))) {
      return res.status(403).json({ success: false, error: "Grupa nije dodeljena ovom disponentu." });
    }
    await hydrateLock(memoryLocks, { db, companyId: req.staff.companyId, lockId });
    const result = acquireLock(memoryLocks, {
      lockId,
      holderUid: req.staff.uid,
      holderName: req.staff.name || req.staff.email || ""
    });
    if (!result.ok) {
      return res.status(409).json({
        success: false,
        code: result.code,
        error: "Plan trenutno uređuje drugi disponent.",
        lock: result.lock
      });
    }
    await syncAfterMutate(req.staff.companyId, result, lockId, false);
    return res.json({ success: true, lock: result.lock, ttlMs: DEFAULT_TTL_MS });
  });

  app.post("/api/staff/plan-locks/heartbeat", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može produžiti lock." });
    }
    const lockId = String(req.body?.lockId || "");
    await hydrateLock(memoryLocks, { db, companyId: req.staff.companyId, lockId });
    const result = heartbeatLock(memoryLocks, {
      lockId,
      holderUid: req.staff.uid
    });
    if (!result.ok) {
      return res.status(result.code === "LOCK_HELD" ? 409 : 404).json({
        success: false,
        code: result.code,
        error: "Lock nije aktivan.",
        lock: result.lock || null
      });
    }
    await syncAfterMutate(req.staff.companyId, result, lockId, false);
    return res.json({ success: true, lock: result.lock });
  });

  app.post("/api/staff/plan-locks/release", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može pustiti lock." });
    }
    const lockId = String(req.body?.lockId || "");
    await hydrateLock(memoryLocks, { db, companyId: req.staff.companyId, lockId });
    const result = releaseLock(memoryLocks, {
      lockId,
      holderUid: req.staff.uid
    });
    if (!result.ok) {
      return res.status(409).json({
        success: false,
        code: result.code,
        error: "Lock drži drugi disponent.",
        lock: result.lock
      });
    }
    await syncAfterMutate(req.staff.companyId, result, lockId, true);
    return res.json({ success: true, released: true });
  });

  app.post("/api/staff/plan-locks/break", requireStaff, async (req, res) => {
    const role = req.staff.role;
    if (role !== "company_admin" && role !== "company-admin" && role !== "superadmin") {
      return res.status(403).json({ success: false, error: "Samo CA/SA može skinuti lock." });
    }
    const lockId = String(req.body?.lockId || "");
    await hydrateLock(memoryLocks, { db, companyId: req.staff.companyId, lockId });
    const result = breakLock(memoryLocks, {
      lockId,
      reason: req.body?.reason
    });
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        code: result.code,
        error: "Razlog break-glass mora imati najmanje 8 karaktera."
      });
    }
    await syncAfterMutate(req.staff.companyId, result, lockId, true);
    try {
      if (typeof logAudit === "function" && req.staff.companyId) {
        await logAudit(req.staff.companyId, req.staff.uid, "plan_lock_break", {
          lockId,
          reason: result.reason,
          previous: result.previous
        });
      }
    } catch {
      /* audit best-effort */
    }
    return res.json({ success: true, broken: true, previous: result.previous });
  });

  app.get("/api/staff/plan-locks/:lockId", requireStaff, async (req, res) => {
    const lockId = decodeURIComponent(String(req.params.lockId || ""));
    const view = await hydrateLock(memoryLocks, {
      db,
      companyId: req.staff.companyId,
      lockId
    });
    return res.json({ success: true, lock: view });
  });
}

/**
 * Hydrate + assert (or auto-acquire) day lock for assignment mutate.
 */
async function ensureAssignmentDayLock({ db, companyId, staff, groupId, dateStr }) {
  const { acquireLock: acquire, assertHolder: assert, buildLockId: buildId } = require("./plan-edit-lock");
  const lockId = buildId("day", groupId, dateStr);
  if (!lockId) return { ok: false, code: "INVALID_LOCK_REQUEST" };
  await hydrateLock(memoryLocks, { db, companyId, lockId });
  let lockCheck = assert(memoryLocks, { lockId, holderUid: staff.uid });
  if (!lockCheck.ok && lockCheck.code === "LOCK_REQUIRED") {
    lockCheck = acquire(memoryLocks, {
      lockId,
      holderUid: staff.uid,
      holderName: staff.name || staff.email || ""
    });
    if (lockCheck.ok) {
      const full = memoryLocks.get(lockId);
      if (full) await persistLock(db, companyId, full);
    }
  }
  return lockCheck;
}

function requirePlanLockForAssignment(staff, groupId, dateStr) {
  const lockId = buildLockId("day", groupId, dateStr);
  if (!lockId) return { ok: false, code: "INVALID_LOCK_REQUEST" };
  return assertHolder(memoryLocks, { lockId, holderUid: staff.uid });
}

/** Test helper */
function _resetPlanLocksForTests() {
  memoryLocks.clear();
}

module.exports = {
  registerPlanEditLockRoutes,
  requirePlanLockForAssignment,
  ensureAssignmentDayLock,
  memoryLocks,
  _resetPlanLocksForTests
};

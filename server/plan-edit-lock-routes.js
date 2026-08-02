/**
 * In-memory plan lock store + Express route registration.
 * Production can later mirror to Firestore; memory works for single-instance + unit/API smoke.
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

const memoryLocks = new Map();

function registerPlanEditLockRoutes(app, { requireStaff, logAudit }) {
  app.post("/api/staff/plan-locks/acquire", requireStaff, (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može držati edit lock." });
    }
    const lockId = buildLockId(req.body?.scopeType, req.body?.groupId, req.body?.scopeKey);
    if (!lockId) return res.status(400).json({ success: false, code: "INVALID_LOCK_REQUEST", error: "Nevažeći opseg lock-a." });
    if (Array.isArray(req.staff.groups) && req.staff.groups.length && !req.staff.groups.includes(String(req.body.groupId))) {
      return res.status(403).json({ success: false, error: "Grupa nije dodeljena ovom disponentu." });
    }
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
    return res.json({ success: true, lock: result.lock, ttlMs: DEFAULT_TTL_MS });
  });

  app.post("/api/staff/plan-locks/heartbeat", requireStaff, (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može produžiti lock." });
    }
    const result = heartbeatLock(memoryLocks, {
      lockId: String(req.body?.lockId || ""),
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
    return res.json({ success: true, lock: result.lock });
  });

  app.post("/api/staff/plan-locks/release", requireStaff, (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može pustiti lock." });
    }
    const result = releaseLock(memoryLocks, {
      lockId: String(req.body?.lockId || ""),
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
    return res.json({ success: true, released: true });
  });

  app.post("/api/staff/plan-locks/break", requireStaff, async (req, res) => {
    const role = req.staff.role;
    if (role !== "company_admin" && role !== "company-admin" && role !== "superadmin") {
      return res.status(403).json({ success: false, error: "Samo CA/SA može skinuti lock." });
    }
    const result = breakLock(memoryLocks, {
      lockId: String(req.body?.lockId || ""),
      reason: req.body?.reason
    });
    if (!result.ok) {
      return res.status(400).json({
        success: false,
        code: result.code,
        error: "Razlog break-glass mora imati najmanje 8 karaktera."
      });
    }
    try {
      if (typeof logAudit === "function" && req.staff.companyId) {
        await logAudit(req.staff.companyId, req.staff.uid, "plan_lock_break", {
          lockId: req.body?.lockId,
          reason: result.reason,
          previous: result.previous
        });
      }
    } catch {
      /* audit best-effort */
    }
    return res.json({ success: true, broken: true, previous: result.previous });
  });

  app.get("/api/staff/plan-locks/:lockId", requireStaff, (req, res) => {
    const lockId = decodeURIComponent(String(req.params.lockId || ""));
    const raw = memoryLocks.get(lockId);
    if (!raw || Number(raw.expiresAtMs) <= Date.now()) {
      return res.json({ success: true, lock: null });
    }
    return res.json({
      success: true,
      lock: {
        lockId: raw.lockId,
        holderUid: raw.holderUid,
        holderName: raw.holderName || "",
        acquiredAtMs: raw.acquiredAtMs,
        expiresAtMs: raw.expiresAtMs
      }
    });
  });
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
  memoryLocks,
  _resetPlanLocksForTests
};

const crypto = require("crypto");

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const MAX_IMPORT_ROWS = 2500;
const WRITE_CHUNK_SIZE = 350;
const ABSENCE_TYPES = Object.freeze({
  OFF: "off",
  VACATION: "vacation",
  SICK: "sick"
});

class GroupMonthlyImportError extends Error {
  constructor(code, details = [], status = 422, meta = null) {
    super(code);
    this.name = "GroupMonthlyImportError";
    this.code = code;
    this.details = details;
    this.status = status;
    this.retryable = meta?.retryable === true;
    this.recoveryRequired = meta?.recoveryRequired === true;
    this.compensated = meta?.compensated === true;
  }
}

/**
 * Safe allowlist for auto-clearing an expired monthly import lock (2R-A.2).
 * Anything not explicitly safe stays fail-closed.
 */
function isSafeToAutoClearImportLock(job) {
  if (!job || typeof job !== "object") return false;
  if (job.recoveryRequired === true) return false;
  if (job.status === "completed") return true;
  if (job.status === "failed" && job.compensated === true) return true;
  if (
    job.status === "prepared"
    && !job.appliedChunks
    && job.compensated !== false
  ) {
    return true;
  }
  return false;
}

function normalizeEid(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function revisionOf(shift) {
  const revision = Number(shift?.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function inferShiftType(duty) {
  const start = String(duty?.workStart || duty?.start || "");
  const hour = Number(start.slice(0, 2));
  if (Number.isInteger(hour) && hour >= 18) return "night";
  if (Number.isInteger(hour) && hour >= 12) return "afternoon";
  return "morning";
}

function canonicalImportRow(row, driver, duty, existing) {
  const absenceType = ABSENCE_TYPES[row.dutyCode];
  return {
    sourceRow: row.sourceRow,
    driverId: driver.id,
    driverName: driver.name,
    date: row.date,
    type: absenceType || inferShiftType(duty),
    name: absenceType ? row.dutyCode : duty.code,
    routeCode: absenceType ? "" : duty.code,
    start: absenceType ? null : (duty.workStart || duty.start || null),
    end: absenceType ? null : (duty.workEnd || duty.end || null),
    expectedRevision: revisionOf(existing)
  };
}

function buildGroupMonthlyPreview({
  companyId,
  actorId,
  groupId,
  month,
  mode,
  sourceName,
  reason,
  rows,
  driversByEid,
  dutiesByCode,
  existingShifts
}) {
  const errors = [];
  const canonicalRows = [];
  const inputKeys = new Set();

  for (const row of rows || []) {
    const eidKey = normalizeEid(row.eid);
    const driver = driversByEid.get(eidKey);
    const key = driver ? `${driver.id}|${row.date}` : `${eidKey}|${row.date}`;
    if (inputKeys.has(key)) {
      errors.push({ row: row.sourceRow, code: "DUPLICATE_ASSIGNMENT" });
      continue;
    }
    inputKeys.add(key);
    if (!row.date.startsWith(`${month}-`)) {
      errors.push({ row: row.sourceRow, code: "DATE_OUTSIDE_MONTH" });
    }
    if (!driver) {
      errors.push({ row: row.sourceRow, code: "EID_NOT_FOUND" });
      continue;
    }
    if (driver.active === false) errors.push({ row: row.sourceRow, code: "DRIVER_INACTIVE" });
    if (String(driver.groupId || driver.lineId || "") !== groupId) {
      errors.push({ row: row.sourceRow, code: "DRIVER_OUTSIDE_GROUP" });
    }
    const duty = ABSENCE_TYPES[row.dutyCode] ? null : dutiesByCode.get(row.dutyCode);
    if (!duty && !ABSENCE_TYPES[row.dutyCode]) {
      errors.push({ row: row.sourceRow, code: "DUTY_NOT_IN_ACTIVE_CATALOG", dutyCode: row.dutyCode });
      continue;
    }
    canonicalRows.push(canonicalImportRow(
      row,
      driver,
      duty,
      existingShifts.get(`${driver.id}|${row.date}`) || null
    ));
  }

  if (mode === "replace") {
    for (const shift of existingShifts.values()) {
      if (String(shift.groupId || "") !== groupId || !String(shift.date || "").startsWith(`${month}-`)) continue;
      const key = `${shift.driverId}|${shift.date}`;
      if (inputKeys.has(key)) continue;
      canonicalRows.push({
        sourceRow: null,
        driverId: shift.driverId,
        driverName: shift.driverName || "",
        date: shift.date,
        type: "clear",
        name: "",
        routeCode: "",
        start: null,
        end: null,
        expectedRevision: revisionOf(shift)
      });
    }
  }

  if (errors.length) throw new GroupMonthlyImportError("MONTHLY_IMPORT_VALIDATION_FAILED", errors);
  if (!canonicalRows.length) throw new GroupMonthlyImportError("MONTHLY_IMPORT_EMPTY", [], 400);
  if (canonicalRows.length > MAX_IMPORT_ROWS) {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_TOO_LARGE", [{ maxRows: MAX_IMPORT_ROWS }], 413);
  }

  canonicalRows.sort((left, right) =>
    left.date.localeCompare(right.date) || left.driverId.localeCompare(right.driverId)
  );
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
    companyId, actorId, groupId, month, mode, sourceName, reason, rows: canonicalRows
  })).digest("hex");
  return {
    fingerprint,
    groupId,
    month,
    mode,
    sourceName,
    reason,
    rows: canonicalRows,
    summary: {
      inputRows: rows.length,
      actions: canonicalRows.length,
      drivers: new Set(canonicalRows.map(row => row.driverId)).size,
      assignments: canonicalRows.filter(row => row.type !== "clear").length,
      removals: canonicalRows.filter(row => row.type === "clear").length
    }
  };
}

function importPreviewId() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(10).toString("hex")}`;
}

function lockDocumentId(groupId, month) {
  return crypto.createHash("sha256").update(`${groupId}|${month}`).digest("hex").slice(0, 32);
}

/**
 * Pure lock evaluation for use inside a mutation transaction (2R-A.3.1).
 * Caller supplies already-read lock/job snapshots. Never auto-clears here —
 * returns clearLock:true so the caller deletes the lock in the same transaction.
 */
function evaluateMonthlyImportLockState({ lockData, jobData, now = Date.now() } = {}) {
  if (!lockData) return { ok: true };
  const expiresAt = lockData.expiresAt?.toDate
    ? lockData.expiresAt.toDate()
    : new Date(lockData.expiresAt || 0);
  const expired = !(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())
    || expiresAt.getTime() <= now;
  const importId = lockData.importId ? String(lockData.importId) : null;
  if (!expired) {
    return {
      ok: false,
      code: "MONTHLY_IMPORT_IN_PROGRESS",
      importId,
      retryable: true
    };
  }
  if (!importId) {
    return {
      ok: false,
      code: "MONTHLY_IMPORT_RECOVERY_REQUIRED",
      importId: null,
      recoveryRequired: true
    };
  }
  if (!jobData) {
    return {
      ok: false,
      code: "MONTHLY_IMPORT_RECOVERY_REQUIRED",
      importId,
      recoveryRequired: true
    };
  }
  if (isSafeToAutoClearImportLock(jobData)) {
    return { ok: true, clearLock: true, importId };
  }
  return {
    ok: false,
    code: "MONTHLY_IMPORT_RECOVERY_REQUIRED",
    importId,
    recoveryRequired: true
  };
}

/**
 * Read group/month import lock (+ job when present) inside an open transaction.
 * All reads happen here; caller may delete lock when decision.clearLock === true.
 */
async function readMonthlyImportLockInTx(tx, companyRef, groupId, month) {
  const lockRef = companyRef.collection("monthly_plan_import_locks")
    .doc(lockDocumentId(groupId, month));
  const lockSnap = await tx.get(lockRef);
  let jobSnap = null;
  const importId = lockSnap.exists ? lockSnap.data()?.importId : null;
  if (importId) {
    jobSnap = await tx.get(companyRef.collection("monthly_plan_imports").doc(String(importId)));
  }
  const decision = evaluateMonthlyImportLockState({
    lockData: lockSnap.exists ? (lockSnap.data() || {}) : null,
    jobData: importId
      ? (jobSnap && jobSnap.exists ? (jobSnap.data() || {}) : null)
      : undefined
  });
  return { lockRef, lockSnap, jobSnap, decision };
}

/**
 * UX-only fast check — not mutation authorization (2R-A.3.1.1).
 * Safe-expired cleanup re-reads lock/job inside a transaction and deletes only
 * when still the same safe-expired lock. Never unconditionally deletes after a
 * standalone get (concurrent claim must win).
 */
async function assertNoActiveGroupMonthlyImport({ db, companyId, groupId, month }) {
  const companyRef = db.collection("companies").doc(companyId);
  const lockRef = companyRef.collection("monthly_plan_import_locks")
    .doc(lockDocumentId(groupId, month));
  const snap = await lockRef.get();
  if (!snap.exists) return { ok: true };
  const lock = snap.data() || {};
  const observedImportId = lock.importId ? String(lock.importId) : "";
  let job = null;
  if (observedImportId) {
    const jobSnap = await companyRef.collection("monthly_plan_imports").doc(observedImportId).get();
    job = jobSnap.exists ? (jobSnap.data() || {}) : null;
  }
  const decision = evaluateMonthlyImportLockState({
    lockData: lock,
    jobData: observedImportId ? job : undefined
  });
  if (decision.ok && !decision.clearLock) return { ok: true };
  if (!decision.ok) {
    return {
      ok: false,
      code: decision.code,
      importId: decision.importId || null,
      retryable: decision.retryable === true,
      recoveryRequired: decision.recoveryRequired === true
    };
  }

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const liveLockSnap = await tx.get(lockRef);
        if (!liveLockSnap.exists) return { ok: true };
        const liveLock = liveLockSnap.data() || {};
        const liveImportId = liveLock.importId ? String(liveLock.importId) : "";
        let liveJob = null;
        if (liveImportId) {
          const liveJobSnap = await tx.get(
            companyRef.collection("monthly_plan_imports").doc(liveImportId)
          );
          liveJob = liveJobSnap.exists ? (liveJobSnap.data() || {}) : null;
        }
        const liveDecision = evaluateMonthlyImportLockState({
          lockData: liveLock,
          jobData: liveImportId ? liveJob : undefined
        });
        if (!liveDecision.ok) {
          return {
            ok: false,
            code: liveDecision.code,
            importId: liveDecision.importId || null,
            retryable: liveDecision.retryable === true,
            recoveryRequired: liveDecision.recoveryRequired === true
          };
        }
        // Delete only the still-same safe-expired lock — never a fresher claim.
        if (
          liveDecision.clearLock
          && liveImportId
          && liveImportId === observedImportId
        ) {
          tx.delete(lockRef);
        }
        return { ok: true };
      });
      return outcome;
    } catch {
      if (attempt === maxAttempts - 1) {
        return {
          ok: false,
          code: "MONTHLY_IMPORT_IN_PROGRESS",
          importId: observedImportId || null,
          retryable: true
        };
      }
    }
  }
  return { ok: true };
}

function buildShiftDocument(row, groupId, actorId, importId, assignedAt, existing = null, { preserveOps = false } = {}) {
  const next = {
    driverId: row.driverId,
    driverName: row.driverName,
    groupId,
    date: row.date,
    type: row.type,
    name: row.name || "",
    bus: row.bus || "",
    routeCode: row.routeCode || "",
    start: row.start || null,
    end: row.end || null,
    assignedBy: actorId,
    assignedAt,
    confirmedByDriver: false,
    revision: row.expectedRevision + 1,
    importId
  };
  // Merge/update: keep dispatcher bus assignment and driver confirmation when the duty identity is unchanged.
  if (preserveOps && existing && String(existing.type || "") === String(row.type || "")) {
    const sameDuty =
      String(existing.name || "") === String(row.name || "")
      && String(existing.start || "") === String(row.start || "")
      && String(existing.end || "") === String(row.end || "");
    if (existing.bus) next.bus = existing.bus;
    if (sameDuty && existing.confirmedByDriver === true) next.confirmedByDriver = true;
  }
  return next;
}

function buildScheduleEntry(shift) {
  return {
    type: shift.type,
    name: shift.name || shift.type,
    bus: null,
    routeCode: shift.routeCode || null,
    start: shift.start || null,
    end: shift.end || null
  };
}

async function prepareGroupMonthlyImport({
  db,
  admin,
  companyId,
  actorId,
  groupId,
  month,
  mode,
  sourceName,
  reason,
  rows,
  activePlan
}) {
  const companyRef = db.collection("companies").doc(companyId);
  const [credentials, profiles, shifts] = await Promise.all([
    companyRef.collection("driver_credentials").get(),
    companyRef.collection("drivers").get(),
    companyRef.collection("shifts")
      .where("date", ">=", `${month}-01`)
      .where("date", "<=", `${month}-31`)
      .get()
  ]);
  const profilesById = new Map(profiles.docs.map(doc => {
    const data = doc.data() || {};
    return [doc.id, {
      id: doc.id,
      ...data,
      name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim()
    }];
  }));
  const driversByEid = new Map(credentials.docs.map(doc => [
    normalizeEid(doc.data()?.eid),
    profilesById.get(doc.id)
  ]).filter(([eid, profile]) => eid && profile));
  const dutiesByCode = new Map((activePlan?.duties || []).map(duty => [String(duty.code).toUpperCase(), duty]));
  const existingShifts = new Map(shifts.docs.map(doc => {
    const data = { id: doc.id, ...doc.data() };
    return [`${data.driverId}|${data.date}`, data];
  }));
  const preview = buildGroupMonthlyPreview({
    companyId, actorId, groupId, month, mode, sourceName, reason,
    rows, driversByEid, dutiesByCode, existingShifts
  });
  const id = importPreviewId();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
  await companyRef.collection("monthly_plan_imports").doc(id).set({
    ...preview,
    id,
    actorId,
    status: "prepared",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt
  });
  return {
    id,
    fingerprint: preview.fingerprint,
    expiresAt: expiresAt.toISOString(),
    summary: preview.summary,
    rows: preview.rows.slice(0, 100).map(row => ({
      sourceRow: row.sourceRow,
      driverName: row.driverName,
      date: row.date,
      dutyCode: row.routeCode || row.name,
      action: row.type === "clear" ? "remove" : "assign"
    }))
  };
}

async function commitGroupMonthlyImport({ db, admin, companyId, actorId, importId, fingerprint }) {
  const companyRef = db.collection("companies").doc(companyId);
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);
  const importSnap = await importRef.get();
  if (!importSnap.exists) throw new GroupMonthlyImportError("MONTHLY_IMPORT_NOT_FOUND", [], 404);
  const job = importSnap.data();
  if (job.actorId !== actorId || job.fingerprint !== fingerprint) {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_MISMATCH", [], 403);
  }
  if (job.status === "completed") return { id: importId, summary: job.summary, idempotent: true };
  const expiresAt = job.expiresAt?.toDate ? job.expiresAt.toDate() : new Date(job.expiresAt);
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_EXPIRED", [], 409);
  }

  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(job.groupId, job.month));
  await db.runTransaction(async tx => {
    const lockSnap = await tx.get(lockRef);
    const lock = lockSnap.exists ? lockSnap.data() : null;
    const lockExpiry = lock?.expiresAt?.toDate ? lock.expiresAt.toDate() : new Date(lock?.expiresAt || 0);
    if (lock && lock.importId !== importId && lockExpiry.getTime() > Date.now()) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_LOCKED", [], 409);
    }
    tx.set(lockRef, {
      importId,
      groupId: job.groupId,
      month: job.month,
      actorId,
      expiresAt: new Date(Date.now() + PREVIEW_TTL_MS)
    });
    tx.set(importRef, {
      status: "committing",
      commitStartedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  const rows = Array.isArray(job.rows) ? job.rows : [];
  const appliedChunks = Number.isInteger(job.appliedChunks) ? job.appliedChunks : 0;
  const assignedAt = admin.firestore.FieldValue.serverTimestamp();
  try {
    for (let offset = appliedChunks * WRITE_CHUNK_SIZE; offset < rows.length; offset += WRITE_CHUNK_SIZE) {
      const chunk = rows.slice(offset, offset + WRITE_CHUNK_SIZE);
      const currentSnaps = await db.getAll(...chunk.map(row =>
        companyRef.collection("shifts").doc(`${row.driverId}_${row.date}`)
      ));
      const batch = db.batch();
      chunk.forEach((row, index) => {
        const ref = currentSnaps[index].ref;
        const current = currentSnaps[index].exists ? currentSnaps[index].data() : null;
        if (current?.importId === importId) return;
        if (revisionOf(current) !== row.expectedRevision) {
          throw new GroupMonthlyImportError("MONTHLY_IMPORT_CONFLICT", [{
            driverId: row.driverId,
            date: row.date,
            expectedRevision: row.expectedRevision,
            currentRevision: revisionOf(current)
          }], 409);
        }
        if (row.type === "clear") batch.delete(ref);
        else {
          batch.set(ref, buildShiftDocument(
            row,
            job.groupId,
            actorId,
            importId,
            assignedAt,
            current,
            { preserveOps: String(job.mode || "") !== "replace" }
          ));
        }
      });
      batch.set(importRef, { appliedChunks: Math.floor(offset / WRITE_CHUNK_SIZE) + 1 }, { merge: true });
      await batch.commit();
    }

    const finalShifts = await companyRef.collection("shifts")
      .where("date", ">=", `${job.month}-01`)
      .where("date", "<=", `${job.month}-31`)
      .get();
    const affectedDrivers = new Map(rows.map(row => [row.driverId, row.driverName]));
    const byDriver = new Map([...affectedDrivers].map(([driverId, driverName]) => [
      driverId, { driverName, parsedShifts: {} }
    ]));
    finalShifts.docs.forEach(doc => {
      const shift = doc.data();
      if (shift.groupId !== job.groupId || !byDriver.has(shift.driverId)) return;
      const day = Number(String(shift.date).slice(8, 10));
      byDriver.get(shift.driverId).parsedShifts[day] = buildScheduleEntry(shift);
    });
    const scheduleBatch = db.batch();
    byDriver.forEach((schedule, driverId) => {
      scheduleBatch.set(companyRef.collection("schedules").doc(`${driverId}_${job.month}`), {
        id: `${driverId}_${job.month}`,
        driverId,
        driverName: schedule.driverName,
        groupId: job.groupId,
        month: job.month,
        parsedShifts: schedule.parsedShifts,
        source: "company-admin-group-import",
        importId,
        updatedAt: assignedAt,
        updatedBy: actorId
      }, { merge: true });
    });
    scheduleBatch.set(importRef, {
      status: "completed",
      completedAt: assignedAt
    }, { merge: true });
    scheduleBatch.delete(lockRef);
    await scheduleBatch.commit();
    return { id: importId, summary: job.summary, idempotent: false };
  } catch (error) {
    const failureBatch = db.batch();
    failureBatch.set(importRef, {
      status: "failed",
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      failureCode: error.code || "MONTHLY_IMPORT_COMMIT_FAILED"
    }, { merge: true });
    failureBatch.delete(lockRef);
    await failureBatch.commit().catch(() => {});
    throw error;
  }
}

module.exports = {
  ABSENCE_TYPES,
  GroupMonthlyImportError,
  MAX_IMPORT_ROWS,
  WRITE_CHUNK_SIZE,
  assertNoActiveGroupMonthlyImport,
  evaluateMonthlyImportLockState,
  readMonthlyImportLockInTx,
  isSafeToAutoClearImportLock,
  buildGroupMonthlyPreview,
  buildScheduleEntry,
  buildShiftDocument,
  commitGroupMonthlyImport,
  lockDocumentId,
  normalizeEid,
  prepareGroupMonthlyImport,
  revisionOf
};

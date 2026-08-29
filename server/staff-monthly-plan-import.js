/**
 * Dispatcher monthly plan import — prepare / commit / compensate.
 * Canonical shift contract: server/shift-assignment.js (SoT = shifts; schedules = mirror).
 */
const crypto = require("crypto");
const { ASSIGNABLE_BUS_STATUSES } = require("./assignment-resource-guard");
const {
  assertNoActiveGroupMonthlyImport,
  lockDocumentId,
  GroupMonthlyImportError
} = require("./group-monthly-plan-import");
const {
  shiftDocumentId,
  scheduleDayNumber,
  currentRevision,
  buildAssignedShift,
  buildClearedShift,
  buildScheduleDayEntry,
  capturePriorSnapshot
} = require("./shift-assignment");
const servicePlans = require("./service-plans");
const { canonicalDutyGuardKey, dutyGuardRef, writeDutyGuardClaimInTx, writeDutyGuardReleaseInTx } = require("./duty-instance-guard");

const PREVIEW_TTL_MS = 30 * 60 * 1000;
let _getActiveServicePlan = servicePlans.getActiveServicePlan;

function setGetActiveServicePlanForTests(fn) {
  _getActiveServicePlan = typeof fn === "function" ? fn : servicePlans.getActiveServicePlan;
}
/** Conservative Firestore doc budget (1 MiB hard limit). */
const MAX_JOB_BYTES = 700 * 1024;
const DEFAULT_WRITE_CHUNK_SIZE = 50;
const SCHEDULE_WRITE_CHUNK_SIZE = 40;
const ABSENCE_OR_CLEAR = new Set(["off", "vacation", "sick", "clear", "bereitschaft"]);

let _writeChunkSize = DEFAULT_WRITE_CHUNK_SIZE;
let _afterLockHookForTests = null;

function setStaffImportWriteChunkSizeForTests(size) {
  _writeChunkSize = Number.isInteger(size) && size > 0 ? size : DEFAULT_WRITE_CHUNK_SIZE;
}

function setAfterLockHookForTests(fn) {
  _afterLockHookForTests = typeof fn === "function" ? fn : null;
}

function importPreviewId() {
  return crypto.randomUUID();
}

function dutyCodeOf(row) {
  return String(row.routeCode || row.name || "").trim().toUpperCase();
}

function busAllowsGroup(bus, groupId) {
  if (!bus || !groupId) return false;
  if (String(bus.groupId || bus.lineId || "") === groupId) return true;
  const ids = Array.isArray(bus.groupIds) ? bus.groupIds.map(String) : [];
  return ids.includes(String(groupId));
}

function sameDutyIdentity(existing, row) {
  if (!existing) return false;
  return String(existing.type || "") === String(row.type || "")
    && String(existing.name || "") === String(row.name || "")
    && String(existing.routeCode || "") === String(row.routeCode || "")
    && String(existing.start || "") === String(row.start || "")
    && String(existing.end || "") === String(row.end || "");
}

/**
 * Bus rule (2R-A):
 * - non-empty import bus wins;
 * - empty import bus + same duty → keep existing ops bus;
 * - empty + duty change → empty.
 */
function resolveImportBus(row, existing) {
  const incoming = String(row.bus || "").trim();
  if (incoming) return incoming;
  if (existing && sameDutyIdentity(existing, row) && existing.bus) {
    return String(existing.bus);
  }
  return "";
}

function buildCanonicalImportShift({
  row, groupId, actorId, importId, assignedAt, existing
}) {
  const revision = currentRevision(existing) + 1;
  const priorSnapshot = capturePriorSnapshot(existing);
  const driverName = String(row.driverName || existing?.driverName || "").trim();
  const data = {
    driverId: row.driverId,
    date: row.date,
    type: row.type,
    name: row.name || "",
    bus: resolveImportBus(row, existing),
    routeCode: row.routeCode || "",
    start: row.start || null,
    end: row.end || null
  };

  let shift;
  if (row.type === "clear") {
    shift = buildClearedShift({
      data,
      driverName,
      driverGroupId: groupId,
      staffUid: actorId,
      revision,
      priorSnapshot,
      assignedAt
    });
  } else {
    shift = buildAssignedShift({
      data,
      driverName,
      driverGroupId: groupId,
      staffUid: actorId,
      revision,
      assignedAt,
      priorSnapshot
    });
  }
  shift.importId = importId;
  return shift;
}

function estimateJobBytes(preview) {
  return Buffer.byteLength(JSON.stringify({
    rows: preview.rows,
    summary: preview.summary,
    fingerprint: preview.fingerprint,
    sourceName: preview.sourceName,
    reason: preview.reason
  }), "utf8");
}

function assertJobSize(preview) {
  const bytes = estimateJobBytes(preview);
  if (bytes > MAX_JOB_BYTES) {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_TOO_LARGE", [{
      bytes,
      maxBytes: MAX_JOB_BYTES
    }], 413);
  }
  return bytes;
}

async function prepareStaffMonthlyImport({
  db,
  admin,
  companyId,
  actorId,
  preview
}) {
  assertJobSize(preview);

  const companyRef = db.collection("companies").doc(companyId);
  const lockCheck = await assertNoActiveGroupMonthlyImport({
    db, companyId, groupId: preview.groupId, month: preview.month
  });
  if (lockCheck && lockCheck.ok === false) {
    throw new GroupMonthlyImportError(lockCheck.code || "MONTHLY_IMPORT_LOCKED", [], 409);
  }

  const id = importPreviewId();
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS);
  const payload = {
    id,
    actorId,
    companyId,
    groupId: preview.groupId,
    month: preview.month,
    sourceName: preview.sourceName,
    reason: preview.reason,
    fingerprint: preview.fingerprint,
    summary: preview.summary,
    rows: preview.rows,
    mode: "assign",
    source: "dispatcher-staff-import",
    status: "prepared",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt
  };
  const encoded = Buffer.byteLength(JSON.stringify({
    ...payload,
    createdAt: null
  }), "utf8");
  if (encoded > MAX_JOB_BYTES) {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_TOO_LARGE", [{
      bytes: encoded,
      maxBytes: MAX_JOB_BYTES
    }], 413);
  }

  await companyRef.collection("monthly_plan_imports").doc(id).set(payload);
  return {
    id,
    fingerprint: preview.fingerprint,
    expiresAt: expiresAt.toISOString(),
    summary: preview.summary,
    groupId: preview.groupId,
    month: preview.month,
    rows: preview.rows.slice(0, 80).map((row) => ({
      driverId: row.driverId,
      date: row.date,
      type: row.type,
      name: row.name,
      bus: row.bus,
      action: row.type === "clear" ? "remove" : "assign"
    }))
  };
}

function fullRestoreFromPrevious(row, groupId, admin) {
  const previous = row.previous;
  if (!previous) return null;
  return {
    driverId: row.driverId,
    date: row.date,
    groupId: previous.groupId || groupId,
    type: previous.type,
    name: previous.name || "",
    bus: previous.bus || "",
    routeCode: previous.routeCode || "",
    start: previous.start || null,
    end: previous.end || null,
    driverName: previous.driverName || row.driverName || "",
    revision: previous.revision,
    confirmedByDriver: previous.confirmedByDriver === true,
    confirmedAt: previous.confirmedAt ?? null,
    shiftFingerprint: previous.shiftFingerprint ?? null,
    confirmationSourceShiftDate: previous.confirmationSourceShiftDate ?? null,
    confirmationBoundRevision: previous.confirmationBoundRevision ?? previous.revision,
    priorSnapshot: previous.priorSnapshot || { empty: true, revision: 0 },
    assignedBy: previous.assignedBy || null,
    assignedAt: previous.assignedAt || null,
    clearedAt: previous.type === "clear" ? (previous.clearedAt || null) : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

async function refreshScheduleMirrors({
  db,
  admin,
  companyRef,
  groupId,
  month,
  driverIds,
  source,
  importId = null,
  actorId = null,
  assignedAt = null,
  chunkSize = SCHEDULE_WRITE_CHUNK_SIZE,
  assertBatchLimit = null
}) {
  const ids = [...new Set(driverIds)];
  if (!ids.length) return;

  const finalShifts = await companyRef.collection("shifts")
    .where("date", ">=", `${month}-01`)
    .where("date", "<=", `${month}-31`)
    .get();

  const driverSnaps = ids.length
    ? await db.getAll(...ids.map((id) => companyRef.collection("drivers").doc(id)))
    : [];
  const driverNameById = new Map();
  driverSnaps.forEach((snap) => {
    if (!snap.exists) return;
    const data = snap.data() || {};
    const name = String(data.name || `${data.firstName || ""} ${data.lastName || ""}`).trim();
    if (name) driverNameById.set(snap.id, name);
  });

  const byDriver = new Map(ids.map((id) => [id, {
    parsedShifts: {},
    driverName: driverNameById.get(id) || ""
  }]));
  finalShifts.docs.forEach((doc) => {
    const shift = doc.data() || {};
    if (shift.groupId !== groupId || !byDriver.has(shift.driverId)) return;
    if (shift.type === "clear") return;
    const day = scheduleDayNumber(shift.date);
    if (day == null) return;
    const bucket = byDriver.get(shift.driverId);
    bucket.parsedShifts[day] = buildScheduleDayEntry(shift);
    if (!bucket.driverName && shift.driverName) {
      bucket.driverName = String(shift.driverName);
    }
    if (!bucket.driverName && driverNameById.has(shift.driverId)) {
      bucket.driverName = driverNameById.get(shift.driverId);
    }
  });

  const deleteField = admin.firestore.FieldValue.delete
    ? admin.firestore.FieldValue.delete()
    : null;

  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    const chunk = ids.slice(offset, offset + chunkSize);
    if (typeof assertBatchLimit === "function") assertBatchLimit(chunk.length);
    const scheduleBatch = db.batch();
    chunk.forEach((driverId) => {
      const schedule = byDriver.get(driverId) || { parsedShifts: {}, driverName: "" };
      const payload = {
        id: `${driverId}_${month}`,
        driverId,
        driverName: schedule.driverName || "",
        groupId,
        month,
        parsedShifts: schedule.parsedShifts,
        source,
        updatedAt: assignedAt || admin.firestore.FieldValue.serverTimestamp()
      };
      if (importId) {
        payload.importId = importId;
      } else if (deleteField) {
        payload.importId = deleteField;
      }
      if (actorId) {
        payload.updatedBy = actorId;
      } else if (deleteField) {
        payload.updatedBy = deleteField;
      }
      scheduleBatch.set(
        companyRef.collection("schedules").doc(`${driverId}_${month}`),
        payload,
        { merge: true }
      );
    });
    await scheduleBatch.commit();
  }
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, details?: any[] }}
 */
async function compensateStaffImport({
  db,
  admin,
  companyRef,
  importRef,
  importId,
  groupId,
  month,
  rows,
  lockRef
}) {
  const applied = [];
  try {
    for (let offset = 0; offset < rows.length; offset += _writeChunkSize) {
      const chunk = rows.slice(offset, offset + _writeChunkSize);
      // Atomic: re-check current.importId in the same transaction as restore/delete.
      const touchedIds = await db.runTransaction(async (tx) => {
        const shiftRefs = chunk.map((row) =>
          companyRef.collection("shifts").doc(shiftDocumentId(row.driverId, row.date))
        );
        const snaps = await txGetAll(tx, shiftRefs);
        const ids = [];
        chunk.forEach((row, index) => {
          const snap = snaps[index];
          if (!snap.exists) return;
          const data = snap.data() || {};
          if (data.importId !== importId) return; // never overwrite a newer writer
          const restored = fullRestoreFromPrevious(row, groupId, admin);
          if (!restored) {
            tx.delete(snap.ref);
            if (data.routeCode || data.name) {
              const guardKey = canonicalDutyGuardKey({ groupId, serviceDate: row.date, dutyCode: data.routeCode || data.name });
              if (guardKey) writeDutyGuardReleaseInTx(tx, dutyGuardRef(companyRef, guardKey));
            }
          } else {
            tx.set(snap.ref, restored);
            if (restored.type !== "clear" && !ABSENCE_OR_CLEAR.has(restored.type) && (restored.routeCode || restored.name)) {
              const guardKey = canonicalDutyGuardKey({ groupId: restored.groupId || groupId, serviceDate: row.date, dutyCode: restored.routeCode || restored.name });
              if (guardKey) {
                writeDutyGuardClaimInTx(tx, dutyGuardRef(companyRef, guardKey), admin.firestore.FieldValue, {
                  companyId: companyRef.id,
                  groupId: restored.groupId || groupId,
                  serviceDate: row.date,
                  dutyCode: restored.routeCode || restored.name,
                  shiftType: restored.type,
                  ownerDriverId: restored.driverId,
                  ownerShiftDocumentId: shiftDocumentId(restored.driverId, row.date),
                  assignedBus: restored.bus || "",
                  staffUid: restored.assignedBy || "compensation"
                });
              }
            } else if (data.routeCode || data.name) {
              const guardKey = canonicalDutyGuardKey({ groupId, serviceDate: row.date, dutyCode: data.routeCode || data.name });
              if (guardKey) writeDutyGuardReleaseInTx(tx, dutyGuardRef(companyRef, guardKey));
            }
          }
          ids.push(row.driverId);
        });
        return ids;
      });
      applied.push(...touchedIds);
    }

    await refreshScheduleMirrors({
      db,
      admin,
      companyRef,
      groupId,
      month,
      driverIds: applied,
      source: "dispatcher-staff-import-rollback"
    });

    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      tx.set(importRef, {
        status: "failed",
        failedAt: admin.firestore.FieldValue.serverTimestamp(),
        compensated: true,
        compensationStatus: "completed"
      }, { merge: true });
      // Never delete a foreign / inconsistent lock.
      if (lockSnap.exists && lockSnap.data()?.importId === importId) {
        tx.delete(lockRef);
      }
    });

    return { ok: true };
  } catch (err) {
    let persisted = false;
    try {
      await importRef.set({
        status: "compensation_failed",
        recoveryRequired: true,
        compensated: false,
        compensationStatus: "failed",
        compensationError: String(err?.code || err?.message || "compensation_failed").slice(0, 120),
        failedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      persisted = true;
    } catch {
      // Do not swallow — lock/job remain fail-closed; caller must report recovery.
      persisted = false;
    }
    // Lock intentionally retained — unsafe to release as if finished.
    return {
      ok: false,
      code: "MONTHLY_IMPORT_COMPENSATION_FAILED",
      recoveryRequired: true,
      details: [{
        reason: String(err?.message || "compensation_failed").slice(0, 200),
        persistFailed: persisted !== true
      }]
    };
  }
}

async function revalidateCommitRows({
  db,
  companyId,
  companyRef,
  actorGroups,
  job,
  rows
}) {
  if (!Array.isArray(actorGroups) || !actorGroups.includes(job.groupId)) {
    throw new GroupMonthlyImportError("GROUP_ACCESS_DENIED", [], 403);
  }

  const driverIds = [...new Set(rows.map((r) => r.driverId))];
  const driverSnaps = driverIds.length
    ? await db.getAll(...driverIds.map((id) => companyRef.collection("drivers").doc(id)))
    : [];
  const driversById = new Map();
  driverSnaps.forEach((snap) => {
    if (snap.exists) driversById.set(snap.id, snap.data());
  });

  const shiftSnaps = rows.length
    ? await db.getAll(...rows.map((row) =>
      companyRef.collection("shifts").doc(shiftDocumentId(row.driverId, row.date))
    ))
    : [];

  const activePlan = await _getActiveServicePlan({ db, companyId, groupId: job.groupId });
  const dutiesByCode = new Map();
  for (const duty of activePlan?.duties || []) {
    const code = String(duty.code || "").trim().toUpperCase();
    if (code) dutiesByCode.set(code, duty);
  }

  const busesSnap = await companyRef.collection("buses").get();
  const busesByNumber = new Map();
  busesSnap.docs.forEach((doc) => {
    const bus = { id: doc.id, ...doc.data() };
    const number = String(bus.number || "").trim();
    if (number) {
      busesByNumber.set(number, bus);
      busesByNumber.set(number.toUpperCase(), bus);
    }
  });

  const errors = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const driver = driversById.get(row.driverId);
    if (!driver) {
      errors.push({ row: rowNumber, code: "DRIVER_NOT_FOUND", driverId: row.driverId, date: row.date });
      return;
    }
    if (driver.active === false) {
      errors.push({ row: rowNumber, code: "DRIVER_INACTIVE", driverId: row.driverId, date: row.date });
    }
    const driverGroupId = driver.groupId || driver.lineId || null;
    if (driverGroupId !== job.groupId) {
      errors.push({ row: rowNumber, code: "DRIVER_OUTSIDE_GROUP", driverId: row.driverId, date: row.date });
    }

    const needsDuty = !ABSENCE_OR_CLEAR.has(row.type);
    if (needsDuty) {
      const code = dutyCodeOf(row);
      if (!code || !dutiesByCode.has(code)) {
        errors.push({
          row: rowNumber,
          code: "DUTY_NOT_IN_ACTIVE_CATALOG",
          driverId: row.driverId,
          date: row.date,
          dutyCode: code
        });
      }
    }

    // Effective bus = explicit row.bus OR what resolveImportBus will keep from current shift.
    const current = shiftSnaps[index]?.exists ? shiftSnaps[index].data() : null;
    const busNumber = resolveImportBus(row, current);
    if (busNumber) {
      const bus = busesByNumber.get(busNumber) || busesByNumber.get(busNumber.toUpperCase());
      if (!bus) {
        errors.push({
          row: rowNumber, code: "BUS_NOT_FOUND", driverId: row.driverId, date: row.date, bus: busNumber
        });
      } else if (bus.active === false) {
        errors.push({
          row: rowNumber, code: "BUS_INACTIVE", driverId: row.driverId, date: row.date, bus: busNumber
        });
      } else if (bus.opsStatus && !ASSIGNABLE_BUS_STATUSES.has(bus.opsStatus)) {
        errors.push({
          row: rowNumber,
          code: "BUS_NOT_AVAILABLE",
          driverId: row.driverId,
          date: row.date,
          bus: busNumber,
          opsStatus: bus.opsStatus
        });
      } else if (!busAllowsGroup(bus, job.groupId)) {
        errors.push({
          row: rowNumber, code: "BUS_OUTSIDE_GROUP", driverId: row.driverId, date: row.date, bus: busNumber
        });
      }
    }
  });

  if (errors.length) {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_REVALIDATION_FAILED", errors, 409);
  }
}

async function countImportTaggedShifts(db, companyRef, importId, rows) {
  if (!rows.length) return 0;
  const snaps = await db.getAll(...rows.map((row) =>
    companyRef.collection("shifts").doc(shiftDocumentId(row.driverId, row.date))
  ));
  let count = 0;
  snaps.forEach((snap) => {
    if (snap.exists && snap.data()?.importId === importId) count += 1;
  });
  return count;
}

function lockExpiryDate(lock) {
  if (!lock) return null;
  const raw = lock.expiresAt?.toDate ? lock.expiresAt.toDate() : new Date(lock.expiresAt || 0);
  if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return null;
  return raw;
}

function isLockAlive(lock, now = Date.now()) {
  const expiry = lockExpiryDate(lock);
  return expiry instanceof Date && expiry.getTime() > now;
}

/**
 * Full lock consistency for chunk/completion (2R-A.3.1.1).
 * Exact match required — missing groupId/month is never a fallback.
 */
function isLockConsistentForImport(lock, importId, actorId, groupId, month) {
  if (!lock || lock.importId !== importId) return false;
  if (!lock.actorId || lock.actorId !== actorId) return false;
  if (groupId == null || groupId === "" || month == null || month === "") return false;
  if (lock.groupId == null || lock.groupId === "" || lock.month == null || lock.month === "") {
    return false;
  }
  if (String(lock.groupId) !== String(groupId)) return false;
  if (String(lock.month) !== String(month)) return false;
  return true;
}

/** Prefer Transaction.getAll when supported; preserve all-reads-before-writes. */
async function txGetAll(tx, refs) {
  if (!refs.length) return [];
  if (typeof tx.getAll === "function") {
    return tx.getAll(...refs);
  }
  const out = [];
  for (const ref of refs) out.push(await tx.get(ref));
  return out;
}

/**
 * No-schema single-flight claim (2R-A.3).
 * Transaction reads LIVE importRef + lockRef before any write.
 * Only prepared → committing may proceed; second HTTP never resumes committing.
 */
async function claimStaffMonthlyImportCommit({
  db,
  admin,
  importRef,
  lockRef,
  importId,
  fingerprint,
  actorId,
  groupId,
  month
}) {
  return db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(importRef);
    const lockSnap = await tx.get(lockRef);
    // All reads complete before any write.

    if (!jobSnap.exists) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_NOT_FOUND", [], 404);
    }
    const live = jobSnap.data() || {};
    if (live.actorId !== actorId || live.fingerprint !== fingerprint) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_MISMATCH", [], 403);
    }
    if (live.source !== "dispatcher-staff-import") {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_MISMATCH", [], 403);
    }

    if (live.status === "completed") {
      return { kind: "idempotent", summary: live.summary, live };
    }

    const terminalBlocked = new Set([
      "failed",
      "compensation_failed",
      "recovery_required",
      "expired"
    ]);
    if (terminalBlocked.has(live.status) || live.recoveryRequired === true) {
      const needsRecovery = live.recoveryRequired === true
        || live.status === "compensation_failed"
        || live.status === "recovery_required"
        || (live.status === "failed" && live.compensated !== true);
      throw new GroupMonthlyImportError(
        needsRecovery ? "MONTHLY_IMPORT_RECOVERY_REQUIRED" : "MONTHLY_IMPORT_NOT_RETRYABLE",
        [{ status: live.status }],
        409,
        { recoveryRequired: needsRecovery }
      );
    }

    const now = Date.now();
    const expiresAt = live.expiresAt?.toDate
      ? live.expiresAt.toDate()
      : new Date(live.expiresAt || 0);
    const lock = lockSnap.exists ? (lockSnap.data() || {}) : null;
    const lockAlive = isLockAlive(lock, now);
    const scopeGroupId = groupId || live.groupId;
    const scopeMonth = month || live.month;
    const lockConsistent = isLockConsistentForImport(
      lock, importId, actorId, scopeGroupId, scopeMonth
    );

    if (live.status === "committing") {
      if (lockConsistent && lockAlive) {
        throw new GroupMonthlyImportError("MONTHLY_IMPORT_IN_PROGRESS", [{
          importId,
          status: "committing"
        }], 409, { retryable: true });
      }
      // Expired / missing / mismatched lock — fail-closed, no takeover/resume.
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        status: "committing",
        lock: lock
          ? (lockAlive ? "mismatched" : "expired")
          : "missing"
      }], 409, { recoveryRequired: true });
    }

    if (live.status !== "prepared") {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_NOT_RETRYABLE", [{
        status: live.status
      }], 409);
    }

    // Prepared but already partial / flagged — fail-closed, no takeover (2R-A.3.1 D).
    if (live.recoveryRequired === true || Number(live.appliedChunks || 0) > 0) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        reason: "prepared_partial",
        appliedChunks: Number(live.appliedChunks || 0)
      }], 409, { recoveryRequired: true });
    }

    if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < now) {
      // Persist expired in this transaction and return; throw OUTSIDE so write commits.
      tx.set(importRef, { status: "expired" }, { merge: true });
      return { kind: "expired", live };
    }

    if (lock && lockAlive && lock.importId && lock.importId !== importId) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_LOCKED", [], 409);
    }
    if (lock && lockAlive && lock.importId === importId) {
      // Prepared job must not already hold a live lock — inconsistent.
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        reason: "prepared_with_live_lock"
      }], 409, { recoveryRequired: true });
    }
    if (lock && !lockAlive && lock.importId && lock.importId !== importId) {
      // Expired foreign lock: do not auto-clear here — fail-closed.
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        reason: "expired_foreign_lock"
      }], 409, { recoveryRequired: true });
    }

    tx.set(importRef, {
      status: "committing",
      commitStartedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    tx.set(lockRef, {
      importId,
      groupId: groupId || live.groupId,
      month: month || live.month,
      actorId,
      expiresAt: new Date(now + PREVIEW_TTL_MS)
    });
    return { kind: "claimed", live };
  });
}

/**
 * Bounded chunk mutation: all reads (job, lock, shifts) before writes in one transaction.
 */
async function applyImportChunkTransaction({
  db,
  admin: _admin,
  companyRef,
  importRef,
  lockRef,
  importId,
  actorId,
  fingerprint,
  groupId,
  month,
  chunk,
  chunkIndex,
  assignedAt
}) {
  return db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(importRef);
    const lockSnap = await tx.get(lockRef);
    const shiftRefs = chunk.map((row) =>
      companyRef.collection("shifts").doc(shiftDocumentId(row.driverId, row.date))
    );
    const shiftSnaps = await txGetAll(tx, shiftRefs);

    if (!jobSnap.exists) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_NOT_FOUND", [], 404);
    }
    const live = jobSnap.data() || {};
    if (live.status !== "committing") {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        reason: "chunk_status_not_committing",
        status: live.status
      }], 409, { recoveryRequired: true });
    }
    if (live.actorId !== actorId || live.fingerprint !== fingerprint) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_MISMATCH", [], 403);
    }
    if (String(live.groupId || "") !== String(groupId)
      || String(live.month || "") !== String(month)) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        reason: "chunk_group_month_mismatch"
      }], 409, { recoveryRequired: true });
    }

    const lock = lockSnap.exists ? (lockSnap.data() || {}) : null;
    const now = Date.now();
    if (!lock || !isLockAlive(lock, now)
      || !isLockConsistentForImport(lock, importId, actorId, groupId, month)) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        reason: !lock
          ? "chunk_lock_missing"
          : (isLockAlive(lock, now) ? "chunk_lock_mismatched" : "chunk_lock_expired")
      }], 409, { recoveryRequired: true });
    }

    const guardPlan = chunk.map((row, index) => {
      const current = shiftSnaps[index].exists ? shiftSnaps[index].data() : null;
      const incomingDutyCode = row.type !== "clear" && !ABSENCE_OR_CLEAR.has(row.type) ? dutyCodeOf(row) : "";
      const currentDutyCode = current && !ABSENCE_OR_CLEAR.has(current.type) ? dutyCodeOf(current) : "";
      const incomingGuardKey = incomingDutyCode ? canonicalDutyGuardKey({ groupId, serviceDate: row.date, dutyCode: incomingDutyCode }) : null;
      const currentGuardKey = (currentDutyCode && currentDutyCode !== incomingDutyCode) ? canonicalDutyGuardKey({ groupId, serviceDate: row.date, dutyCode: currentDutyCode }) : null;
      return {
        incomingDutyCode,
        currentDutyCode,
        incomingGuardRef: incomingGuardKey ? dutyGuardRef(companyRef, incomingGuardKey) : null,
        currentGuardRef: currentGuardKey ? dutyGuardRef(companyRef, currentGuardKey) : null
      };
    });

    const guardRefsToRead = [...new Set(
      guardPlan.flatMap((g) => [g.incomingGuardRef, g.currentGuardRef]).filter(Boolean)
    )];
    const guardSnaps = await txGetAll(tx, guardRefsToRead);
    const guardSnapMap = new Map();
    guardRefsToRead.forEach((ref, i) => {
      guardSnapMap.set(ref.path, guardSnaps[i]);
    });

    chunk.forEach((row, index) => {
      const current = shiftSnaps[index].exists ? shiftSnaps[index].data() : null;
      if (current?.importId === importId) return;
      if (currentRevision(current) !== Number(row.expectedRevision)) {
        throw new GroupMonthlyImportError("MONTHLY_IMPORT_CONFLICT", [{
          driverId: row.driverId,
          date: row.date,
          expectedRevision: row.expectedRevision,
          currentRevision: currentRevision(current)
        }], 409);
      }

      const gp = guardPlan[index];
      if (gp.incomingGuardRef) {
        const gSnap = guardSnapMap.get(gp.incomingGuardRef.path);
        if (gSnap && gSnap.exists) {
          const gData = gSnap.data() || {};
          if (gData.ownerDriverId && gData.ownerDriverId !== row.driverId) {
            const conflictDriverName = gData.ownerDriverName || gData.ownerDriverId || "";
            throw new GroupMonthlyImportError("MONTHLY_IMPORT_CONFLICT", [{
              driverId: row.driverId,
              date: row.date,
              code: "DUTY_ALREADY_ASSIGNED",
              dutyCode: gp.incomingDutyCode,
              existingDriverId: gData.ownerDriverId,
              existingDriverName: conflictDriverName
            }], 409);
          }
        }
      }

      const next = buildCanonicalImportShift({
        row,
        groupId,
        actorId,
        importId,
        assignedAt,
        existing: current
      });
      tx.set(shiftSnaps[index].ref, next);

      if (gp.incomingGuardRef) {
        writeDutyGuardClaimInTx(tx, gp.incomingGuardRef, _admin.firestore.FieldValue, {
          companyId: companyRef.id,
          groupId,
          serviceDate: row.date,
          dutyCode: gp.incomingDutyCode,
          shiftType: row.type,
          ownerDriverId: row.driverId,
          ownerShiftDocumentId: shiftDocumentId(row.driverId, row.date),
          assignedBus: next.bus || "",
          staffUid: actorId
        });
      }
      if (gp.currentGuardRef) {
        const oldSnap = guardSnapMap.get(gp.currentGuardRef.path);
        if (oldSnap && oldSnap.exists && oldSnap.data()?.ownerDriverId === row.driverId) {
          writeDutyGuardReleaseInTx(tx, gp.currentGuardRef);
        }
      }
    });
    tx.set(importRef, { appliedChunks: chunkIndex + 1 }, { merge: true });
  });
}

async function commitStaffMonthlyImport({
  db,
  admin,
  companyId,
  actorId,
  importId,
  fingerprint,
  actorGroups = null,
  assertBatchLimit = null,
  afterLockHook = null,
  afterChunkHook = null
}) {
  const companyRef = db.collection("companies").doc(companyId);
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);

  // Fail-closed: actorGroups is mandatory — never skip revalidation.
  if (!Array.isArray(actorGroups)) {
    throw new GroupMonthlyImportError("GROUP_ACCESS_DENIED", [], 403);
  }

  // Lightweight existence/group path for lock id; authoritative status is LIVE in claim tx.
  const importSnap = await importRef.get();
  if (!importSnap.exists) throw new GroupMonthlyImportError("MONTHLY_IMPORT_NOT_FOUND", [], 404);
  const seed = importSnap.data() || {};
  if (seed.actorId !== actorId || seed.fingerprint !== fingerprint) {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_MISMATCH", [], 403);
  }
  if (seed.source !== "dispatcher-staff-import") {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_MISMATCH", [], 403);
  }
  const lockRef = companyRef.collection("monthly_plan_import_locks")
    .doc(lockDocumentId(seed.groupId, seed.month));

  // Prepared + prior tagged shifts / appliedChunks → recovery before claim (2R-A.3.1 D).
  if (seed.status === "prepared") {
    const seedRows = Array.isArray(seed.rows) ? seed.rows : [];
    const tagged = await countImportTaggedShifts(db, companyRef, importId, seedRows);
    if (Number(seed.appliedChunks || 0) > 0 || tagged > 0 || seed.recoveryRequired === true) {
      throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
        reason: tagged > 0 ? "prepared_with_tagged_shifts" : "prepared_partial",
        tagged,
        appliedChunks: Number(seed.appliedChunks || 0)
      }], 409, { recoveryRequired: true });
    }
  }

  const claim = await claimStaffMonthlyImportCommit({
    db,
    admin,
    importRef,
    lockRef,
    importId,
    fingerprint,
    actorId,
    groupId: seed.groupId,
    month: seed.month
  });

  if (claim.kind === "idempotent") {
    return { id: importId, summary: claim.summary, idempotent: true };
  }
  if (claim.kind === "expired") {
    throw new GroupMonthlyImportError("MONTHLY_IMPORT_EXPIRED", [], 409);
  }

  const job = claim.live;
  const rows = Array.isArray(job.rows) ? job.rows : [];

  const lockHook = typeof afterLockHook === "function"
    ? afterLockHook
    : _afterLockHookForTests;
  if (typeof lockHook === "function") {
    await lockHook({ db, companyId, importId, job });
  }

  // Revalidate AFTER exclusive claim, before first mutation of THIS request.
  try {
    await revalidateCommitRows({
      db,
      companyId,
      companyRef,
      actorGroups,
      job,
      rows
    });
  } catch (revalidationError) {
    const tagged = await countImportTaggedShifts(db, companyRef, importId, rows);
    const hasPriorWrites = Number(job.appliedChunks || 0) > 0 || tagged > 0;

    if (!hasPriorWrites) {
      try {
        await db.runTransaction(async (tx) => {
          const jobLive = await tx.get(importRef);
          const lockLive = await tx.get(lockRef);
          if (!jobLive.exists) return;
          const status = jobLive.data()?.status;
          if (status !== "committing") return;
          tx.set(importRef, {
            status: "prepared",
            revalidationFailedAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          if (lockLive.exists && lockLive.data()?.importId === importId) {
            tx.delete(lockRef);
          }
        });
      } catch (cleanupErr) {
        await importRef.set({
          recoveryRequired: true,
          status: "recovery_required",
          cleanupError: String(cleanupErr?.message || "cleanup_failed").slice(0, 120)
        }, { merge: true }).catch(() => {});
        throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
          reason: "revalidation_cleanup_failed"
        }], 409, { recoveryRequired: true });
      }
      throw revalidationError;
    }

    // Writes already exist for this importId — compensate or stay recovery-required.
    const compensation = await compensateStaffImport({
      db,
      admin,
      companyRef,
      importRef,
      importId,
      groupId: job.groupId,
      month: job.month,
      rows,
      lockRef
    });
    if (!compensation.ok) {
      throw new GroupMonthlyImportError(
        compensation.code || "MONTHLY_IMPORT_COMPENSATION_FAILED",
        compensation.details || [],
        409,
        { recoveryRequired: true }
      );
    }
    const compensatedErr = revalidationError instanceof GroupMonthlyImportError
      ? revalidationError
      : new GroupMonthlyImportError("MONTHLY_IMPORT_REVALIDATION_FAILED", [], 409);
    compensatedErr.compensated = true;
    throw compensatedErr;
  }

  const assignedAt = admin.firestore.FieldValue.serverTimestamp();
  try {
    let chunkIndex = 0;
    for (let offset = 0; offset < rows.length; offset += _writeChunkSize) {
      const chunk = rows.slice(offset, offset + _writeChunkSize);
      if (typeof assertBatchLimit === "function") assertBatchLimit(chunk.length);
      await applyImportChunkTransaction({
        db,
        admin,
        companyRef,
        importRef,
        lockRef,
        importId,
        actorId,
        fingerprint,
        groupId: job.groupId,
        month: job.month,
        chunk,
        chunkIndex,
        assignedAt
      });
      chunkIndex += 1;
      if (typeof afterChunkHook === "function") {
        await afterChunkHook({ offset, importId });
      }
    }

    await refreshScheduleMirrors({
      db,
      admin,
      companyRef,
      groupId: job.groupId,
      month: job.month,
      driverIds: rows.map((r) => r.driverId),
      source: "dispatcher-staff-import",
      importId,
      actorId,
      assignedAt,
      assertBatchLimit
    });

    await db.runTransaction(async (tx) => {
      const jobLive = await tx.get(importRef);
      const lockLive = await tx.get(lockRef);
      if (!jobLive.exists || jobLive.data()?.status !== "committing") {
        throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
          reason: "completion_status_mismatch"
        }], 409, { recoveryRequired: true });
      }
      const lock = lockLive.exists ? (lockLive.data() || {}) : null;
      const now = Date.now();
      if (!lock || !isLockAlive(lock, now)
        || !isLockConsistentForImport(lock, importId, actorId, job.groupId, job.month)) {
        throw new GroupMonthlyImportError("MONTHLY_IMPORT_RECOVERY_REQUIRED", [{
          reason: !lock
            ? "completion_lock_missing"
            : (isLockAlive(lock, now) ? "completion_lock_mismatched" : "completion_lock_expired")
        }], 409, { recoveryRequired: true });
      }
      tx.set(importRef, {
        status: "completed",
        completedAt: assignedAt,
        compensated: false
      }, { merge: true });
      tx.delete(lockRef);
    });

    return { id: importId, summary: job.summary, idempotent: false };
  } catch (error) {
    if (error?.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || error?.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED") {
      throw error;
    }
    const compensation = await compensateStaffImport({
      db,
      admin,
      companyRef,
      importRef,
      importId,
      groupId: job.groupId,
      month: job.month,
      rows,
      lockRef
    });
    if (!compensation.ok) {
      throw new GroupMonthlyImportError(
        compensation.code || "MONTHLY_IMPORT_COMPENSATION_FAILED",
        compensation.details || [],
        409,
        { recoveryRequired: true }
      );
    }
    if (error instanceof GroupMonthlyImportError) {
      error.compensated = true;
      throw error;
    }
    throw new GroupMonthlyImportError(
      error?.code || "MONTHLY_IMPORT_COMMIT_FAILED",
      error?.details || [],
      error?.status || 409,
      { compensated: true }
    );
  }
}

module.exports = {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport,
  claimStaffMonthlyImportCommit,
  applyImportChunkTransaction,
  compensateStaffImport,
  isLockConsistentForImport,
  txGetAll,
  buildCanonicalImportShift,
  resolveImportBus,
  sameDutyIdentity,
  estimateJobBytes,
  assertJobSize,
  setStaffImportWriteChunkSizeForTests,
  setGetActiveServicePlanForTests,
  setAfterLockHookForTests,
  refreshScheduleMirrors,
  PREVIEW_TTL_MS,
  MAX_JOB_BYTES,
  DEFAULT_WRITE_CHUNK_SIZE,
  SCHEDULE_WRITE_CHUNK_SIZE
};

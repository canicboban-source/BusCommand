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
  constructor(code, details = [], status = 422) {
    super(code);
    this.name = "GroupMonthlyImportError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
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

async function assertNoActiveGroupMonthlyImport({ db, companyId, groupId, month }) {
  const ref = db.collection("companies").doc(companyId)
    .collection("monthly_plan_import_locks").doc(lockDocumentId(groupId, month));
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  const lock = snap.data() || {};
  const expiresAt = lock.expiresAt?.toDate ? lock.expiresAt.toDate() : new Date(lock.expiresAt || 0);
  if (expiresAt.getTime() <= Date.now()) {
    await ref.delete().catch(() => {});
    return { ok: true };
  }
  return { ok: false, code: "MONTHLY_IMPORT_IN_PROGRESS", importId: lock.importId || null };
}

function buildShiftDocument(row, groupId, actorId, importId, assignedAt) {
  return {
    driverId: row.driverId,
    driverName: row.driverName,
    groupId,
    date: row.date,
    type: row.type,
    name: row.name || "",
    bus: "",
    routeCode: row.routeCode || "",
    start: row.start || null,
    end: row.end || null,
    assignedBy: actorId,
    assignedAt,
    confirmedByDriver: false,
    revision: row.expectedRevision + 1,
    importId
  };
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
        else batch.set(ref, buildShiftDocument(row, job.groupId, actorId, importId, assignedAt));
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
  buildGroupMonthlyPreview,
  buildScheduleEntry,
  buildShiftDocument,
  commitGroupMonthlyImport,
  lockDocumentId,
  normalizeEid,
  prepareGroupMonthlyImport,
  revisionOf
};

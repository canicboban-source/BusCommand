const crypto = require("crypto");

class PlanImportValidationError extends Error {
  constructor(errors) {
    super("plan_import_validation_failed");
    this.name = "PlanImportValidationError";
    this.code = "PLAN_IMPORT_VALIDATION_FAILED";
    this.errors = errors;
  }
}

function revisionOf(shift) {
  const revision = Number(shift?.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function canonicalRow(row) {
  return {
    driverId: row.driverId,
    date: row.date,
    type: row.type,
    name: row.name || "",
    bus: row.bus || "",
    routeCode: row.routeCode || "",
    start: row.start || null,
    end: row.end || null,
    expectedRevision: row.expectedRevision
  };
}

function buildPlanImportPreview({ companyId, staffUid, payload, driversById, shiftsById }) {
  const errors = [];
  const seen = new Set();
  const inputRows = payload.rows.map(canonicalRow);

  inputRows.forEach((row, index) => {
    const rowNumber = index + 1;
    const key = `${row.driverId}|${row.date}`;
    if (seen.has(key)) {
      errors.push({ row: rowNumber, code: "DUPLICATE_ASSIGNMENT", driverId: row.driverId, date: row.date });
    }
    seen.add(key);

    if (!row.date.startsWith(`${payload.month}-`)) {
      errors.push({ row: rowNumber, code: "DATE_OUTSIDE_MONTH", driverId: row.driverId, date: row.date });
    }

    const driver = driversById.get(row.driverId);
    if (!driver) {
      errors.push({ row: rowNumber, code: "DRIVER_NOT_FOUND", driverId: row.driverId, date: row.date });
      return;
    }
    if (driver.active === false) {
      errors.push({ row: rowNumber, code: "DRIVER_INACTIVE", driverId: row.driverId, date: row.date });
    }
    const driverGroupId = driver.groupId || driver.lineId || null;
    if (driverGroupId !== payload.groupId) {
      errors.push({ row: rowNumber, code: "DRIVER_OUTSIDE_GROUP", driverId: row.driverId, date: row.date });
    }

    const existing = shiftsById.get(key) || null;
    const currentRevision = revisionOf(existing);
    if (row.expectedRevision !== currentRevision) {
      errors.push({
        row: rowNumber,
        code: "REVISION_CONFLICT",
        driverId: row.driverId,
        date: row.date,
        expectedRevision: row.expectedRevision,
        currentRevision
      });
    }
  });

  if (errors.length) throw new PlanImportValidationError(errors);

  const rows = [...inputRows].sort((left, right) => {
    return left.date.localeCompare(right.date) || left.driverId.localeCompare(right.driverId);
  });

  const fingerprintPayload = {
    companyId,
    staffUid,
    groupId: payload.groupId,
    month: payload.month,
    sourceName: payload.sourceName,
    reason: payload.reason,
    rows
  };
  const fingerprint = crypto.createHash("sha256")
    .update(JSON.stringify(fingerprintPayload))
    .digest("hex");

  const driverIds = new Set(rows.map((row) => row.driverId));
  return {
    fingerprint,
    groupId: payload.groupId,
    month: payload.month,
    sourceName: payload.sourceName,
    reason: payload.reason,
    summary: {
      rows: rows.length,
      drivers: driverIds.size,
      assignments: rows.filter((row) => row.type !== "clear").length,
      removals: rows.filter((row) => row.type === "clear").length
    }
  };
}

module.exports = {
  PlanImportValidationError,
  buildPlanImportPreview,
  canonicalRow,
  revisionOf
};

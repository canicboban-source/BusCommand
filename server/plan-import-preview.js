const crypto = require("crypto");

const ABSENCE_OR_CLEAR = new Set(["off", "vacation", "sick", "clear", "bereitschaft"]);

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

function dutyCodeOf(row) {
  return String(row.routeCode || row.name || "").trim().toUpperCase();
}

function busAllowsGroup(bus, groupId) {
  if (!bus || !groupId) return false;
  if (String(bus.groupId || bus.lineId || "") === groupId) return true;
  const ids = Array.isArray(bus.groupIds) ? bus.groupIds.map(String) : [];
  return ids.includes(String(groupId));
}

/**
 * @param {object} args
 * @param {Map} [args.dutiesByCode] uppercase duty code → duty (optional; when set, duty rows validated)
 * @param {Map} [args.busesByNumber] bus number → bus doc (optional; when set, non-empty bus validated)
 * @param {boolean} [args.requireDutyCatalog=false] when true, missing catalog rejects duty rows
 */
function buildPlanImportPreview({
  companyId,
  staffUid,
  payload,
  driversById,
  shiftsById,
  dutiesByCode = null,
  busesByNumber = null,
  requireDutyCatalog = false
}) {
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

    const needsDuty = !ABSENCE_OR_CLEAR.has(row.type);
    if (needsDuty) {
      const code = dutyCodeOf(row);
      if (!code) {
        errors.push({ row: rowNumber, code: "DUTY_CODE_REQUIRED", driverId: row.driverId, date: row.date });
      } else if (requireDutyCatalog && (!dutiesByCode || dutiesByCode.size === 0)) {
        errors.push({ row: rowNumber, code: "DUTY_CATALOG_MISSING", driverId: row.driverId, date: row.date });
      } else if (dutiesByCode && dutiesByCode.size > 0 && !dutiesByCode.has(code)) {
        errors.push({
          row: rowNumber,
          code: "DUTY_NOT_IN_ACTIVE_CATALOG",
          driverId: row.driverId,
          date: row.date,
          dutyCode: code
        });
      }
    }

    const busNumber = String(row.bus || "").trim();
    if (busNumber && busesByNumber) {
      const bus = busesByNumber.get(busNumber) || busesByNumber.get(busNumber.toUpperCase());
      if (!bus) {
        errors.push({
          row: rowNumber,
          code: "BUS_NOT_FOUND",
          driverId: row.driverId,
          date: row.date,
          bus: busNumber
        });
      } else if (bus.active === false) {
        errors.push({
          row: rowNumber,
          code: "BUS_INACTIVE",
          driverId: row.driverId,
          date: row.date,
          bus: busNumber
        });
      } else if (bus.opsStatus && bus.opsStatus !== "ready") {
        errors.push({
          row: rowNumber,
          code: "BUS_NOT_AVAILABLE",
          driverId: row.driverId,
          date: row.date,
          bus: busNumber,
          opsStatus: bus.opsStatus
        });
      } else if (!busAllowsGroup(bus, payload.groupId)) {
        errors.push({
          row: rowNumber,
          code: "BUS_OUTSIDE_GROUP",
          driverId: row.driverId,
          date: row.date,
          bus: busNumber
        });
      }
    }
  });

  if (errors.length) throw new PlanImportValidationError(errors);

  const rows = [...inputRows].sort((left, right) => {
    return left.date.localeCompare(right.date) || left.driverId.localeCompare(right.driverId);
  }).map((row) => {
    const key = `${row.driverId}|${row.date}`;
    const existing = shiftsById.get(key) || null;
    const driver = driversById.get(row.driverId) || {};
    const driverName = String(driver.name || `${driver.firstName || ""} ${driver.lastName || ""}`.trim() || "").trim();
    return {
      ...row,
      driverName,
      previous: existing
        ? {
          type: existing.type || null,
          name: existing.name || "",
          bus: existing.bus || "",
          routeCode: existing.routeCode || "",
          start: existing.start || null,
          end: existing.end || null,
          revision: revisionOf(existing),
          groupId: existing.groupId || null,
          driverName: existing.driverName || driverName || "",
          confirmedByDriver: existing.confirmedByDriver === true,
          confirmedAt: existing.confirmedAt ?? null,
          shiftFingerprint: existing.shiftFingerprint ?? null,
          confirmationSourceShiftDate: existing.confirmationSourceShiftDate ?? null,
          confirmationBoundRevision: existing.confirmationBoundRevision ?? revisionOf(existing),
          priorSnapshot: existing.priorSnapshot || { empty: true, revision: 0 },
          assignedBy: existing.assignedBy || null,
          assignedAt: existing.assignedAt || null,
          clearedAt: existing.clearedAt || null
        }
        : null
    };
  });

  const fingerprintPayload = {
    companyId,
    staffUid,
    groupId: payload.groupId,
    month: payload.month,
    sourceName: payload.sourceName,
    reason: payload.reason,
    rows: rows.map(({ previous: _previous, ...rest }) => rest)
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
    rows,
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
  revisionOf,
  ABSENCE_OR_CLEAR
};

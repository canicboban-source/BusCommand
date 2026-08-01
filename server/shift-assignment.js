/**
 * Canonical day assignment: one shift doc per driverId+date with optimistic revision.
 * Monthly schedule mirror is updated in the same transaction (view, not second source of truth).
 */

function shiftDocumentId(driverId, date) {
  return `${driverId}_${date}`;
}

function scheduleMonthFromDate(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

function scheduleDayNumber(dateStr) {
  const day = Number(String(dateStr || "").split("-")[2]);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function scheduleDocumentId(driverId, driverName, yearMonth) {
  // Prefer stable driverId key; keep name-based alias for legacy reads on client.
  return {
    canonical: `${driverId}_${yearMonth}`,
    legacyName: `${driverName}_${yearMonth}`
  };
}

function currentRevision(data) {
  const value = data?.revision;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function assertExpectedRevision(existingData, expectedRevision) {
  if (expectedRevision === undefined || expectedRevision === null) {
    return { ok: false, reason: "expected_revision_required" };
  }
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, reason: "invalid_expected_revision" };
  }
  const current = existingData ? currentRevision(existingData) : 0;
  if (existingData == null && expectedRevision !== 0) {
    return { ok: false, reason: "revision_conflict", currentRevision: 0, current: null };
  }
  if (existingData != null && current !== expectedRevision) {
    return {
      ok: false,
      reason: "revision_conflict",
      currentRevision: current,
      current: existingData
    };
  }
  return { ok: true, legacy: false, currentRevision: current };
}

function buildAssignedShift({ data, driverName, driverGroupId, staffUid, revision, assignedAt }) {
  return {
    driverId: data.driverId,
    groupId: driverGroupId,
    date: data.date,
    type: data.type,
    name: data.name || "",
    bus: data.bus || "",
    routeCode: data.routeCode || "",
    start: data.start || null,
    end: data.end || null,
    driverName,
    assignedBy: staffUid,
    assignedAt,
    confirmedByDriver: false,
    revision
  };
}

function buildScheduleDayEntry(shift) {
  return {
    type: shift.type,
    name: shift.name || shift.type,
    bus: shift.bus || null,
    routeCode: shift.routeCode || null,
    start: shift.start || null,
    end: shift.end || null
  };
}

module.exports = {
  shiftDocumentId,
  scheduleMonthFromDate,
  scheduleDayNumber,
  scheduleDocumentId,
  currentRevision,
  assertExpectedRevision,
  buildAssignedShift,
  buildScheduleDayEntry
};

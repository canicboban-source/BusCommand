/**
 * Canonical day assignment (§5).
 *
 * Source of truth: companies/{companyId}/shifts/{driverId}_{date}
 *   - Every mutate bumps `revision` (integer, start 0 for create).
 *   - Writers must send `expectedRevision`; mismatch → 409 REVISION_CONFLICT.
 *   - `confirmedByDriver` is always reset on staff mutate; confirmations bind
 *     to `confirmationBoundRevision` (= revision after the write).
 *
 * Mirror (not a second SoT): companies/{companyId}/schedules/{driverId}_{YYYY-MM}
 *   - Updated in the same transaction as the shift write.
 *   - Client may READ day cells from the mirror when no shift doc is loaded yet.
 *   - Client must NEVER write schedules/shifts except via PUT /api/staff/shifts/assignment.
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

/**
 * Two concurrent writers: the second must see the first writer's revision or
 * lose with revision_conflict. Pure helper used by tests and documented as the
 * concurrency contract for PUT /api/staff/shifts/assignment.
 */
function simulateOptimisticWrite(existingData, expectedRevision, nextPayload) {
  const check = assertExpectedRevision(existingData, expectedRevision);
  if (!check.ok) {
    return {
      ok: false,
      code: "REVISION_CONFLICT",
      currentRevision: check.currentRevision ?? 0,
      current: check.current || existingData || null
    };
  }
  const revision = currentRevision(existingData) + 1;
  const shift = buildAssignedShift({
    data: nextPayload.data,
    driverName: nextPayload.driverName,
    driverGroupId: nextPayload.driverGroupId,
    staffUid: nextPayload.staffUid,
    revision,
    assignedAt: nextPayload.assignedAt || "ts"
  });
  return { ok: true, revision, shift };
}

function buildAssignedShift({ data, driverName, driverGroupId, staffUid, revision, assignedAt, priorSnapshot }) {
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
    // Any staff mutate invalidates a prior driver confirmation (§5 / §10).
    confirmedByDriver: false,
    confirmedAt: null,
    shiftFingerprint: null,
    confirmationSourceShiftDate: null,
    confirmationBoundRevision: revision,
    revision,
    priorSnapshot: priorSnapshot || { empty: true, revision: 0 }
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

/**
 * One-level undo stack (§7 / Ch8). Captures the assignment state before a
 * staff mutate so undo can restore without deleting audit history.
 */
function capturePriorSnapshot(existing) {
  if (!existing || existing.type === "clear") {
    return {
      empty: true,
      revision: existing ? currentRevision(existing) : 0
    };
  }
  return {
    empty: false,
    revision: currentRevision(existing),
    type: existing.type,
    name: existing.name || "",
    bus: existing.bus || "",
    routeCode: existing.routeCode || "",
    start: existing.start || null,
    end: existing.end || null
  };
}

function buildClearedShift({ data, driverName, driverGroupId, staffUid, revision, priorSnapshot, assignedAt }) {
  return {
    driverId: data.driverId,
    groupId: driverGroupId,
    date: data.date,
    type: "clear",
    name: "",
    bus: "",
    routeCode: "",
    start: null,
    end: null,
    driverName,
    assignedBy: staffUid,
    assignedAt,
    confirmedByDriver: false,
    confirmedAt: null,
    shiftFingerprint: null,
    confirmationSourceShiftDate: null,
    confirmationBoundRevision: revision,
    revision,
    priorSnapshot: priorSnapshot || { empty: true, revision: 0 },
    clearedAt: assignedAt
  };
}

/**
 * Pure undo helper: given current shift + expectedRevision, produce next write.
 * Used by API and unit tests — does not touch Firestore.
 */
function simulateUndoWrite(existingData, expectedRevision) {
  const check = assertExpectedRevision(existingData, expectedRevision);
  if (!check.ok) {
    return {
      ok: false,
      code: "REVISION_CONFLICT",
      currentRevision: check.currentRevision ?? 0,
      current: check.current || existingData || null
    };
  }
  if (!existingData || !existingData.priorSnapshot) {
    return { ok: false, code: "NOTHING_TO_UNDO", currentRevision: check.currentRevision };
  }
  const prior = existingData.priorSnapshot;
  const revision = currentRevision(existingData) + 1;
  const undoneSnapshot = capturePriorSnapshot(existingData);
  if (prior.empty === true) {
    return {
      ok: true,
      revision,
      deleted: true,
      priorSnapshot: undoneSnapshot,
      shift: null
    };
  }
  return {
    ok: true,
    revision,
    deleted: false,
    priorSnapshot: undoneSnapshot,
    restore: {
      type: prior.type,
      name: prior.name || "",
      bus: prior.bus || "",
      routeCode: prior.routeCode || "",
      start: prior.start || null,
      end: prior.end || null
    }
  };
}

/** Preview how many day cells a mass absence fill would touch (inclusive). */
function previewMassDayRange(fromDay, toDay, totalDays) {
  const from = Number(fromDay);
  const to = Number(toDay);
  const max = Number(totalDays);
  if (!Number.isInteger(from) || !Number.isInteger(to) || !Number.isInteger(max)) {
    return { ok: false, reason: "invalid_range" };
  }
  if (from < 1 || to < 1 || from > max || to > max || from > to) {
    return { ok: false, reason: "invalid_range" };
  }
  const days = [];
  for (let d = from; d <= to; d += 1) days.push(d);
  return { ok: true, days, affectedCount: days.length };
}

/**
 * A driver confirmation is valid only for the revision that was active when
 * they confirmed. Staff edits bump revision and clear confirmedByDriver; if a
 * stale confirm payload arrives with an older bound revision, reject it.
 */
function assertConfirmationMatchesRevision(shiftData, claimedBoundRevision) {
  if (!shiftData || shiftData.confirmedByDriver !== true) {
    return { ok: false, reason: "not_confirmed" };
  }
  const bound = Number.isInteger(shiftData.confirmationBoundRevision)
    ? shiftData.confirmationBoundRevision
    : currentRevision(shiftData);
  const claimed = Number.isInteger(claimedBoundRevision) ? claimedBoundRevision : bound;
  if (claimed !== currentRevision(shiftData) || claimed !== bound) {
    return {
      ok: false,
      reason: "confirmation_revision_mismatch",
      currentRevision: currentRevision(shiftData),
      confirmationBoundRevision: bound
    };
  }
  return { ok: true, confirmationBoundRevision: bound };
}

module.exports = {
  shiftDocumentId,
  scheduleMonthFromDate,
  scheduleDayNumber,
  scheduleDocumentId,
  currentRevision,
  assertExpectedRevision,
  simulateOptimisticWrite,
  buildAssignedShift,
  buildScheduleDayEntry,
  assertConfirmationMatchesRevision,
  capturePriorSnapshot,
  buildClearedShift,
  simulateUndoWrite,
  previewMassDayRange
};

"use strict";

/**
 * Shared replacement eligibility contract (Radar + coverage modal + server).
 * Browser-safe: no Firebase, no credentials, no geo/distance claims.
 * Rest math uses the tenant IANA zone so DST is measured in real elapsed time.
 * Activation is STRICT: only codeActivated === true is eligible.
 * Locale strings live in replacement-eligibility-i18n.cjs.
 */

const MIN_REST_MS = 11 * 60 * 60 * 1000;
const NEIGHBOR_DAY_RADIUS = 3;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE = "Europe/Vienna";

const WORKING_TYPES = new Set(["morning", "afternoon", "night"]);
const TIMED_DUTY_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft", "standby"]);
const TARGET_DAY_BUSY_TYPES = new Set(["morning", "afternoon", "night"]);
const ABSENCE_SHIFT_TYPES = new Set(["vacation", "sick"]);
const APPROVED_ABSENCE_STATUSES = new Set(["approved", "odobreno"]);
const PENDING_ABSENCE_STATUSES = new Set(["pending", "na čekanju"]);

const BLOCK = Object.freeze({
  WRONG_TENANT: "WRONG_TENANT",
  DRIVER_NOT_FOUND: "DRIVER_NOT_FOUND",
  DRIVER_INACTIVE: "DRIVER_INACTIVE",
  DRIVER_NOT_ACTIVATED: "DRIVER_NOT_ACTIVATED",
  SAME_DRIVER: "SAME_DRIVER",
  UNKNOWN_GROUP: "UNKNOWN_GROUP",
  DUTY_OVERLAP: "DUTY_OVERLAP",
  APPROVED_ABSENCE: "APPROVED_ABSENCE",
  REST_TIMES_UNKNOWN: "REST_TIMES_UNKNOWN",
  REST_BEFORE_INSUFFICIENT: "REST_BEFORE_INSUFFICIENT",
  REST_AFTER_INSUFFICIENT: "REST_AFTER_INSUFFICIENT",
  DUTY_ALREADY_ASSIGNED: "DUTY_ALREADY_ASSIGNED",
  BUS_NOT_AVAILABLE: "BUS_NOT_AVAILABLE",
  DRIVER_NOT_AVAILABLE: "DRIVER_NOT_AVAILABLE",
  REVISION_CONFLICT: "REVISION_CONFLICT"
});

const WARN = Object.freeze({
  PENDING_ABSENCE: "PENDING_ABSENCE"
});

function rowMatchesDriverAndTenant(row, driverId, tenantId) {
  if (String(row?.driverId || "").trim() !== String(driverId || "").trim()) return false;
  const rowTenant = String(row?.companyId || "").trim();
  if (tenantId && rowTenant && rowTenant !== tenantId) return false;
  return true;
}

function addDays(dateString, count) {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function neighborDates(targetDate, radius = NEIGHBOR_DAY_RADIUS) {
  if (!DATE_RE.test(String(targetDate || ""))) return [];
  const dates = [];
  for (let offset = -radius; offset <= radius; offset += 1) {
    dates.push(addDays(targetDate, offset));
  }
  return dates;
}

function validTimezone(timezone) {
  try {
    Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function resolveTimezone(timezone) {
  return validTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDateTimeToUtc(dateString, time, timezone) {
  if (!DATE_RE.test(dateString) || !TIME_RE.test(time) || !validTimezone(timezone)) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetAsUtc;
  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(new Date(guess), timezone);
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    guess += targetAsUtc - representedAsUtc;
  }
  return new Date(guess);
}

function normalizeType(shift) {
  return String(shift?.type || "").trim().toLowerCase();
}

function hasTimes(shift) {
  return TIME_RE.test(String(shift?.start || "")) && TIME_RE.test(String(shift?.end || ""));
}

function shiftWindow(shift, dateString, timezone) {
  if (!shift || !hasTimes(shift)) return null;
  const zone = resolveTimezone(timezone);
  const startAt = localDateTimeToUtc(dateString, shift.start, zone);
  let endAt = localDateTimeToUtc(dateString, shift.end, zone);
  if (!startAt || !endAt) return null;
  if (endAt <= startAt) endAt = localDateTimeToUtc(addDays(dateString, 1), shift.end, zone);
  return endAt ? { startAt, endAt } : null;
}

function windowsOverlap(left, right) {
  if (!left || !right) return false;
  return left.startAt < right.endAt && right.startAt < left.endAt;
}

function driverIdOf(driver) {
  return String(driver?.id || driver?.uid || driver?.driverId || "").trim();
}

function homeGroupId(driver) {
  return String(driver?.groupId || driver?.lineId || "").trim();
}

function normalizeKnownGroupIds(driver) {
  const primary = homeGroupId(driver);
  const raw = Array.isArray(driver?.knownGroupIds) ? driver.knownGroupIds : [];
  const ids = [];
  for (const value of raw) {
    const id = String(value || "").trim();
    if (!id || id === primary || ids.includes(id)) continue;
    ids.push(id);
  }
  if (primary) ids.unshift(primary);
  return ids;
}

function driverKnowsGroup(driver, groupId) {
  const target = String(groupId || "").trim();
  if (!target) return false;
  return normalizeKnownGroupIds(driver).includes(target);
}

function normalizeAbsenceStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function datesOverlapInclusive(startA, endA, startB, endB) {
  if (!DATE_RE.test(startA) || !DATE_RE.test(endA) || !DATE_RE.test(startB) || !DATE_RE.test(endB)) return false;
  return startA <= endB && endA >= startB;
}

function absenceOverlapsDate(absence, dateStr) {
  const start = String(absence?.start || absence?.from || "").slice(0, 10);
  const end = String(absence?.end || absence?.to || start).slice(0, 10);
  return datesOverlapInclusive(start, end, dateStr, dateStr);
}

function isApprovedAbsence(absence) {
  return APPROVED_ABSENCE_STATUSES.has(normalizeAbsenceStatus(absence?.status));
}

function isPendingAbsence(absence) {
  return PENDING_ABSENCE_STATUSES.has(normalizeAbsenceStatus(absence?.status));
}

function scheduleDayEntry(schedules, dateString, driverId) {
  const month = String(dateString || "").slice(0, 7);
  const day = Number(String(dateString || "").slice(8, 10));
  if (!month || !Number.isInteger(day)) return null;
  const list = Array.isArray(schedules) ? schedules : [];
  const owner = String(driverId || "").trim();
  const owned = owner
    ? list.filter((entry) =>
      String(entry?.driverId || "").trim() === owner
      || String(entry?.id || "").startsWith(`${owner}_`)
    )
    : list;
  const search = owned.length ? owned : (owner ? [] : list);
  const schedule = search.find((entry) => String(entry?.month || entry?.id || "").includes(month) && entry?.parsedShifts)
    || search.find((entry) => String(entry?.month || "") === month);
  if (!schedule?.parsedShifts) return null;
  return schedule.parsedShifts[day] || schedule.parsedShifts[String(day)] || null;
}

function dutyForDate({ shifts = [], schedules = [], tenantId = "" }, dateString, driverId) {
  const id = String(driverId || "").trim();
  const direct = (shifts || []).find((entry) =>
    String(entry?.date || "") === dateString
    && rowMatchesDriverAndTenant(entry, id, tenantId)
  );
  if (direct) {
    if (normalizeType(direct) === "clear") return { ...direct, date: dateString, source: "shift", type: "clear" };
    return { ...direct, date: dateString, source: "shift" };
  }
  const scheduled = scheduleDayEntry(schedules, dateString, id);
  if (!scheduled) return null;
  return { ...scheduled, date: dateString, source: "schedule_mirror" };
}

function collectCandidateDuties({ shifts, schedules, driverId, targetDate, timezone, tenantId }) {
  const dates = neighborDates(targetDate);
  return dates.map((date) => {
    const duty = dutyForDate({ shifts, schedules, tenantId }, date, driverId);
    if (!duty) return { date, duty: null, window: null };
    return { date, duty, window: shiftWindow(duty, date, timezone) };
  });
}

function block(code, extra = {}) {
  return { code, ...extra };
}

function restMinutes(fromMs, toMs) {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
  return Math.round((toMs - fromMs) / 60000);
}

function evaluateReplacementEligibility(input = {}) {
  const hardBlocks = [];
  const warnings = [];
  const candidate = input.candidate || null;
  const candidateId = driverIdOf(candidate);
  const originalDriverId = String(input.originalDriverId || "").trim();
  const tenantId = String(input.tenantId || input.companyId || "").trim();
  const candidateTenant = String(candidate?.companyId || "").trim();
  const targetGroupId = String(input.targetGroupId || "").trim();
  const targetDate = String(input.targetShift?.date || input.targetDate || "").trim();
  const timezone = resolveTimezone(input.timezone);
  const targetShift = { ...(input.targetShift || {}), date: targetDate };

  if (!candidate || !candidateId) hardBlocks.push(block(BLOCK.DRIVER_NOT_FOUND));
  if (tenantId && candidateTenant && tenantId !== candidateTenant) hardBlocks.push(block(BLOCK.WRONG_TENANT));
  if (candidate && candidate.active === false) hardBlocks.push(block(BLOCK.DRIVER_INACTIVE));
  if (candidate && candidate.codeActivated !== true) {
    hardBlocks.push(block(BLOCK.DRIVER_NOT_ACTIVATED));
  }
  if (candidateId && originalDriverId && candidateId === originalDriverId) hardBlocks.push(block(BLOCK.SAME_DRIVER));
  if (candidate && targetGroupId && !driverKnowsGroup(candidate, targetGroupId)) {
    hardBlocks.push(block(BLOCK.UNKNOWN_GROUP));
  }

  if (input.conflicts?.revision) hardBlocks.push(block(BLOCK.REVISION_CONFLICT));
  if (input.conflicts?.bus) hardBlocks.push(block(BLOCK.BUS_NOT_AVAILABLE));
  if (input.conflicts?.driver) hardBlocks.push(block(BLOCK.DRIVER_NOT_AVAILABLE));
  if (input.conflicts?.dutyGuard) hardBlocks.push(block(BLOCK.DUTY_ALREADY_ASSIGNED));

  const absences = Array.isArray(input.absences) ? input.absences : [];
  const ownAbsences = absences.filter((row) => rowMatchesDriverAndTenant(row, candidateId, tenantId));
  if (DATE_RE.test(targetDate)) {
    if (ownAbsences.some((row) => isApprovedAbsence(row) && absenceOverlapsDate(row, targetDate))) {
      hardBlocks.push(block(BLOCK.APPROVED_ABSENCE));
    }
    if (ownAbsences.some((row) => isPendingAbsence(row) && absenceOverlapsDate(row, targetDate))) {
      warnings.push({ code: WARN.PENDING_ABSENCE });
    }
  }

  const duties = DATE_RE.test(targetDate)
    ? collectCandidateDuties({
      shifts: input.shifts || [],
      schedules: input.schedules || [],
      driverId: candidateId,
      targetDate,
      timezone,
      tenantId
    })
    : [];
  const targetDay = duties.find((row) => row.date === targetDate) || null;
  const targetDayType = normalizeType(targetDay?.duty);
  if (ABSENCE_SHIFT_TYPES.has(targetDayType)) {
    if (!hardBlocks.some((row) => row.code === BLOCK.APPROVED_ABSENCE)) {
      hardBlocks.push(block(BLOCK.APPROVED_ABSENCE));
    }
  }
  if (TARGET_DAY_BUSY_TYPES.has(targetDayType)) {
    hardBlocks.push(block(BLOCK.DUTY_OVERLAP));
  }

  const targetWindow = shiftWindow(targetShift, targetDate, timezone);
  if (!targetWindow) {
    hardBlocks.push(block(BLOCK.REST_TIMES_UNKNOWN, { side: "target" }));
  } else {
    for (const row of duties) {
      if (!row.duty || row.date === targetDate) continue;
      const type = normalizeType(row.duty);
      if (!TIMED_DUTY_TYPES.has(type) && !WORKING_TYPES.has(type)) continue;
      if (WORKING_TYPES.has(type) && !row.window) {
        hardBlocks.push(block(BLOCK.REST_TIMES_UNKNOWN, { side: "neighbor", date: row.date }));
        continue;
      }
      if (row.window && windowsOverlap(row.window, targetWindow)) {
        hardBlocks.push(block(BLOCK.DUTY_OVERLAP, { date: row.date }));
      }
    }
  }

  let previous = null;
  let next = null;
  if (targetWindow) {
    const dated = duties.filter((row) => row.duty && row.date !== targetDate);
    const previousCandidates = dated.filter((row) => {
      const type = normalizeType(row.duty);
      return WORKING_TYPES.has(type) || (TIMED_DUTY_TYPES.has(type) && row.window);
    });
    previous = previousCandidates
      .filter((row) => row.window && row.window.endAt.getTime() <= targetWindow.startAt.getTime())
      .sort((a, b) => b.window.endAt - a.window.endAt)[0] || null;
    next = previousCandidates
      .filter((row) => row.window && row.window.startAt.getTime() >= targetWindow.endAt.getTime())
      .sort((a, b) => a.window.startAt - b.window.startAt)[0] || null;

    const untimedWorkingPrev = dated.find((row) =>
      WORKING_TYPES.has(normalizeType(row.duty))
      && !row.window
      && row.date < targetDate
    );
    const untimedWorkingNext = dated.find((row) =>
      WORKING_TYPES.has(normalizeType(row.duty))
      && !row.window
      && row.date > targetDate
    );
    if (untimedWorkingPrev && !previous) {
      hardBlocks.push(block(BLOCK.REST_TIMES_UNKNOWN, { side: "before", date: untimedWorkingPrev.date }));
    }
    if (untimedWorkingNext && !next) {
      hardBlocks.push(block(BLOCK.REST_TIMES_UNKNOWN, { side: "after", date: untimedWorkingNext.date }));
    }
  }

  let restBeforeMinutes = null;
  let restAfterMinutes = null;
  if (targetWindow && previous?.window) {
    restBeforeMinutes = restMinutes(previous.window.endAt.getTime(), targetWindow.startAt.getTime());
    if (restBeforeMinutes == null || (restBeforeMinutes * 60000) < MIN_REST_MS) {
      hardBlocks.push(block(BLOCK.REST_BEFORE_INSUFFICIENT, { minutes: restBeforeMinutes }));
    }
  }
  if (targetWindow && next?.window) {
    restAfterMinutes = restMinutes(targetWindow.endAt.getTime(), next.window.startAt.getTime());
    if (restAfterMinutes == null || (restAfterMinutes * 60000) < MIN_REST_MS) {
      hardBlocks.push(block(BLOCK.REST_AFTER_INSUFFICIENT, { minutes: restAfterMinutes }));
    }
  }

  const uniqueBlocks = [];
  const seen = new Set();
  for (const row of hardBlocks) {
    const key = `${row.code}|${row.side || ""}|${row.date || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueBlocks.push(row);
  }

  const knowsTarget = Boolean(candidate && targetGroupId && driverKnowsGroup(candidate, targetGroupId));
  const sameHomeGroup = Boolean(targetGroupId && homeGroupId(candidate) === targetGroupId);
  const restReserveMinutes = [restBeforeMinutes, restAfterMinutes]
    .filter((value) => Number.isFinite(value))
    .reduce((min, value) => (min == null ? value : Math.min(min, value)), null);

  const ranking = {
    knowsTarget,
    sameHomeGroup,
    restReserveMinutes,
    nameKey: String(candidate?.name || `${candidate?.lastName || ""} ${candidate?.firstName || ""}`.trim() || candidateId),
    driverId: candidateId
  };

  return {
    eligible: uniqueBlocks.length === 0,
    hardBlocks: uniqueBlocks,
    warnings,
    ranking,
    restBeforeMinutes,
    restAfterMinutes
  };
}

function compareReplacementRanking(left, right) {
  const a = left?.ranking || left || {};
  const b = right?.ranking || right || {};
  if (Boolean(a.knowsTarget) !== Boolean(b.knowsTarget)) return a.knowsTarget ? -1 : 1;
  if (Boolean(a.sameHomeGroup) !== Boolean(b.sameHomeGroup)) return a.sameHomeGroup ? -1 : 1;
  const aRest = Number.isFinite(a.restReserveMinutes) ? a.restReserveMinutes : Number.POSITIVE_INFINITY;
  const bRest = Number.isFinite(b.restReserveMinutes) ? b.restReserveMinutes : Number.POSITIVE_INFINITY;
  if (aRest !== bRest) return bRest - aRest;
  const nameCmp = String(a.nameKey || "").localeCompare(String(b.nameKey || ""), undefined, { sensitivity: "base" });
  if (nameCmp) return nameCmp;
  return String(a.driverId || "").localeCompare(String(b.driverId || ""));
}

function listEligibleReplacementDrivers(input = {}) {
  const drivers = Array.isArray(input.drivers) ? input.drivers : [];
  const allShifts = Array.isArray(input.shifts) ? input.shifts : [];
  const allSchedules = Array.isArray(input.schedules) ? input.schedules : [];
  const allAbsences = Array.isArray(input.absences) ? input.absences : [];
  const rows = [];
  for (const driver of drivers) {
    const id = driverIdOf(driver);
    const evaluation = evaluateReplacementEligibility({
      ...input,
      candidate: driver,
      shifts: allShifts.filter((row) => rowMatchesDriverAndTenant(row, id, input.tenantId || input.companyId)),
      schedules: allSchedules.filter((row) =>
        String(row?.driverId || "") === id || String(row?.id || "").startsWith(`${id}_`)
      ),
      absences: allAbsences.filter((row) => rowMatchesDriverAndTenant(row, id, input.tenantId || input.companyId))
    });
    if (!evaluation.eligible) continue;
    rows.push({
      driver,
      id,
      ...evaluation
    });
  }
  rows.sort(compareReplacementRanking);
  return rows;
}

function auditEligibilitySnapshot(evaluation) {
  if (!evaluation) return {};
  return {
    eligible: evaluation.eligible === true,
    hardBlocks: (evaluation.hardBlocks || []).map((row) => row.code),
    warnings: (evaluation.warnings || []).map((row) => row.code),
    restBeforeMinutes: Number.isFinite(evaluation.restBeforeMinutes) ? evaluation.restBeforeMinutes : null,
    restAfterMinutes: Number.isFinite(evaluation.restAfterMinutes) ? evaluation.restAfterMinutes : null,
    sameHomeGroup: evaluation.ranking?.sameHomeGroup === true,
    knowsTarget: evaluation.ranking?.knowsTarget === true
  };
}

module.exports = {
  MIN_REST_MS,
  NEIGHBOR_DAY_RADIUS,
  BLOCK,
  WARN,
  addDays,
  neighborDates,
  shiftWindow,
  localDateTimeToUtc,
  driverKnowsGroup,
  evaluateReplacementEligibility,
  listEligibleReplacementDrivers,
  compareReplacementRanking,
  auditEligibilitySnapshot,
  dutyForDate
};

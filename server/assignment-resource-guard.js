/**
 * Server authority for live shift assignment resource integrity (FAZA 3).
 * Pure helpers — no Firestore I/O. Reuses import-era error codes where possible.
 */

const { busHasGroup } = require("./bus-group-membership");

const ACTIVE_DUTY_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft"]);
/** Assignable opsStatus values (D21) — Aktivan and Rezerva both count as available. */
const ASSIGNABLE_BUS_STATUSES = new Set(["active", "reserve"]);

function normalizeBusNumber(bus) {
  return String(bus || "").trim().toLowerCase();
}

function parseHmToMinutes(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Inclusive overlap; overnight end<=start extends end by 24h (and checks ±1 day). */
function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const as0 = parseHmToMinutes(aStart);
  const ae0 = parseHmToMinutes(aEnd);
  const bs0 = parseHmToMinutes(bStart);
  const be0 = parseHmToMinutes(bEnd);
  // Missing times → same calendar day is a potential conflict (hard fail).
  if (as0 == null || ae0 == null || bs0 == null || be0 == null) return true;

  function expanded(start, end) {
    let e = end;
    if (e <= start) e += 24 * 60;
    return [
      [start, e],
      [start - 24 * 60, e - 24 * 60],
      [start + 24 * 60, e + 24 * 60]
    ];
  }

  for (const [as, ae] of expanded(as0, ae0)) {
    for (const [bs, be] of expanded(bs0, be0)) {
      if (as < be && bs < ae) return true;
    }
  }
  return false;
}

function isActiveDutyType(type) {
  return ACTIVE_DUTY_TYPES.has(String(type || "").toLowerCase());
}

/**
 * Validate bus exists, active, opsStatus (keep-current exception), pool membership.
 * @param {{ bus: object|null, busNumber: string, groupId: string, existingBusNumber?: string|null }} args
 */
function evaluateBusResource({ bus, busNumber, groupId, existingBusNumber = null }) {
  const number = String(busNumber || "").trim();
  if (!number) return { ok: true, skipped: true };

  if (!bus) {
    return { ok: false, code: "BUS_NOT_FOUND", bus: number };
  }
  if (bus.active === false) {
    return { ok: false, code: "BUS_INACTIVE", bus: number };
  }

  const keepCurrent = normalizeBusNumber(existingBusNumber) === normalizeBusNumber(number)
    && normalizeBusNumber(number) !== "";
  const opsStatus = String(bus.opsStatus || "active").trim().toLowerCase() || "active";
  if (!ASSIGNABLE_BUS_STATUSES.has(opsStatus) && !keepCurrent) {
    return {
      ok: false,
      code: "BUS_NOT_AVAILABLE",
      bus: number,
      opsStatus
    };
  }

  if (!busHasGroup(bus, groupId)) {
    return { ok: false, code: "BUS_OUTSIDE_GROUP", bus: number };
  }

  return { ok: true, keepCurrent, opsStatus };
}

/**
 * Find overlapping active bus assignments (same day, any group).
 * @param {Array<object>} shifts
 * @param {{ bus: string, date: string, excludeDriverId?: string|null, excludeShiftId?: string|null, start?: string|null, end?: string|null }} query
 */
function findOverlappingBusAssignments(shifts, query = {}) {
  const busKey = normalizeBusNumber(query.bus);
  const date = String(query.date || "");
  const excludeDriverId = query.excludeDriverId != null ? String(query.excludeDriverId) : "";
  const excludeShiftId = query.excludeShiftId != null ? String(query.excludeShiftId) : "";
  if (!busKey || !date) return [];

  const hits = [];
  for (const shift of shifts || []) {
    if (excludeShiftId && String(shift.id || "") === excludeShiftId) continue;
    if (normalizeBusNumber(shift?.bus) !== busKey) continue;
    if (String(shift?.date || "") !== date) continue;
    if (!isActiveDutyType(shift?.type)) continue;

    const otherDriverId = shift.driverId != null ? String(shift.driverId) : "";
    if (excludeDriverId && otherDriverId && otherDriverId === excludeDriverId) continue;

    if (!timeRangesOverlap(query.start, query.end, shift.start, shift.end)) continue;

    hits.push({
      bus: String(shift.bus || query.bus),
      date,
      groupId: String(shift.groupId || shift.lineId || ""),
      driverId: otherDriverId || null,
      driverName: String(shift.driverName || ""),
      type: String(shift.type || "").toLowerCase(),
      start: shift.start || null,
      end: shift.end || null,
      shiftId: shift.id || null
    });
  }
  return hits;
}

/**
 * Duty code against active catalog (when a code is provided).
 * @param {{ type: string, dutyCode?: string|null, start?: string|null, end?: string|null, dutiesByCode?: Map|null }} args
 */
function evaluateDutyAgainstCatalog({ type, dutyCode, start = null, end = null, dutiesByCode = null }) {
  if (!isActiveDutyType(type)) return { ok: true, skipped: true };

  const code = String(dutyCode || "").trim();
  if (!code) return { ok: true, skipped: true };

  if (!dutiesByCode || dutiesByCode.size === 0) {
    return { ok: false, code: "DUTY_CATALOG_MISSING", dutyCode: code };
  }

  const upper = code.toUpperCase();
  const duty = dutiesByCode.get(code) || dutiesByCode.get(upper) || null;
  if (!duty) {
    return { ok: false, code: "DUTY_NOT_IN_ACTIVE_CATALOG", dutyCode: code };
  }

  const catalogStart = duty.start || duty.workStart || null;
  const catalogEnd = duty.end || duty.workEnd || null;
  const providedStart = start || null;
  const providedEnd = end || null;
  if (providedStart && catalogStart && String(providedStart) !== String(catalogStart)) {
    return {
      ok: false,
      code: "DUTY_TIME_MISMATCH",
      dutyCode: code,
      expectedStart: catalogStart,
      expectedEnd: catalogEnd || null
    };
  }
  if (providedEnd && catalogEnd && String(providedEnd) !== String(catalogEnd)) {
    return {
      ok: false,
      code: "DUTY_TIME_MISMATCH",
      dutyCode: code,
      expectedStart: catalogStart || null,
      expectedEnd: catalogEnd
    };
  }

  return {
    ok: true,
    duty,
    start: providedStart || catalogStart || null,
    end: providedEnd || catalogEnd || null
  };
}

function assignmentResourceErrorMessage(code) {
  switch (code) {
    case "BUS_NOT_FOUND":
      return "Autobus nije pronađen u voznom parku firme.";
    case "BUS_INACTIVE":
      return "Autobus nije aktivan.";
    case "BUS_NOT_AVAILABLE":
      return "Autobus nije spreman za dodelu (opsStatus).";
    case "BUS_OUTSIDE_GROUP":
      return "Autobus nije u dozvoljenom poolu za ovu grupu.";
    case "BUS_DOUBLE_BOOKED":
      return "Autobus je već dodeljen drugoj aktivnoj smeni u konfliktnom intervalu.";
    case "DUTY_CATALOG_MISSING":
      return "Nema aktivnog kataloga smena za ovu grupu.";
    case "DUTY_NOT_IN_ACTIVE_CATALOG":
      return "Kod smene nije u aktivnom katalogu.";
    case "DUTY_TIME_MISMATCH":
      return "Vreme smene ne odgovara aktivnom katalogu.";
    case "STAFF_SESSION_INVALID":
      return "Sesija disponenta više nije važeća. Prijavite se ponovo.";
    case "DRIVER_SCOPE_CHANGED":
      return "Grupa vozača je promenjena. Osvežite plan i ponovo preuzmite zaključavanje.";
    case "DRIVER_INACTIVE":
      return "Vozač nije aktivan i ne može primiti novu dodelu.";
    default:
      return "Dodela smene nije dozvoljena.";
  }
}

module.exports = {
  ACTIVE_DUTY_TYPES,
  ASSIGNABLE_BUS_STATUSES,
  normalizeBusNumber,
  parseHmToMinutes,
  timeRangesOverlap,
  isActiveDutyType,
  evaluateBusResource,
  findOverlappingBusAssignments,
  evaluateDutyAgainstCatalog,
  assignmentResourceErrorMessage
};

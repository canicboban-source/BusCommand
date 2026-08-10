/**
 * Bus overlap detection for local preflight (server remains authority).
 * Conflicting interval = hard block — never "warn but save".
 */

const ACTIVE_DUTY_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft"]);

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

/** Inclusive overlap on a timeline; overnight end<=start extends end by 24h (and checks ±1 day). */
function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  const as0 = parseHmToMinutes(aStart);
  const ae0 = parseHmToMinutes(aEnd);
  const bs0 = parseHmToMinutes(bStart);
  const be0 = parseHmToMinutes(bEnd);
  // Missing times → treat same calendar day as potential conflict.
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

function resolveShiftGroupId(shift, drivers = []) {
  const direct = shift?.groupId || shift?.lineId || null;
  if (direct) return String(direct);
  const driverId = shift?.driverId;
  const driverName = shift?.driverName;
  const hit = (drivers || []).find((d) =>
    (driverId && String(d.id) === String(driverId))
    || (driverName && String(d.name) === String(driverName))
  );
  return hit ? String(hit.groupId || hit.lineId || "") : "";
}

/**
 * Overlapping active bus duties on the same date (any group — hard conflict).
 * @param {Array<object>} shifts
 * @param {{ bus: string, date: string, excludeDriverId?: string|null, start?: string|null, end?: string|null, drivers?: Array<object> }} query
 */
function findOverlappingBusConflicts(shifts, query = {}) {
  const busKey = normalizeBusNumber(query.bus);
  const date = String(query.date || "");
  const excludeDriverId = query.excludeDriverId != null ? String(query.excludeDriverId) : "";
  const drivers = query.drivers || [];
  if (!busKey || !date) return [];

  const hits = [];
  for (const shift of shifts || []) {
    if (normalizeBusNumber(shift?.bus) !== busKey) continue;
    if (String(shift?.date || "") !== date) continue;
    const type = String(shift?.type || "").toLowerCase();
    if (!ACTIVE_DUTY_TYPES.has(type)) continue;

    const otherDriverId = shift.driverId != null ? String(shift.driverId) : "";
    if (excludeDriverId && otherDriverId && otherDriverId === excludeDriverId) continue;

    if (!timeRangesOverlap(query.start, query.end, shift.start, shift.end)) continue;

    hits.push({
      bus: String(shift.bus || query.bus),
      date,
      groupId: resolveShiftGroupId(shift, drivers),
      driverId: otherDriverId || null,
      driverName: String(shift.driverName || ""),
      type,
      start: shift.start || null,
      end: shift.end || null
    });
  }
  return hits;
}

/** @deprecated use findOverlappingBusConflicts — kept as alias for cross-group callers. */
function findCrossGroupBusConflicts(shifts, query = {}) {
  const targetGroup = String(query.groupId || "");
  return findOverlappingBusConflicts(shifts, query).filter((hit) => {
    if (!targetGroup) return true;
    return hit.groupId && hit.groupId !== targetGroup;
  });
}

function formatBusConflictBlock(conflicts, translate) {
  const first = conflicts?.[0];
  if (!first) return "";
  const tFn = typeof translate === "function" ? translate : (k) => k;
  return tFn("ops_bus_conflict_blocked")
    .replace("{bus}", first.bus)
    .replace("{group}", first.groupId || "—")
    .replace("{driver}", first.driverName || "—");
}

/** @deprecated alias — product copy is hard-block, not warn. */
function formatCrossGroupBusWarn(conflicts, translate) {
  return formatBusConflictBlock(conflicts, translate);
}

export {
  ACTIVE_DUTY_TYPES,
  normalizeBusNumber,
  timeRangesOverlap,
  resolveShiftGroupId,
  findOverlappingBusConflicts,
  findCrossGroupBusConflicts,
  formatBusConflictBlock,
  formatCrossGroupBusWarn
};

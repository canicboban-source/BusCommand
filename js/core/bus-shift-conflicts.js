/**
 * Cross-group bus usage warning (operational soft signal).
 * Same company bus may belong to multiple groups; concurrent active duty = warn, not ban.
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
  // Missing times → treat same calendar day as potential conflict (ops warning).
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
 * @param {Array<object>} shifts
 * @param {{ bus: string, date: string, groupId?: string|null, excludeDriverId?: string|null, start?: string|null, end?: string|null, drivers?: Array<object> }} query
 * @returns {Array<{ bus: string, date: string, groupId: string, driverId: string|null, driverName: string, type: string, start: string|null, end: string|null }>}
 */
function findCrossGroupBusConflicts(shifts, query = {}) {
  const busKey = normalizeBusNumber(query.bus);
  const date = String(query.date || "");
  const targetGroup = String(query.groupId || "");
  const excludeDriverId = query.excludeDriverId != null ? String(query.excludeDriverId) : "";
  const drivers = query.drivers || [];
  if (!busKey || !date) return [];

  const hits = [];
  for (const shift of shifts || []) {
    if (normalizeBusNumber(shift?.bus) !== busKey) continue;
    if (String(shift?.date || "") !== date) continue;
    const type = String(shift?.type || "").toLowerCase();
    if (!ACTIVE_DUTY_TYPES.has(type)) continue;

    const otherGroup = resolveShiftGroupId(shift, drivers);
    if (!otherGroup) continue;
    if (targetGroup && otherGroup === targetGroup) continue;

    const otherDriverId = shift.driverId != null ? String(shift.driverId) : "";
    if (excludeDriverId && otherDriverId && otherDriverId === excludeDriverId) continue;

    if (!timeRangesOverlap(query.start, query.end, shift.start, shift.end)) continue;

    hits.push({
      bus: String(shift.bus || query.bus),
      date,
      groupId: otherGroup,
      driverId: otherDriverId || null,
      driverName: String(shift.driverName || ""),
      type,
      start: shift.start || null,
      end: shift.end || null
    });
  }
  return hits;
}

function formatCrossGroupBusWarn(conflicts, translate) {
  const first = conflicts?.[0];
  if (!first) return "";
  const tFn = typeof translate === "function" ? translate : (k) => k;
  return tFn("ops_bus_cross_group_warn")
    .replace("{bus}", first.bus)
    .replace("{group}", first.groupId)
    .replace("{driver}", first.driverName || "—");
}

export {
  ACTIVE_DUTY_TYPES,
  normalizeBusNumber,
  timeRangesOverlap,
  resolveShiftGroupId,
  findCrossGroupBusConflicts,
  formatCrossGroupBusWarn
};

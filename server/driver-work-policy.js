const crypto = require("crypto");

const ACTIVE_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft"]);
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function validTimezone(timezone) {
  try {
    Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function localDateString(date, timezone) {
  const parts = zonedParts(date, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateString, count) {
  const date = new Date(`${dateString}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function weekday(dateString) {
  return new Date(`${dateString}T12:00:00.000Z`).getUTCDay();
}

function localDateTimeToUtc(dateString, time, timezone) {
  if (!TIME_RE.test(time) || !validTimezone(timezone)) return null;
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = targetAsUtc;
  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(new Date(guess), timezone);
    const representedAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second)
    );
    guess += targetAsUtc - representedAsUtc;
  }
  return new Date(guess);
}

function isWorkingShift(shift) {
  return Boolean(shift && ACTIVE_TYPES.has(shift.type) && TIME_RE.test(shift.start || "") && TIME_RE.test(shift.end || ""));
}

function scheduleShiftForDate(schedules, dateString) {
  const month = dateString.slice(0, 7);
  const day = Number(dateString.slice(8, 10));
  const schedule = schedules.find((entry) => entry.month === month && entry.parsedShifts);
  return schedule?.parsedShifts?.[day] || schedule?.parsedShifts?.[String(day)] || null;
}

function shiftForDate({ shifts = [], schedules = [] }, dateString) {
  // Canonical read: day assignment docs win. The monthly schedule is only a
  // projection for days that do not yet have a shift document.
  // Soft-clear tombstones (Ch8 undo) are not active assignments.
  const direct = shifts.find((entry) => entry.date === dateString && entry.type !== "clear");
  if (direct) return { ...direct, date: dateString, source: "shift" };
  const scheduled = scheduleShiftForDate(schedules, dateString);
  if (!scheduled) return null;
  return { ...scheduled, date: dateString, source: "schedule_mirror", revision: 0 };
}

function shiftWindow(shift, dateString, timezone) {
  if (!isWorkingShift(shift)) return null;
  const startAt = localDateTimeToUtc(dateString, shift.start, timezone);
  let endAt = localDateTimeToUtc(dateString, shift.end, timezone);
  if (!startAt || !endAt) return null;
  if (endAt <= startAt) endAt = localDateTimeToUtc(addDays(dateString, 1), shift.end, timezone);
  return endAt ? { startAt, endAt } : null;
}

function fingerprintShift(shift) {
  const stable = [shift.date, shift.type, shift.start, shift.end, shift.routeCode, shift.bus, shift.name]
    .map((value) => String(value || "")).join("|");
  return crypto.createHash("sha256").update(stable).digest("hex");
}

/**
 * Weekend confirmation source day:
 * - Friday always
 * - If Friday is off: last working day before Saturday (Thu/Wed/…)
 */
function fridayOfWeek(dateString) {
  const day = weekday(dateString);
  if (day === 0 || day === 6) return null;
  return addDays(dateString, 5 - day);
}

function isWeekendPackageSourceDay(data, activeDate) {
  const day = weekday(activeDate);
  if (day === 0 || day === 6) return false;
  if (day === 5) return true;
  const friday = fridayOfWeek(activeDate);
  if (!friday || isWorkingShift(shiftForDate(data, friday))) return false;
  for (let offset = 1; offset <= 5; offset += 1) {
    const candidate = addDays(friday, -offset);
    if (!isWorkingShift(shiftForDate(data, candidate))) continue;
    return candidate === activeDate;
  }
  return false;
}

function confirmationRequestLabel(targetDate) {
  const day = weekday(targetDate);
  if (day === 6) return "saturday";
  if (day === 0) return "sunday";
  if (day === 1) return "monday";
  return "next_shift";
}

function confirmationTargetDates(data, activeDate) {
  const weekendPackage = isWeekendPackageSourceDay(data, activeDate);
  const day = weekday(activeDate);
  let horizon = 14;
  if (weekendPackage) {
    horizon = ((1 - day + 7) % 7) || 7;
  }

  const targets = [];
  for (let offset = 1; offset <= horizon; offset += 1) {
    const date = addDays(activeDate, offset);
    const shift = shiftForDate(data, date);
    if (!isWorkingShift(shift)) continue;
    targets.push(date);
    if (!weekendPackage) break;
  }
  return targets;
}

function buildConfirmationTargets(data, sourceShiftDate) {
  const weekendPackage = isWeekendPackageSourceDay(data, sourceShiftDate);
  return confirmationTargetDates(data, sourceShiftDate).map((targetDate) => {
    const targetShift = shiftForDate(data, targetDate);
    const withDate = { ...targetShift, date: targetDate };
    return {
      ...withDate,
      fingerprint: fingerprintShift(withDate),
      label: weekendPackage ? confirmationRequestLabel(targetDate) : "next_shift",
      requestId: `${sourceShiftDate}_${targetDate}`,
      separateRequest: true
    };
  });
}

function evaluateDriverWorkPolicy({ now = new Date(), timezone, shifts = [], schedules = [] }) {
  if (!validTimezone(timezone)) return { status: "blocked", reason: "timezone_invalid", timezone };
  const today = localDateString(now, timezone);
  const data = { shifts, schedules };
  const candidates = [addDays(today, -1), today];
  for (const date of candidates) {
    const shift = shiftForDate(data, date);
    const window = shiftWindow(shift, date, timezone);
    if (!window) continue;
    const sessionEndsAt = new Date(window.endAt.getTime() + 30 * 60_000);
    if (now >= window.startAt && now <= sessionEndsAt) {
      const status = now <= window.endAt ? "active" : "grace";
      return {
        status, timezone, shift: { ...shift, date },
        shiftStartsAt: window.startAt.toISOString(),
        notificationsUntil: window.endAt.toISOString(),
        sessionEndsAt: sessionEndsAt.toISOString(),
        confirmationTargets: buildConfirmationTargets(data, date),
        weekendPackage: isWeekendPackageSourceDay(data, date)
      };
    }
  }
  return { status: "off_duty", reason: "outside_working_hours", timezone };
}

module.exports = {
  ACTIVE_TYPES, TIME_RE, validTimezone, localDateString, addDays, weekday,
  localDateTimeToUtc, isWorkingShift, shiftForDate, shiftWindow,
  fingerprintShift, confirmationTargetDates, confirmationRequestLabel,
  isWeekendPackageSourceDay, fridayOfWeek, buildConfirmationTargets,
  evaluateDriverWorkPolicy
};

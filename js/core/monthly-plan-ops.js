/**
 * Pure helpers for dispatcher monthly mass ops (§7 / Ch8).
 * Server mirror lives in server/shift-assignment.js#previewMassDayRange.
 */

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

const MASS_ABSENCE_TYPES = new Set(["off", "vacation", "sick"]);

function isMassAbsenceType(type) {
    return MASS_ABSENCE_TYPES.has(String(type || ""));
}

export { previewMassDayRange, isMassAbsenceType, MASS_ABSENCE_TYPES };

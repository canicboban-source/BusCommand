/**
 * Monthly plan day counters — shared by Dispo UI and unit tests.
 * Assigned = any non-off/clear day (includes vacation/sick).
 * Work = duty days only (excludes vacation/sick/off/clear).
 */

const EMPTY_TYPES = new Set(["", "off", "clear"]);
const ABSENCE_TYPES = new Set(["vacation", "sick"]);

function countMonthlyPlanDayStats(parsedShifts) {
    let assignedDays = 0;
    let workDays = 0;
    for (const shift of Object.values(parsedShifts || {})) {
        if (!shift) continue;
        const type = String(shift.type || "off").toLowerCase();
        if (EMPTY_TYPES.has(type)) continue;
        assignedDays += 1;
        if (!ABSENCE_TYPES.has(type)) workDays += 1;
    }
    return { assignedDays, workDays };
}

/** Pick one/other i18n key for English-like plural (count === 1 → one). */
function pickCountKey(count, oneKey, otherKey) {
    return Number(count) === 1 ? oneKey : otherKey;
}

export {
    ABSENCE_TYPES,
    EMPTY_TYPES,
    countMonthlyPlanDayStats,
    pickCountKey
};

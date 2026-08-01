function interval(date, shift) {
    const startText = String(shift?.start || "");
    const endText = String(shift?.end || "");
    if (!/^\d{2}:\d{2}$/.test(startText) || !/^\d{2}:\d{2}$/.test(endText)) return null;
    const start = new Date(`${date}T${startText}:00`).getTime();
    let end = new Date(`${date}T${endText}:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end <= start) end += 24 * 60 * 60 * 1000;
    return { start, end };
}

const UNAVAILABLE_TYPES = new Set(["off", "vacation", "sick", "clear"]);

function normalizedDayType(value) {
    const type = String(value || "").toLowerCase();
    if (["weekday", "workday", "mon-fri"].includes(type)) return "weekday";
    if (["weekend", "sat-sun"].includes(type)) return "weekend";
    return "";
}

function isExpectedToday(entry, isWeekday) {
    const dayType = normalizedDayType(entry?.dayType);
    return !dayType || (isWeekday ? dayType === "weekday" : dayType === "weekend");
}

function detectDailyPlanCoverageGaps({
    date,
    isWeekday,
    slots = [],
    catalogEntries = {},
    servicePlanActive = false,
    vacations = [],
    getShift = () => null
}) {
    const gaps = [];
    const assignedCodes = new Set(slots.map(slot => String(slot.code || "")).filter(Boolean));

    if (servicePlanActive) {
        Object.values(catalogEntries)
            .filter(entry => entry?.code && entry.type !== "bereitschaft" && isExpectedToday(entry, isWeekday))
            .forEach(entry => {
                if (!assignedCodes.has(String(entry.code))) {
                    gaps.push({
                        id: `missing-driver:${entry.code}`,
                        kind: "missing_driver",
                        severity: "high",
                        code: entry.code,
                        start: entry.start || null,
                        end: entry.end || null
                    });
                }
            });
    }

    if (isWeekday && !slots.some(slot => slot.type === "bereitschaft" && slot.driverId)) {
        gaps.push({
            id: "uncovered-standby",
            kind: "uncovered_standby",
            severity: "high",
            code: Object.values(catalogEntries).find(entry => entry?.type === "bereitschaft")?.code || "X2"
        });
    }

    const occupiedBuses = [];
    slots.forEach(slot => {
        if (!slot.driverId) return;
        const shift = getShift(slot.driverId, date);
        const approvedAbsence = vacations.some((vacation) =>
            vacation.driverId === slot.driverId
            && ["approved", "odobreno", "genehmigt"].includes(String(vacation.status || "").trim().toLowerCase())
            && vacation.start <= date
            && vacation.end >= date
        );
        if (!shift || approvedAbsence || UNAVAILABLE_TYPES.has(String(shift.type || "").toLowerCase())) {
            gaps.push({
                id: `driver-unavailable:${slot.code}:${slot.driverId}`,
                kind: "driver_unavailable",
                severity: "high",
                code: slot.code,
                driverId: slot.driverId,
                driverName: slot.driverName
            });
            return;
        }
        if (!shift.bus) {
            gaps.push({
                id: `missing-bus:${slot.code}:${slot.driverId}`,
                kind: "missing_bus",
                severity: "warning",
                code: slot.code,
                driverId: slot.driverId,
                driverName: slot.driverName
            });
            return;
        }
        const dutyInterval = interval(date, {
            start: slot.start || shift.start,
            end: slot.end || shift.end
        });
        if (dutyInterval) occupiedBuses.push({ slot, shift, dutyInterval });
    });

    occupiedBuses.forEach((current, index) => {
        occupiedBuses.slice(index + 1).forEach(other => {
            if (String(current.shift.bus) !== String(other.shift.bus)) return;
            if (current.dutyInterval.start >= other.dutyInterval.end
                || other.dutyInterval.start >= current.dutyInterval.end) return;
            gaps.push({
                id: `duplicate-bus:${current.shift.bus}:${current.slot.code}:${other.slot.code}`,
                kind: "duplicate_bus",
                severity: "high",
                bus: current.shift.bus,
                code: current.slot.code,
                otherCode: other.slot.code
            });
        });
    });

    return gaps;
}

export { detectDailyPlanCoverageGaps };

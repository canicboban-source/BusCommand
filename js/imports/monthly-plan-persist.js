// Persist imported monthly plan days through the staff assignment API (server + schedule mirror).
import ApiClient from "../core/api-client.js";
import { getShiftForDriverDate } from "../core/shift-plan.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { findDriverByName, normalizeType } from "./monthly-plan-persist-utils.js";

function padDay(day) {
    return String(day).padStart(2, "0");
}

/**
 * Push parsed monthly plan cells to Firestore via PUT /api/staff/shifts/assignment.
 * @returns {{ ok: number, fail: number, skipped: number, errors: string[] }}
 */
async function persistImportedMonthlyPlan(byDriver, month, {
    drivers = window.state?.drivers || [],
    concurrency = 4
} = {}) {
    if (USE_LOCAL_STATE) {
        return { ok: 0, fail: 0, skipped: 0, errors: [] };
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return { ok: 0, fail: 0, skipped: 0, errors: ["invalid_month"] };
    }

    const jobs = [];
    for (const [driverName, data] of Object.entries(byDriver || {})) {
        const driver = findDriverByName(drivers, driverName);
        if (!driver?.id) {
            jobs.push({ skip: true, reason: `driver_missing:${driverName}` });
            continue;
        }
        for (const [day, shift] of Object.entries(data.parsedShifts || {})) {
            const dayNum = Number.parseInt(day, 10);
            if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) continue;
            const date = `${month}-${padDay(dayNum)}`;
            const type = normalizeType(shift);
            const existing = getShiftForDriverDate(driver.name, date);
            const expectedRevision = Number.isInteger(existing?.revision) ? existing.revision : 0;
            jobs.push({
                payload: {
                    driverId: driver.id,
                    date,
                    type,
                    name: String(shift?.name || shift?.routeCode || "").slice(0, 120),
                    bus: String(shift?.bus || "").slice(0, 32),
                    routeCode: String(shift?.routeCode || "").slice(0, 64),
                    expectedRevision,
                    ...(shift?.start ? { start: shift.start } : {}),
                    ...(shift?.end ? { end: shift.end } : {})
                }
            });
        }
    }

    let ok = 0;
    let fail = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < jobs.length; i += concurrency) {
        const chunk = jobs.slice(i, i + concurrency);
        await Promise.all(chunk.map(async (job) => {
            if (job.skip) {
                skipped += 1;
                if (job.reason) errors.push(job.reason);
                return;
            }
            const result = await ApiClient.assignStaffShift(job.payload);
            if (result?.success) {
                ok += 1;
                return;
            }
            fail += 1;
            errors.push(`${job.payload.date}:${result?.code || result?.error || "fail"}`);
        }));
    }

    return { ok, fail, skipped, errors: errors.slice(0, 12) };
}

export { persistImportedMonthlyPlan, findDriverByName, normalizeType };

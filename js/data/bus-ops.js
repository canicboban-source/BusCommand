/**
 * Dispatcher-owned bus operational fields (D20).
 * `active` = fleet on/off; `opsStatus` = day-to-day availability.
 */

const BUS_OPS_STATUSES = Object.freeze(["active", "breakdown", "reserve", "other_line"]);
/** Assignable to a new shift / offered as a Needs-Attention coverage candidate (D21). */
const ASSIGNABLE_BUS_STATUSES = Object.freeze(["active", "reserve"]);

function normalizeBusOpsStatus(busOrStatus) {
    const raw = typeof busOrStatus === "string"
        ? busOrStatus
        : (busOrStatus?.opsStatus || "active");
    const status = String(raw || "active").trim().toLowerCase();
    return BUS_OPS_STATUSES.includes(status) ? status : "active";
}

function normalizeBusGarage(busOrGarage) {
    const raw = typeof busOrGarage === "string"
        ? busOrGarage
        : (busOrGarage?.garage || "");
    return String(raw || "").trim().slice(0, 40);
}

function normalizeBusPlate(busOrPlate) {
    const raw = typeof busOrPlate === "string"
        ? busOrPlate
        : (busOrPlate?.plate || "");
    return String(raw || "").trim().slice(0, 20);
}

/** Eligible for Needs attention / coverage assignment. */
function busIsAssignable(bus) {
    if (!bus || bus.active === false) return false;
    return ASSIGNABLE_BUS_STATUSES.includes(normalizeBusOpsStatus(bus));
}

function busRevisionOf(bus) {
    const revision = Number(bus?.revision);
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

export {
    BUS_OPS_STATUSES,
    ASSIGNABLE_BUS_STATUSES,
    normalizeBusOpsStatus,
    normalizeBusGarage,
    normalizeBusPlate,
    busIsAssignable,
    busRevisionOf
};

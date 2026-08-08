/**
 * Dispatcher-owned bus operational fields (D20).
 * `active` = fleet on/off; `opsStatus` = day-to-day availability.
 */

const BUS_OPS_STATUSES = Object.freeze(["ready", "breakdown", "technical", "out"]);

function normalizeBusOpsStatus(busOrStatus) {
    const raw = typeof busOrStatus === "string"
        ? busOrStatus
        : (busOrStatus?.opsStatus || "ready");
    const status = String(raw || "ready").trim().toLowerCase();
    return BUS_OPS_STATUSES.includes(status) ? status : "ready";
}

function normalizeBusGarage(busOrGarage) {
    const raw = typeof busOrGarage === "string"
        ? busOrGarage
        : (busOrGarage?.garage || "");
    return String(raw || "").trim().slice(0, 40);
}

/** Eligible for Needs attention / coverage assignment. */
function busIsAssignable(bus) {
    if (!bus || bus.active === false) return false;
    return normalizeBusOpsStatus(bus) === "ready";
}

function busRevisionOf(bus) {
    const revision = Number(bus?.revision);
    return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

export {
    BUS_OPS_STATUSES,
    normalizeBusOpsStatus,
    normalizeBusGarage,
    busIsAssignable,
    busRevisionOf
};

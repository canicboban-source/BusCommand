// BusCommand — one-click reason codes for Dispo soft-remove + operational incidents
import { t } from "../ui/i18n.js";

/** Soft-remove / roster membership reasons (stable codes for audit). */
const DISPO_CHANGE_REASONS = Object.freeze([
    "sev",
    "sold_out",
    "wrong_assignment",
    "temp_off_line",
    "plan_correction",
    "other"
]);

/** Driver coverage incident reasons. */
const DISPO_DRIVER_INCIDENT_REASONS = Object.freeze([
    "sick",
    "late",
    "no_show",
    "personal",
    "other"
]);

/** Vehicle / bus operational incident reasons. */
const DISPO_BUS_INCIDENT_REASONS = Object.freeze([
    "breakdown",
    "ac_climate",
    "technical",
    "accident",
    "sold_out",
    "other"
]);

function optionsFromCodes(codes, keyPrefix) {
    return codes.map((value) => ({
        value,
        label: t(`${keyPrefix}${value}`) || value
    }));
}

function dispoChangeReasonOptions() {
    return optionsFromCodes(DISPO_CHANGE_REASONS, "dispo_reason_");
}

function dispoDriverIncidentReasonOptions() {
    return optionsFromCodes(DISPO_DRIVER_INCIDENT_REASONS, "dispo_inc_driver_");
}

function dispoBusIncidentReasonOptions() {
    return optionsFromCodes(DISPO_BUS_INCIDENT_REASONS, "dispo_inc_bus_");
}

function normalizeDispoChangeReason(raw, allowed = DISPO_CHANGE_REASONS) {
    const reason = String(raw || "").trim();
    return allowed.includes(reason) ? reason : "";
}

function reasonLabel(code, keyPrefix = "dispo_reason_") {
    const value = String(code || "").trim();
    if (!value) return "";
    return t(`${keyPrefix}${value}`) || value;
}

function recordDemoChangeReason(entry) {
    if (!window.state) return;
    if (!Array.isArray(window.state.opsChangeLog)) window.state.opsChangeLog = [];
    const actor = window.currentUser?.name || window.currentUser?.email || window.currentUser?.uid || "dispatcher";
    window.state.opsChangeLog.push({
        ...entry,
        by: entry.by || actor,
        at: entry.at || new Date().toISOString()
    });
    if (window.state.opsChangeLog.length > 200) {
        window.state.opsChangeLog = window.state.opsChangeLog.slice(-200);
    }
}

export {
    DISPO_CHANGE_REASONS,
    DISPO_DRIVER_INCIDENT_REASONS,
    DISPO_BUS_INCIDENT_REASONS,
    dispoChangeReasonOptions,
    dispoDriverIncidentReasonOptions,
    dispoBusIncidentReasonOptions,
    normalizeDispoChangeReason,
    reasonLabel,
    recordDemoChangeReason
};

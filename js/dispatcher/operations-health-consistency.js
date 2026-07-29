// Keeps the operations health banner consistent with the visible daily-plan rows.
import { getVisibleDrivers, todayDateStr } from "../core/utils.js";
import { getDriverDutySummary } from "../core/shift-plan.js";
import { t } from "../ui/i18n.js";

let installed = false;
let scheduled = false;

function driverId(driver) {
    return driver?.id || driver?.uid || driver?.driverId || "";
}

function isConfirmed(driver, date) {
    const id = driverId(driver);
    return Boolean(id && (window.state?.shiftConfirmations || []).some(row =>
        row?.driverId === id && row?.date === date
    ));
}

function operationalShiftSummary() {
    if (window.currentUser?.role !== "dispatcher") return { uncovered: 0, pending: 0 };
    const date = todayDateStr();
    let uncovered = 0;
    let pending = 0;

    getVisibleDrivers().forEach(driver => {
        const duty = getDriverDutySummary(driver.name, date);
        const type = duty?.shift?.type;
        if (!duty?.shift || type === "off" || type === "clear") {
            uncovered += 1;
            return;
        }
        if (!isConfirmed(driver, date)) pending += 1;
    });

    return { uncovered, pending };
}

function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
}

function syncOperationsHealth() {
    scheduled = false;
    const dashboard = document.getElementById("dispatcher-dashboard");
    const health = document.getElementById("ops-plan-health");
    if (!dashboard || dashboard.classList.contains("hidden") || !health) return;

    const summary = operationalShiftSummary();
    if (!summary.uncovered && !summary.pending) return;

    const title = health.querySelector("strong");
    const hint = health.querySelector("span:not(.dot)");
    if (!title || !hint) return;

    if (!health.classList.contains("is-attention")) health.classList.add("is-attention");
    setText(title, t("ops_plan_attention"));

    const parts = [];
    if (summary.uncovered) parts.push(`${summary.uncovered} · ${t("ops_shift_uncovered")}`);
    if (summary.pending) parts.push(`${summary.pending} · ${t("status_pending_confirmation")}`);
    setText(hint, parts.join(" · "));
}

function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(syncOperationsHealth);
}

function installOperationsHealthConsistency() {
    if (installed) return;
    installed = true;
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleSync();
}

export { installOperationsHealthConsistency, operationalShiftSummary, syncOperationsHealth };

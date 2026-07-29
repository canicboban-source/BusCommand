// Keeps the operations health banner consistent with the daily plan rows.
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
    health.classList.add("is-attention");
    title.textContent = t("ops_plan_attention") || "Plan zahteva pažnju";
    const parts = [];
    if (summary.uncovered) parts.push(`${summary.uncovered} ${t("ops_shift_uncovered") || "nepokrivena smena"}`);
    if (summary.pending) parts.push(`${summary.pending} ${t("status_pending_confirmation") || "čeka potvrdu"}`);
    hint.textContent = parts.join(" · ");
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
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scheduleSync();
}

export { installOperationsHealthConsistency, operationalShiftSummary, syncOperationsHealth };

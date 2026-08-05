/**
 * Aligns the ops health banner with actionable Needs attention items (Ultimate §8).
 * Never invent "6 uncovered" attention that opens an empty panel.
 */
import { getVisibleDrivers, todayDateStr } from "../core/utils.js";
import { getDriverDutySummary } from "../core/shift-plan.js";
import { t } from "../ui/i18n.js";
import { collectOpsAttentionItems } from "./ops-attention.js";
import { switchSection } from "../layout/navigation.js";

let installed = false;
let scheduled = false;
let planGapBound = false;

function driverId(driver) {
    return driver?.id || driver?.uid || driver?.driverId || "";
}

function isConfirmed(driver, date) {
    const id = driverId(driver);
    return Boolean(id && (window.state?.shiftConfirmations || []).some((row) =>
        row?.driverId === id && row?.date === date
    ));
}

function operationalShiftSummary() {
    if (window.currentUser?.role !== "dispatcher") return { uncovered: 0, pending: 0 };
    const date = todayDateStr();
    let uncovered = 0;
    let pending = 0;

    getVisibleDrivers().forEach((driver) => {
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

function clearPlanGap(health) {
    if (!health) return;
    health.classList.remove("is-plan-gap");
    if (!health.classList.contains("is-attention")) {
        health.classList.remove("is-clickable");
        health.setAttribute("role", "status");
        health.removeAttribute("tabindex");
        health.removeAttribute("aria-label");
        health.dataset.planGap = "false";
    }
}

function wirePlanGapClick(health) {
    if (!health || planGapBound) return;
    planGapBound = true;
    health.addEventListener("click", () => {
        if (!health.classList.contains("is-plan-gap")) return;
        // Plan gaps are fixed in the daily plan — not in an empty Needs attention sheet.
        switchSection("dispatcher-daily-plan-pick");
    });
    health.addEventListener("keydown", (event) => {
        if (!health.classList.contains("is-plan-gap")) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            switchSection("dispatcher-daily-plan-pick");
        }
    });
}

function syncOperationsHealth() {
    scheduled = false;
    const dashboard = document.getElementById("dispatcher-dashboard");
    const health = document.getElementById("ops-plan-health");
    if (!dashboard || dashboard.classList.contains("hidden") || !health) return;

    const title = health.querySelector("strong");
    const hint = health.querySelector("span:not(.dot)");
    if (!title || !hint) return;

    // Real Needs attention items own the banner (reports, missing bus, confirms, …).
    const panelCount = collectOpsAttentionItems().length;
    if (panelCount > 0) {
        clearPlanGap(health);
        return;
    }

    // Dashboard already painted a real attention / stale state — do not overwrite.
    if (health.classList.contains("is-attention") && title.textContent !== t("ops_plan_healthy")) {
        clearPlanGap(health);
        return;
    }

    const summary = operationalShiftSummary();
    if (!summary.uncovered && !summary.pending) {
        clearPlanGap(health);
        return;
    }

    // Soft plan-gap only: never is-attention without panel items (empty sheet bug).
    health.classList.remove("is-attention");
    health.classList.add("is-plan-gap", "is-clickable");
    health.dataset.planGap = "true";
    health.setAttribute("role", "button");
    health.setAttribute("tabindex", "0");

    const parts = [];
    if (summary.uncovered) parts.push(`${summary.uncovered} · ${t("ops_shift_uncovered")}`);
    if (summary.pending) parts.push(`${summary.pending} · ${t("status_pending_confirmation")}`);
    setText(title, t("ops_plan_gap_title") || "Dnevni plan ima praznine");
    setText(hint, parts.join(" · ") + " — " + (t("ops_plan_gap_hint") || "Kliknite za dnevni plan."));
    health.setAttribute(
        "aria-label",
        t("ops_plan_gap_aria") || "Dnevni plan ima praznine. Otvorite dnevni plan."
    );
    wirePlanGapClick(health);
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

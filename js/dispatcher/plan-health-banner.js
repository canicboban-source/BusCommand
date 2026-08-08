// Shared plan-health note for Ops / Daily / Monthly / Vehicles panels.
import { t } from "../ui/i18n.js";
import { escapeHtml, getVisibleDrivers, todayDateStr } from "../core/utils.js";
import { getDriverDutySummary, getDailyPlanForDate } from "../core/shift-plan.js";
import { actionAttr } from "../core/action-delegate.js";
import {
    collectOpsAttentionItems,
    collectPlanGapAttentionItems,
    openOpsAttentionPanel
} from "./ops-attention.js";

/** Latest problem rows per banner host (avoids stale click closures). */
const rowsByHost = new WeakMap();

function driverBelongsToGroup(driver, groupId) {
    if (!groupId) return true;
    const gid = String(driver.groupId || driver.lineId || "");
    return !gid || gid === String(groupId);
}

/** Same uncovered rule as Ops soft plan-gap (no shift / off / clear). */
function scopedUncoveredDrivers(groupId, dateStr) {
    const date = dateStr || todayDateStr();
    const missing = [];
    getVisibleDrivers().forEach((driver) => {
        if (!driverBelongsToGroup(driver, groupId)) return;
        const duty = getDriverDutySummary(driver.name, date);
        const type = duty?.shift?.type;
        if (!duty?.shift || type === "off" || type === "clear") {
            missing.push(driver);
        }
    });
    return missing;
}

/** Empty duty slots on the daily plan (assigned code, no driver). */
function emptyDailySlots(groupId, dateStr) {
    const date = dateStr || todayDateStr();
    const prevHub = window.state?.activeGroupHubId;
    const prevFilter = window.state?.activeGroupFilter;
    try {
        if (groupId && window.state) {
            window.state.activeGroupHubId = groupId;
            window.state.activeGroupFilter = groupId;
        }
        return (getDailyPlanForDate(date).slots || []).filter((slot) =>
            slot && !String(slot.driverName || "").trim()
        );
    } finally {
        if (window.state) {
            window.state.activeGroupHubId = prevHub;
            window.state.activeGroupFilter = prevFilter;
        }
    }
}

function ensureBannerStructure(host) {
    if (host.querySelector("[data-plan-health-title]")) return;
    host.innerHTML = `
        <div class="ops-health-head">
            <span class="dot" aria-hidden="true"></span>
            <div class="ops-health-copy">
                <strong data-plan-health-title></strong>
                <span data-plan-health-hint></span>
            </div>
        </div>
        <div class="ops-health-problems" data-plan-health-problems hidden></div>`;
}

function buildProblemRows(attention, gapItems) {
    const rows = [];

    attention.forEach((item) => {
        rows.push({
            id: item.id,
            title: item.title || item.kind || "Issue",
            summary: item.summary || item.driverName || "",
            severity: item.severity || "warning",
            focusId: item.id
        });
    });

    gapItems.forEach((item) => {
        rows.push({
            id: item.id,
            title: item.title || item.kind || "Gap",
            summary: item.summary || item.driverName || item.dutyCode || "",
            severity: item.severity || "warning",
            focusId: item.id
        });
    });

    return rows;
}

function paintProblemList(listEl, rows) {
    if (!listEl) return;
    if (!rows.length) {
        listEl.innerHTML = "";
        listEl.hidden = true;
        return;
    }
    listEl.innerHTML = rows.map((row) => `
            <button type="button" class="ops-health-problem is-${escapeHtml(row.severity)}" ${actionAttr("openOpsAttentionPanel", [row.focusId])}>
                <strong>${escapeHtml(row.title)}</strong>
                <span>${escapeHtml(row.summary)}</span>
            </button>`).join("");
    listEl.hidden = false;
}

/** Open the Needs attention / solutions panel (problem + fix). */
function goToOpsPlanProblems(focusId = "") {
    openOpsAttentionPanel(focusId || "");
}

function activateBanner(host) {
    if (!host.classList.contains("is-clickable")) return;
    const rows = rowsByHost.get(host) || [];
    const listEl = host.querySelector("[data-plan-health-problems]");
    if (listEl) {
        listEl.hidden = false;
        listEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    if (rows.length === 1) {
        openOpsAttentionPanel(rows[0].focusId);
        return;
    }

    // Multiple: show stacked list AND open the solutions panel with all of them.
    openOpsAttentionPanel(rows[0]?.focusId || "");
}

function wireBannerClick(host) {
    if (host.dataset.planHealthBound === "1") return;
    host.dataset.planHealthBound = "1";

    host.addEventListener("click", (event) => {
        if (event.target.closest("[data-plan-health-problems]")) return;
        activateBanner(host);
    });
    host.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (event.target.closest("[data-plan-health-problems]")) return;
        event.preventDefault();
        activateBanner(host);
    });
}

/**
 * Paint a `.ops-health` host with healthy / gap / attention copy.
 * Click opens the solutions panel (Needs attention) with problem + fix.
 * Multiple problems stack one under another.
 */
function paintPlanHealthBanner(hostOrId, opts = {}) {
    const host = typeof hostOrId === "string"
        ? document.getElementById(hostOrId)
        : hostOrId;
    if (!host) return;

    const dateStr = opts.dateStr || todayDateStr();
    const groupId = opts.groupId || window.state?.activeGroupHubId || window.state?.activeGroupFilter || null;
    const attention = collectOpsAttentionItems().filter((item) => {
        if (!groupId) return true;
        if (item.groupId && String(item.groupId) === String(groupId)) return true;
        return !item.groupId;
    });
    const gapItems = collectPlanGapAttentionItems(groupId, dateStr);
    const uncoveredDrivers = scopedUncoveredDrivers(groupId, dateStr);
    const slots = emptyDailySlots(groupId, dateStr);
    const hasGap = uncoveredDrivers.length > 0 || slots.length > 0 || gapItems.length > 0;
    const hasAttention = attention.length > 0;
    const rows = buildProblemRows(attention, gapItems);
    rowsByHost.set(host, rows);

    ensureBannerStructure(host);
    host.classList.toggle("is-attention", hasAttention && !hasGap);
    host.classList.toggle("is-plan-gap", hasGap);
    host.classList.toggle("is-clickable", rows.length > 0);
    host.classList.toggle("is-expanded", rows.length > 0);

    const titleEl = host.querySelector("[data-plan-health-title]");
    const hintEl = host.querySelector("[data-plan-health-hint]");
    const listEl = host.querySelector("[data-plan-health-problems]");

    if (hasGap) {
        titleEl.textContent = t("ops_plan_gap_title") || t("ops_plan_gap") || "Daily plan has gaps";
        hintEl.textContent = t("ops_plan_gap_hint") || "Click to open problem and solutions.";
    } else if (hasAttention) {
        titleEl.textContent = t("ops_plan_attention") || "Plan needs attention";
        hintEl.textContent = rows.length > 1
            ? (t("ops_plan_attention_click_many") || "Each problem is listed below.")
            : (t("ops_plan_attention_hint") || "Click to open the problem.");
    } else {
        titleEl.textContent = t("ops_plan_healthy") || "Plan is healthy";
        hintEl.textContent = t("ops_plan_healthy_hint") || "Everything matches the plan";
    }

    paintProblemList(listEl, rows);
    if (rows.length) {
        listEl.hidden = false;
        host.setAttribute("role", "button");
        host.setAttribute("tabindex", "0");
        host.setAttribute(
            "aria-label",
            t("ops_plan_gap_aria") || t("ops_attn_open_aria", { count: rows.length })
                || `Needs attention: ${rows.length}.`
        );
    } else {
        host.setAttribute("role", "status");
        host.removeAttribute("tabindex");
        host.removeAttribute("aria-label");
    }

    wireBannerClick(host);
}

export { paintPlanHealthBanner, goToOpsPlanProblems };

// BusCommand — Group Hub: jedan ekran za uvoz i upravljanje linijom
import { getGroupById, getFormedLineGroupIds } from "../data/groups.js";
import { activateShiftCatalogForLine, ensureShiftCatalogForEdit } from "../core/line-shift-catalog.js";
import { t } from "../ui/i18n.js";
import {
    assignDriverToLine,
    countBusesForLineGroup,
    countDriversForLineGroup,
    countPlansForLineGroup,
    driverBelongsToLine,
    getBusesForLineGroup,
    getDriversForLineGroup,
    getSubgroupsForLine
} from "../data/group-membership.js";
import { actionAttr } from "../core/action-delegate.js";
import { saveState } from "../core/state.js";
import { loadActiveServicePlanForLine } from "../core/service-plan.js";
import { renderDispatcherDataHub } from "./data-hub.js";
import { renderDailyPlanFullPage, renderHubDailyPreview } from "./daily-plan.js";
import { renderHubMonthlyPreview, renderMonthlyPlansFullPage } from "./monthly-plans.js";
import { switchSection } from "../layout/navigation.js";
import { escapeHtml, showToast } from "../core/utils.js";

const PLAN_CATALOG_TIMEOUT_MS = 8_000;

function getHubGroupId() {
    return window.state.activeGroupHubId || null;
}

function migrateLineMembership(lineId) {
    if (!lineId) return;

    const subGroupIds = new Set(
        (window.state.groups || [])
            .filter(g => g.lineId === lineId || g.id === lineId)
            .map(g => g.id)
    );
    subGroupIds.add(lineId);

    (window.state.drivers || []).forEach(d => {
        if (subGroupIds.has(d.groupId) || driverBelongsToLine(d, lineId)) {
            const g = getGroupById(d.groupId);
            const subName = g && g.lineId === lineId && g.id !== lineId ? g.name : (d.subGroup || "");
            assignDriverToLine(d, lineId, subName);
        }
    });

    const dispGroups = getFormedLineGroupIds();
    const singleLine = dispGroups.length === 1 ? dispGroups[0] : lineId;

    (window.state.buses || []).forEach(b => {
        if (b.groupId === lineId || b.lineId === lineId) {
            b.groupId = lineId;
            b.lineId = lineId;
        } else if (!b.groupId && singleLine === lineId) {
            b.groupId = lineId;
            b.lineId = lineId;
        }
    });

    saveState();
}

function openGroupHub(groupId) {
    if (!groupId) return;
    window.state.activeGroupHubId = groupId;
    window.state.activeGroupFilter = groupId;
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    switchSection("dispatcher-group-hub");
    loadActiveServicePlanForLine(groupId)
        .then(plan => { if (plan && getHubGroupId() === groupId) renderGroupHub(); })
        .catch(error => console.warn("Published service plan could not be loaded", error));
}

function openMonthlyPlansFull() {
    if (!getHubGroupId()) return;
    window._planFullReturnSection = "dispatcher-group-hub";
    switchSection("dispatcher-monthly-plans-full");
}

function openDailyPlanFull() {
    if (!getHubGroupId()) return;
    window._planFullReturnSection = "dispatcher-group-hub";
    switchSection("dispatcher-daily-plan-full");
}

function setPlanSectionBusy(sectionId, busy) {
    if (typeof document === "undefined") return;
    const section = document.getElementById(sectionId);
    if (!section) return;
    if (busy) section.setAttribute("aria-busy", "true");
    else section.removeAttribute("aria-busy");
}

async function refreshPlanCatalog(groupId, sectionId, render) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PLAN_CATALOG_TIMEOUT_MS);
    setPlanSectionBusy(sectionId, true);
    try {
        await loadActiveServicePlanForLine(groupId, { signal: controller.signal });
        if (getHubGroupId() === groupId) render();
    } catch (error) {
        console.warn("Published service plan could not be loaded", error);
        if (getHubGroupId() === groupId) {
            const key = error?.name === "AbortError" ? "plan_catalog_load_timeout" : "plan_catalog_load_failed";
            showToast(t(key), "info", 5000);
        }
    } finally {
        clearTimeout(timeoutId);
        setPlanSectionBusy(sectionId, false);
    }
}

function openPlanForGroup(groupId, { sectionId, returnSection, render }) {
    if (!groupId) return Promise.resolve(null);
    window.state.activeGroupHubId = groupId;
    window.state.activeGroupFilter = groupId;
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    window._planFullReturnSection = returnSection;
    if (!switchSection(sectionId)) return Promise.resolve(null);
    return refreshPlanCatalog(groupId, sectionId, render);
}

function openDailyPlanForGroup(groupId) {
    return openPlanForGroup(groupId, {
        sectionId: "dispatcher-daily-plan-full",
        returnSection: "dispatcher-daily-plan-pick",
        render: renderDailyPlanFullPage
    });
}

function openMonthlyPlanForGroup(groupId) {
    return openPlanForGroup(groupId, {
        sectionId: "dispatcher-monthly-plans-full",
        returnSection: "dispatcher-monthly-plan-pick",
        render: renderMonthlyPlansFullPage
    });
}

function backFromPlanFullPage() {
    switchSection(window._planFullReturnSection || "dispatcher-daily-plan-pick");
}

function renderHubPlanPreviews() {
    renderHubDailyPreview();
    renderHubMonthlyPreview();
}

function closeGroupHub() {
    switchSection("dispatcher-dashboard");
}

function scrollHubSection(sectionId) {
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    el.classList.remove("hub-panel-target");
    window.requestAnimationFrame(() => el.classList.add("hub-panel-target"));
    window.setTimeout(() => el.classList.remove("hub-panel-target"), 1400);
}

function renderGroupOverviewDetail(groupId) {
    const el = document.getElementById("group-hub-overview-detail");
    if (!el) return;

    const drivers = getDriversForLineGroup(groupId);
    const buses = getBusesForLineGroup(groupId);
    const subgroups = getSubgroupsForLine(groupId);
    const plans = countPlansForLineGroup(groupId);

    const driverRows = drivers.length
        ? drivers.map(d => {
            const driverName = d.name || [d.firstName, d.lastName].filter(Boolean).join(" ") || "—";
            return `<tr>
                <td class="hub-ov-name">${escapeHtml(driverName)}</td>
                <td class="hub-ov-muted">${escapeHtml(d.email || "—")}</td>
                <td class="hub-ov-muted">${escapeHtml(d.phone || "—")}</td>
            </tr>`;
        }).join("")
        : `<tr><td colspan="3" class="hub-ov-empty">${t("hub_no_drivers")}</td></tr>`;

    const busChips = buses.length
        ? buses.map(b => `<span class="hub-bus-chip">${escapeHtml(String(b.number))}</span>`).join("")
        : `<span class="hub-ov-empty-inline">${t("hub_no_buses")}</span>`;

    const subRows = subgroups.length
        ? subgroups.map(sg => {
            const cnt = drivers.filter(d => d.groupId === sg.id).length;
            return `<span class="hub-subgroup-chip" style="--hub-chip-color:${escapeHtml(sg.color)};">${escapeHtml(sg.name)}: ${cnt}</span>`;
        }).join("")
        : "";

    el.innerHTML = `
        <div class="hub-overview-grid">
            <div class="hub-overview-panel">
                <h4 class="hub-overview-heading">
                    <i data-lucide="users" style="width:16px;height:16px;"></i> ${t("hub_stat_drivers")} (${drivers.length})
                </h4>
                <div class="hub-overview-table-wrap">
                    <table class="hub-overview-table">
                        <thead><tr>
                            <th>${t("table_name")}</th>
                            <th>${t("table_email") || "Email"}</th>
                            <th>${t("table_phone")}</th>
                        </tr></thead>
                        <tbody>${driverRows}</tbody>
                    </table>
                </div>
                ${subRows ? `<div class="hub-subgroup-chips">${subRows}</div>` : ""}
            </div>
            <div class="hub-overview-panel">
                <h4 class="hub-overview-heading">
                    <i data-lucide="bus" style="width:16px;height:16px;"></i> ${t("hub_stat_buses")} (${buses.length})
                </h4>
                <div class="hub-bus-chip-wrap">
                    ${busChips}
                </div>
                <p class="hub-overview-meta">
                    ${t("hub_monthly_plans_lbl")}: <strong>${plans}</strong>
                    · ${t("hub_shift_catalog_lbl")}: <strong>${window.state.shiftCatalog?.entries ? Object.keys(window.state.shiftCatalog.entries).length : 0}</strong>
                </p>
            </div>
        </div>
        <div class="hub-overview-actions">
            <button type="button" class="btn-secondary hub-action-btn" ${actionAttr("scrollHubSection", ["hub-section-drivers"])}>${t("hub_edit_drivers")}</button>
            <button type="button" class="btn-primary hub-action-btn" ${actionAttr("scrollHubSection", ["hub-section-buses"])}>${t("hub_edit_buses")}</button>
            <button type="button" class="btn-secondary hub-action-btn" ${actionAttr("openDailyPlanFull")}>${t("hub_daily_plan")}</button>
            <button type="button" class="btn-secondary hub-action-btn" ${actionAttr("openMonthlyPlansFull")}>${t("hub_monthly_plan")}</button>
        </div>`;
}

function renderGroupHub() {
    const groupId = getHubGroupId();
    const group = groupId ? getGroupById(groupId) : null;
    if (!group) {
        closeGroupHub();
        return;
    }

    const titleEl = document.getElementById("group-hub-title");
    const badgeEl = document.getElementById("group-hub-id-badge");
    const descEl = document.getElementById("group-hub-desc");
    if (titleEl) titleEl.textContent = group.name;
    if (badgeEl) {
        badgeEl.textContent = group.id;
        badgeEl.style.borderColor = group.color;
        badgeEl.style.color = group.color;
        badgeEl.style.background = group.color + "22";
    }
    if (descEl) {
        const dc = countDriversForLineGroup(groupId);
        const bc = countBusesForLineGroup(groupId);
        const pc = countPlansForLineGroup(groupId);
        descEl.textContent = t("hub_desc", {
            drivers: dc,
            buses: bc,
            plans: pc
        });
    }

    const setStat = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(val);
    };
    const driverCount = countDriversForLineGroup(groupId);
    const busCount = countBusesForLineGroup(groupId);
    setStat("hub-stat-drivers", driverCount);
    setStat("hub-stat-buses", busCount);
    setStat("hub-stat-plans", countPlansForLineGroup(groupId));
    setStat("hub-stat-catalog", window.state.shiftCatalog?.entries
        ? Object.keys(window.state.shiftCatalog.entries).length
        : 0);

    renderGroupOverviewDetail(groupId);

    const emptyHint = document.getElementById("group-hub-empty-hint");
    const workspace = document.getElementById("group-hub-workspace");
    const hasData = driverCount > 0 || busCount > 0;
    if (emptyHint) emptyHint.style.display = hasData ? "none" : "block";
    if (workspace) workspace.style.opacity = "1";

    const groupSelect = document.getElementById("new-driver-group");
    if (groupSelect) {
        groupSelect.value = groupId;
        groupSelect.style.display = "none";
    }

    renderDispatcherDataHub();
    renderHubPlanPreviews();

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function getDashboardLineGroups() {
    const formed = getFormedLineGroupIds();
    if (formed.length) {
        return (window.state.groups || []).filter(g => formed.includes(g.id));
    }
    return (window.state.groups || []).filter(g => !g.lineId || g.id === g.lineId || String(g.id).match(/^\d+$/));
}

function renderGroupsPickerGrid(containerId, onGroupClickName, hintKey = "plan_pick_open") {
    const grid = document.getElementById(containerId);
    if (!grid) return;

    const groups = getDashboardLineGroups();
    if (groups.length === 0) {
        grid.innerHTML = `
            <div class="card" style="grid-column:1/-1;text-align:center;padding:28px;">
                <p style="color:var(--text-muted);margin:0;">${t("disp_no_groups_assigned")}</p>
            </div>`;
        if (typeof lucide !== "undefined") lucide.createIcons();
        return;
    }

    grid.innerHTML = groups.map(g => {
        const driverCount = countDriversForLineGroup(g.id);
        const busCount = countBusesForLineGroup(g.id);
        const planCount = countPlansForLineGroup(g.id);
        const ready = driverCount > 0 && (planCount > 0 || busCount > 0);

        return `
            <button type="button" class="card dashboard-group-card" ${actionAttr(onGroupClickName, [g.id])}
                style="margin:0;text-align:left;cursor:pointer;border-left:4px solid ${g.color};width:100%;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <div style="font-size:1.15rem;font-weight:700;">${g.name}</div>
                        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${t("plan_pick_line") || "Linija"} ${g.id}</div>
                    </div>
                    <span style="font-size:0.72rem;padding:4px 8px;border-radius:12px;font-weight:700;
                        background:${ready ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)"};
                        color:${ready ? "#10b981" : "#f59e0b"};">
                        ${ready ? (t("plan_pick_ready") || "Spremno") : (t("plan_pick_incomplete") || "Dopuni podatke")}
                    </span>
                </div>
                <div style="display:flex;gap:14px;margin-top:14px;font-size:0.8rem;color:var(--text-muted);flex-wrap:wrap;">
                    <span>${driverCount} ${t("hub_stat_drivers") || "vozača"}</span>
                    <span>${busCount} ${t("hub_stat_buses") || "autobusa"}</span>
                    <span>${planCount} ${t("hub_stat_plans") || "planova"}</span>
                </div>
                <div style="margin-top:12px;font-size:0.76rem;font-weight:600;color:${g.color};">
                    ${t(hintKey) || "Klikni →"}
                </div>
            </button>`;
    }).join("");

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderPlanGroupPicker(mode) {
    if (mode === "daily") {
        renderGroupsPickerGrid("daily-plan-groups-grid", "openDailyPlanForGroup");
    } else {
        renderGroupsPickerGrid("monthly-plan-groups-grid", "openMonthlyPlanForGroup");
    }
}

function renderDashboardGroupsGrid() {
    renderGroupsPickerGrid("dashboard-groups-grid", "openGroupHub", "disp_group_hub_hint");
}

/** @deprecated koristi scrollHubSection */
function setGroupHubTab() {
    /* tabs uklonjeni — jedan ekran */
}

export {
    getHubGroupId,
    openGroupHub,
    closeGroupHub,
    openMonthlyPlansFull,
    openDailyPlanFull,
    openDailyPlanForGroup,
    openMonthlyPlanForGroup,
    backFromPlanFullPage,
    scrollHubSection,
    setGroupHubTab,
    renderGroupHub,
    renderDashboardGroupsGrid,
    renderPlanGroupPicker,
    migrateLineMembership
};

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
import { renderDispatcherDataHub } from "./data-hub.js";
import { renderHubDailyPreview, renderDailyPlanFullPage, bindDailyPlanFullPage } from "./daily-plan.js";
import { renderHubMonthlyPreview } from "./monthly-plans.js";
import { switchSection } from "../layout/navigation.js";

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

function openDailyPlanForGroup(groupId) {
    if (!groupId) return;
    window.state.activeGroupHubId = groupId;
    window.state.activeGroupFilter = groupId;
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    window._planFullReturnSection = "dispatcher-daily-plan-pick";
    switchSection("dispatcher-daily-plan-full");
}

function openMonthlyPlanForGroup(groupId) {
    if (!groupId) return;
    window.state.activeGroupHubId = groupId;
    window.state.activeGroupFilter = groupId;
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    window._planFullReturnSection = "dispatcher-monthly-plan-pick";
    switchSection("dispatcher-monthly-plans-full");
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
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
            const g = getGroupById(d.groupId);
            const sub = g?.name || d.subGroup || "—";
            return `<tr>
                <td style="padding:6px 8px;font-weight:600;">${d.name}</td>
                <td style="padding:6px 8px;color:var(--text-muted);font-size:0.8rem;">${sub}</td>
                <td style="padding:6px 8px;font-size:0.8rem;">${d.companyId || "—"}</td>
                <td style="padding:6px 8px;font-size:0.8rem;">${d.phone || "—"}</td>
            </tr>`;
        }).join("")
        : `<tr><td colspan="4" style="padding:12px;color:var(--text-muted);text-align:center;">${t("hub_no_drivers")}</td></tr>`;

    const busChips = buses.length
        ? buses.map(b => `<span style="display:inline-block;padding:4px 10px;margin:2px 4px 2px 0;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:16px;font-size:0.82rem;font-weight:600;">${b.number}</span>`).join("")
        : `<span style="color:var(--text-muted);font-size:0.85rem;">${t("hub_no_buses")}</span>`;

    const subRows = subgroups.length
        ? subgroups.map(sg => {
            const cnt = drivers.filter(d => d.groupId === sg.id).length;
            return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;margin:2px 6px 2px 0;background:${sg.color}22;border:1px solid ${sg.color}55;border-radius:16px;font-size:0.78rem;font-weight:600;color:${sg.color};">${sg.name}: ${cnt}</span>`;
        }).join("")
        : "";

    el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
                <h4 style="margin:0 0 10px;font-size:0.9rem;display:flex;align-items:center;gap:6px;">
                    <i data-lucide="users" style="width:16px;height:16px;"></i> ${t("hub_stat_drivers")} (${drivers.length})
                </h4>
                <div style="max-height:200px;overflow-y:auto;border:1px solid var(--panel-border);border-radius:8px;">
                    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                        <thead><tr style="background:rgba(255,255,255,0.04);">
                            <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);">${t("table_name")}</th>
                            <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);">${t("table_subgroup")}</th>
                            <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);">${t("table_id")}</th>
                            <th style="padding:6px 8px;text-align:left;font-size:0.72rem;color:var(--text-muted);">${t("table_phone")}</th>
                        </tr></thead>
                        <tbody>${driverRows}</tbody>
                    </table>
                </div>
                ${subRows ? `<div style="margin-top:10px;">${subRows}</div>` : ""}
            </div>
            <div>
                <h4 style="margin:0 0 10px;font-size:0.9rem;display:flex;align-items:center;gap:6px;">
                    <i data-lucide="bus" style="width:16px;height:16px;"></i> ${t("hub_stat_buses")} (${buses.length})
                </h4>
                <div style="padding:10px;border:1px solid var(--panel-border);border-radius:8px;min-height:60px;">
                    ${busChips}
                </div>
                <p style="margin:12px 0 0;font-size:0.78rem;color:var(--text-muted);">
                    ${t("hub_monthly_plans_lbl")}: <strong style="color:var(--text-main);">${plans}</strong>
                    · ${t("hub_shift_catalog_lbl")}: <strong style="color:var(--text-main);">${window.state.shiftCatalog?.entries ? Object.keys(window.state.shiftCatalog.entries).length : 0}</strong>
                </p>
            </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
            <button type="button" class="btn-secondary" style="height:32px;font-size:0.78rem;" ${actionAttr("scrollHubSection", ["hub-section-drivers"])}>${t("hub_edit_drivers")}</button>
            <button type="button" class="btn-secondary" style="height:32px;font-size:0.78rem;" ${actionAttr("scrollHubSection", ["hub-section-buses"])}>${t("hub_edit_buses")}</button>
            <button type="button" class="btn-secondary" style="height:32px;font-size:0.78rem;" ${actionAttr("openDailyPlanFull")}>${t("hub_daily_plan")}</button>
            <button type="button" class="btn-secondary" style="height:32px;font-size:0.78rem;" ${actionAttr("openMonthlyPlansFull")}>${t("hub_monthly_plan")}</button>
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
                <p style="color:var(--text-muted);margin:0 0 12px;">${t("hub_no_groups")}</p>
                <button type="button" class="btn-primary" ${actionAttr("switchSection", ["dispatcher-settings"])}>
                    <i data-lucide="plus"></i> ${t("settings_groups_title") || "Kreiraj grupu"}
                </button>
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

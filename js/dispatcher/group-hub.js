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
import { renderHubDailyPreview } from "./daily-plan.js";
import { renderHubMonthlyPreview } from "./monthly-plans.js";
import { switchSection } from "../layout/navigation.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { isOperationalReadOnly } from "../core/access.js";
import { syncUserSession } from "../auth/login-session.js";
import {
    isDispatcherAssignedGroupId,
    normalizeGroupIds,
    sanitizeDispatcherActiveGroups
} from "../core/dispatcher-scope.js";

function getHubGroupId() {
    return window.state.activeGroupHubId || null;
}

function isDispatcherRole() {
    const role = String(window.currentUser?.role || "");
    return role === "dispatcher" || role === "disp";
}

function paintActiveGroupHeader(groupId) {
    const sub = document.getElementById("header-user-sub");
    if (!sub || !window.currentUser) return;
    if (!groupId) {
        sub.innerHTML = "";
        return;
    }
    const activeGroup = (window.state.groups || []).find((g) => String(g.id) === String(groupId));
    const groupName = escapeHtml(String(activeGroup?.name || groupId));
    const switchLabel = escapeHtml(t("btn_switch") || "Switch");
    const activeLabel = escapeHtml(t("active_group_short") || "Active group");
    let html = `${activeLabel}: ${groupName} <button type="button" ${actionAttr("switchToGroupSetup")} style="background:rgba(255,255,255,0.1); border:none; color:var(--primary-color); border-radius:4px; padding:2px 8px; margin-left:8px; font-size:0.75rem; cursor:pointer;">${switchLabel}</button>`;
    if (window.currentUser.impersonated) {
        html += ` <button type="button" ${actionAttr("exitImpersonation")} style="background:var(--danger-color); border:none; color:#fff; border-radius:4px; padding:3px 12px; margin-left:8px; font-size:0.75rem; cursor:pointer; font-weight:600;">${escapeHtml(t("btn_exit_inspect") || "Exit inspect")}</button>`;
    }
    sub.innerHTML = html;
}

/** Keep header "Active group" and dispatcher record aligned with the open hub (D1). */
function adoptActiveGroup(groupId) {
    if (!groupId) return;
    window.state.activeGroupHubId = groupId;
    window.state.activeGroupFilter = groupId;

    if (!isDispatcherRole() || !window.currentUser) return;

    window.currentUser.activeGroupId = groupId;
    syncUserSession(window.currentUser);

    const disp = (window.state.dispatchers || []).find((d) => d.id === window.currentUser.id);
    if (disp && disp.activeGroupId !== groupId) {
        disp.activeGroupId = groupId;
        saveState();
    }

    paintActiveGroupHeader(groupId);
}

/** Clear invalid active/hub IDs; return a valid fallback or null (defense-in-depth). */
function enforceDispatcherGroupScope() {
    if (!isDispatcherRole() || !window.currentUser) return null;
    const sanitized = sanitizeDispatcherActiveGroups({
        assignedIds: window.currentUser.groups,
        activeGroupId: window.currentUser.activeGroupId,
        activeGroupHubId: window.state?.activeGroupHubId
    });
    window.currentUser.groups = sanitized.assignedIds;
    window.currentUser.activeGroupId = sanitized.activeGroupId;
    if (window.state) {
        window.state.activeGroupHubId = sanitized.activeGroupHubId;
        if (sanitized.activeGroupHubId) {
            window.state.activeGroupFilter = sanitized.activeGroupHubId;
        } else {
            window.state.activeGroupFilter = null;
        }
    }
    syncUserSession(window.currentUser);
    paintActiveGroupHeader(sanitized.activeGroupId);
    return sanitized;
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

/** @returns {boolean} true when Dispo may open this group (or role is not Dispo). */
function assertDispatcherMayOpenGroup(groupId) {
    if (!isDispatcherRole()) return true;
    const assigned = normalizeGroupIds(window.currentUser?.groups);
    if (isDispatcherAssignedGroupId(assigned, groupId)) return true;
    const sanitized = enforceDispatcherGroupScope();
    showToast(t("dispatcher_select_group") || "Please select a group.", "error");
    if (sanitized?.fallback) {
        openAssignedGroupHub(sanitized.fallback);
    } else {
        switchSection("dispatcher-dashboard");
    }
    return false;
}

function openGroupHub(groupId) {
    if (!groupId) return;
    if (!assertDispatcherMayOpenGroup(groupId)) return;
    openAssignedGroupHub(groupId);
}

function openAssignedGroupHub(groupId) {
    adoptActiveGroup(groupId);
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    switchSection("dispatcher-group-hub");
    renderGroupHub();
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

async function openDailyPlanForGroup(groupId) {
    if (!groupId) return;
    if (!assertDispatcherMayOpenGroup(groupId)) return;
    adoptActiveGroup(groupId);
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    await loadActiveServicePlanForLine(groupId).catch(error => console.warn("Published service plan could not be loaded", error));
    window._planFullReturnSection = "dispatcher-daily-plan-pick";
    switchSection("dispatcher-daily-plan-full");
}

async function openMonthlyPlanForGroup(groupId) {
    if (!groupId) return;
    if (!assertDispatcherMayOpenGroup(groupId)) return;
    adoptActiveGroup(groupId);
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    await loadActiveServicePlanForLine(groupId).catch(error => console.warn("Published service plan could not be loaded", error));
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

    const readOnly = isOperationalReadOnly();
    const driverRows = drivers.length
        ? drivers.map(d => {
            const driverName = d.name || [d.firstName, d.lastName].filter(Boolean).join(" ") || "—";
            const detachCell = readOnly || !d.id
                ? `<td class="hub-ov-muted">—</td>`
                : `<td class="hub-ov-actions">
                    <button type="button" class="btn-secondary hub-ov-detach-btn"
                        ${actionAttr("detachDriverFromLine", [d.id, groupId])}
                        title="${escapeHtml(t("dispo_remove_from_line_hint") || "")}">
                        ${escapeHtml(t("dispo_remove_from_line") || "Remove from line")}
                    </button>
                </td>`;
            return `<tr>
                <td class="hub-ov-name">${escapeHtml(driverName)}</td>
                <td class="hub-ov-muted">${escapeHtml(d.email || "—")}</td>
                <td class="hub-ov-muted">${escapeHtml(d.phone || "—")}</td>
                ${detachCell}
            </tr>`;
        }).join("")
        : `<tr><td colspan="4" class="hub-ov-empty">${t("hub_no_drivers")}</td></tr>`;

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
                            <th>${t("table_actions") || "Action"}</th>
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
            <button type="button" class="btn-primary hub-action-btn" ${actionAttr("openVehiclesFromPlan")}>${t("hub_edit_buses")}</button>
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
    applyOperationalReadOnlyToHub();

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function applyOperationalReadOnlyToHub() {
    const readOnly = isOperationalReadOnly();
    const bannerId = "ops-readonly-banner";
    let banner = document.getElementById(bannerId);
    const hub = document.getElementById("dispatcher-group-hub");
    const slot = document.getElementById("ops-readonly-banner-slot");
    if (readOnly && hub) {
        if (!banner) {
            banner = document.createElement("div");
            banner.id = bannerId;
            banner.setAttribute("role", "status");
            banner.setAttribute("data-i18n", "ops_readonly_banner");
            banner.style.cssText = "position:sticky;top:0;z-index:40;margin:0 0 12px;padding:12px 14px;border-radius:10px;background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.55);color:#fbbf24;font-size:0.9rem;font-weight:700;letter-spacing:0.01em;box-shadow:0 4px 16px rgba(0,0,0,0.25);";
            (slot || hub).insertBefore(banner, (slot || hub).firstChild);
        }
        banner.textContent = t("ops_readonly_banner") || "Read-only view — Company Admin can inspect groups but cannot change plans, buses, or assignments.";
        banner.classList.remove("hidden");
        banner.removeAttribute("hidden");
    } else if (banner) {
        banner.classList.add("hidden");
        banner.setAttribute("hidden", "");
    }

    const addForm = document.getElementById("add-bus-form");
    if (addForm) addForm.style.display = readOnly ? "none" : "";
    const importBox = document.querySelector(".hub-bus-import, .vehicles-bus-import");
    if (importBox) importBox.style.display = readOnly ? "none" : "";
    const packageImport = document.getElementById("group-hub-step-import");
    if (packageImport) packageImport.style.display = readOnly ? "none" : "";
    const extraImport = document.getElementById("hub-section-extra-import");
    if (extraImport) extraImport.style.display = readOnly ? "none" : "";
    const monthlyImport = document.getElementById("dispo-monthly-plan-import");
    if (monthlyImport) monthlyImport.style.display = readOnly ? "none" : "";
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
    // Ops card opens the daily plan — keep CTA copy honest (hub stays reachable from Reports / filters).
    renderGroupsPickerGrid("dashboard-groups-grid", "openDailyPlanForGroup", "plan_pick_open");
}

function openVehiclesFromPlan() {
    const groupId = getHubGroupId() || window.state.activeGroupFilter;
    if (!groupId) {
        switchSection("dispatcher-vehicles");
        return;
    }
    adoptActiveGroup(groupId);
    // Lazy import avoided — register window.openVehiclesForGroup from vehicles-panel.
    if (typeof window.openVehiclesForGroup === "function") {
        window.openVehiclesForGroup(groupId);
        return;
    }
    switchSection("dispatcher-vehicles");
}

/**
 * Product entry for monthly Dienstplan: import a finished schedule (or open
 * the monthly editor to assign real days). Never creates empty Frei shells.
 *
 * FAZA 2R-B.1.2: open the native file chooser in the same user-activation turn.
 * Scroll/highlight is visual only and must never wrap input.click().
 */
function openMonthlyPlanImport(_event) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    if (!getHubGroupId()) {
        showToast(t("hub_import_monthly_need_group") || "Prvo otvorite grupu.", "error");
        return;
    }
    openMonthlyPlansFull();
    const input = document.getElementById("bulk-plan-import-files");
    // Must stay synchronous with the click handler — no setTimeout around .click().
    if (input && typeof input.click === "function") {
        input.click();
    }
    const zone = document.getElementById("dispo-monthly-plan-import")
        || document.getElementById("plan-import-dropzone");
    if (zone) {
        zone.scrollIntoView({ behavior: "smooth", block: "center" });
        zone.classList.add("hub-panel-target");
        window.setTimeout(() => zone.classList.remove("hub-panel-target"), 1400);
    }
}

/** @deprecated koristi scrollHubSection */
function setGroupHubTab() {
    /* tabs uklonjeni — jedan ekran */
}

export {
    getHubGroupId,
    openGroupHub,
    enforceDispatcherGroupScope,
    closeGroupHub,
    openMonthlyPlansFull,
    openDailyPlanFull,
    openDailyPlanForGroup,
    openMonthlyPlanForGroup,
    openVehiclesFromPlan,
    openMonthlyPlanImport,
    backFromPlanFullPage,
    scrollHubSection,
    setGroupHubTab,
    renderGroupHub,
    renderDashboardGroupsGrid,
    renderPlanGroupPicker,
    migrateLineMembership
};

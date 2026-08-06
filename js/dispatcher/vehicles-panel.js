// Dispatcher Vehicles panel — bus import / changes / group scope (split from Group Hub).
import { t } from "../ui/i18n.js";
import { switchSection } from "../layout/navigation.js";
import { activateShiftCatalogForLine, ensureShiftCatalogForEdit } from "../core/line-shift-catalog.js";
import { loadActiveServicePlanForLine } from "../core/service-plan.js";
import { renderBusesList } from "../data/buses-routes.js";
import { getGroupById } from "../data/groups.js";
import { paintPlanHealthBanner } from "./plan-health-banner.js";
import { migrateLineMembership, getHubGroupId } from "./group-hub.js";
import { isOperationalReadOnly } from "../core/access.js";

function openVehiclesForGroup(groupId) {
    if (!groupId) return;
    window.state.activeGroupHubId = groupId;
    window.state.activeGroupFilter = groupId;
    migrateLineMembership(groupId);
    activateShiftCatalogForLine(groupId);
    ensureShiftCatalogForEdit(groupId);
    loadActiveServicePlanForLine(groupId).catch(() => {});
    switchSection("dispatcher-vehicles");
}

function renderDispatcherVehicles() {
    const groupId = getHubGroupId() || window.state.activeGroupFilter;
    const group = groupId ? getGroupById(groupId) : null;
    const title = document.getElementById("vehicles-panel-title");
    const sub = document.getElementById("vehicles-panel-subtitle");
    if (title) {
        title.textContent = group
            ? `${t("nav_vehicles") || "Vehicles"} — ${group.name}`
            : (t("nav_vehicles") || "Vehicles");
    }
    if (sub) {
        sub.textContent = group
            ? (t("vehicles_panel_sub_group", { id: group.id }) || `Line ${group.id}: import, changes, group assignment.`)
            : (t("vehicles_panel_sub") || "Pick a group from Ops or Daily first, then manage buses here.");
    }

    paintPlanHealthBanner("vehicles-plan-health", { groupId });

    const form = document.getElementById("add-bus-form");
    const importBlock = document.querySelector(".vehicles-bus-import");
    const readOnly = isOperationalReadOnly();
    if (form) form.hidden = readOnly || !groupId;
    if (importBlock) importBlock.hidden = readOnly || !groupId;

    if (!groupId) {
        const list = document.getElementById("settings-buses-list");
        if (list) {
            list.innerHTML = `<li class="empty-state">${t("vehicles_need_group") || "Open a group from Operations or Daily plan first."}</li>`;
        }
        return;
    }

    renderBusesList();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

export { openVehiclesForGroup, renderDispatcherVehicles };

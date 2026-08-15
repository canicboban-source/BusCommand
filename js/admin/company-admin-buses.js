// BusCommand — Company Admin read-only fleet (§17 / Ch15)
import { escapeHtml, showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { getCompanyScope } from "./company-admin.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { normalizeBusOpsStatus, normalizeBusPlate } from "../data/bus-ops.js";

const OPS_STATUS_BADGE_TONE = Object.freeze({
    active: "approved",
    breakdown: "rejected",
    reserve: "pending",
    other_line: "pending"
});

function groupName(groups, groupId) {
    const match = (groups || []).find((group) => group.id === groupId);
    return match?.name || groupId || "—";
}

function busGroupLabels(bus, groups) {
    const ids = Array.isArray(bus.groupIds) && bus.groupIds.length
        ? bus.groupIds
        : (bus.groupId ? [bus.groupId] : []);
    if (!ids.length) return "—";
    return ids.map((id) => groupName(groups, id)).join(", ");
}

function renderCompanyAdminBuses() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return;
    const scope = getCompanyScope(window.state, window.currentUser, USE_LOCAL_STATE);
    const note = document.getElementById("ca-buses-readonly-note");
    if (note) {
        note.textContent = t("ca_buses_readonly_note")
            || "Read-only fleet overview. Dispatchers attach and manage buses in daily ops.";
    }
    const tbody = document.getElementById("ca-buses-table-body");
    const countEl = document.getElementById("ca-buses-count");
    if (countEl) countEl.textContent = String(scope.buses.length);
    if (!tbody) return;
    tbody.replaceChildren();
    if (!scope.buses.length) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 4;
        cell.style.textAlign = "center";
        cell.style.color = "var(--text-muted)";
        cell.textContent = t("ca_buses_empty") || "No buses in this company yet.";
        return;
    }
    const sorted = [...scope.buses].sort((a, b) =>
        String(a.number || a.id || "").localeCompare(String(b.number || b.id || ""), undefined, { numeric: true })
    );
    for (const bus of sorted) {
        const row = tbody.insertRow();
        const active = bus.active !== false;
        row.insertCell().innerHTML = `${escapeHtml(bus.number || bus.id || "—")}${active ? "" : ` <small>· ${escapeHtml(t("driver_status_inactive") || "Inactive")}</small>`}`;
        row.insertCell().textContent = normalizeBusPlate(bus) || "—";
        row.insertCell().textContent = busGroupLabels(bus, scope.groups);
        const statusCell = row.insertCell();
        const ops = normalizeBusOpsStatus(bus);
        const tone = OPS_STATUS_BADGE_TONE[ops] || "pending";
        statusCell.innerHTML = `<span class="badge ${tone}">${escapeHtml(t(`bus_ops_${ops}`) || ops)}</span>`;
    }
}

function openCompanyBusesOverview() {
    if (window.currentUser?.role !== "company-admin") {
        showToast(t("error_access_denied"), "error");
        return;
    }
    if (typeof window.switchSection === "function") {
        window.switchSection("company-admin-buses");
    }
}

export { renderCompanyAdminBuses, openCompanyBusesOverview };

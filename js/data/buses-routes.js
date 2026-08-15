// BusCommand ESM v9.5
import { getBusesForLineGroup } from "./group-membership.js";
import { busHasGroup, withAttachedGroup, withDetachedGroup, buildNewBusGroups } from "./bus-group-membership.js";
import {
    BUS_OPS_STATUSES,
    busRevisionOf,
    normalizeBusOpsStatus,
    normalizeBusPlate
} from "./bus-ops.js";
import { getGroupById } from "./groups.js";
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";
import { isOperationalReadOnly } from "../core/access.js";
import { dispoChangeReasonOptions, recordDemoChangeReason } from "../dispatcher/change-reason.js";

function findCompanyBusByNumber(number) {
    const key = String(number || "").trim().toLowerCase();
    return (window.state.buses || []).find((b) => String(b.number || "").trim().toLowerCase() === key) || null;
}

function upsertLocalBusFromApi(bus) {
    if (!bus?.id) return;
    const idx = window.state.buses.findIndex((item) => item.id === bus.id);
    if (idx >= 0) window.state.buses[idx] = { ...window.state.buses[idx], ...bus };
    else window.state.buses.push(bus);
}

function toastBusWriteConflict(result) {
    if (result?.bus) upsertLocalBusFromApi(result.bus);
    showToast(t(result?.code === "GARAGE_BUSY" ? "bus_garage_busy" : "bus_conflict_refresh"), "error");
}

function opsStatusLabel(status) {
    const key = `bus_ops_${normalizeBusOpsStatus(status)}`;
    return t(key) || normalizeBusOpsStatus(status);
}

function opsStatusOptions(selected) {
    const current = normalizeBusOpsStatus(selected);
    return BUS_OPS_STATUSES.map((status) =>
        `<option value="${status}" ${status === current ? "selected" : ""}>${escapeHtml(opsStatusLabel(status))}</option>`
    ).join("");
}

function primaryGroupId(bus) {
    if (Array.isArray(bus?.groupIds) && bus.groupIds.length) return String(bus.groupIds[0]);
    return String(bus?.groupId || bus?.lineId || "").trim();
}

function busGroupLabel(bus) {
    const gid = primaryGroupId(bus);
    if (!gid) return "—";
    return getGroupById(gid)?.name || gid;
}

function groupSwitchOptionsHtml(selectedGroupId) {
    const groups = window.state.groups || [];
    return groups.map((g) =>
        `<option value="${escapeHtml(g.id)}" ${String(g.id) === String(selectedGroupId) ? "selected" : ""}>${escapeHtml(g.name || g.id)}</option>`
    ).join("");
}

function statusPillsHtml(busId, current, readOnly) {
    return BUS_OPS_STATUSES.map((status) => {
        const isCurrent = status === current;
        const attrs = isCurrent || readOnly
            ? "disabled"
            : actionAttr("quickSetBusStatus", [busId, status]);
        return `<button type="button" class="bus-status-pill bus-status-${status}${isCurrent ? " is-current" : ""}" ${attrs}>${escapeHtml(opsStatusLabel(status))}</button>`;
    }).join("");
}

function renderAddBusFormOptions(activeGrp) {
    const groupSelect = document.getElementById("new-bus-group");
    if (groupSelect) groupSelect.innerHTML = groupSwitchOptionsHtml(activeGrp);
    const statusSelect = document.getElementById("new-bus-status");
    if (statusSelect && !statusSelect.options.length) statusSelect.innerHTML = opsStatusOptions("active");
}

function renderBusesList() {
    const tbody = document.getElementById("settings-buses-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    renderAddBusFormOptions(activeGrp);
    const myBuses = activeGrp ? getBusesForLineGroup(activeGrp) : (window.state.buses || []);
    const readOnly = isOperationalReadOnly();
    if (!myBuses.length) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5;
        cell.style.textAlign = "center";
        cell.style.color = "var(--text-muted)";
        cell.textContent = t("ca_buses_empty") || "No buses in this company yet.";
        return;
    }
    myBuses.forEach((b) => {
        const active = b.active !== false;
        const plate = normalizeBusPlate(b);
        const ops = normalizeBusOpsStatus(b);
        const row = document.createElement("tr");
        row.className = "hub-bus-row";
        row.dataset.busId = String(b.id);

        const numberCell = row.insertCell();
        numberCell.innerHTML = `<strong>${escapeHtml(b.number)}</strong>${active ? "" : ` <small>· ${escapeHtml(t("driver_status_inactive"))}</small>`}`;

        const plateCell = row.insertCell();
        plateCell.dataset.busPlateCell = "1";
        plateCell.textContent = plate || "—";

        const groupCell = row.insertCell();
        groupCell.innerHTML = readOnly
            ? escapeHtml(busGroupLabel(b))
            : `<select class="bus-group-switch" ${changeAttr("changeBusGroup", [b.id], "args-value")}>${groupSwitchOptionsHtml(primaryGroupId(b))}</select>`;

        const statusCell = row.insertCell();
        statusCell.className = "bus-status-cell";
        statusCell.innerHTML = statusPillsHtml(b.id, ops, readOnly);

        const actionsCell = row.insertCell();
        const editBtn = readOnly
            ? ""
            : `<button type="button" class="btn-secondary hub-bus-edit-btn" ${actionAttr("toggleBusEdit", [b.id])}>${escapeHtml(t("btn_edit"))}</button>`;
        const deleteBtn = readOnly
            ? ""
            : `<button type="button" class="hub-bus-toggle ${active ? "is-active" : "is-inactive"}" ${actionAttr("deleteBus", [b.id])} title="${escapeHtml(active ? (t("dispo_bus_deactivate_hint") || "") : (t("btn_activate") || ""))}">
                ${active ? (t("dispo_bus_deactivate") || t("btn_deactivate")) : t("btn_activate")}
            </button>`;
        actionsCell.innerHTML = `${editBtn}${deleteBtn}`;

        const editRow = document.createElement("tr");
        editRow.className = "hub-bus-edit-row hidden";
        editRow.innerHTML = `
            <td colspan="5">
                <form class="hub-bus-edit-form" data-bus-edit="${escapeHtml(b.id)}" data-submit-action="saveBusOpsProfile">
                    <label>
                        <span>${escapeHtml(t("table_plate") || "Tablice")}</span>
                        <input type="text" name="plate" maxlength="20" value="${escapeHtml(plate)}" data-i18n-placeholder="ph_bus_plate">
                    </label>
                    <div class="hub-bus-edit-actions">
                        <button type="button" class="btn-secondary" ${actionAttr("toggleBusEdit", [b.id])}>${escapeHtml(t("btn_cancel"))}</button>
                        <button type="submit" class="btn-primary">${escapeHtml(t("btn_save_changes"))}</button>
                    </div>
                </form>
            </td>
        `;

        tbody.appendChild(row);
        tbody.appendChild(editRow);
    });
}

function toggleBusEdit(busId) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const form = document.querySelector(`[data-bus-edit="${CSS.escape(String(busId))}"]`);
    const row = form?.closest("tr");
    if (!row) return;
    row.classList.toggle("hidden");
    if (!row.classList.contains("hidden")) {
        form.querySelector("input[name='plate']")?.focus();
    }
}

/** Shared PUT /buses/:id path for both the plate edit form and the quick status pills. */
async function applyBusProfileUpdate(bus, { plate, opsStatus }) {
    const expectedRevision = busRevisionOf(bus);
    if (!USE_LOCAL_STATE) {
        const result = await ApiClient.updateStaffBus(bus.id, { plate, garage: "", opsStatus, expectedRevision });
        if (!result?.success) {
            if (result?.status === 409 || result?.code === "REVISION_CONFLICT" || result?.code === "GARAGE_BUSY") {
                toastBusWriteConflict(result);
            } else {
                showToast(result?.error || t("bus_edit_failed"), "error");
            }
            renderBusesList();
            if (typeof lucide !== "undefined") lucide.createIcons();
            return false;
        }
        upsertLocalBusFromApi(result.bus || { id: bus.id, plate, opsStatus, revision: expectedRevision + 1 });
    } else {
        Object.assign(bus, { plate, opsStatus, revision: expectedRevision + 1 });
        saveState();
    }
    return true;
}

async function saveBusOpsProfile(event) {
    if (event?.preventDefault) event.preventDefault();
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const form = event?.target?.closest?.("[data-bus-edit]") || event?.target;
    const busId = String(form?.dataset?.busEdit || "").trim();
    const bus = (window.state.buses || []).find((item) => item.id === busId);
    if (!bus || !form) return;
    const plate = normalizeBusPlate(form.querySelector("input[name='plate']")?.value || "");
    if (!await applyBusProfileUpdate(bus, { plate, opsStatus: normalizeBusOpsStatus(bus) })) return;
    showToast(t("bus_edit_saved"), "success");
    renderBusesList();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function quickSetBusStatus(busId, opsStatus) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const bus = (window.state.buses || []).find((item) => item.id === busId);
    if (!bus) return;
    if (!await applyBusProfileUpdate(bus, { plate: normalizeBusPlate(bus), opsStatus: normalizeBusOpsStatus(opsStatus) })) return;
    renderBusesList();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function changeBusGroup(busId, toGroupId) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const bus = (window.state.buses || []).find((item) => item.id === busId);
    const gid = String(toGroupId || "").trim();
    if (!bus || !gid) return;
    if (primaryGroupId(bus) === gid) return;
    const expectedRevision = busRevisionOf(bus);
    if (!USE_LOCAL_STATE) {
        const result = await ApiClient.switchStaffBusGroup(busId, gid, expectedRevision);
        if (!result?.success) {
            if (result?.status === 409 || result?.code === "REVISION_CONFLICT") toastBusWriteConflict(result);
            else showToast(result?.error || t("bus_status_failed"), "error");
            renderBusesList();
            if (typeof lucide !== "undefined") lucide.createIcons();
            return;
        }
        upsertLocalBusFromApi(result.bus);
    } else {
        Object.assign(bus, withDetachedGroup(bus, primaryGroupId(bus)));
        Object.assign(bus, withAttachedGroup(bus, gid));
        bus.revision = expectedRevision + 1;
        saveState();
    }
    showToast(t("bus_attached_to_group") || "Bus linked to this group", "success");
    renderBusesList();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function addBus(event) {
    event.preventDefault();
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const input = document.getElementById("new-bus-num");
    const plateInput = document.getElementById("new-bus-plate");
    const groupSelect = document.getElementById("new-bus-group");
    const statusSelect = document.getElementById("new-bus-status");
    const number = input.value.trim();
    const plate = normalizeBusPlate(plateInput?.value || "");
    const opsStatus = normalizeBusOpsStatus(statusSelect?.value || "active");
    if (!number) return;

    const hubId = window.state.activeGroupHubId;
    const selectedGrp = String(groupSelect?.value || "").trim();
    const activeGrp = selectedGrp || hubId || (window.currentUser && window.currentUser.activeGroupId);
    if (!activeGrp) {
        showToast(t("bus_import_need_group"), "error");
        return;
    }

    showConfirm(
        (t("confirm_add_bus") || "Add bus") + ': "' + number + '"?',
        async function() {
            if (!USE_LOCAL_STATE) {
                const result = await ApiClient.createStaffBus(number, activeGrp, { plate, opsStatus });
                if (!result?.success) {
                    const detail = String(result?.error || "").trim();
                    showToast(
                        detail || t("bus_add_failed") || "The bus could not be added.",
                        "error"
                    );
                    return;
                }
                if (!Array.isArray(window.state.buses)) window.state.buses = [];
                upsertLocalBusFromApi(result.bus);
                input.value = "";
                if (plateInput) plateInput.value = "";
                renderBusesList();
                if (typeof lucide !== "undefined") lucide.createIcons();
                const msg = result.attached
                    ? t("bus_attached_to_group") || "Bus linked to this group"
                    : (result.alreadyInGroup
                        ? t("bus_already_in_group") || "Bus already in this group"
                        : (number + " — " + (t("bus_added") || "vozilo dodano")));
                showToast(msg, result.alreadyInGroup ? "info" : "success");
                return;
            }

            const existing = findCompanyBusByNumber(number);
            if (existing) {
                if (busHasGroup(existing, activeGrp)) {
                    showToast(t("bus_already_in_group") || "Bus already in this group", "info");
                    input.value = "";
                    renderBusesList();
                    return;
                }
                Object.assign(existing, withAttachedGroup(existing, activeGrp));
                if (plate && !normalizeBusPlate(existing)) existing.plate = plate;
                saveState();
                input.value = "";
                if (plateInput) plateInput.value = "";
                renderBusesList();
                lucide.createIcons();
                showToast(t("bus_attached_to_group") || "Bus linked to this group", "success");
                return;
            }

            const groups = buildNewBusGroups(activeGrp);
            window.state.buses.push({
                id: `bus-${Date.now()}`,
                number,
                active: true,
                plate,
                opsStatus,
                revision: 0,
                ...groups
            });
            saveState();
            input.value = "";
            if (plateInput) plateInput.value = "";
            renderBusesList();
            lucide.createIcons();
            showToast(number + " — " + (t("bus_added") || "vozilo dodano"), "success");
        },
        { danger: false, title: t("btn_add_bus") || "Add Bus", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteBus(id) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const bus = window.state.buses.find((item) => item.id === id);
    if (!bus) return;
    const nextActive = bus.active === false;
    showConfirm(
        nextActive
            ? (t("confirm_activate_bus") || "Activate this bus?")
            : (t("dispo_confirm_bus_deactivate") || t("confirm_deactivate_bus") || "Deactivate this bus? It will stay in the company but will not be assignable."),
        async function(payload) {
        const reason = payload?.reason || "";
        const note = payload?.note || "";
        const expectedRevision = busRevisionOf(bus);
        if (!USE_LOCAL_STATE) {
            const result = await ApiClient.setStaffBusActive(id, nextActive, expectedRevision, nextActive ? {} : { reason, note });
            if (!result?.success) {
                if (result?.status === 409 || result?.code === "REVISION_CONFLICT") toastBusWriteConflict(result);
                else showToast(result?.error || t("bus_status_failed"), "error");
                renderBusesList();
                lucide.createIcons();
                return;
            }
            upsertLocalBusFromApi(result.bus || { id, active: result.active, revision: expectedRevision + 1 });
        } else {
            Object.assign(bus, { active: nextActive, revision: expectedRevision + 1 });
            if (!nextActive) {
                recordDemoChangeReason({
                    type: "bus_deactivated",
                    busId: id,
                    reason,
                    note
                });
            }
            saveState();
        }
        renderBusesList();
        lucide.createIcons();
    }, {
        danger: !nextActive,
        reasons: nextActive ? undefined : dispoChangeReasonOptions()
    });
}

function renderRoutesList() {
    const list = document.getElementById("settings-routes-list");
    if (!list) return;
    list.innerHTML = "";
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    const myRoutes = window.state.routes.filter(r => !r.groupId || r.groupId === activeGrp);
    myRoutes.forEach(r => {
        const li = document.createElement("li");
        const deleteBtn = USE_LOCAL_STATE
            ? `<button ${actionAttr("deleteRoute", [r.id])} style="align-self:center;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                ${t("btn_delete") || "Obriši"}
            </button>`
            : "";
        li.innerHTML = `
            <div class="crud-route-info">
                <div class="crud-route-header">
                    <span class="crud-route-num">${t("table_route")} ${r.number}</span>
                    <span class="crud-route-name">${r.name}</span>
                </div>
                <span class="crud-route-stops">${t("stops_plan")}: ${r.stops.join(" ➔ ")}</span>
            </div>
            ${deleteBtn}
        `;
        list.appendChild(li);
    });
}

function addRoute(event) {
    event.preventDefault();
    if (!USE_LOCAL_STATE) {
        showToast(t("fleet_demo_only") || "Upravljanje linijama u produkciji još nije dostupno preko ovog ekrana.", "info");
        return;
    }
    const num = document.getElementById("new-route-num").value.trim();
    const name = document.getElementById("new-route-name").value.trim();
    const stopsStr = document.getElementById("new-route-stops").value.trim();
    
    if (!num || !name || !stopsStr) return;
    
    const stops = stopsStr.split(",").map(s => s.trim()).filter(s => s.length > 0);
    
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    const newRoute = {
        id: `rt-${Date.now()}`,
        number: num,
        name: name,
        stops: stops,
        groupId: activeGrp
    };
    
    showConfirm(
        (t("confirm_add_route") || "Add route") + ': ' + num + ' ' + name + '?',
        function() {
            window.state.routes.push(newRoute);
            saveState();
            document.getElementById("add-route-form").reset();
            renderRoutesList();
            lucide.createIcons();
            showToast(num + " " + name + " — " + (t("route_added") || "linija dodana"), "success");
        },
        { danger: false, title: t("btn_add_route") || "Add Route", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteRoute(id) {
    if (!USE_LOCAL_STATE) {
        showToast(t("fleet_demo_only") || "Upravljanje linijama u produkciji još nije dostupno preko ovog ekrana.", "info");
        return;
    }
    if (window.state.routes.length <= 1) {
        showToast(t("js_alert_min_route_err") || "Cannot delete last route", "error");
        return;
    }
    showConfirm(t("js_alert_delete_route") || "Delete this route?", function() {
        window.state.routes = window.state.routes.filter(r => r.id !== id);
        saveState();
        renderRoutesList();
        lucide.createIcons();
    }, { danger: true });
}
export {
    renderBusesList,
    addBus,
    deleteBus,
    toggleBusEdit,
    saveBusOpsProfile,
    quickSetBusStatus,
    changeBusGroup,
    renderRoutesList,
    addRoute,
    deleteRoute,
    upsertLocalBusFromApi
};

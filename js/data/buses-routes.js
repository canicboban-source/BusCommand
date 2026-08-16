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
import { escapeHtml, showToast, refreshIcons } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";
import { isOperationalReadOnly } from "../core/access.js";
import { dispoChangeReasonOptions, recordDemoChangeReason } from "../dispatcher/change-reason.js";
import { tx, btnSecondary } from "../ui/markup.js";
import { rowActionsMenuHtml } from "../ui/row-actions-menu.js";

function blockedIfReadOnly() {
    if (!isOperationalReadOnly()) return false;
    showToast(t("error_ops_read_only"), "error");
    return true;
}

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

function refreshBusesUi() {
    renderBusesList();
    refreshIcons();
}

/** Call a bus write endpoint; on success upsert the returned (or fallback) bus. */
async function performBusWrite(apiCall, fallbackKey, localFallback) {
    const result = await apiCall();
    if (!result?.success) {
        if (result?.status === 409 || result?.code === "REVISION_CONFLICT" || result?.code === "GARAGE_BUSY") {
            toastBusWriteConflict(result);
        } else {
            showToast(result?.error || t(fallbackKey), "error");
        }
        refreshBusesUi();
        return false;
    }
    upsertLocalBusFromApi(result.bus || localFallback);
    return true;
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

function groupName(gid) {
    return getGroupById(gid)?.name || gid;
}

function busGroupLabel(bus) {
    const gid = primaryGroupId(bus);
    return gid ? groupName(gid) : "—";
}

function groupSwitchOptionsHtml(selectedGroupId) {
    const groups = window.state.groups || [];
    return groups.map((g) =>
        `<option value="${escapeHtml(g.id)}" ${String(g.id) === String(selectedGroupId) ? "selected" : ""}>${escapeHtml(g.name || g.id)}</option>`
    ).join("");
}

function statusCellHtml(bus, ops, readOnly) {
    const pills = BUS_OPS_STATUSES.map((status) => {
        const isCurrent = status === ops;
        const attrs = isCurrent || readOnly ? "disabled" : actionAttr("quickSetBusStatus", [bus.id, status]);
        return `<button type="button" class="bus-status-pill bus-status-${status}${isCurrent ? " is-current" : ""}" ${attrs}>${escapeHtml(opsStatusLabel(status))}</button>`;
    }).join("");
    if (ops !== "other_line" || !bus.otherLineId) return pills;
    const text = t("bus_other_line_badge").replace("{line}", groupName(bus.otherLineId));
    return `${pills}<span class="bus-other-line-badge">${escapeHtml(text)}</span>`;
}

function renderAddBusFormOptions(activeGrp) {
    const groupSelect = document.getElementById("new-bus-group");
    if (groupSelect) groupSelect.innerHTML = groupSwitchOptionsHtml(activeGrp);
    const statusSelect = document.getElementById("new-bus-status");
    if (statusSelect && !statusSelect.options.length) statusSelect.innerHTML = opsStatusOptions("active");
}

let showArchivedBuses = false;

function toggleShowArchivedBuses(input) {
    showArchivedBuses = Boolean(input?.checked);
    renderBusesList();
}

function renderBusesList() {
    const tbody = document.getElementById("settings-buses-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    renderAddBusFormOptions(activeGrp);
    const allBuses = activeGrp ? getBusesForLineGroup(activeGrp) : (window.state.buses || []);
    const myBuses = allBuses.filter((b) => showArchivedBuses || b.active !== false);
    const readOnly = isOperationalReadOnly();
    if (!myBuses.length) {
        const archivedCount = allBuses.length - myBuses.length;
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5;
        cell.style.textAlign = "center";
        cell.style.color = "var(--text-muted)";
        cell.textContent = archivedCount
            ? t("bus_all_archived_hint").replace("{count}", archivedCount)
            : (t("ca_buses_empty") || "No buses in this company yet.");
        return;
    }
    myBuses.forEach((b) => {
        const active = b.active !== false;
        const plate = normalizeBusPlate(b);
        const ops = normalizeBusOpsStatus(b);
        const row = document.createElement("tr");
        row.className = "bus-fleet-row";
        row.dataset.busId = String(b.id);

        const numberCell = row.insertCell();
        numberCell.innerHTML = `<strong>${escapeHtml(b.number)}</strong>${active ? "" : ` <small>· ${tx("driver_status_inactive")}</small>`}`;

        const plateCell = row.insertCell();
        plateCell.dataset.busPlateCell = "1";
        plateCell.textContent = plate || "—";

        const groupCell = row.insertCell();
        groupCell.innerHTML = readOnly
            ? escapeHtml(busGroupLabel(b))
            : `<select class="bus-group-switch" ${changeAttr("changeBusGroup", [b.id], "args-value")}>${groupSwitchOptionsHtml(primaryGroupId(b))}</select>`;

        const statusCell = row.insertCell();
        statusCell.className = "bus-status-cell";
        // Flex on the inner div only: display:flex on a <td> drops the
        // table-cell layout and pushes ACTIONS onto a second line.
        statusCell.innerHTML = `<div class="bus-status-pills">${statusCellHtml(b, ops, readOnly)}</div>`;

        const actionsCell = row.insertCell();
        actionsCell.className = "bus-fleet-actions";
        // Single ⋮ menu replaces the inline edit/deactivate button row (D25 UI unification).
        const busMenuItems = readOnly
            ? []
            : [
                {
                    action: "toggleBusEdit",
                    args: [b.id],
                    label: t("dispo_bus_edit_data"),
                    icon: "pencil",
                    className: "hub-bus-edit-btn"
                },
                {
                    action: "deleteBus",
                    args: [b.id],
                    label: active ? (t("dispo_bus_deactivate") || t("btn_deactivate")) : t("btn_activate"),
                    icon: active ? "circle-pause" : "circle-check",
                    className: `hub-bus-toggle ${active ? "is-active" : "is-inactive"}`,
                    danger: active,
                    title: active ? (t("dispo_bus_deactivate_hint") || "") : (t("btn_activate") || "")
                }
            ];
        actionsCell.innerHTML = `<div class="bus-fleet-actions-inner">${rowActionsMenuHtml(`ops-bus-${b.id}`, busMenuItems)}</div>`;

        const editRow = document.createElement("tr");
        editRow.className = "hub-bus-edit-row hidden";
        editRow.innerHTML = `
            <td colspan="5">
                <form class="hub-bus-edit-form" data-bus-edit="${escapeHtml(b.id)}" data-submit-action="saveBusOpsProfile">
                    <label>
                        <span>${tx("table_plate")}</span>
                        <input type="text" name="plate" maxlength="20" value="${escapeHtml(plate)}" data-i18n-placeholder="ph_bus_plate">
                    </label>
                    <div class="hub-bus-edit-actions">
                        ${btnSecondary(actionAttr("toggleBusEdit", [b.id]), `${tx("btn_cancel")}`)}
                        <button type="submit" class="btn-primary">${tx("btn_save_changes")}</button>
                    </div>
                </form>
            </td>
        `;

        tbody.appendChild(row);
        tbody.appendChild(editRow);
    });
}

function toggleBusEdit(busId) {
    if (blockedIfReadOnly()) return;
    const form = document.querySelector(`[data-bus-edit="${CSS.escape(String(busId))}"]`);
    const row = form?.closest("tr");
    if (!row) return;
    row.classList.toggle("hidden");
    if (!row.classList.contains("hidden")) {
        form.querySelector("input[name='plate']")?.focus();
    }
}

/** Shared PUT /buses/:id path for both the plate edit form and the quick status pills. */
async function applyBusProfileUpdate(bus, { plate, opsStatus, otherLineId }) {
    // Only "other_line" carries a target line — clear it the moment status moves away
    // from other_line, and keep the existing one if this call doesn't touch status.
    const nextOtherLineId = opsStatus === "other_line"
        ? (otherLineId !== undefined ? otherLineId : (bus.otherLineId || ""))
        : "";
    const expectedRevision = busRevisionOf(bus);
    if (!USE_LOCAL_STATE) {
        return performBusWrite(
            () => ApiClient.updateStaffBus(bus.id, { plate, garage: "", opsStatus, otherLineId: nextOtherLineId, expectedRevision }),
            "bus_edit_failed",
            { id: bus.id, plate, opsStatus, otherLineId: nextOtherLineId, revision: expectedRevision + 1 }
        );
    }
    Object.assign(bus, { plate, opsStatus, otherLineId: nextOtherLineId, revision: expectedRevision + 1 });
    saveState();
    return true;
}

async function saveBusOpsProfile(event) {
    if (event?.preventDefault) event.preventDefault();
    if (blockedIfReadOnly()) return;
    const form = event?.target?.closest?.("[data-bus-edit]") || event?.target;
    const busId = String(form?.dataset?.busEdit || "").trim();
    const bus = (window.state.buses || []).find((item) => item.id === busId);
    if (!bus || !form) return;
    const plate = normalizeBusPlate(form.querySelector("input[name='plate']")?.value || "");
    if (!await applyBusProfileUpdate(bus, { plate, opsStatus: normalizeBusOpsStatus(bus) })) return;
    showToast(t("bus_edit_saved"), "success");
    refreshBusesUi();
}

async function quickSetBusStatus(busId, opsStatus) {
    if (blockedIfReadOnly()) return;
    const bus = (window.state.buses || []).find((item) => item.id === busId);
    if (!bus) return;
    const nextStatus = normalizeBusOpsStatus(opsStatus);

    if (nextStatus === "other_line") {
        const otherGroups = (window.state.groups || []).filter((g) => String(g.id) !== primaryGroupId(bus));
        if (!otherGroups.length) {
            showToast(t("bus_other_line_no_groups"), "error");
            return;
        }
        showConfirm(
            t("bus_other_line_prompt"),
            async (payload) => {
                const otherLineId = payload?.reason || "";
                if (!otherLineId) return;
                if (!await applyBusProfileUpdate(bus, { plate: normalizeBusPlate(bus), opsStatus: nextStatus, otherLineId })) return;
                refreshBusesUi();
            },
            {
                danger: false,
                title: t("bus_ops_other_line"),
                confirmText: t("btn_yes"),
                reasons: otherGroups.map((g) => ({ value: g.id, label: g.name || g.id }))
            }
        );
        return;
    }

    if (!await applyBusProfileUpdate(bus, { plate: normalizeBusPlate(bus), opsStatus: nextStatus })) return;
    refreshBusesUi();
}

async function changeBusGroup(busId, toGroupId) {
    if (blockedIfReadOnly()) return;
    const bus = (window.state.buses || []).find((item) => item.id === busId);
    const gid = String(toGroupId || "").trim();
    if (!bus || !gid || primaryGroupId(bus) === gid) return;
    const expectedRevision = busRevisionOf(bus);
    if (!USE_LOCAL_STATE) {
        if (!await performBusWrite(() => ApiClient.switchStaffBusGroup(busId, gid, expectedRevision), "bus_status_failed")) return;
    } else {
        Object.assign(bus, withDetachedGroup(bus, primaryGroupId(bus)));
        Object.assign(bus, withAttachedGroup(bus, gid));
        bus.revision = expectedRevision + 1;
        saveState();
    }
    showToast(t("bus_attached_to_group") || "Bus linked to this group", "success");
    refreshBusesUi();
}

async function addBus(event) {
    event.preventDefault();
    if (blockedIfReadOnly()) return;
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
                refreshBusesUi();
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
                refreshBusesUi();
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
            refreshBusesUi();
            showToast(number + " — " + (t("bus_added") || "vozilo dodano"), "success");
        },
        { danger: false, title: t("btn_add_bus") || "Add Bus", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteBus(id) {
    if (blockedIfReadOnly()) return;
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
            if (!await performBusWrite(
                () => ApiClient.setStaffBusActive(id, nextActive, expectedRevision, nextActive ? {} : { reason, note }),
                "bus_status_failed",
                { id, active: nextActive, revision: expectedRevision + 1 }
            )) return;
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
        refreshBusesUi();
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
            ? `<button ${actionAttr("deleteRoute", [r.id])} class="bc-mini-btn is-danger is-solid is-self-center">${t("btn_delete") || "Obriši"}</button>`
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
            refreshIcons();
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
        refreshIcons();
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
    toggleShowArchivedBuses,
    renderRoutesList,
    addRoute,
    deleteRoute,
    upsertLocalBusFromApi
};

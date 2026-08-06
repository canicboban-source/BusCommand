// BusCommand ESM v9.5
import { getBusesForLineGroup } from "./group-membership.js";
import { busHasGroup, withAttachedGroup, buildNewBusGroups } from "./bus-group-membership.js";
import {
    BUS_OPS_STATUSES,
    busRevisionOf,
    normalizeBusGarage,
    normalizeBusOpsStatus
} from "./bus-ops.js";
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";
import { isOperationalReadOnly } from "../core/access.js";

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

function renderBusesList() {
    const list = document.getElementById("settings-buses-list");
    if (!list) return;
    list.innerHTML = "";
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    const myBuses = activeGrp ? getBusesForLineGroup(activeGrp) : (window.state.buses || []);
    const readOnly = isOperationalReadOnly();
    myBuses.forEach((b) => {
        const li = document.createElement("li");
        li.className = "hub-bus-item";
        li.dataset.busId = String(b.id);
        const active = b.active !== false;
        const garage = normalizeBusGarage(b);
        const ops = normalizeBusOpsStatus(b);
        const meta = [
            opsStatusLabel(ops),
            garage || (t("bus_garage_unset") || "bez garaže")
        ].join(" · ");
        const deleteBtn = readOnly
            ? ""
            : `<button type="button" class="hub-bus-toggle ${active ? "is-active" : "is-inactive"}" ${actionAttr("deleteBus", [b.id])} title="${escapeHtml(active ? (t("dispo_bus_deactivate_hint") || "") : (t("btn_activate") || ""))}">
                ${active ? (t("dispo_bus_deactivate") || t("btn_deactivate")) : t("btn_activate")}
            </button>`;
        const detachBtn = readOnly || !activeGrp
            ? ""
            : `<button type="button" class="btn-secondary hub-bus-detach-btn" ${actionAttr("detachBusFromLine", [b.id, activeGrp])}>
                ${escapeHtml(t("dispo_bus_remove_from_line") || "Remove from this line")}
            </button>`;
        const editBtn = readOnly
            ? ""
            : `<button type="button" class="btn-secondary hub-bus-edit-btn" ${actionAttr("toggleBusEdit", [b.id])}>${escapeHtml(t("btn_edit"))}</button>`;
        li.innerHTML = `
            <div class="hub-bus-row">
                <div class="hub-bus-identity">
                    <strong>${escapeHtml(t("vehicle"))} ${escapeHtml(b.number)}</strong>
                    <small>${escapeHtml(meta)}${active ? "" : ` · ${escapeHtml(t("driver_status_inactive"))}`}</small>
                </div>
                <div class="hub-bus-actions">${editBtn}${detachBtn}${deleteBtn}</div>
            </div>
            <form class="hub-bus-edit-form hidden" data-bus-edit="${escapeHtml(b.id)}" data-submit-action="saveBusOpsProfile">
                <label>
                    <span>${escapeHtml(t("bus_garage"))}</span>
                    <input type="text" name="garage" maxlength="40" value="${escapeHtml(garage)}" data-i18n-placeholder="bus_garage_placeholder">
                </label>
                <label>
                    <span>${escapeHtml(t("bus_ops_status"))}</span>
                    <select name="opsStatus">${opsStatusOptions(ops)}</select>
                </label>
                <div class="hub-bus-edit-actions">
                    <button type="button" class="btn-secondary" ${actionAttr("toggleBusEdit", [b.id])}>${escapeHtml(t("btn_cancel"))}</button>
                    <button type="submit" class="btn-primary">${escapeHtml(t("btn_save_changes"))}</button>
                </div>
            </form>
        `;
        list.appendChild(li);
    });
}

function toggleBusEdit(busId) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const form = document.querySelector(`[data-bus-edit="${CSS.escape(String(busId))}"]`);
    if (!form) return;
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) {
        form.querySelector("input[name='garage']")?.focus();
    }
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
    const garage = normalizeBusGarage(form.querySelector("input[name='garage']")?.value || "");
    const opsStatus = normalizeBusOpsStatus(form.querySelector("select[name='opsStatus']")?.value || "ready");
    const expectedRevision = busRevisionOf(bus);
    if (!IS_DEMO_MODE) {
        const result = await ApiClient.updateStaffBus(busId, { garage, opsStatus, expectedRevision });
        if (!result?.success) {
            if (result?.status === 409 || result?.code === "REVISION_CONFLICT" || result?.code === "GARAGE_BUSY") {
                toastBusWriteConflict(result);
            } else {
                showToast(result?.error || t("bus_edit_failed"), "error");
                return;
            }
            renderBusesList();
            if (typeof lucide !== "undefined") lucide.createIcons();
            return;
        }
        upsertLocalBusFromApi(result.bus || { id: busId, garage, opsStatus, revision: expectedRevision + 1 });
    } else {
        Object.assign(bus, { garage, opsStatus, revision: expectedRevision + 1 });
        saveState();
    }
    showToast(t("bus_edit_saved"), "success");
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
    const garageInput = document.getElementById("new-bus-garage");
    const number = input.value.trim();
    const garage = normalizeBusGarage(garageInput?.value || "");
    if (!number) return;

    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    if (!activeGrp) {
        showToast(t("bus_import_need_group"), "error");
        return;
    }

    showConfirm(
        (t("confirm_add_bus") || "Add bus") + ': "' + number + '"?',
        async function() {
            if (!IS_DEMO_MODE) {
                const result = await ApiClient.createStaffBus(number, activeGrp, { garage, opsStatus: "ready" });
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
                if (garageInput) garageInput.value = "";
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
                if (garage && !normalizeBusGarage(existing)) existing.garage = garage;
                saveState();
                input.value = "";
                if (garageInput) garageInput.value = "";
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
                garage,
                opsStatus: "ready",
                revision: 0,
                ...groups
            });
            saveState();
            input.value = "";
            if (garageInput) garageInput.value = "";
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
        async function() {
        const expectedRevision = busRevisionOf(bus);
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.setStaffBusActive(id, nextActive, expectedRevision);
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
            saveState();
        }
        renderBusesList();
        lucide.createIcons();
    }, { danger: !nextActive });
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
        const deleteBtn = IS_DEMO_MODE
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
    if (!IS_DEMO_MODE) {
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
    if (!IS_DEMO_MODE) {
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
    renderRoutesList,
    addRoute,
    deleteRoute,
    upsertLocalBusFromApi
};

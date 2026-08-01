// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { getBusesForLineGroup } from "./group-membership.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import ApiClient from "../core/api-client.js";
import { parseBusImportText, validateBusImportFile } from "../imports/bus-csv-import.js";

let pendingBusImport = null;
let editingBusId = null;

function activeBusGroupId() {
    return window.state.activeGroupHubId || window.currentUser?.activeGroupId || "";
}

function renderBusesList() {
    const list = document.getElementById("settings-buses-list");
    if (!list) return;
    list.innerHTML = "";
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    const myBuses = activeGrp ? getBusesForLineGroup(activeGrp) : (window.state.buses || []);
    myBuses.forEach(b => {
        const li = document.createElement("li");
        const active = b.active !== false;
        const statusBtn = `<button type="button" ${actionAttr("deleteBus", [b.id])} style="background:rgba(239,68,68,0.08);color:${active ? "#ef4444" : "#16a34a"};border:1px solid currentColor;padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                ${active ? (t("btn_deactivate") || "Deactivate") : (t("btn_activate") || "Activate")}
            </button>`;
        if (editingBusId === b.id) {
            li.innerHTML = `<form class="hub-bus-edit-form" data-submit-action="saveBusEdit" data-bus-id="${escapeHtml(b.id)}">
                <label class="sr-only" for="edit-bus-${escapeHtml(b.id)}">${escapeHtml(t("bus_edit_number"))}</label>
                <input id="edit-bus-${escapeHtml(b.id)}" name="number" value="${escapeHtml(b.number)}" maxlength="32" required>
                <button type="submit" class="btn-primary">${escapeHtml(t("btn_save"))}</button>
                <button type="button" class="btn-secondary" ${actionAttr("cancelBusEdit")}>${escapeHtml(t("btn_cancel"))}</button>
            </form>`;
        } else {
            li.innerHTML = `
                <span>${escapeHtml(t("vehicle"))} ${escapeHtml(b.number)} <small style="color:var(--text-muted);">${active ? "" : `(${escapeHtml(t("driver_status_inactive"))})`}</small></span>
                <span class="hub-bus-row-actions">
                    <button type="button" class="btn-secondary" ${actionAttr("startEditBus", [b.id])}>${escapeHtml(t("btn_edit"))}</button>
                    ${statusBtn}
                </span>
            `;
        }
        list.appendChild(li);
    });
}

function startEditBus(id) {
    if (!window.state.buses.some(bus => bus.id === id)) return;
    editingBusId = id;
    renderBusesList();
    document.querySelector(`[data-bus-id="${CSS.escape(id)}"] input[name="number"]`)?.focus();
}

function cancelBusEdit() {
    editingBusId = null;
    renderBusesList();
}

async function saveBusEdit(event) {
    event.preventDefault();
    const form = event.target?.closest?.('[data-submit-action="saveBusEdit"]') || event.target;
    const id = form?.dataset?.busId || "";
    const bus = window.state.buses.find(item => item.id === id);
    const number = String(form?.elements?.number?.value || "").trim();
    if (!bus || !number) {
        showToast(t("bus_edit_invalid"), "error");
        return;
    }
    const duplicate = window.state.buses.some(item =>
        item.id !== id && String(item.number || "").toLocaleLowerCase() === number.toLocaleLowerCase()
    );
    if (duplicate) {
        showToast(t("bus_edit_duplicate"), "error");
        return;
    }

    if (!IS_DEMO_MODE) {
        const result = await ApiClient.updateStaffBus(id, number);
        if (!result?.success || !result.bus) {
            const errorKey = result?.code === "bus_number_duplicate"
                ? "bus_edit_duplicate"
                : "bus_edit_failed";
            showToast(t(errorKey), "error");
            return;
        }
        Object.assign(bus, result.bus);
    } else {
        bus.number = number;
        saveState();
    }

    editingBusId = null;
    renderBusesList();
    if (typeof lucide !== "undefined") lucide.createIcons();
    showToast(t("bus_edit_saved", { number }), "success");
}

async function addBus(event) {
    event.preventDefault();
    const input = document.getElementById("new-bus-num");
    const number = input.value.trim();
    if (!number) return;
    
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    const newBus = {
        id: `bus-${Date.now()}`,
        number: number,
        groupId: activeGrp
    };
    showConfirm(
        (t("confirm_add_bus") || "Add bus") + ': "' + number + '"?',
        async function() {
            if (!IS_DEMO_MODE) {
                const result = await ApiClient.createStaffBus(number, activeGrp);
                if (!result?.success) {
                    showToast(t("bus_add_failed"), "error");
                    return;
                }
                if (!window.state.buses.some((bus) => bus.id === result.bus.id)) {
                    window.state.buses.push(result.bus);
                }
            } else {
            window.state.buses.push(newBus);
                saveState();
            }
            input.value = "";
            renderBusesList();
            lucide.createIcons();
            showToast(number + " — " + (t("bus_added") || "vozilo dodano"), "success");
        },
        { danger: false, title: t("btn_add_bus") || "Add Bus", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteBus(id) {
    const bus = window.state.buses.find((item) => item.id === id);
    if (!bus) return;
    const nextActive = bus.active === false;
    showConfirm(nextActive ? t("confirm_activate_bus") : t("confirm_deactivate_bus"), async function() {
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.setStaffBusActive(id, nextActive);
            if (!result?.success) {
                showToast(t("bus_status_failed"), "error");
                return;
            }
            bus.active = result.active;
        } else {
            bus.active = nextActive;
            saveState();
        }
        renderBusesList();
        lucide.createIcons();
    }, { danger: !nextActive });
}

function renderBusImportPreview() {
    const container = document.getElementById("bus-import-preview");
    if (!container) return;
    container.replaceChildren();
    if (!pendingBusImport) return;

    const summary = document.createElement("p");
    summary.className = "bus-import-preview__summary";
    summary.textContent = t("bus_import_preview", { count: pendingBusImport.numbers.length });
    container.appendChild(summary);

    const sample = document.createElement("p");
    sample.className = "bus-import-preview__sample";
    sample.textContent = pendingBusImport.numbers.slice(0, 12).join(", ");
    container.appendChild(sample);

    const actions = document.createElement("div");
    actions.className = "bus-import-preview__actions";

    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "btn-primary";
    confirm.dataset.action = "confirmBusImport";
    confirm.textContent = t("bus_import_confirm");

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "btn-secondary";
    clear.dataset.action = "clearBusImport";
    clear.textContent = t("btn_clear_preview") || t("btn_cancel");

    actions.append(confirm, clear);
    container.appendChild(actions);
}

async function handleBusImportFile(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (!validateBusImportFile(file)) {
        pendingBusImport = null;
        renderBusImportPreview();
        showToast(t("bus_import_invalid_file"), "error", 5000);
        return;
    }

    try {
        const parsed = parseBusImportText(await file.text());
        if (parsed.errors.length) {
            const first = parsed.errors[0];
            const key = first.code === "too_many_rows" ? "bus_import_too_many_rows" : "bus_import_invalid_rows";
            showToast(t(key, { line: first.line || "—" }), "error", 5000);
            pendingBusImport = null;
            renderBusImportPreview();
            return;
        }

        const existing = new Set((window.state.buses || []).map(bus => String(bus.number || "").toLocaleLowerCase()));
        const numbers = parsed.numbers.filter(number => !existing.has(number.toLocaleLowerCase()));
        if (!numbers.length) {
            showToast(t("bus_import_no_new"), "info", 5000);
            pendingBusImport = null;
            renderBusImportPreview();
            return;
        }

        pendingBusImport = { numbers, skippedExisting: parsed.numbers.length - numbers.length };
        renderBusImportPreview();
    } catch (error) {
        console.error("Bus import read error", error);
        pendingBusImport = null;
        renderBusImportPreview();
        showToast(t("bus_import_read_failed"), "error", 5000);
    }
}

function clearBusImport() {
    pendingBusImport = null;
    renderBusImportPreview();
}

async function confirmBusImport() {
    if (!pendingBusImport?.numbers?.length) return;
    const groupId = activeBusGroupId();
    if (!groupId) {
        showToast(t("bus_import_group_required"), "error", 5000);
        return;
    }
    if (!IS_DEMO_MODE && window.currentUser?.role !== "dispatcher") {
        showToast(t("bus_import_dispatcher_only"), "error", 5000);
        return;
    }

    const numbers = [...pendingBusImport.numbers];
    let added = 0;
    let skipped = pendingBusImport.skippedExisting || 0;
    let failed = 0;

    for (const number of numbers) {
        try {
            if (IS_DEMO_MODE) {
                window.state.buses.push({
                    id: `bus-import-${Date.now()}-${added}`,
                    number,
                    groupId,
                    active: true
                });
                added += 1;
                continue;
            }

            const result = await ApiClient.createStaffBus(number, groupId);
            if (!result?.success || !result.bus) {
                failed += 1;
                continue;
            }
            if (!window.state.buses.some(bus => bus.id === result.bus.id)) window.state.buses.push(result.bus);
            added += 1;
        } catch (error) {
            if (Number(error?.status) === 409) skipped += 1;
            else failed += 1;
        }
    }

    if (IS_DEMO_MODE) saveState();
    pendingBusImport = null;
    renderBusImportPreview();
    renderBusesList();
    if (typeof lucide !== "undefined") lucide.createIcons();
    showToast(t("bus_import_result", { added, skipped, failed }), failed ? "info" : "success", 6000);
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
    clearBusImport,
    confirmBusImport,
    cancelBusEdit,
    deleteBus,
    handleBusImportFile,
    renderBusImportPreview,
    saveBusEdit,
    startEditBus,
    renderRoutesList,
    addRoute,
    deleteRoute
};

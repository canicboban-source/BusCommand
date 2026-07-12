// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { getBusesForLineGroup } from "./group-membership.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

function renderBusesList() {
    const list = document.getElementById("settings-buses-list");
    if (!list) return;
    list.innerHTML = "";
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    const myBuses = activeGrp ? getBusesForLineGroup(activeGrp) : (window.state.buses || []);
    myBuses.forEach(b => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span>${t("vehicle")} ${b.number}</span>
            <button ${actionAttr("deleteBus", [b.id])} style="background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                ${t("btn_delete") || "Obriši"}
            </button>
        `;
        list.appendChild(li);
    });
}

function addBus(event) {
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
        function() {
            window.state.buses.push(newBus);
            saveState();
            input.value = "";
            renderBusesList();
            lucide.createIcons();
            showToast(number + " — " + (t("bus_added") || "vozilo dodano"), "success");
        },
        { danger: false, title: t("btn_add_bus") || "Add Bus", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteBus(id) {
    showConfirm(t("js_alert_delete_bus") || "Delete this bus?", function() {
        window.state.buses = window.state.buses.filter(b => b.id !== id);
        saveState();
        renderBusesList();
        lucide.createIcons();
    }, { danger: true });
}

function renderRoutesList() {
    const list = document.getElementById("settings-routes-list");
    list.innerHTML = "";
    const hubId = window.state.activeGroupHubId;
    const activeGrp = hubId || (window.currentUser && window.currentUser.activeGroupId);
    const myRoutes = window.state.routes.filter(r => !r.groupId || r.groupId === activeGrp);
    myRoutes.forEach(r => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="crud-route-info">
                <div class="crud-route-header">
                    <span class="crud-route-num">${t("table_route")} ${r.number}</span>
                    <span class="crud-route-name">${r.name}</span>
                </div>
                <span class="crud-route-stops">${t("stops_plan")}: ${r.stops.join(" ➔ ")}</span>
            </div>
            <button ${actionAttr("deleteRoute", [r.id])} style="align-self:center;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                ${t("btn_delete") || "Obriši"}
            </button>
        `;
        list.appendChild(li);
    });
}

function addRoute(event) {
    event.preventDefault();
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
    renderRoutesList,
    addRoute,
    deleteRoute
};

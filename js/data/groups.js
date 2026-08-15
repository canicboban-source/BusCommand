// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast, refreshIcons } from "../core/utils.js";
import { countDriversForLineGroup, countBusesForLineGroup } from "./group-membership.js";
import { scheduleRefreshObservedSections } from "../core/state-observer.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";

function getGroupById(id) {
    if (!window.state.groups) return null;
    return window.state.groups.find(g => g.id === id) || null;
}

function getGroupName(id) {
    const g = getGroupById(id);
    return g ? g.name : "—";
}

/** Formirane linijske grupe dispečera (npr. 310, 105) — otvaraju Group Hub */
function getFormedLineGroupIds() {
    if (window.currentUser?.role === "dispatcher") {
        const disp = (window.state.dispatchers || []).find(d => d.id === window.currentUser.id);
        const ids = disp?.groups || [window.currentUser.activeGroupId].filter(Boolean);
        if (ids.length) return ids;
    }
    return (window.state.groups || [])
        .filter(g => String(g.id).match(/^\d+$/) || g.id === g.lineId)
        .map(g => g.id);
}

function getActiveLineId() {
    return window.state.activeGroupHubId
        || window.currentUser?.activeGroupId
        || getFormedLineGroupIds()[0]
        || null;
}

function isFormedLineGroup(groupId) {
    return getFormedLineGroupIds().includes(groupId);
}

function setGroupFilter(groupId) {
    window.state.activeGroupFilter = (window.state.activeGroupFilter === groupId) ? null : groupId;
    
    // Re-renderi sve filter barove
    renderGroupFilterBar("group-filter-bar");
    renderGroupFilterBar("group-filter-bar-shifts");
    renderGroupFilterBar("group-filter-bar-reports");
    
    scheduleRefreshObservedSections({ topics: ["groups"] });
}

function renderGroupFilterBar(containerId) {
    const bar = document.getElementById(containerId);
    if (!bar) return;

    const groups = window.state.groups || [];
    const active = window.state.activeGroupFilter;
    const allLabel = t("all_groups") || "All Groups";

    let html = `<span class="bc-filter-label">Filter:</span>`;

    // "Sve" dugme
    html += `<button ${actionAttr("setGroupFilter", [null])} class="bc-filter-chip${active ? "" : " is-on"}">${allLabel}</button>`;

    groups.forEach(g => {
        const isActive = active === g.id;
        const clickAttrs = isFormedLineGroup(g.id)
            ? actionAttr("openGroupHub", [g.id])
            : actionAttr("setGroupFilter", [g.id]);
        html += `<button ${clickAttrs} class="bc-filter-chip is-line${isActive ? " is-on" : ""}" style="--bc-chip-color:${g.color}">${g.name}</button>`;
    });

    bar.innerHTML = html;
}

function renderGroupsList() {
    const container = document.getElementById("groups-list");
    if (!container) return;

    const groups = window.state.groups || [];

    if (groups.length === 0) {
        container.innerHTML = `<p class="bc-empty-note">${t("groups_empty") || "Nema grupa. Dodajte prvu iznad."}</p>`;
        return;
    }

    container.innerHTML = groups.map(g => {
        const isLine = isFormedLineGroup(g.id);
        const driverCount = isLine
            ? countDriversForLineGroup(g.id)
            : (window.state.drivers || []).filter(d => d.groupId === g.id).length;
        const busCount = isLine ? countBusesForLineGroup(g.id) : 0;
        return `<div class="bc-list-row" style="--bc-chip-color:${g.color}">
            <div class="bc-list-main">
                <div class="bc-list-title is-bold">${g.name}</div>
                <div class="bc-list-sub">${driverCount} ${t("drivers_count")}${busCount ? ` · ${busCount} ${t("buses_count")}` : ""}${g.description ? " · " + g.description : ""}</div>
            </div>
            ${isLine ? `<button ${actionAttr("openGroupHub", [g.id])} class="bc-mini-btn is-info">${t("btn_open_group")}</button>` : ""}
            <button ${actionAttr("deleteGroup", [g.id])} class="bc-mini-btn is-danger">${t("btn_delete") || "Obriši"}</button>
        </div>`;
    }).join("");
}

function addGroup() {
    const name  = document.getElementById("new-group-name")?.value?.trim();
    const color = document.getElementById("new-group-color")?.value || "#0ea5e9";
    const desc  = document.getElementById("new-group-desc")?.value?.trim() || "";

    if (!name) { showToast(t("group_err_name") || "Unesite naziv grupe", "error"); return; }
    if (!window.state.groups) window.state.groups = [];
    if (window.state.groups.find(g => g.name.toLowerCase() === name.toLowerCase())) {
        showToast(t("group_err_exists") || "Grupa sa tim imenom već postoji", "error"); return;
    }

    const companyId = window.currentUser && window.currentUser.companyId;

    const newGroup = {
        id: `grp-${Date.now()}`,
        name: name,
        color: color,
        description: desc,
        active: true,
        companyId: companyId || ""
    };

    showConfirm(
        (t("confirm_add_group") || "Dodaj grupu") + ': "' + name + '"?',
        function() {
            window.state.groups.push(newGroup);

            // Ako je korisnik dispečer, automatski mu dodeli novu grupu da je odmah vidi
            if (window.currentUser && window.currentUser.role === 'dispatcher') {
                const disp = (window.state.dispatchers || []).find(d => d.id === window.currentUser.id);
                if (disp) {
                    if (!Array.isArray(disp.groups)) disp.groups = [];
                    disp.groups.push(newGroup.id);
                }
            }

            saveState();
            
            const elName = document.getElementById("new-group-name");
            const elDesc = document.getElementById("new-group-desc");
            if (elName) elName.value = "";
            if (elDesc) elDesc.value = "";
            
            renderGroupsList();
            showToast(name + " — " + (t("group_added") || "grupa dodata"), "success");
            refreshIcons();
        }
    );
}

function deleteGroup(id) {
    showConfirm(t("js_alert_delete_group") || "Obriši ovu grupu?", function() {
        window.state.groups = window.state.groups.filter(g => g.id !== id);
        // Resetuj filter ako je obrisana grupa bila aktivna
        if (window.state.activeGroupFilter === id) {
            window.state.activeGroupFilter = null;
        }
        // Ukloni grupu i iz vozača
        window.state.drivers.forEach(d => {
            if (d.groupId === id) d.groupId = "";
        });
        
        saveState();
        renderGroupsList();
        showToast(t("group_deleted"), "info");
    }, { danger: true });
}

export {
    getGroupById,
    getGroupName,
    getFormedLineGroupIds,
    getActiveLineId,
    isFormedLineGroup,
    setGroupFilter,
    renderGroupFilterBar,
    renderGroupsList,
    addGroup,
    deleteGroup
};

// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { getVisibleDrivers, showToast } from "../core/utils.js";
import { countDriversForLineGroup, countBusesForLineGroup } from "./group-membership.js";
import { scheduleRefreshObservedSections } from "../core/state-observer.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

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

    let html = `<span style="font-size:0.78rem; color:var(--text-muted); font-weight:600; margin-right:4px;">Filter:</span>`;

    // "Sve" dugme
    html += `<button ${actionAttr("setGroupFilter", [null])} style="
        padding:5px 14px; border-radius:20px; font-size:0.78rem; font-weight:600; cursor:pointer;
        border: 1px solid ${!active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"};
        background: ${!active ? "rgba(255,255,255,0.1)" : "transparent"};
        color: ${!active ? "var(--text-main)" : "var(--text-muted)"};
        transition: all 0.15s;">${allLabel}</button>`;

    groups.forEach(g => {
        const isActive = active === g.id;
        const clickAttrs = isFormedLineGroup(g.id)
            ? actionAttr("openGroupHub", [g.id])
            : actionAttr("setGroupFilter", [g.id]);
        html += `<button ${clickAttrs} style="
            padding:5px 14px; border-radius:20px; font-size:0.78rem; font-weight:700; cursor:pointer;
            border: 2px solid ${isActive ? g.color : "rgba(255,255,255,0.1)"};
            background: ${isActive ? g.color + "33" : "transparent"};
            color: ${isActive ? g.color : "var(--text-muted)"};
            transition: all 0.15s;">${g.name}</button>`;
    });

    bar.innerHTML = html;
}

function renderGroupsList() {
    const container = document.getElementById("groups-list");
    if (!container) return;

    const groups = window.state.groups || [];

    if (groups.length === 0) {
        container.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:16px;">${t("groups_empty") || "Nema grupa. Dodajte prvu iznad."}</p>`;
        return;
    }

    container.innerHTML = groups.map(g => {
        const isLine = isFormedLineGroup(g.id);
        const driverCount = isLine
            ? countDriversForLineGroup(g.id)
            : (window.state.drivers || []).filter(d => d.groupId === g.id).length;
        const busCount = isLine ? countBusesForLineGroup(g.id) : 0;
        return `<div style="
            display:flex; align-items:center; gap:12px; padding:10px 14px;
            background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
            border-left: 3px solid ${g.color}; border-radius:8px; margin-bottom:6px;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:0.88rem; color:var(--text-main);">${g.name}</div>
                <div style="font-size:0.76rem; color:var(--text-muted);">${driverCount} ${t("drivers_count")}${busCount ? ` · ${busCount} ${t("buses_count")}` : ""}${g.description ? " · " + g.description : ""}</div>
            </div>
            ${isLine ? `<button ${actionAttr("openGroupHub", [g.id])} style="
                background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.35);color:#3b82f6;
                border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.73rem;font-weight:600;flex-shrink:0;">
                ${t("btn_open_group")}
            </button>` : ""}
            <button ${actionAttr("deleteGroup", [g.id])} style="
                background:none; border:1px solid rgba(239,68,68,0.3); color:#ef4444;
                border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.73rem; font-weight:600; flex-shrink:0;">
                ${t("btn_delete") || "Obriši"}
            </button>
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
            lucide.createIcons();
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

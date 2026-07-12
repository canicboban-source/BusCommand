// BusCommand — Company Admin: grupe / linije (Faza 3)
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { countDriversForLineGroup, countBusesForLineGroup } from "../data/group-membership.js";
import { isFormedLineGroup } from "../data/groups.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { renderCompanyAdminDashboard } from "./company-admin.js";
import { getCompanyGroups } from "./company-admin-team.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

function getCompanyId() {
    return window.currentUser?.companyId || null;
}

function renderCompanyAdminGroups() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return;

    const container = document.getElementById("ca-groups-manage-list");
    if (!container) return;

    const groups = getCompanyGroups();
    if (groups.length === 0) {
        container.innerHTML = `<p style="font-size:0.88rem;color:var(--text-muted);text-align:center;padding:24px 0;">${t("ca_groups_empty") || "Nema grupa. Dodajte prvu liniju iznad."}</p>`;
        if (typeof lucide !== "undefined") lucide.createIcons();
        return;
    }

    container.innerHTML = groups.map(g => {
        const isLine = isFormedLineGroup(g.id) || /^\d+$/.test(String(g.id));
        const driverCount = isLine ? countDriversForLineGroup(g.id) : (window.state.drivers || []).filter(d => d.groupId === g.id).length;
        const busCount = isLine ? countBusesForLineGroup(g.id) : 0;
        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-left:3px solid ${g.color};border-radius:8px;margin-bottom:8px;">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);">${escapeHtml(g.name)}</div>
                <div style="font-size:0.76rem;color:var(--text-muted);margin-top:4px;">
                    ${t("plan_pick_line") || "Linija"} <strong>${g.id}</strong>
                    · ${driverCount} ${t("hub_stat_drivers") || "vozača"}
                    ${busCount ? ` · ${busCount} ${t("hub_stat_buses") || "autobusa"}` : ""}
                    ${g.description ? ` · ${escapeHtml(g.description)}` : ""}
                </div>
            </div>
            <button type="button" ${actionAttr("deleteCompanyGroup", [g.id])} style="background:none;border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:0.73rem;font-weight:600;flex-shrink:0;">
                <i data-lucide="trash-2" style="width:12px;height:12px;vertical-align:middle;"></i> ${t("btn_delete") || "Obriši"}
            </button>
        </div>`;
    }).join("");

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function addCompanyGroup() {
    const lineId = document.getElementById("ca-new-group-line-id")?.value?.trim();
    const name = document.getElementById("ca-new-group-name")?.value?.trim();
    const color = document.getElementById("ca-new-group-color")?.value || "#0ea5e9";
    const desc = document.getElementById("ca-new-group-desc")?.value?.trim() || "";

    if (!lineId || !name) {
        showToast(t("ca_group_err_line_name") || "Unesite ID linije i naziv", "error");
        return;
    }
    if (!/^\d+$/.test(lineId)) {
        showToast(t("ca_group_err_line_numeric") || "ID linije mora biti broj (npr. 310)", "error");
        return;
    }
    if (!window.state.groups) window.state.groups = [];
    if (window.state.groups.some(g => g.id === lineId)) {
        showToast(t("group_err_exists") || "Grupa sa tim ID već postoji", "error");
        return;
    }

    const companyId = getCompanyId();
    const newGroup = {
        id: lineId,
        lineId,
        name,
        color,
        description: desc,
        active: true,
        companyId: companyId || ""
    };

    showConfirm(
        (t("confirm_add_group") || "Dodaj grupu") + `: ${name} (${lineId})?`,
        () => {
            window.state.groups.push(newGroup);
            saveState();
            document.getElementById("ca-new-group-line-id").value = "";
            document.getElementById("ca-new-group-name").value = "";
            document.getElementById("ca-new-group-desc").value = "";
            renderCompanyAdminGroups();
            renderCompanyAdminDashboard();
            showToast(t("group_added") || "Grupa dodata", "success");
        },
        { danger: false, confirmText: t("btn_yes") || "Da" }
    );
}

function deleteCompanyGroup(id) {
    const cid = getCompanyId();
    const g = (window.state.groups || []).find(x => x.id === id);
    if (!g) return;
    if (cid && g.companyId && g.companyId !== cid) {
        showToast(t("ca_group_forbidden") || "Nemate pristup ovoj grupi", "error");
        return;
    }
    showConfirm(t("js_alert_delete_group") || "Obrisati ovu grupu?", () => {
        window.state.groups = window.state.groups.filter(x => x.id !== id);
        if (window.state.activeGroupFilter === id) window.state.activeGroupFilter = null;
        (window.state.drivers || []).forEach(d => {
            if (d.groupId === id) d.groupId = "";
        });
        (window.state.dispatchers || []).forEach(d => {
            if (d.groups) d.groups = d.groups.filter(gid => gid !== id);
            if (d.activeGroupId === id) d.activeGroupId = d.groups?.[0] || null;
        });
        saveState();
        renderCompanyAdminGroups();
        renderCompanyAdminDashboard();
        showToast(t("ca_group_deleted") || "Grupa obrisana", "info");
    }, { danger: true });
}

export {
    renderCompanyAdminGroups,
    addCompanyGroup,
    deleteCompanyGroup
};

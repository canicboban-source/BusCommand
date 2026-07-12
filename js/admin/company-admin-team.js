// BusCommand — Company Admin: upravljanje dispečerima (Faza 2)
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { renderCompanyAdminDashboard } from "./company-admin.js";
import { actionAttr, changeAttr as _changeAttr } from "../core/action-delegate.js";

const TEMP_RESET_PASSWORD = "ChangeMe123";

function getCompanyId() {
    return window.currentUser?.companyId || null;
}

function getCompanyDispatchers() {
    const cid = getCompanyId();
    return (window.state.dispatchers || []).filter(d =>
        !d.isSuperAdmin && d.id !== "superadmin" &&
        (!cid || !d.companyId || d.companyId === cid)
    );
}

function getCompanyGroups() {
    const cid = getCompanyId();
    return (window.state.groups || []).filter(g =>
        !cid || !g.companyId || g.companyId === cid
    );
}

function findCompanyDispatcher(dispId) {
    const disp = (window.state.dispatchers || []).find(d => d.id === dispId);
    if (!disp || disp.isSuperAdmin) return null;
    const cid = getCompanyId();
    if (cid && disp.companyId && disp.companyId !== cid) return null;
    return disp;
}

function renderCompanyAdminTeam() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return;

    const groupSelect = document.getElementById("ca-disp-groups-select");
    const groups = getCompanyGroups();
    if (groupSelect) {
        if (groups.length === 0) {
            groupSelect.innerHTML = `<option value="" disabled selected>${t("ca_no_groups_for_disp") || "Prvo kreirajte grupe"}</option>`;
        } else {
            groupSelect.innerHTML = groups.map(g =>
                `<option value="${escapeHtml(g.id)}">${escapeHtml(g.name)} (${g.id})</option>`
            ).join("");
            groupSelect.multiple = true;
            groupSelect.size = Math.min(4, groups.length);
        }
    }

    const list = document.getElementById("ca-dispatchers-manage-list");
    if (!list) return;

    const dispatchers = getCompanyDispatchers();
    if (dispatchers.length === 0) {
        list.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:24px 0;">${t("ca_no_dispatchers") || "Nema dispečera. Dodajte prvog iznad."}</p>`;
        if (typeof lucide !== "undefined") lucide.createIcons();
        return;
    }

    list.innerHTML = dispatchers.map(d => {
        const groupChips = (d.groups || []).map(gid => {
            const g = getCompanyGroups().find(x => x.id === gid) || (window.state.groups || []).find(x => x.id === gid);
            return g
                ? `<span style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}44;padding:2px 8px;border-radius:12px;font-size:0.72rem;margin:2px;">${escapeHtml(g.name)}</span>`
                : `<span style="font-size:0.72rem;color:var(--text-muted);">${gid}</span>`;
        }).join(" ") || `<span style="font-size:0.75rem;color:var(--text-muted);">${t("group_none") || "Nema grupe"}</span>`;

        const groupChecks = groups.map(g => {
            const checked = (d.groups || []).includes(g.id) ? "checked" : "";
            return `<label style="display:flex;align-items:center;gap:8px;font-size:0.82rem;margin-bottom:6px;cursor:pointer;">
                <input type="checkbox" class="ca-disp-grp-chk" data-disp="${d.id}" value="${g.id}" ${checked}
                    style="accent-color:var(--primary-color);">
                <span style="color:${g.color};font-weight:600;">${escapeHtml(g.name)}</span>
                <span style="color:var(--text-muted);font-size:0.75rem;">(${g.id})</span>
            </label>`;
        }).join("");

        const active = d.passwordChanged !== false;
        const statusColor = active ? "#16a34a" : "#f59e0b";
        const statusLabel = active ? (t("ca_disp_active") || "Aktivan") : (t("ca_disp_must_change_pwd") || "Mora promeniti lozinku");

        return `
        <div class="card" style="margin-bottom:10px;padding:14px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                <div style="min-width:200px;">
                    <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(d.name)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">${escapeHtml(d.email || "—")}</div>
                    <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">${groupChips}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <span style="font-size:0.72rem;font-weight:600;color:${statusColor};background:${statusColor}18;border:1px solid ${statusColor}33;padding:3px 10px;border-radius:10px;">${statusLabel}</span>
                    <button type="button" class="btn-secondary" style="height:34px;font-size:0.78rem;padding:0 10px;" ${actionAttr("toggleCaDispGroupsEdit", [d.id])}>
                        <i data-lucide="layers"></i> ${t("ca_edit_groups") || "Grupe"}
                    </button>
                    <button type="button" class="btn-secondary" style="height:34px;font-size:0.78rem;padding:0 10px;" ${actionAttr("resetCompanyDispatcherPassword", [d.id])}>
                        <i data-lucide="key"></i> ${t("ca_reset_password") || "Reset lozinke"}
                    </button>
                    <button type="button" style="height:34px;background:none;border:1px solid rgba(239,68,68,0.35);color:#ef4444;border-radius:8px;padding:0 10px;cursor:pointer;font-size:0.78rem;" ${actionAttr("removeCompanyDispatcher", [d.id])}>
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
            <div id="ca-disp-groups-edit-${d.id}" class="hidden" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--panel-border);">
                <p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 10px;">${t("ca_assign_groups_hint") || "Označite grupe (linije) koje dispečer sme da vodi:"}</p>
                ${groupChecks || `<p style="font-size:0.8rem;color:var(--text-muted);">${t("ca_no_groups_for_disp")}</p>`}
                <button type="button" class="btn-primary" style="margin-top:10px;height:36px;font-size:0.8rem;" ${actionAttr("saveCompanyDispatcherGroups", [d.id])}>
                    ${t("btn_save") || "Sačuvaj grupe"}
                </button>
            </div>
        </div>`;
    }).join("");

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function toggleCaDispGroupsEdit(dispId) {
    const el = document.getElementById(`ca-disp-groups-edit-${dispId}`);
    if (el) el.classList.toggle("hidden");
}

function saveCompanyDispatcherGroups(dispId) {
    const disp = findCompanyDispatcher(dispId);
    if (!disp) return;
    const checks = document.querySelectorAll(`.ca-disp-grp-chk[data-disp="${dispId}"]:checked`);
    disp.groups = Array.from(checks).map(c => c.value);
    if (!disp.activeGroupId && disp.groups.length) disp.activeGroupId = disp.groups[0];
    if (disp.activeGroupId && !disp.groups.includes(disp.activeGroupId)) {
        disp.activeGroupId = disp.groups[0] || null;
    }
    saveState();
    renderCompanyAdminTeam();
    renderCompanyAdminDashboard();
    showToast(t("ca_groups_saved") || "Grupe dispečera sačuvane", "success");
}

function addCompanyDispatcher() {
    const name = document.getElementById("ca-new-disp-name")?.value?.trim();
    const email = document.getElementById("ca-new-disp-email")?.value?.trim().toLowerCase();
    const password = document.getElementById("ca-new-disp-password")?.value || "";
    const groupSelect = document.getElementById("ca-disp-groups-select");

    if (!name || !email || !password) {
        showToast(t("error_fill_all_fields") || "Popunite sva polja", "error");
        return;
    }
    if (password.length < 6) {
        showToast(t("ca_password_min") || "Lozinka mora imati najmanje 6 karaktera", "error");
        return;
    }
    if ((window.state.dispatchers || []).some(d => d.email === email) ||
        (window.state.companyAdmins || []).some(ca => ca.email === email)) {
        showToast(t("ca_email_exists") || "Email je već u upotrebi", "error");
        return;
    }

    const selectedGroups = groupSelect
        ? Array.from(groupSelect.selectedOptions).map(o => o.value).filter(Boolean)
        : [];

    const newDisp = {
        id: "dispo-" + Date.now(),
        name,
        email,
        password,
        passwordChanged: false,
        groups: selectedGroups,
        activeGroupId: selectedGroups[0] || null,
        companyId: getCompanyId() || "demo",
        paymentStatus: "Trial",
        trialDaysLeft: 30
    };

    showConfirm(
        (t("confirm_add_dispatcher") || "Dodaj dispečera") + `: ${name}?`,
        () => {
            if (!window.state.dispatchers) window.state.dispatchers = [];
            window.state.dispatchers.push(newDisp);
            saveState();
            document.getElementById("ca-new-disp-name").value = "";
            document.getElementById("ca-new-disp-email").value = "";
            document.getElementById("ca-new-disp-password").value = "";
            if (groupSelect) Array.from(groupSelect.options).forEach(o => { o.selected = false; });
            renderCompanyAdminTeam();
            renderCompanyAdminDashboard();
            showToast(t("ca_disp_added") || "Dispečer dodat", "success");
        },
        { danger: false, confirmText: t("btn_yes") || "Da" }
    );
}

function removeCompanyDispatcher(dispId) {
    const disp = findCompanyDispatcher(dispId);
    if (!disp) return;
    showConfirm(
        (t("ca_confirm_remove_disp") || "Ukloniti dispečera") + ` ${disp.name}?`,
        () => {
            window.state.dispatchers = (window.state.dispatchers || []).filter(d => d.id !== dispId);
            saveState();
            renderCompanyAdminTeam();
            renderCompanyAdminDashboard();
            showToast(t("ca_disp_removed") || "Dispečer uklonjen", "info");
        },
        { danger: true }
    );
}

function resetCompanyDispatcherPassword(dispId) {
    const disp = findCompanyDispatcher(dispId);
    if (!disp) return;
    showConfirm(
        t("ca_confirm_reset_pwd") || "Resetovati lozinku? Dispečer mora da postavi novu pri sledećem loginu.",
        () => {
            disp.password = TEMP_RESET_PASSWORD;
            disp.passwordChanged = false;
            saveState();
            renderCompanyAdminTeam();
            showToast(
                (t("ca_reset_pwd_done") || "Privremena lozinka:") + ` ${TEMP_RESET_PASSWORD}`,
                "success",
                8000
            );
        },
        { danger: false, confirmText: t("ca_reset_password") || "Reset" }
    );
}

export {
    renderCompanyAdminTeam,
    addCompanyDispatcher,
    removeCompanyDispatcher,
    resetCompanyDispatcherPassword,
    saveCompanyDispatcherGroups,
    toggleCaDispGroupsEdit,
    getCompanyGroups,
    getCompanyDispatchers
};

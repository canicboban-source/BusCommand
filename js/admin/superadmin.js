// BusCommand ESM v9.5
import { initializeLoginSelects } from "../auth/login-ui.js";
import { persistUserSession } from "../auth/login-session.js";
import { saveState } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

function renderSuperAdminDashboard() {
    if (!IS_DEMO_MODE && window.currentUser && window.currentUser.role === "superadmin") {
        renderSuperAdminDashboardProduction();
        return;
    }
    _renderSuperAdminDashboardDemo();
}

async function renderSuperAdminDashboardProduction() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    listContainer.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">' + t("loading") + '</td></tr>';

    const data = await ApiClient.getCompanies();
    if (!data.success) {
        listContainer.innerHTML = '<tr><td colspan="8" style="color:#ef4444;">' + escapeHtml(data.error || t("error_generic")) + '</td></tr>';
        return;
    }

    const companies = data.companies || [];
    listContainer.innerHTML = "";

    const totalCompEl = document.getElementById("superadmin-total-companies");
    if (totalCompEl) totalCompEl.innerText = companies.length;

    companies.forEach(c => {
        const tr = document.createElement("tr");
        const statusClass = c.status === "active" ? "badge-success" : "badge-critical";
        const planClass   = c.plan === "trial" ? "badge-pending" : "badge-success";

        tr.innerHTML = `
            <td><strong>${escapeHtml(c.name)}</strong><br><small style="color:var(--text-muted)">${escapeHtml(c.id)}</small></td>
            <td><span class="badge ${statusClass}">${escapeHtml(c.status)}</span></td>
            <td><span class="badge ${planClass}">${escapeHtml(c.plan)}</span></td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td style="font-size:0.8rem;">${c.email ? '<code style="font-size:0.75rem;">' + escapeHtml(c.email) + '</code>' : '—'}</td>
            <td style="white-space:nowrap;">
                <button class="btn-primary" ${actionAttr("superadminOpenCompany", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">
                    <i data-lucide="external-link" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Open
                </button>
                ${c.status === "active"
                    ? `<button class="btn-secondary" ${actionAttr("superadminToggleStatus", [c.id, "suspended"])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#ff4d4d;color:white;border:none;">Suspend</button>`
                    : `<button class="btn-secondary" ${actionAttr("superadminToggleStatus", [c.id, "active"])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#10b981;color:white;border:none;">Activate</button>`
                }
            </td>
        `;
        listContainer.appendChild(tr);
    });
    renderCompanyAdminList();
    lucide.createIcons();
}

function _renderSuperAdminDashboardDemo() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    
    const dispatchers = window.state.dispatchers || [];
    const companies = dispatchers.filter(d => d.id !== "superadmin");
    
    const totalCompEl = document.getElementById("superadmin-total-companies");
    if (totalCompEl) totalCompEl.innerText = companies.length;
    
    // Calculate totals for stat cards
    let totalUsers = 0;
    let totalGroups = 0;
    companies.forEach(c => {
        const groupCount = (c.groups || []).length;
        totalGroups += groupCount;
        (c.groups || []).forEach(gId => {
            totalUsers += (window.state.drivers || []).filter(d => d.groupId === gId).length;
        });
    });
    const totalUsersEl = document.getElementById("superadmin-total-users");
    if (totalUsersEl) totalUsersEl.innerText = totalUsers;
    const totalGroupsEl = document.getElementById("superadmin-total-groups");
    if (totalGroupsEl) totalGroupsEl.innerText = totalGroups;
    
    companies.forEach(c => {
        const tr = document.createElement("tr");
        const statusText = c.passwordChanged ? "Active" : "New / Inactive";
        const statusClass = c.passwordChanged ? "badge-success" : "badge-pending";
        
        // Payment status
        const payStatus = c.paymentStatus || "Trial";
        const payClass = payStatus === "Paid" ? "badge-success" : payStatus === "Overdue" ? "badge-critical" : "badge-pending";
        const trialDays = c.trialDaysLeft !== null && c.trialDaysLeft !== undefined ? c.trialDaysLeft + "d" : "-";
        
        // Group and user counts
        const groupCount = (c.groups || []).length;
        let userCount = 0;
        (c.groups || []).forEach(gId => {
            userCount += (window.state.drivers || []).filter(d => d.groupId === gId).length;
        });
        
        tr.innerHTML = `
            <td><strong>${c.name}</strong></td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td><span class="badge ${payClass}">${payStatus}</span></td>
            <td>${payStatus === "Trial" ? trialDays : "-"}</td>
            <td>${groupCount}</td>
            <td>${userCount}</td>
            <td style="font-size:0.8rem;">${c.email ? '<code style="font-size:0.75rem;">' + c.email + '</code>' : (c.pin ? '<code>' + c.pin + '</code>' : '<span style="color:var(--text-muted)">—</span>')}</td>
            <td style="white-space:nowrap;">
                <button class="btn-primary" ${actionAttr("superadminImpersonate", [c.id])} style="padding: 4px 10px; font-size: 0.8rem; height: auto; margin-right: 6px;">
                    <i data-lucide="eye" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Inspect
                </button>
                <button class="btn-secondary" ${actionAttr("superadminResetPin", [c.id])} style="padding: 4px 10px; font-size: 0.8rem; height: auto; margin-right: 6px; background:rgba(255,255,255,0.05); color:white; border:1px solid rgba(255,255,255,0.1);">
                    <i data-lucide="key" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Reset PIN
                </button>
                <button class="btn-secondary" ${actionAttr("superadminDeleteCompany", [c.id])} style="padding: 4px 10px; font-size: 0.8rem; height: auto; background:#ff4d4d; color:white; border:none;">
                    <i data-lucide="trash-2" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Delete
                </button>
            </td>
        `;
        listContainer.appendChild(tr);
    });
    renderCompanyAdminList();
    lucide.createIcons();
}

async function superadminToggleStatus(companyId, status) {
    const label = status === "suspended" ? "suspendovati" : "aktivirati";
    showConfirm("Da li želite da " + label + " firmu " + companyId + "?", async () => {
        const res = await ApiClient.setCompanyStatus(companyId, status);
        if (res.success) {
            showToast("Status ažuriran.", "success");
            renderSuperAdminDashboard();
        } else {
            showToast(res.error || "Greška.", "error");
        }
    }, { danger: status === "suspended" });
}

function superadminOpenCompany(companyId) {
    window.open("/?mode=production&company=" + encodeURIComponent(companyId), "_blank");
}


function superadminCreateCompany() {
    const nameInput = document.getElementById("sa-new-name");
    const pinInput  = document.getElementById("sa-new-pin");
    if (!nameInput || !pinInput) return;

    const name = nameInput.value.trim();
    const pin  = pinInput.value.trim() || "1234";
    const companyId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("firma-" + Date.now());

    if (!name) { showToast("Unesite naziv firme.", "error"); return; }

    if (!IS_DEMO_MODE) {
        ApiClient.createCompany({ companyId, name, contactEmail: "admin@" + companyId + ".com" })
            .then(res => {
                if (res.success) {
                    nameInput.value = ""; pinInput.value = "";
                    renderSuperAdminDashboard();
                    showToast("Firma '" + name + "' kreirana (ID: " + companyId + ")", "success");
                } else {
                    showToast(res.error || "Greška.", "error");
                }
            });
        return;
    }

    if (pin.length < 4 || pin.length > 6) {
        showToast("PIN mora imati 4–6 cifara.", "error"); return;
    }

    const id = "disp-" + Date.now();
    window.state.dispatchers = window.state.dispatchers || [];
    window.state.dispatchers.push({ id, name, pin, passwordChanged: false, groups: [], companyId: "demo" });
    saveState();
    nameInput.value = ""; pinInput.value = "";
    renderSuperAdminDashboard();
    initializeLoginSelects();
    showToast("Firma uspješno registrovana!");
}

function superadminCreateCompanyAdmin() {
    const name      = (document.getElementById('sa-ca-name')       || {}).value?.trim();
    const email     = (document.getElementById('sa-ca-email')      || {}).value?.trim().toLowerCase();
    const password  = (document.getElementById('sa-ca-password')   || {}).value?.trim();
    const companyId = (document.getElementById('sa-ca-company-id') || {}).value?.trim().toLowerCase();

    if (!name || !email || !password || !companyId) {
        showToast('Popunite sva polja (ime, email, lozinka, company ID)', 'error'); return;
    }
    if (password.length < 6) {
        showToast('Lozinka mora imati najmanje 6 znakova', 'error'); return;
    }

    if (!IS_DEMO_MODE) {
        ApiClient.createUser({ email, password, name, role: "company_admin", companyId })
            .then(res => {
                if (res.success) {
                    ['sa-ca-name','sa-ca-email','sa-ca-password','sa-ca-company-id'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = '';
                    });
                    showToast('Company Admin "' + name + '" kreiran.', 'success');
                } else {
                    showToast(res.error || 'Greška.', 'error');
                }
            });
        return;
    }

    if (!window.state.companyAdmins) window.state.companyAdmins = [];
    if (window.state.companyAdmins.find(ca => ca.email === email)) {
        showToast('Company admin sa tim emailom već postoji', 'error'); return;
    }
    window.state.companyAdmins.push({
        id: 'ca-' + Date.now(), name, email, password, companyId,
        role: 'company-admin', createdAt: new Date().toISOString()
    });
    ['sa-ca-name','sa-ca-email','sa-ca-password','sa-ca-company-id'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderCompanyAdminList();
    showToast('Company Admin "' + name + '" kreiran za firmu: ' + companyId, 'success');
}

function renderCompanyAdminList() {
    const container = document.getElementById('sa-ca-list');
    if (!container) return;
    const list = window.state.companyAdmins || [];
    if (list.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.8rem;">${t("sa_no_company_admins")}</p>`;
        return;
    }
    container.innerHTML = list.map(ca => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
            <div>
                <span style="font-weight:600;color:var(--text-main);">${escapeHtml(ca.name)}</span>
                <span style="color:var(--text-muted);font-size:0.78rem;margin-left:8px;">${escapeHtml(ca.email)}</span>
                <span style="color:var(--primary-color);font-size:0.75rem;margin-left:8px;">firma: ${escapeHtml(ca.companyId)}</span>
            </div>
            <button ${actionAttr("superadminDeleteCompanyAdmin", [ca.id])} style="background:#ef444422;border:1px solid #ef4444;color:#ef4444;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.75rem;">
                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function superadminDeleteCompanyAdmin(id) {
    if (!window.state.companyAdmins) return;
    window.state.companyAdmins = window.state.companyAdmins.filter(ca => ca.id !== id);
    renderCompanyAdminList();
    showToast('Company Admin obrisan', 'info');
}

function superadminImpersonate(dispId) {
    const disp = window.state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    window.currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        activeGroupId: disp.activeGroupId || (disp.groups && disp.groups.length > 0 ? disp.groups[0] : null),
        impersonated: true,
        readOnly: true  // Super Admin stealth mode — view only, no changes
    };
    
    persistUserSession(window.currentUser);
    showAppLayout();
    showToast(`👁️ Stealth Inspect: ${disp.name} (Read-Only)`, "info");
}

function superadminResetPin(dispId) {
    const disp = window.state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    disp.pin = "1234";
    disp.passwordChanged = false;
    saveState();
    renderSuperAdminDashboard();
    showToast(`PIN reset to 1234 for ${disp.name}`);
}

function superadminDeleteCompany(dispId) {
    showConfirm("Are you sure you want to delete this company account? This cannot be undone.", function() {
        window.state.dispatchers = window.state.dispatchers.filter(d => d.id !== dispId);
        saveState();
        renderSuperAdminDashboard();
        initializeLoginSelects();
        showToast("Company deleted.", "info");
    }, { danger: true, title: "Delete Company" });
}
export {
    renderSuperAdminDashboard,
    renderSuperAdminDashboardProduction,
    _renderSuperAdminDashboardDemo,
    superadminToggleStatus,
    superadminOpenCompany,
    superadminCreateCompany,
    superadminCreateCompanyAdmin,
    renderCompanyAdminList,
    superadminDeleteCompanyAdmin,
    superadminImpersonate,
    superadminResetPin,
    superadminDeleteCompany
};

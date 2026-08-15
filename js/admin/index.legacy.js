// Auto-extracted from app.js (lines 5411-6003)
import { refreshIcons } from "../core/utils.js";
function isReadOnly() {
    return currentUser && currentUser.impersonated === true && currentUser.readOnly === true;
}

// ── ROLE NORMALIZACIJA (Firebase claims → app roles) ───────
function normalizeRole(role) {
    if (role === "company_admin") return "company-admin";
    return role;
}

function renderSuperAdminDashboard() {
    if (!USE_LOCAL_STATE && currentUser && currentUser.role === "superadmin") {
        renderSuperAdminDashboardProduction();
        return;
    }
    _renderSuperAdminDashboardDemo();
}

async function renderSuperAdminDashboardProduction() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    listContainer.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">Učitavanje...</td></tr>';

    const data = await ApiClient.getCompanies();
    if (!data.success) {
        listContainer.innerHTML = '<tr><td colspan="8" style="color:#ef4444;">' + escapeHtml(data.error || "Greška") + '</td></tr>';
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
                <button class="btn-primary" onclick="superadminOpenCompany('${escapeHtml(c.id)}')" style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">
                    <i data-lucide="external-link" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Open
                </button>
                ${c.status === "active"
                    ? `<button class="btn-secondary" onclick="superadminToggleStatus('${escapeHtml(c.id)}','suspended')" style="padding:4px 10px;font-size:0.8rem;height:auto;background:#ff4d4d;color:white;border:none;">Suspend</button>`
                    : `<button class="btn-secondary" onclick="superadminToggleStatus('${escapeHtml(c.id)}','active')" style="padding:4px 10px;font-size:0.8rem;height:auto;background:#10b981;color:white;border:none;">Activate</button>`
                }
            </td>
        `;
        listContainer.appendChild(tr);
    });
    renderCompanyAdminList();
    refreshIcons();
}

function _renderSuperAdminDashboardDemo() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    
    const dispatchers = state.dispatchers || [];
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
            totalUsers += (state.drivers || []).filter(d => d.groupId === gId).length;
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
            userCount += (state.drivers || []).filter(d => d.groupId === gId).length;
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
                <button class="btn-primary" onclick="superadminImpersonate('${c.id}')" style="padding: 4px 10px; font-size: 0.8rem; height: auto; margin-right: 6px;">
                    <i data-lucide="eye" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Inspect
                </button>
                <button class="btn-secondary" onclick="superadminResetPin('${c.id}')" style="padding: 4px 10px; font-size: 0.8rem; height: auto; margin-right: 6px; background:rgba(255,255,255,0.05); color:white; border:1px solid rgba(255,255,255,0.1);">
                    <i data-lucide="key" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Reset PIN
                </button>
                <button class="btn-secondary" onclick="superadminDeleteCompany('${c.id}')" style="padding: 4px 10px; font-size: 0.8rem; height: auto; background:#ff4d4d; color:white; border:none;">
                    <i data-lucide="trash-2" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Delete
                </button>
            </td>
        `;
        listContainer.appendChild(tr);
    });
    renderCompanyAdminList();
    refreshIcons();
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


// ── GLOBAL CONFIRM MODAL ────────────────────────────────────────────────
let _confirmCallback = null;

function showConfirm(message, onConfirm, opts = {}) {
    _confirmCallback = onConfirm;
    const modal   = document.getElementById("global-confirm-modal");
    const titleEl = document.getElementById("global-confirm-title");
    const msgEl   = document.getElementById("global-confirm-message");
    const yesBtn  = document.getElementById("global-confirm-yes");
    if (titleEl) titleEl.textContent = opts.title || t("confirm_title") || "Potvrda";
    if (msgEl)   msgEl.textContent   = message;
    if (yesBtn) {
        yesBtn.textContent = opts.confirmText || t("btn_yes") || "Da";
        yesBtn.style.background = opts.danger === false
            ? "linear-gradient(135deg,var(--primary-color),#0369a1)"
            : "linear-gradient(135deg,#dc2626,#b91c1c)";
    }
    if (modal) {
        modal.classList.remove("hidden");
        refreshIcons();
    }
}

function closeConfirmModal() {
    const modal = document.getElementById("global-confirm-modal");
    if (modal) modal.classList.add("hidden");
    _confirmCallback = null;
}

function confirmModalYes() {
    const cb = _confirmCallback;   // sačuvaj prije nego closeConfirmModal nullira
    closeConfirmModal();
    if (typeof cb === "function") cb();
}
// ─────────────────────────────────────────────────────────────────────────

// ── COMPANY ADMIN DASHBOARD ──────────────────────────────────
function renderCompanyAdminDashboard() {
    if (!currentUser || currentUser.role !== "company-admin") return;
    const myCompanyId = currentUser.companyId;

    // Filtriraj vozace, grupe i dispečere za ovu firmu
    const allDrivers     = (state.drivers || []).filter(d => d.companyId === myCompanyId || !myCompanyId);
    const allGroups      = (state.groups  || []).filter(g => g.companyId === myCompanyId || !myCompanyId);
    const allDispatchers = (state.dispatchers || []).filter(d => d.id !== "superadmin" && (d.companyId === myCompanyId || !myCompanyId));
    const allIncidents   = (state.incidents || []).filter(i => {
        if (!myCompanyId) return true;
        const drv = (state.drivers || []).find(d => d.id === i.driverId);
        return drv && drv.companyId === myCompanyId;
    });
    const activeIncidents = allIncidents.filter(i => i.status === "open" || i.status === "pending");

    // Stat cards
    const el = id => document.getElementById(id);
    if (el("ca-stat-drivers"))     el("ca-stat-drivers").textContent    = allDrivers.length;
    if (el("ca-stat-groups"))      el("ca-stat-groups").textContent     = allGroups.length;
    if (el("ca-stat-dispatchers")) el("ca-stat-dispatchers").textContent = allDispatchers.length;
    if (el("ca-stat-incidents"))   el("ca-stat-incidents").textContent   = activeIncidents.length;

    // Grupe lista
    const groupsList = el("ca-groups-list");
    if (groupsList) {
        if (allGroups.length === 0) {
            groupsList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nema definisanih grupa.</p>';
        } else {
            groupsList.innerHTML = allGroups.map(g => {
                const gDrivers = allDrivers.filter(d => d.groupId === g.id);
                const gDisp = allDispatchers.filter(d => (d.groups || []).includes(g.id));
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
                    <div>
                        <span style="font-weight:600;color:var(--text-main);">${escapeHtml(g.name)}</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px;">(${g.id})</span>
                    </div>
                    <div style="display:flex;gap:12px;font-size:0.78rem;color:var(--text-muted);">
                        <span><i data-lucide="users" style="width:12px;height:12px;vertical-align:middle;"></i> ${gDrivers.length}</span>
                        <span><i data-lucide="shield" style="width:12px;height:12px;vertical-align:middle;"></i> ${gDisp.length}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Dispečeri lista
    const dispList = el("ca-dispatchers-list");
    if (dispList) {
        if (allDispatchers.length === 0) {
            dispList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nema dispečera.</p>';
        } else {
            dispList.innerHTML = allDispatchers.map(d => {
                const grpNames = (d.groups || []).map(gId => {
                    const grp = (state.groups || []).find(g => g.id === gId);
                    return grp ? escapeHtml(grp.name) : gId;
                }).join(', ') || '—';
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
                    <div>
                        <span style="font-weight:600;color:var(--text-main);">${escapeHtml(d.name)}</span>
                        <span style="display:block;font-size:0.75rem;color:var(--text-muted);">${escapeHtml(d.email || '')}</span>
                    </div>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${grpNames}</span>
                </div>`;
            }).join('');
        }
    }

    // Vozači lista
    const driversList = el("ca-drivers-list");
    if (driversList) {
        if (allDrivers.length === 0) {
            driversList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nema vozača.</p>';
        } else {
            driversList.innerHTML = allDrivers.map(d => {
                const grp = (state.groups || []).find(g => g.id === d.groupId);
                const statusColor = d.status === "online" ? "#22c55e" : "#64748b";
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;flex-shrink:0;"></span>
                        <div>
                            <span style="font-weight:600;color:var(--text-main);">${escapeHtml(d.name)}</span>
                            <span style="display:block;font-size:0.75rem;color:var(--text-muted);">
                                ${grp ? escapeHtml(grp.name) : (d.groupId || '—')}
                                ${d.bus ? ' · ' + escapeHtml(d.bus) : ''}
                            </span>
                        </div>
                    </div>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${d.status || 'offline'}</span>
                </div>`;
            }).join('');
        }
    }

    refreshIcons();
}

function superadminCreateCompany() {
    const nameInput = document.getElementById("sa-new-name");
    const pinInput  = document.getElementById("sa-new-pin");
    if (!nameInput || !pinInput) return;

    const name = nameInput.value.trim();
    const pin  = pinInput.value.trim() || "1234";
    const companyId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("firma-" + Date.now());

    if (!name) { showToast("Unesite naziv firme.", "error"); return; }

    if (!USE_LOCAL_STATE) {
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
    state.dispatchers = state.dispatchers || [];
    state.dispatchers.push({ id, name, pin, passwordChanged: false, groups: [], companyId: "demo" });
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

    if (!USE_LOCAL_STATE) {
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

    if (!state.companyAdmins) state.companyAdmins = [];
    if (state.companyAdmins.find(ca => ca.email === email)) {
        showToast('Company admin sa tim emailom već postoji', 'error'); return;
    }
    state.companyAdmins.push({
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
    const list = state.companyAdmins || [];
    if (list.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;">Nema kreiranih company admina.</p>';
        return;
    }
    container.innerHTML = list.map(ca => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
            <div>
                <span style="font-weight:600;color:var(--text-main);">${escapeHtml(ca.name)}</span>
                <span style="color:var(--text-muted);font-size:0.78rem;margin-left:8px;">${escapeHtml(ca.email)}</span>
                <span style="color:var(--primary-color);font-size:0.75rem;margin-left:8px;">firma: ${escapeHtml(ca.companyId)}</span>
            </div>
            <button onclick="superadminDeleteCompanyAdmin('${ca.id}')" style="background:#ef444422;border:1px solid #ef4444;color:#ef4444;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.75rem;">
                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>
        </div>
    `).join('');
    refreshIcons();
}

function superadminDeleteCompanyAdmin(id) {
    if (!state.companyAdmins) return;
    state.companyAdmins = state.companyAdmins.filter(ca => ca.id !== id);
    renderCompanyAdminList();
    showToast('Company Admin obrisan', 'info');
}

function superadminImpersonate(dispId) {
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        activeGroupId: disp.activeGroupId || (disp.groups && disp.groups.length > 0 ? disp.groups[0] : null),
        impersonated: true,
        readOnly: true  // Super Admin stealth mode — view only, no changes
    };
    
    sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    showAppLayout();
    showToast(`👁️ Stealth Inspect: ${disp.name} (Read-Only)`, "info");
}

function superadminResetPin(dispId) {
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    disp.pin = "1234";
    disp.passwordChanged = false;
    saveState();
    renderSuperAdminDashboard();
    showToast(`PIN reset to 1234 for ${disp.name}`);
}

function superadminDeleteCompany(dispId) {
    showConfirm("Are you sure you want to delete this company account? This cannot be undone.", function() {
        state.dispatchers = state.dispatchers.filter(d => d.id !== dispId);
        saveState();
        renderSuperAdminDashboard();
        initializeLoginSelects();
        showToast("Company deleted.", "info");
    }, { danger: true, title: "Delete Company" });
}

function exitImpersonation() {
    // Remove read-only banner
    const banner = document.getElementById("readonly-banner");
    if (banner) banner.remove();
    
    currentUser = {
        role: "superadmin",
        name: "Super Admin",
        id: "superadmin"
    };
    sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    showAppLayout();
    showToast("Returned to Super Admin mode");
}

function saveNewDispatcherPassword() {
    const dispId = document.getElementById("setup-dispatcher-id").value;
    const newPin = document.getElementById("setup-new-pin").value.trim();
    const confirmPin = document.getElementById("setup-confirm-pin").value.trim();
    
    if (newPin.length < 4 || newPin.length > 6 || isNaN(newPin)) {
        showToast(t("disp_err_pin") || "PIN must be 4–6 digits", "error"); return;
        return;
    }
    
    if (newPin !== confirmPin) {
        showToast("PINs do not match!", "error"); return;
        return;
    }
    
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    disp.pin = newPin;
    disp.passwordChanged = true;
    saveState();
    
    document.getElementById("dispatcher-password-setup-view").classList.add("hidden");
    
    // Log in immediately
    currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        activeGroupId: null
    };
    sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    
    // Show success message and redirect
    showAppLayout();
    showToast(t("msg_password_saved") || "Password saved!", "success");
}

function populateGroupSetupSelect(dispId) {
    const select = document.getElementById("group-setup-select");
    if (!select) return;
    select.innerHTML = "";
    
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    const groups = disp.groups || [];
    const container = document.getElementById("group-select-container");
    
    if (groups.length === 0) {
        if (container) container.style.display = "none";
    } else {
        if (container) container.style.display = "block";
        groups.forEach(gId => {
            const opt = document.createElement("option");
            opt.value = gId;
            opt.innerText = `Group / Linija ${gId}`;
            select.appendChild(opt);
        });
    }
}

function createDispatcherGroup() {
    const idInput = document.getElementById("new-group-id");
    const nameInput = document.getElementById("new-group-name");
    if (!idInput || !nameInput) return;
    
    const id = idInput.value.trim();
    const name = nameInput.value.trim() || `Route ${id}`;
    
    if (!id) {
        showToast(t("group_err_name") || "Enter a group name", "error"); return;
        return;
    }
    
    const currentDispId = currentUser ? currentUser.id : document.getElementById("setup-dispatcher-id").value;
    const disp = state.dispatchers.find(d => d.id === currentDispId);
    if (!disp) return;
    
    if (!disp.groups) disp.groups = [];
    if (disp.groups.includes(id)) {
        showToast(t("group_err_exists") || "Group already exists", "error"); return;
        return;
    }
    
    if (!state.groups) state.groups = [];
    if (!state.groups.some(g => g.id === id)) {
        state.groups.push({ id: id, name: name, color: "#a6001a" });
    }
    
    disp.groups.push(id);
    disp.activeGroupId = id;
    saveState();
    
    idInput.value = "";
    nameInput.value = "";
    
    if (!currentUser) {
        currentUser = { role: "dispatcher", name: disp.name, id: disp.id, activeGroupId: id };
        sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    } else {
        currentUser.activeGroupId = id;
        sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    }
    
    document.getElementById("dispatcher-group-setup-view").classList.add("hidden");
    showAppLayout();
    showToast(t("group_added") || "Group added!");
}

function enterDispatcherActiveGroup() {
    const select = document.getElementById("group-setup-select");
    if (!select) return;
    
    const gId = select.value;
    if (!gId) { showToast("Please select a group", "error"); return; return; }
    
    const currentDispId = currentUser ? currentUser.id : document.getElementById("setup-dispatcher-id").value;
    const disp = state.dispatchers.find(d => d.id === currentDispId);
    if (!disp) return;
    
    disp.activeGroupId = gId;
    saveState();
    
    if (!currentUser) {
        currentUser = { role: "dispatcher", name: disp.name, id: disp.id, activeGroupId: gId };
    } else {
        currentUser.activeGroupId = gId;
    }
    sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    
    document.getElementById("dispatcher-group-setup-view").classList.add("hidden");
    showAppLayout();
}

function switchToGroupSetup() {
    document.getElementById("app-container").classList.add("hidden");
    document.getElementById("dispatcher-group-setup-view").classList.remove("hidden");
    populateGroupSetupSelect(currentUser.id);
    refreshIcons();
}

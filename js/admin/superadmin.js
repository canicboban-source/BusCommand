// BusCommand ESM v9.5
import { initializeLoginSelects } from "../auth/login-ui.js";
import { persistUserSession } from "../auth/login-session.js";
import { saveState, clearTenantStateCache } from "../core/state.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { runSingleSubmission } from "../core/submit-lock.js";

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
    document.getElementById("sa-demo-company-pin")?.remove();
    listContainer.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);">' + t("loading") + '</td></tr>';
    const statElements = [
        document.getElementById("superadmin-total-companies"),
        document.getElementById("superadmin-total-users"),
        document.getElementById("superadmin-total-dispatchers")
            || document.getElementById("superadmin-total-groups")
    ];
    statElements.forEach(element => { if (element) element.textContent = "…"; });
    const statsError = document.getElementById("superadmin-stats-error");
    if (statsError) { statsError.textContent = ""; statsError.classList.add("hidden"); }

    let data;
    let overview;
    let adminsPayload;
    try {
        [data, overview, adminsPayload] = await Promise.all([
            ApiClient.getCompanies(),
            ApiClient.getSuperAdminOverview(),
            ApiClient.getCompanyAdmins()
        ]);
    } catch {
        data = { success: false, error: t("error_generic") };
        overview = { success: false };
        adminsPayload = { success: false };
    }
    if (adminsPayload?.success && Array.isArray(adminsPayload.companyAdmins)) {
        window.state.companyAdmins = adminsPayload.companyAdmins.map((admin) => ({
            id: admin.id,
            name: admin.name || admin.email || admin.id,
            email: admin.email || "",
            companyId: admin.companyId,
            role: "company-admin",
            active: admin.active !== false
        }));
    } else if (!window.state.companyAdmins) {
        window.state.companyAdmins = [];
    }
    if (overview.success && overview.stats) {
        const values = [
            overview.stats.companies,
            overview.stats.drivers,
            overview.stats.dispatchers ?? overview.stats.groups
        ];
        statElements.forEach((element, index) => {
            if (element) element.textContent = Number.isSafeInteger(values[index]) ? String(values[index]) : "—";
        });
    } else {
        statElements.forEach(element => { if (element) element.textContent = "—"; });
        if (statsError) {
            statsError.textContent = t("superadmin_stats_error");
            statsError.classList.remove("hidden");
        }
    }
    if (!data.success) {
        listContainer.innerHTML = '<tr><td colspan="6" style="color:#ef4444;">' + escapeHtml(data.error || t("error_generic")) + '</td></tr>';
        renderCompanyAdminList();
        return;
    }

    const companies = data.companies || [];
    listContainer.innerHTML = "";

    companies.forEach(c => {
        const tr = document.createElement("tr");
        const statusClass = c.status === "active" ? "badge-success" : "badge-critical";
        const planClass   = c.plan === "trial" ? "badge-pending" : "badge-success";

        tr.innerHTML = `
            <td><strong>${escapeHtml(c.name)}</strong></td>
            <td>
                <div class="sa-company-id-cell">
                    <code class="sa-company-id-code" title="${escapeHtml(t("company_id_label") || "Company ID")}">${escapeHtml(c.id)}</code>
                    <button type="button" class="btn-secondary sa-company-id-copy" ${actionAttr("superadminCopyCompanyId", [c.id])} title="${escapeHtml(t("sa_copy_company_id") || "Copy ID")}" aria-label="${escapeHtml(t("sa_copy_company_id") || "Copy ID")}">
                        <i data-lucide="copy" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            </td>
            <td><span class="badge ${statusClass}">${escapeHtml(c.status)}</span></td>
            <td><span class="badge ${planClass}">${escapeHtml(c.plan)}</span></td>
            <td>${escapeHtml(c.country || "—")}</td>
            <td style="font-size:0.8rem;">${c.email ? '<code style="font-size:0.75rem;">' + escapeHtml(c.email) + '</code>' : '—'}</td>
            <td style="white-space:nowrap;">
                <button class="btn-primary" ${actionAttr("superadminOpenCompanyDetail", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">
                    <i data-lucide="panel-right-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${escapeHtml(t("sa_detail_open") || "Details")}
                </button>
                ${c.supportSessionActive
                    ? `<button class="btn-secondary" ${actionAttr("superadminEndSupport", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">${escapeHtml(t("sa_support_end"))}</button>`
                    : (c.supportSessionEnabled
                        ? `<button class="btn-secondary" ${actionAttr("superadminStartSupport", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">${escapeHtml(t("sa_support_start"))}</button>`
                        : `<button class="btn-secondary" disabled style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;opacity:0.5;">${escapeHtml(t("sa_support_start"))}</button>`)
                }
                ${c.status === "active"
                    ? `<button class="btn-secondary" ${actionAttr("superadminToggleStatus", [c.id, "suspended"])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#ff4d4d;color:white;border:none;margin-right:6px;">${t("btn_suspend")}</button>`
                    : `<button class="btn-secondary" ${actionAttr("superadminToggleStatus", [c.id, "active"])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#10b981;color:white;border:none;margin-right:6px;">${t("btn_activate")}</button>`
                }
                <button class="btn-secondary" ${actionAttr("superadminDeleteCompany", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#7f1d1d;color:white;border:none;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${escapeHtml(t("sa_delete_company") || "Delete")}
                </button>
            </td>
        `;
        listContainer.appendChild(tr);
    });
    if (!companies.length) {
        listContainer.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px;">${escapeHtml(t("sa_companies_empty") || "No companies yet.")}</td></tr>`;
    }
    renderCompanyAdminList();
    lucide.createIcons();
}

function superadminFocusCompanies() {
    const panel = document.getElementById("sa-companies-panel");
    if (!panel) return;
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
    panel.focus?.({ preventScroll: true });
    panel.style.outline = "2px solid var(--primary-color)";
    panel.style.outlineOffset = "4px";
    setTimeout(() => {
        panel.style.outline = "";
        panel.style.outlineOffset = "";
    }, 1600);
}

async function superadminCopyCompanyId(companyId) {
    const id = String(companyId || "").trim();
    if (!id) return;
    try {
        await navigator.clipboard.writeText(id);
        showToast(t("sa_company_id_copied", { id }) || `Company ID kopiran: ${id}`, "success");
    } catch {
        showToast(id, "info", 8000);
    }
}

function _renderSuperAdminDashboardDemo() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    document.getElementById("sa-demo-company-pin")?.classList.remove("hidden");
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

let _pendingDetailCompanyId = null;

function formatSaDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
}

function renderCompanyDetailAdmins(company) {
    const list = document.getElementById("sa-detail-admins");
    if (!list) return;
    const admins = company.admins || [];
    if (!admins.length) {
        list.innerHTML = `<p class="sa-detail-empty">${escapeHtml(t("sa_detail_no_admins") || "No company admins yet.")}</p>`;
        return;
    }
    list.innerHTML = admins.map(admin => {
        const active = admin.active !== false;
        const statusClass = active ? "badge-success" : "badge-critical";
        const statusLabel = active
            ? (t("sa_detail_admin_active") || "Active")
            : (t("sa_detail_admin_inactive") || "Disabled");
        return `
            <div class="sa-detail-admin-row">
                <div class="sa-detail-admin-meta">
                    <strong>${escapeHtml(admin.name || admin.email || admin.id)}</strong>
                    <span>${escapeHtml(admin.email || "—")}</span>
                    <span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="sa-detail-admin-actions">
                    <button type="button" class="btn-secondary" ${actionAttr("superadminResetCompanyAdminPassword", [company.id, admin.id])}>
                        ${escapeHtml(t("sa_detail_reset_password") || "Reset password")}
                    </button>
                    <button type="button" class="btn-secondary" ${actionAttr("superadminSetCompanyAdminStatus", [company.id, admin.id, !active])}>
                        ${escapeHtml(active
                            ? (t("sa_detail_disable_admin") || "Disable")
                            : (t("sa_detail_enable_admin") || "Enable"))}
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function fillCompanyDetailModal(company) {
    const title = document.getElementById("sa-detail-title");
    const nameEl = document.getElementById("sa-detail-name");
    const idEl = document.getElementById("sa-detail-company-id");
    const statusEl = document.getElementById("sa-detail-status");
    const planEl = document.getElementById("sa-detail-plan");
    const countryEl = document.getElementById("sa-detail-country");
    const emailEl = document.getElementById("sa-detail-email");
    const trialEl = document.getElementById("sa-detail-trial");
    const supportEl = document.getElementById("sa-detail-support");
    const countsEl = document.getElementById("sa-detail-counts");
    const errorEl = document.getElementById("sa-detail-error");
    const resetBox = document.getElementById("sa-detail-reset-link-box");
    const openBtn = document.getElementById("sa-detail-open-app-btn");
    const copyBtn = document.getElementById("sa-detail-copy-id-btn");

    if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
    }
    if (resetBox) {
        resetBox.classList.add("hidden");
        resetBox.innerHTML = "";
    }
    if (title) title.textContent = company.name || company.id;
    if (nameEl) nameEl.textContent = company.name || "—";
    if (idEl) idEl.textContent = company.id || "—";
    if (statusEl) {
        statusEl.textContent = company.status || "—";
        statusEl.className = "badge " + (company.status === "active" ? "badge-success" : "badge-critical");
    }
    if (planEl) {
        planEl.textContent = company.plan || "—";
        planEl.className = "badge " + (company.plan === "trial" ? "badge-pending" : "badge-success");
    }
    if (countryEl) countryEl.textContent = company.country || "—";
    if (emailEl) emailEl.textContent = company.contactEmail || "—";
    if (trialEl) trialEl.textContent = formatSaDate(company.trialEndsAt);
    if (supportEl) {
        supportEl.textContent = company.supportSessionActive
            ? (t("sa_detail_support_active") || "Active")
            : (company.supportSessionEnabled
                ? (t("sa_detail_support_ready") || "Available")
                : (t("sa_detail_support_off") || "Off"));
    }
    if (countsEl) {
        const counts = company.counts || {};
        countsEl.innerHTML = `
            <div><span>${escapeHtml(t("sa_detail_count_admins") || "Admins")}</span><strong>${Number(counts.companyAdmins) || 0}</strong></div>
            <div><span>${escapeHtml(t("sa_detail_count_dispatchers") || "Dispatchers")}</span><strong>${Number(counts.dispatchers) || 0}</strong></div>
            <div><span>${escapeHtml(t("sa_detail_count_drivers") || "Drivers")}</span><strong>${Number(counts.drivers) || 0}</strong></div>
            <div><span>${escapeHtml(t("sa_detail_count_groups") || "Groups")}</span><strong>${Number(counts.groups) || 0}</strong></div>
        `;
    }
    if (openBtn) openBtn.setAttribute("data-action-args", JSON.stringify([company.id]));
    if (copyBtn) copyBtn.setAttribute("data-action-args", JSON.stringify([company.id]));
    renderCompanyDetailAdmins(company);
}

async function superadminOpenCompanyDetail(companyId) {
    const id = String(companyId || "").trim();
    if (!id) return;
    _pendingDetailCompanyId = id;
    const modal = document.getElementById("sa-company-detail-modal");
    const body = document.getElementById("sa-detail-body");
    const errorEl = document.getElementById("sa-detail-error");
    if (!modal || !body) return;
    if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
    }
    body.innerHTML = `
        <div class="sa-detail-grid">
            <div><span data-i18n="company_name_label">Company</span><strong id="sa-detail-name">—</strong></div>
            <div>
                <span data-i18n="company_id_label">Company ID</span>
                <div class="sa-company-id-cell">
                    <code id="sa-detail-company-id" class="sa-company-id-code">—</code>
                    <button type="button" id="sa-detail-copy-id-btn" class="btn-secondary sa-company-id-copy" data-action="superadminCopyCompanyId" data-action-args='[]' title="${escapeHtml(t("sa_copy_company_id") || "Copy ID")}">
                        <i data-lucide="copy" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            </div>
            <div><span data-i18n="superadmin_status">Status</span><span id="sa-detail-status" class="badge">—</span></div>
            <div><span data-i18n="sa_col_plan">Plan</span><span id="sa-detail-plan" class="badge">—</span></div>
            <div><span data-i18n="sa_col_country">Country</span><strong id="sa-detail-country">—</strong></div>
            <div><span data-i18n="email_label">Email</span><strong id="sa-detail-email">—</strong></div>
            <div><span data-i18n="sa_detail_trial">Trial ends</span><strong id="sa-detail-trial">—</strong></div>
            <div><span data-i18n="sa_detail_support">Support</span><strong id="sa-detail-support">—</strong></div>
        </div>
        <div id="sa-detail-counts" class="sa-detail-counts"></div>
        <h4 class="sa-detail-subtitle">${escapeHtml(t("sa_detail_admins_title") || "Company admins")}</h4>
        <div id="sa-detail-admins"></div>
        <div id="sa-detail-reset-link-box" class="sa-detail-reset-box hidden"></div>
    `;

    function showDetailModal() {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
    }

    if (IS_DEMO_MODE) {
        fillCompanyDetailModal({
            id,
            name: id,
            status: "active",
            plan: "trial",
            country: "—",
            contactEmail: null,
            counts: { companyAdmins: 0, dispatchers: 0, drivers: 0, groups: 0 },
            admins: []
        });
        showDetailModal();
        lucide.createIcons();
        return;
    }

    const res = await ApiClient.getCompanyDetail(id);
    if (!res.success || !res.company) {
        if (errorEl) {
            errorEl.textContent = res.error || t("error_generic");
            errorEl.classList.remove("hidden");
        }
        showDetailModal();
        return;
    }
    fillCompanyDetailModal(res.company);
    showDetailModal();
    lucide.createIcons();
}

function superadminCloseCompanyDetail() {
    _pendingDetailCompanyId = null;
    const modal = document.getElementById("sa-company-detail-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
        modal.setAttribute("aria-hidden", "true");
    }
}

async function superadminRefreshCompanyDetail() {
    if (!_pendingDetailCompanyId) return;
    await superadminOpenCompanyDetail(_pendingDetailCompanyId);
}

async function superadminSetCompanyAdminStatus(companyId, uid, active) {
    const nextActive = active === true || active === "true";
    const label = nextActive
        ? (t("sa_detail_confirm_enable") || "Enable this company admin?")
        : (t("sa_detail_confirm_disable") || "Disable this company admin?");
    showConfirm(label, async () => {
        const res = await ApiClient.setCompanyAdminStatus(companyId, uid, nextActive);
        if (!res.success) {
            showToast(res.error || t("error_generic"), "error");
            return;
        }
        showToast(
            nextActive
                ? (t("sa_detail_admin_enabled") || "Company admin enabled.")
                : (t("sa_detail_admin_disabled") || "Company admin disabled."),
            "success"
        );
        await superadminRefreshCompanyDetail();
        await renderSuperAdminDashboard();
    }, { danger: !nextActive });
}

async function superadminResetCompanyAdminPassword(companyId, uid) {
    showConfirm(t("sa_detail_confirm_reset") || "Generate a password reset link for this company admin?", async () => {
        const res = await ApiClient.resetCompanyAdminPassword(companyId, uid);
        if (!res.success) {
            showToast(res.error || t("error_generic"), "error");
            return;
        }
        const box = document.getElementById("sa-detail-reset-link-box");
        if (box && res.resetLink) {
            box.classList.remove("hidden");
            box.innerHTML = `
                <p>${escapeHtml(t("sa_detail_reset_ready", { email: res.email }) || `Reset link for ${res.email}:`)}</p>
                <code class="sa-detail-reset-link">${escapeHtml(res.resetLink)}</code>
                <button type="button" class="btn-secondary" ${actionAttr("superadminCopyText", [res.resetLink])}>
                    ${escapeHtml(t("sa_detail_copy_reset_link") || "Copy reset link")}
                </button>
            `;
        }
        showToast(t("sa_detail_reset_done") || "Password reset link ready.", "success");
        lucide.createIcons();
    });
}

async function superadminCopyText(value) {
    const text = String(value || "").trim();
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        showToast(t("sa_detail_copied") || "Copied.", "success");
    } catch {
        showToast(text, "info", 8000);
    }
}


async function superadminCreateCompany() {
    const nameInput = document.getElementById("sa-new-name");
    const pinInput  = document.getElementById("sa-new-pin");
    const submitButton = document.getElementById("sa-create-company-btn");
    if (!nameInput || (IS_DEMO_MODE && !pinInput)) return false;

    const name = nameInput.value.trim();
    const pin  = pinInput?.value.trim() || "1234";
    const companyId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("firma-" + Date.now());

    if (!name) { showToast(t("company_name_required"), "error"); return false; }

    if (!IS_DEMO_MODE) {
        const submission = await runSingleSubmission(submitButton, t("creating"), async () => {
            const res = await ApiClient.createCompany({ companyId, name, contactEmail: "admin@" + companyId + ".com" });
            if (!res.success) {
                showToast(res.error || t("error_generic"), "error");
                return false;
            }
            nameInput.value = "";
            await renderSuperAdminDashboard();
            showToast(t("company_created", { name, companyId }), "success");
            return true;
        });
        return submission.started && submission.value === true;
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
    showToast(t("company_created", { name, companyId }), "success");
}

async function superadminCreateCompanyAdmin() {
    const name      = (document.getElementById('sa-ca-name')       || {}).value?.trim();
    const email     = (document.getElementById('sa-ca-email')      || {}).value?.trim().toLowerCase();
    const password  = (document.getElementById('sa-ca-password')   || {}).value?.trim();
    const companyId = (document.getElementById('sa-ca-company-id') || {}).value?.trim().toLowerCase();
    const submitButton = document.getElementById("sa-create-admin-btn");

    if (!name || !email || !password || !companyId) {
        showToast(t("error_fill_admin_fields"), 'error'); return false;
    }
    if (password.length < 6) {
        showToast(t("ca_password_min"), 'error'); return false;
    }

    if (!IS_DEMO_MODE) {
        const submission = await runSingleSubmission(submitButton, t("creating"), async () => {
                const res = await ApiClient.createUser({ email, password, name, role: "company_admin", companyId });
                if (res.success) {
                    ['sa-ca-name','sa-ca-email','sa-ca-password','sa-ca-company-id'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.value = '';
                    });
                    if (!window.state.companyAdmins) window.state.companyAdmins = [];
                    window.state.companyAdmins = window.state.companyAdmins.filter(admin => admin.email !== email);
                    window.state.companyAdmins.push({
                        id: res.uid, name, email, companyId, role: "company-admin"
                    });
                    await renderSuperAdminDashboard();
                    showToast(t("admin_created", { name }), 'success');
                    return true;
                } else {
                    showToast(res.error || t("error_generic"), 'error');
                    return false;
                }
        });
        return submission.started && submission.value === true;
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
    if (!IS_DEMO_MODE && window.currentUser?.role === "superadmin") {
        superadminOpenDeleteCompanyModal(dispId);
        return;
    }
    showConfirm("Are you sure you want to delete this company account? This cannot be undone.", function() {
        window.state.dispatchers = window.state.dispatchers.filter(d => d.id !== dispId);
        saveState();
        renderSuperAdminDashboard();
        initializeLoginSelects();
        showToast("Company deleted.", "info");
    }, { danger: true, title: "Delete Company" });
}

let _pendingDeleteCompanyId = null;

function superadminOpenDeleteCompanyModal(companyId) {
    _pendingDeleteCompanyId = companyId;
    const modal = document.getElementById("sa-delete-company-modal");
    const confirmInput = document.getElementById("sa-delete-company-confirm");
    const hint = document.getElementById("sa-delete-company-id-hint");
    const error = document.getElementById("sa-delete-company-error");
    if (hint) hint.textContent = companyId;
    if (confirmInput) confirmInput.value = "";
    if (error) {
        error.textContent = "";
        error.classList.add("hidden");
    }
    if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
        requestAnimationFrame(() => confirmInput?.focus());
    }
}

function superadminCancelDeleteCompanyModal() {
    _pendingDeleteCompanyId = null;
    const modal = document.getElementById("sa-delete-company-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
}

async function superadminConfirmDeleteCompany() {
    const companyId = _pendingDeleteCompanyId;
    if (!companyId) return;
    const confirmInput = document.getElementById("sa-delete-company-confirm");
    const error = document.getElementById("sa-delete-company-error");
    const typed = (confirmInput?.value || "").trim();
    if (typed !== companyId) {
        if (error) {
            error.textContent = t("sa_delete_company_mismatch") || "companyId se ne poklapa.";
            error.classList.remove("hidden");
        }
        return;
    }
    const res = await ApiClient.deleteCompany(companyId, typed);
    if (!res.success) {
        if (error) {
            error.textContent = res.error || t("error_generic");
            error.classList.remove("hidden");
        }
        showToast(res.error || t("error_generic"), "error");
        return;
    }
    clearTenantStateCache(companyId);
    superadminCancelDeleteCompanyModal();
    showToast(t("sa_delete_company_done") || "Firma obrisana.", "success");
    await renderSuperAdminDashboard();
}

let _pendingSupportCompanyId = null;

function superadminStartSupport(companyId) {
    _pendingSupportCompanyId = companyId;
    const modal = document.getElementById("sa-support-modal");
    const reason = document.getElementById("sa-support-reason");
    const category = document.getElementById("sa-support-category");
    const error = document.getElementById("sa-support-error");
    if (reason) reason.value = "";
    if (category) category.value = "incident";
    if (error) { error.textContent = ""; error.classList.add("hidden"); }
    if (modal) {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
    }
}

function superadminCancelSupportModal() {
    _pendingSupportCompanyId = null;
    const modal = document.getElementById("sa-support-modal");
    if (modal) {
        modal.classList.add("hidden");
        modal.style.display = "none";
    }
}

async function superadminConfirmSupportStart() {
    const companyId = _pendingSupportCompanyId;
    if (!companyId) return;
    const category = document.getElementById("sa-support-category")?.value || "incident";
    const reason = (document.getElementById("sa-support-reason")?.value || "").trim();
    const error = document.getElementById("sa-support-error");
    if (reason.length < 20) {
        if (error) {
            error.textContent = t("sa_support_reason_short");
            error.classList.remove("hidden");
        }
        return;
    }
    const res = await ApiClient.startSupportSession(companyId, { category, reason });
    if (!res.success) {
        if (error) {
            error.textContent = res.error || t("error_generic");
            error.classList.remove("hidden");
        }
        showToast(res.error || t("error_generic"), "error");
        return;
    }
    superadminCancelSupportModal();
    showToast(t("sa_support_started"), "success");
    await renderSuperAdminDashboard();
}

async function superadminEndSupport(companyId) {
    const active = await ApiClient.getActiveSupportSessionAdmin(companyId);
    if (!active.success || !active.session?.id) {
        showToast(t("sa_support_none"), "info");
        await renderSuperAdminDashboard();
        return;
    }
    showConfirm(t("sa_support_end_confirm"), async () => {
        const res = await ApiClient.endSupportSessionAdmin(active.session.id, companyId);
        if (!res.success) {
            showToast(res.error || t("error_generic"), "error");
            return;
        }
        showToast(t("sa_support_ended"), "success");
        await renderSuperAdminDashboard();
    });
}

export {
    renderSuperAdminDashboard,
    renderSuperAdminDashboardProduction,
    _renderSuperAdminDashboardDemo,
    superadminToggleStatus,
    superadminOpenCompany,
    superadminOpenCompanyDetail,
    superadminCloseCompanyDetail,
    superadminSetCompanyAdminStatus,
    superadminResetCompanyAdminPassword,
    superadminCopyText,
    superadminFocusCompanies,
    superadminCopyCompanyId,
    superadminCreateCompany,
    superadminCreateCompanyAdmin,
    renderCompanyAdminList,
    superadminDeleteCompanyAdmin,
    superadminImpersonate,
    superadminResetPin,
    superadminDeleteCompany,
    superadminCancelDeleteCompanyModal,
    superadminConfirmDeleteCompany,
    superadminStartSupport,
    superadminCancelSupportModal,
    superadminConfirmSupportStart,
    superadminEndSupport
};

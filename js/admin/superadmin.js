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

async function refreshSaPlatformHealth() {
    const el = document.getElementById("sa-platform-health");
    if (!el) return;
    if (IS_DEMO_MODE) {
        el.textContent = t("sa_health_demo") || "Demo mode — platform health is local only.";
        return;
    }
    try {
        const health = await ApiClient.getPlatformHealth();
        if (!health?.success) {
            el.textContent = t("sa_health_unavailable") || "Platform health unavailable.";
            return;
        }
        const parts = [
            `${t("sa_health_status") || "Status"}: ${health.status || "ok"}`,
            `${t("sa_health_mode") || "Mode"}: ${health.mode || "—"}`,
            `${t("sa_health_version") || "Version"}: ${health.version || "—"}`,
            `${t("sa_health_uptime") || "Uptime"}: ${Math.max(0, Number(health.uptime) || 0)}s`,
            `Firebase: ${health.firebase ? "on" : "off"}`
        ];
        el.textContent = parts.join(" · ");
    } catch {
        el.textContent = t("sa_health_unavailable") || "Platform health unavailable.";
    }
}

function renderSuperAdminDashboard() {
    refreshSaPlatformHealth();
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

function _demoCompanyPlan(company) {
    const pay = String(company.paymentStatus || "").toLowerCase();
    if (pay === "paid") return "standard";
    if (pay === "overdue") return "trial";
    return company.plan || "trial";
}

function _demoCompanyStatus(company) {
    if (company.active === false || company.status === "suspended") return "suspended";
    return company.passwordChanged ? "active" : "pending";
}

function _findDemoCompanyDispatcher(companyRef) {
    const key = String(companyRef || "").trim();
    if (!key) return null;
    return (window.state.dispatchers || []).find((d) =>
        d
        && d.id !== "superadmin"
        && !d.isSuperAdmin
        && (d.companyId === key || d.id === key)
    ) || null;
}

function _renderSuperAdminDashboardDemo() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    document.getElementById("sa-demo-company-pin")?.classList.remove("hidden");
    listContainer.innerHTML = "";

    const dispatchers = window.state.dispatchers || [];
    const companies = dispatchers.filter(d => d.id !== "superadmin" && !d.isSuperAdmin);

    const totalCompEl = document.getElementById("superadmin-total-companies");
    if (totalCompEl) totalCompEl.textContent = String(companies.length);

    let totalDrivers = 0;
    companies.forEach(c => {
        (c.groups || []).forEach(gId => {
            totalDrivers += (window.state.drivers || []).filter(d => d.groupId === gId).length;
        });
    });
    // Drivers without a dispatcher group still count toward the tenant total.
    if (!companies.length) {
        totalDrivers = (window.state.drivers || []).length;
    }
    const totalUsersEl = document.getElementById("superadmin-total-users");
    if (totalUsersEl) totalUsersEl.textContent = String(totalDrivers);
    const totalDispatchersEl = document.getElementById("superadmin-total-dispatchers");
    if (totalDispatchersEl) totalDispatchersEl.textContent = String(companies.length);

    if (!companies.length) {
        listContainer.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:18px;">${escapeHtml(t("sa_companies_empty") || "No companies yet.")}</td></tr>`;
        renderCompanyAdminList();
        lucide.createIcons();
        return;
    }

    companies.forEach(c => {
        const tr = document.createElement("tr");
        const status = _demoCompanyStatus(c);
        const plan = _demoCompanyPlan(c);
        const statusClass = status === "active" ? "badge-success" : status === "suspended" ? "badge-critical" : "badge-pending";
        const planClass = plan === "trial" ? "badge-pending" : "badge-success";
        const companyKey = c.companyId || c.id;
        const supportEnabled = c.features?.supportSession !== false;
        const supportActive = !!c.supportSessionActive;

        tr.innerHTML = `
            <td><strong>${escapeHtml(c.name || companyKey)}</strong></td>
            <td>
                <div class="sa-company-id-cell">
                    <code class="sa-company-id-code" title="${escapeHtml(t("company_id_label") || "Company ID")}: ${escapeHtml(companyKey)}">${escapeHtml(companyKey)}</code>
                    <button type="button" class="btn-secondary sa-company-id-copy" ${actionAttr("superadminCopyCompanyId", [companyKey])} title="${escapeHtml(t("sa_copy_company_id") || "Copy ID")}" aria-label="${escapeHtml(t("sa_copy_company_id") || "Copy ID")}">
                        <i data-lucide="copy" style="width:14px;height:14px;"></i>
                    </button>
                </div>
            </td>
            <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
            <td><span class="badge ${planClass}">${escapeHtml(plan)}</span></td>
            <td>${escapeHtml(c.country || "—")}</td>
            <td style="font-size:0.8rem;">${c.email ? '<code style="font-size:0.75rem;">' + escapeHtml(c.email) + '</code>' : '—'}</td>
            <td style="white-space:nowrap;">
                <button class="btn-primary" ${actionAttr("superadminOpenCompanyDetail", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">
                    <i data-lucide="panel-right-open" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${escapeHtml(t("sa_detail_open") || "Details")}
                </button>
                ${supportActive
                    ? `<button class="btn-secondary" ${actionAttr("superadminEndSupport", [companyKey])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">${escapeHtml(t("sa_support_end"))}</button>`
                    : (supportEnabled
                        ? `<button class="btn-secondary" ${actionAttr("superadminStartSupport", [companyKey])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">${escapeHtml(t("sa_support_start"))}</button>`
                        : `<button class="btn-secondary" disabled style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;opacity:0.5;">${escapeHtml(t("sa_support_start"))}</button>`)
                }
                ${status === "suspended"
                    ? `<button class="btn-secondary" ${actionAttr("superadminToggleStatus", [companyKey, "active"])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#10b981;color:white;border:none;margin-right:6px;">${t("btn_activate")}</button>`
                    : `<button class="btn-secondary" ${actionAttr("superadminToggleStatus", [companyKey, "suspended"])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#ff4d4d;color:white;border:none;margin-right:6px;">${t("btn_suspend")}</button>`
                }
                <button class="btn-secondary" ${actionAttr("superadminImpersonate", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;">
                    <i data-lucide="eye" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Inspect
                </button>
                <button class="btn-secondary" ${actionAttr("superadminResetPin", [c.id])} style="padding:4px 10px;font-size:0.8rem;height:auto;margin-right:6px;background:rgba(255,255,255,0.05);color:white;border:1px solid rgba(255,255,255,0.1);">
                    <i data-lucide="key" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> Reset PIN
                </button>
                <button class="btn-secondary" ${actionAttr("superadminDeleteCompany", [companyKey])} style="padding:4px 10px;font-size:0.8rem;height:auto;background:#7f1d1d;color:white;border:none;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;"></i> ${escapeHtml(t("sa_delete_company") || "Delete")}
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
        if (IS_DEMO_MODE) {
            const disp = _findDemoCompanyDispatcher(companyId);
            if (!disp) {
                showToast(t("error_generic"), "error");
                return;
            }
            disp.active = status !== "suspended";
            disp.status = status === "suspended" ? "suspended" : "active";
            saveState();
            showToast(t("sa_status_updated"), "success");
            renderSuperAdminDashboard();
            return;
        }
        const res = await ApiClient.setCompanyStatus(companyId, status);
        if (res.success) {
            showToast(t("sa_status_updated"), "success");
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
    renderCompanyDetailSettingsForm(company);
}

function renderCompanyDetailSettingsForm(company) {
    const host = document.getElementById("sa-detail-settings");
    if (!host) return;
    const features = company.features || {};
    const trialValue = company.trialEndsAt ? String(company.trialEndsAt).slice(0, 10) : "";
    host.innerHTML = `
        <h4 class="sa-detail-subtitle">${escapeHtml(t("sa_detail_settings_title") || "Plan, limits and flags")}</h4>
        <div class="sa-detail-settings-grid">
            <label>${escapeHtml(t("sa_col_plan") || "Plan")}
                <select id="sa-edit-plan">
                    <option value="trial"${company.plan === "trial" ? " selected" : ""}>trial</option>
                    <option value="standard"${company.plan === "standard" ? " selected" : ""}>standard</option>
                    <option value="enterprise"${company.plan === "enterprise" ? " selected" : ""}>enterprise</option>
                </select>
            </label>
            <label>${escapeHtml(t("sa_detail_max_drivers") || "Max drivers")}
                <input id="sa-edit-max-drivers" type="number" min="1" max="5000" value="${Number(company.maxDrivers) || 50}">
            </label>
            <label>${escapeHtml(t("sa_detail_max_dispatchers") || "Max dispatchers")}
                <input id="sa-edit-max-dispatchers" type="number" min="1" max="500" value="${Number(company.maxDispatchers) || 5}">
            </label>
            <label>${escapeHtml(t("sa_detail_trial") || "Trial ends")}
                <input id="sa-edit-trial-ends" type="date" value="${escapeHtml(trialValue)}">
            </label>
        </div>
        <div class="sa-detail-flags">
            <label><input type="checkbox" id="sa-flag-supportSession" ${features.supportSession ? "checked" : ""}> supportSession</label>
            <label><input type="checkbox" id="sa-flag-shiftConfirmationScheduler" ${features.shiftConfirmationScheduler ? "checked" : ""}> shiftConfirmationScheduler</label>
            <label><input type="checkbox" id="sa-flag-liveGps" ${features.liveGps ? "checked" : ""}> liveGps</label>
            <label><input type="checkbox" id="sa-flag-liveMap" ${features.liveMap !== false ? "checked" : ""}> liveMap</label>
        </div>
        <p class="sa-detail-settings-hint">${escapeHtml(t("sa_detail_settings_hint") || "liveGps stays off until O2 retention is decided. Changing flags is audited.")}</p>
        <button type="button" class="btn-primary" data-action="superadminSaveCompanySettings" data-action-args='${JSON.stringify([company.id])}'>
            ${escapeHtml(t("sa_detail_save_settings") || "Save settings")}
        </button>
    `;
}

async function superadminSaveCompanySettings(companyId) {
    const id = String(companyId || _pendingDetailCompanyId || "").trim();
    if (!id || IS_DEMO_MODE) {
        showToast(t("sa_detail_settings_demo") || "Settings patch is production-only.", "info");
        return;
    }
    const payload = {
        plan: document.getElementById("sa-edit-plan")?.value || undefined,
        maxDrivers: Number(document.getElementById("sa-edit-max-drivers")?.value),
        maxDispatchers: Number(document.getElementById("sa-edit-max-dispatchers")?.value),
        trialEndsAt: document.getElementById("sa-edit-trial-ends")?.value
            ? `${document.getElementById("sa-edit-trial-ends").value}T23:59:59.000Z`
            : null,
        features: {
            supportSession: !!document.getElementById("sa-flag-supportSession")?.checked,
            shiftConfirmationScheduler: !!document.getElementById("sa-flag-shiftConfirmationScheduler")?.checked,
            liveGps: !!document.getElementById("sa-flag-liveGps")?.checked,
            liveMap: !!document.getElementById("sa-flag-liveMap")?.checked
        }
    };
    const result = await ApiClient.patchCompanySettings(id, payload);
    if (!result.success) {
        showToast(result.error || t("error_generic"), "error");
        return;
    }
    showToast(t("sa_detail_settings_saved") || "Company settings saved.", "success");
    if (result.company) fillCompanyDetailModal(result.company);
    await renderSuperAdminDashboard();
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
        <div id="sa-detail-settings"></div>
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
        const disp = (window.state.dispatchers || []).find(d => d.id === id) || null;
        const companyKey = disp?.companyId || disp?.id || id;
        const groupIds = Array.isArray(disp?.groups) ? disp.groups : [];
        const drivers = (window.state.drivers || []).filter(d => groupIds.includes(d.groupId));
        const admins = (window.state.companyAdmins || [])
            .filter(ca => ca.companyId === companyKey || ca.companyId === id)
            .map(ca => ({
                id: ca.id,
                name: ca.name || ca.email || ca.id,
                email: ca.email || "",
                active: ca.active !== false
            }));
        fillCompanyDetailModal({
            id: companyKey,
            name: disp?.name || companyKey,
            status: disp ? _demoCompanyStatus(disp) : "active",
            plan: disp ? _demoCompanyPlan(disp) : "trial",
            country: disp?.country || "—",
            contactEmail: disp?.email || null,
            trialEndsAt: disp?.trialEndsAt || null,
            maxDrivers: disp?.maxDrivers || 50,
            maxDispatchers: disp?.maxDispatchers || 5,
            features: disp?.features || {},
            supportSessionEnabled: disp?.features?.supportSession !== false,
            supportSessionActive: !!disp?.supportSessionActive,
            counts: {
                companyAdmins: admins.length,
                dispatchers: disp ? 1 : 0,
                drivers: drivers.length,
                groups: groupIds.length
            },
            admins
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
        if (IS_DEMO_MODE) {
            const match = (window.state.companyAdmins || []).find((admin) =>
                String(admin.id) === String(uid)
            );
            if (!match) {
                showToast(t("error_generic"), "error");
                return;
            }
            match.active = nextActive;
            saveState();
            showToast(
                nextActive
                    ? (t("sa_detail_admin_enabled") || "Company admin enabled.")
                    : (t("sa_detail_admin_disabled") || "Company admin disabled."),
                "success"
            );
            await superadminRefreshCompanyDetail();
            await renderSuperAdminDashboard();
            return;
        }
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
        if (IS_DEMO_MODE) {
            const match = (window.state.companyAdmins || []).find((admin) => String(admin.id) === String(uid));
            if (!match) {
                showToast(t("error_generic"), "error");
                return;
            }
            const tempPass = `demo-reset-${Math.floor(1000 + Math.random() * 9000)}`;
            match.password = tempPass;
            saveState();
            const box = document.getElementById("sa-detail-reset-link-box");
            if (box) {
                box.classList.remove("hidden");
                box.innerHTML = `
                    <p>${escapeHtml(t("sa_detail_reset_ready", { email: match.email }) || `Demo password for ${match.email}:`)}</p>
                    <code class="sa-detail-reset-link">${escapeHtml(tempPass)}</code>
                    <button type="button" class="btn-secondary" ${actionAttr("superadminCopyText", [tempPass])}>
                        ${escapeHtml(t("sa_detail_copy_reset_link") || "Copy password")}
                    </button>
                `;
            }
            showToast(t("sa_detail_reset_done") || "Password reset link ready.", "success");
            lucide.createIcons();
            return;
        }
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
        showToast(t("sa_pin_length_error"), "error"); return;
    }

    const id = "disp-" + Date.now();
    window.state.dispatchers = window.state.dispatchers || [];
    window.state.dispatchers.push({
        id,
        name,
        pin,
        passwordChanged: false,
        groups: [],
        companyId,
        email: "",
        country: "—"
    });
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
        showToast(t("sa_ca_email_exists"), "error"); return;
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
    showToast(t("sa_ca_created_for_company", { name, companyId }), "success");
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
            ${IS_DEMO_MODE ? `<button ${actionAttr("superadminDeleteCompanyAdmin", [ca.id])} style="background:#ef444422;border:1px solid #ef4444;color:#ef4444;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.75rem;" title="Demo only">
                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>` : ""}
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function superadminDeleteCompanyAdmin(id) {
    if (!IS_DEMO_MODE) {
        showToast(t("sa_ca_delete_prod_blocked") !== "sa_ca_delete_prod_blocked"
            ? t("sa_ca_delete_prod_blocked")
            : "In production, disable the Company Admin instead of deleting.", "error");
        return;
    }
    if (!window.state.companyAdmins) return;
    window.state.companyAdmins = window.state.companyAdmins.filter(ca => ca.id !== id);
    renderCompanyAdminList();
    showToast(t("sa_ca_deleted"), "info");
}

function superadminImpersonate(dispId) {
    // Production uses audited support sessions — never fake a dispatcher token locally.
    if (!IS_DEMO_MODE) {
        showToast(t("sa_impersonate_demo_only") || "Stealth inspect is demo-only. Use a support session in production.", "error");
        return;
    }
    const disp = window.state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;

    window.currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        activeGroupId: disp.activeGroupId || (disp.groups && disp.groups.length > 0 ? disp.groups[0] : null),
        impersonated: true,
        readOnly: true
    };

    persistUserSession(window.currentUser);
    showAppLayout();
    showToast(`Stealth Inspect: ${disp.name} (Read-Only)`, "info");
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

function superadminDeleteCompany(companyRef) {
    const key = String(companyRef || "").trim();
    if (!key) return;
    // Typed company-ID confirm for Super Admin (demo + production).
    if (window.currentUser?.role === "superadmin") {
        const disp = _findDemoCompanyDispatcher(key);
        const typedId = disp?.companyId || key;
        superadminOpenDeleteCompanyModal(typedId);
        return;
    }
    showConfirm("Are you sure you want to delete this company account? This cannot be undone.", function() {
        window.state.dispatchers = window.state.dispatchers.filter(d => d.id !== key && d.companyId !== key);
        saveState();
        renderSuperAdminDashboard();
        initializeLoginSelects();
        showToast(t("sa_company_deleted"), "info");
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
    if (IS_DEMO_MODE) {
        window.state.dispatchers = (window.state.dispatchers || []).filter((d) => {
            if (d.id === "superadmin" || d.isSuperAdmin) return true;
            return d.companyId !== companyId && d.id !== companyId;
        });
        window.state.companyAdmins = (window.state.companyAdmins || []).filter(
            (ca) => ca.companyId !== companyId
        );
        saveState();
        superadminCancelDeleteCompanyModal();
        showToast(t("sa_delete_company_done") || t("sa_company_deleted") || "Firma obrisana.", "success");
        renderSuperAdminDashboard();
        initializeLoginSelects();
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
    if (IS_DEMO_MODE) {
        const disp = _findDemoCompanyDispatcher(companyId);
        if (!disp) {
            if (error) {
                error.textContent = t("error_generic");
                error.classList.remove("hidden");
            }
            return;
        }
        disp.features = { ...(disp.features || {}), supportSession: true };
        disp.supportSessionActive = true;
        disp.supportSessionMeta = { category, reason, startedAt: new Date().toISOString() };
        saveState();
        superadminCancelSupportModal();
        showToast(t("sa_support_started"), "success");
        // Enter read-only tenant view (same guardrails as Inspect).
        window.currentUser = {
            role: "dispatcher",
            name: disp.name,
            id: disp.id,
            companyId: disp.companyId || companyId,
            activeGroupId: disp.activeGroupId || (disp.groups && disp.groups[0]) || null,
            impersonated: true,
            readOnly: true,
            supportSession: true
        };
        persistUserSession(window.currentUser);
        showAppLayout();
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
    if (IS_DEMO_MODE) {
        const disp = _findDemoCompanyDispatcher(companyId);
        if (!disp || !disp.supportSessionActive) {
            showToast(t("sa_support_none"), "info");
            renderSuperAdminDashboard();
            return;
        }
        showConfirm(t("sa_support_end_confirm"), () => {
            disp.supportSessionActive = false;
            disp.supportSessionMeta = null;
            saveState();
            showToast(t("sa_support_ended"), "success");
            renderSuperAdminDashboard();
        });
        return;
    }
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
    superadminEndSupport,
    superadminSaveCompanySettings
};

// BusCommand ESM v9.5
import { initializeLoginSelects } from "../auth/login-ui.js";
import { persistUserSession } from "../auth/login-session.js";
import { saveState, clearTenantStateCache } from "../core/state.js";
import { escapeHtml, showToast, refreshIcons, toastApiError } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { rowActionsMenuHtml } from "../ui/row-actions-menu.js";
import {
    loadSaCreateCompanyFlow,
    getSaCreateFlowIfLoaded
} from "./sa-create-company-flow-loader.js";
import { icon, btnSecondary, btnPrimary } from "../ui/markup.js";

const LICENSE_PACKAGE_LIMITS = Object.freeze({
    starter: { maxDrivers: 15, maxDispatchers: 2, label: "STARTER" },
    pro: { maxDrivers: 50, maxDispatchers: 5, label: "PRO" },
    fleet_master: { maxDrivers: 200, maxDispatchers: 15, label: "FLEET MASTER" },
    enterprise: { maxDrivers: 5000, maxDispatchers: 50, label: "ENTERPRISE" }
});

function packageLimitsForType(licenseType) {
    const key = String(licenseType || "pro").toLowerCase().replace(/[\s-]+/g, "_");
    if (key === "trial" || key === "standard") return LICENSE_PACKAGE_LIMITS.pro;
    return LICENSE_PACKAGE_LIMITS[key] || LICENSE_PACKAGE_LIMITS.pro;
}

function superadminOnPlanChange(planValue) {
    const limits = packageLimitsForType(planValue);
    const driversEl = document.getElementById("sa-edit-max-drivers");
    const dispEl = document.getElementById("sa-edit-max-dispatchers");
    if (driversEl) driversEl.value = String(limits.maxDrivers);
    if (dispEl) dispEl.value = String(limits.maxDispatchers);
}

/** t() returns the key when missing — never treat that as a real string. */
function tf(key, fallback) {
    const value = t(key);
    return value && value !== key ? value : fallback;
}

async function refreshSaPlatformHealth() {
    const el = document.getElementById("sa-platform-health");
    if (!el) return;
    if (USE_LOCAL_STATE) {
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
    if (!USE_LOCAL_STATE && window.currentUser && window.currentUser.role === "superadmin") {
        renderSuperAdminDashboardProduction();
        return;
    }
    _renderSuperAdminDashboardDemo();
}

async function renderSuperAdminDashboardProduction() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    document.getElementById("sa-demo-company-pin")?.classList.add("hidden");
    listContainer.innerHTML = `<tr><td colspan="6" class="sa-companies-empty">${escapeHtml(t("loading") || "Loading…")}</td></tr>`;
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
        listContainer.innerHTML = `<tr><td colspan="6" class="sa-companies-empty" style="color:#ef4444;">${escapeHtml(data.error || t("error_generic"))}</td></tr>`;
        return;
    }

    const companies = data.companies || [];
    const admins = window.state.companyAdmins || [];
    if (!companies.length) {
        listContainer.innerHTML = `<tr><td colspan="6" class="sa-companies-empty">${escapeHtml(t("sa_companies_empty") || "No companies yet.")}</td></tr>`;
    } else {
        listContainer.innerHTML = companies.map((c) => {
            const admin = admins.find((a) => a.companyId === c.id && a.active !== false) || null;
            return _saCompanyRowHtml({
                name: c.name,
                companyKey: c.id,
                detailId: c.id,
                status: c.status,
                licenseStatus: c.licenseStatus,
                packageLabel: c.packageLabel || c.plan,
                daysRemaining: c.daysRemaining,
                country: c.country,
                adminName: c.adminName || admin?.name || "",
                adminEmail: c.adminEmail || admin?.email || c.email || "",
                supportSessionActive: !!c.supportSessionActive,
                supportSessionEnabled: !!c.supportSessionEnabled,
                demoExtras: false
            });
        }).join("");
    }
    refreshIcons();
}

/** Single badge: TRIAL+days (yellow) OR ACTIVE+package (green). Never mix contradictory chips. */
function _licenseStatusLabel(licenseStatus, status, { packageLabel, daysRemaining } = {}) {
    const pkg = String(packageLabel || "PRO").toUpperCase();
    if (status === "suspended" || licenseStatus === "suspended") {
        return { text: t("license_status_suspended") || "Suspendovan", cls: "badge-critical" };
    }
    if (licenseStatus === "expired") {
        return { text: t("sa_status_expired") || "Istekla licenca", cls: "badge-critical" };
    }
    if (licenseStatus === "trial") {
        const days = daysRemaining != null ? daysRemaining : "—";
        const text = (t("license_badge_trial_days") || "Probni: {days} dana").replace("{days}", String(days));
        return { text, cls: "badge-pending" };
    }
    return { text: pkg, cls: "badge-success" };
}

function _saCompanyRowHtml({
    name,
    companyKey,
    detailId,
    status,
    licenseStatus,
    packageLabel,
    daysRemaining,
    country,
    adminName,
    adminEmail,
    supportSessionActive,
    supportSessionEnabled,
    demoExtras,
    dispId
}) {
    const openId = detailId || companyKey;
    const license = _licenseStatusLabel(licenseStatus, status, { packageLabel, daysRemaining });
    const menuItems = [];
    if (supportSessionActive) {
        menuItems.push({ action: "superadminEndSupport", args: [companyKey], label: t("sa_support_end") || "End support", icon: "headset" });
    } else if (supportSessionEnabled) {
        menuItems.push({ action: "superadminStartSupport", args: [companyKey], label: t("sa_support_start") || "Support", icon: "headset" });
    }
    if (status === "suspended") {
        menuItems.push({ action: "superadminToggleStatus", args: [companyKey, "active"], label: t("btn_activate") || "Activate", icon: "play" });
    } else {
        menuItems.push({ action: "superadminToggleStatus", args: [companyKey, "suspended"], label: t("btn_suspend") || "Suspend", icon: "pause", danger: true });
    }
    if (demoExtras) {
        menuItems.push({ action: "superadminImpersonate", args: [dispId || openId], label: t("sa_inspect_dispatcher") || "Inspect", icon: "eye" });
        menuItems.push({ action: "superadminResetPin", args: [dispId || openId], label: t("sa_reset_disp_password") || "Reset", icon: "key" });
    }
    menuItems.push({
        action: "superadminDeleteCompany",
        args: [companyKey],
        label: t("sa_delete_company") || "Delete",
        icon: "trash-2",
        danger: true
    });
    const adminLine = adminName || adminEmail
        ? `<strong>${escapeHtml(adminName || "—")}</strong><small>${escapeHtml(adminEmail || "")}</small>`
        : `<span class="sa-admin-missing">${escapeHtml(t("sa_no_company_admins") || "—")}</span>`;
    return `<tr class="sa-company-row" data-company-id="${escapeHtml(companyKey)}">
        <td class="sa-col-name"><strong>${escapeHtml(name || companyKey)}</strong></td>
        <td class="sa-col-tenant"><code>${escapeHtml(companyKey)}</code>
            <button type="button" class="btn-secondary sa-company-id-copy" ${actionAttr("superadminCopyCompanyId", [companyKey])} aria-label="${escapeHtml(t("sa_copy_company_id") || "Copy")}">
                ${icon("copy")}
            </button>
        </td>
        <td class="sa-col-admin">${adminLine}</td>
        <td class="sa-col-country">${escapeHtml(country || "—")}</td>
        <td class="sa-col-status"><span class="badge ${license.cls}">${escapeHtml(license.text)}</span></td>
        <td class="sa-col-actions">
            <button type="button" class="btn-secondary sa-detail-btn" ${actionAttr("superadminOpenCompanyDetail", [openId])}>
                ${icon("panel-right-open")} <span>${escapeHtml(t("sa_detail_open") || "Manage account")}</span>
            </button>
            ${rowActionsMenuHtml(`sa-co-${companyKey}`, menuItems)}
        </td>
    </tr>`;
}

let _saCreateFlowInitialized = false;

function initSaCreateFlowHooks(mod) {
    if (!_saCreateFlowInitialized) {
        mod.initSaCreateCompanyFlow({
            refreshDashboard: () => renderSuperAdminDashboard(),
            openCompanyDetail: (companyId) => superadminOpenCompanyDetail(companyId),
            findDemoCompanyDispatcher: (companyId) => _findDemoCompanyDispatcher(companyId),
            renderCompanyAdminList: () => renderCompanyAdminList()
        });
        _saCreateFlowInitialized = true;
    }
    return mod;
}

/** Loader-failure toast ownership — never wipe flow-outcome or unrelated toasts. */
let _saCreateLoaderToastEl = null;

function dismissSaCreateLoaderFailureToast() {
    const el = _saCreateLoaderToastEl;
    _saCreateLoaderToastEl = null;
    if (el && typeof el.remove === "function" && el.isConnected) {
        el.remove();
    }
}

function showSaCreateLoaderFailureToast() {
    dismissSaCreateLoaderFailureToast();
    const el = showToast(t("sa_create_chunk_load_failed"), "error", 8000);
    if (el && el.nodeType === 1) {
        el.setAttribute("data-sa-create-loader-toast", "1");
        _saCreateLoaderToastEl = el;
    }
    return el;
}

/**
 * H1-A.1 wrapper: load failures vs execution failures are separate catch boundaries.
 * Rejected imports are cleared by sa-create-company-flow-loader (retry without reload).
 */
async function withSaCreateFlowModule(run) {
    let mod;
    try {
        mod = await loadSaCreateCompanyFlow();
        initSaCreateFlowHooks(mod);
        // Successful load clears any prior loader-failure toast from this surface.
        dismissSaCreateLoaderFailureToast();
        // Flow module owns Escape from this point — drop unloaded document guard.
        unbindSaCreateUnloadedEscapeGuard();
    } catch {
        showSaCreateLoaderFailureToast();
        return undefined;
    }
    try {
        return await run(mod);
    } catch (err) {
        console.error("sa-create-company-flow execution failed", err);
        // Execution errors are not load failures — do not use loader-toast ownership.
        showToast(t("error_generic"), "error", 8000);
        return undefined;
    }
}

/** Document-level Escape while create-flow chunk is not loaded (focus may stay outside modal). */
let _saCreateUnloadedEscapeGuard = null;

function unbindSaCreateUnloadedEscapeGuard() {
    if (!_saCreateUnloadedEscapeGuard) return;
    document.removeEventListener("keydown", _saCreateUnloadedEscapeGuard, true);
    _saCreateUnloadedEscapeGuard = null;
}

function bindSaCreateUnloadedEscapeGuard() {
    if (_saCreateUnloadedEscapeGuard) return;
    _saCreateUnloadedEscapeGuard = (event) => {
        if (event.key !== "Escape") return;
        const modal = document.getElementById("sa-create-company-modal");
        if (!modal || modal.classList.contains("hidden") || modal.hasAttribute("hidden")) return;
        // Once payload is loaded, flow module owns Escape / leave-confirm.
        if (getSaCreateFlowIfLoaded()) return;
        event.preventDefault();
        event.stopPropagation();
        dismissSaCreateModalShellLocal();
    };
    document.addEventListener("keydown", _saCreateUnloadedEscapeGuard, true);
}

function focusSaCreateModalShellSync() {
    const modal = document.getElementById("sa-create-company-modal");
    if (!modal) return;
    let target = null;
    try {
        target = document.getElementById("sa-new-name")
            || modal.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    } catch {
        // Never let focus helpers break Open / Escape ownership.
        return;
    }
    if (!target || typeof target.focus !== "function") return;
    try {
        target.focus({ preventScroll: true });
    } catch {
        try { target.focus(); } catch { /* ignore */ }
    }
}

function dismissSaCreateModalShellLocal() {
    unbindSaCreateUnloadedEscapeGuard();
    const modal = document.getElementById("sa-create-company-modal");
    const pwd = document.getElementById("sa-ca-password");
    if (pwd) pwd.value = "";
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("hidden", "");
}

function superadminOpenCreateModal() {
    const modal = document.getElementById("sa-create-company-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.removeAttribute("hidden");
    // Focus inside the shell before lazy import so keyboard events are not stranded on
    // #sa-open-create-modal when the chunk fails. Document guard covers residual cases.
    focusSaCreateModalShellSync();
    if (!getSaCreateFlowIfLoaded()) {
        bindSaCreateUnloadedEscapeGuard();
    }
    void withSaCreateFlowModule((mod) => mod.superadminOpenCreateModal());
}

function superadminCloseCreateModal() {
    const loaded = getSaCreateFlowIfLoaded();
    if (loaded) {
        initSaCreateFlowHooks(loaded);
        loaded.superadminCloseCreateModal();
        return;
    }
    // No module loaded: Close must not start import/recovery or emit toasts.
    dismissSaCreateModalShellLocal();
}

async function superadminSubmitCreateModal(event) {
    if (event?.preventDefault) event.preventDefault();
    return withSaCreateFlowModule((mod) => mod.superadminSubmitCreateModal(event));
}

async function superadminCreateCompany() {
    return withSaCreateFlowModule((mod) => mod.superadminCreateCompany());
}

async function superadminCreateCompanyAdmin() {
    return withSaCreateFlowModule((mod) => mod.superadminCreateCompanyAdmin());
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

function _demoCompanyHasAdmin(companyRef) {
    const key = String(companyRef || "").trim();
    if (!key) return false;
    return (window.state.companyAdmins || []).some((ca) =>
        ca && ca.active !== false && (String(ca.companyId) === key || String(ca.id) === key)
    );
}

function _demoCompanyStatus(company) {
    if (!company) return "pending";
    if (company.active === false || company.status === "suspended") return "suspended";
    // Active once a CA exists for the firm, or the lead account finished first login.
    const companyKey = company.companyId || company.id;
    if (_demoCompanyHasAdmin(companyKey) || company.passwordChanged || company.status === "active") {
        return "active";
    }
    return "pending";
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
    if (!companies.length) {
        totalDrivers = (window.state.drivers || []).length;
    }
    const totalUsersEl = document.getElementById("superadmin-total-users");
    if (totalUsersEl) totalUsersEl.textContent = String(totalDrivers);
    const totalDispatchersEl = document.getElementById("superadmin-total-dispatchers");
    if (totalDispatchersEl) totalDispatchersEl.textContent = String(companies.length);

    if (!companies.length) {
        listContainer.innerHTML = `<tr><td colspan="6" class="sa-companies-empty">${escapeHtml(t("sa_companies_empty") || "No companies yet.")}</td></tr>`;
        refreshIcons();
        return;
    }

    const admins = window.state.companyAdmins || [];
    listContainer.innerHTML = companies.map((c) => {
        const status = _demoCompanyStatus(c);
        const companyKey = c.companyId || c.id;
        const admin = admins.find((a) => a.companyId === companyKey) || null;
        return _saCompanyRowHtml({
            name: c.name || companyKey,
            companyKey,
            detailId: c.id,
            status,
            licenseStatus: status === "suspended" ? "suspended" : (status === "pending" || String(_demoCompanyPlan(c)).toLowerCase() === "trial" ? "trial" : "active"),
            packageLabel: String(_demoCompanyPlan(c) || "PRO").toUpperCase() === "TRIAL"
                ? "PRO"
                : String(_demoCompanyPlan(c) || "PRO").toUpperCase(),
            daysRemaining: c.trialDaysLeft ?? 30,
            country: c.country,
            adminName: admin?.name || "",
            adminEmail: admin?.email || c.email || "",
            supportSessionActive: !!c.supportSessionActive,
            supportSessionEnabled: c.features?.supportSession !== false,
            demoExtras: true,
            dispId: c.id
        });
    }).join("");
    refreshIcons();
}

async function superadminToggleStatus(companyId, status) {
    const label = status === "suspended" ? "suspendovati" : "aktivirati";
    showConfirm("Da li želite da " + label + " firmu " + companyId + "?", async () => {
        if (USE_LOCAL_STATE) {
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

/**
 * Legacy entry retained for registry compatibility.
 * Production: opens the real audited support-session modal (never toast-only).
 * Demo: Inspect (read-only) via impersonation — also available from the row menu.
 */
function superadminOpenCompany(companyId) {
    const id = String(companyId || _pendingDetailCompanyId || "").trim();
    if (!id) {
        showToast(tf("error_generic", "Company not found."), "error");
        return;
    }
    if (USE_LOCAL_STATE) {
        const disp = _findDemoCompanyDispatcher(id);
        if (disp?.id) {
            superadminImpersonate(disp.id);
            return;
        }
        showToast(
            tf("sa_open_demo_hint", "Demo: add a dispatcher for this firm, then use Inspect (read-only)."),
            "info"
        );
        return;
    }
    superadminStartSupport(id);
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
    const state = company.caProvisionState || null;
    const createEligible = company.caCreateEligible === true
        || (state === "missing_firestore_ca" && company.caSlotClaimed !== true);
    const slotOrphan = state === "missing_firestore_ca" && company.caSlotClaimed === true;

    if (!admins.length) {
        if (slotOrphan) {
            list.innerHTML = `<p class="sa-detail-empty sa-detail-ca-ops-error" data-sa-ca-slot-orphan="1">${escapeHtml(
                t("sa_detail_ca_slot_orphan") || "Company admin slot is claimed but no admin profile exists. Contact ops — create is blocked."
            )}</p>`;
            return;
        }
        if (createEligible && state === "missing_firestore_ca") {
            list.innerHTML = `
                <p class="sa-detail-empty">${escapeHtml(t("sa_detail_no_admins") || "No company admins yet.")}</p>
                <div class="sa-detail-admin-actions sa-detail-create-missing-wrap">
                    <button type="button" class="btn-primary" data-sa-create-missing-ca-cta="1"
                        ${actionAttr("superadminOpenCreateMissingAdmin", [company.id])}>
                        ${escapeHtml(t("sa_detail_create_company_admin") || "Create company admin")}
                    </button>
                </div>
                <div id="sa-detail-create-missing-host" class="sa-detail-create-missing-host hidden" hidden></div>
            `;
            return;
        }
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
                    ${btnSecondary(actionAttr("superadminResetCompanyAdminPassword", [company.id, admin.id]), `${escapeHtml(t("sa_detail_reset_password") || "Reset password")}`)}
                    ${btnSecondary(actionAttr("superadminSetCompanyAdminStatus", [company.id, admin.id, !active]), `${escapeHtml(active
                            ? (t("sa_detail_disable_admin") || "Disable")
                            : (t("sa_detail_enable_admin") || "Enable"))}`)}
                </div>
            </div>
        `;
    }).join("");
}

function clearCreateMissingAdminPasswordLocal() {
    const pwd = document.getElementById("sa-missing-ca-password");
    if (pwd) pwd.value = "";
}

function superadminOpenCreateMissingAdmin(companyId) {
    return withSaCreateFlowModule((mod) => mod.superadminOpenCreateMissingAdmin(companyId));
}

function superadminSubmitCreateMissingAdmin(event) {
    if (event?.preventDefault) event.preventDefault();
    return withSaCreateFlowModule((mod) => mod.superadminSubmitCreateMissingAdmin(event));
}

function superadminCancelCreateMissingAdmin() {
    const loaded = getSaCreateFlowIfLoaded();
    if (loaded) {
        initSaCreateFlowHooks(loaded);
        loaded.superadminCancelCreateMissingAdmin();
        return;
    }
    clearCreateMissingAdminPasswordLocal();
    const host = document.getElementById("sa-detail-create-missing-host");
    if (host) {
        host.innerHTML = "";
        host.classList.add("hidden");
        host.setAttribute("hidden", "");
    }
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
    const supportBtn = document.getElementById("sa-detail-support-btn");
    const copyBtn = document.getElementById("sa-detail-copy-id-btn");

    if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
    }
    if (resetBox) {
        resetBox.classList.add("hidden");
        resetBox.innerHTML = "";
    }
    if (title) {
        const accountLabel = t("sa_detail_title") || "Manage company account";
        title.textContent = company.name
            ? `${accountLabel}: ${company.name}`
            : accountLabel;
    }
    if (nameEl) nameEl.textContent = company.name || "—";
    if (idEl) idEl.textContent = company.id || "—";
    const licenseBadge = _licenseStatusLabel(
        company.licenseStatus || (String(company.plan || "").toLowerCase() === "trial" ? "trial" : "active"),
        company.status,
        {
            packageLabel: company.packageLabel || packageLimitsForType(company.licenseType || company.plan).label,
            daysRemaining: company.daysRemaining
        }
    );
    if (statusEl) {
        statusEl.textContent = licenseBadge.text;
        statusEl.className = `badge ${licenseBadge.cls}`;
    }
    if (planEl) {
        // Package name only as plain text — never a second conflicting status chip.
        const pkg = company.packageLabel
            || packageLimitsForType(company.licenseType || company.plan).label;
        planEl.textContent = String(pkg).toUpperCase();
        planEl.className = "sa-detail-plan-text";
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
    if (supportBtn) {
        const canStartSupport = !!company.supportSessionEnabled && !company.supportSessionActive;
        supportBtn.setAttribute("data-action-args", JSON.stringify([company.id]));
        supportBtn.classList.toggle("hidden", !canStartSupport);
        if (canStartSupport) supportBtn.removeAttribute("hidden");
        else supportBtn.setAttribute("hidden", "");
        const label = supportBtn.querySelector("[data-i18n='sa_support_start_audited']")
            || supportBtn.querySelector("span");
        if (label) label.textContent = t("sa_support_start_audited") || t("sa_support_start") || "Start audited support";
    }
    if (copyBtn) copyBtn.setAttribute("data-action-args", JSON.stringify([company.id]));
    renderCompanyDetailDispatcher(company);
    renderCompanyDetailAdmins(company);
    renderCompanyDetailSettingsForm(company);
}

function renderCompanyDetailDispatcher(company) {
    const host = document.getElementById("sa-detail-dispatcher");
    if (!host) return;
    const disp = company.demoDispatcher;
    if (!disp) {
        host.innerHTML = "";
        host.classList.add("hidden");
        return;
    }
    host.classList.remove("hidden");
    const groups = Array.isArray(disp.groups) ? disp.groups.join(", ") : "—";
    const emailVal = escapeHtml(disp.email || "");
    const countryVal = escapeHtml(disp.country && disp.country !== "—" ? disp.country : "");
    host.innerHTML = `
        <h4 class="sa-detail-subtitle">${escapeHtml(tf("sa_detail_dispatcher_title", "Dispatcher / firm contact"))}</h4>
        <div class="sa-detail-profile-form">
            <label>${escapeHtml(tf("email_label", "Email"))}
                <input id="sa-edit-disp-email" type="email" value="${emailVal}" autocomplete="off">
            </label>
            <label>${escapeHtml(tf("sa_col_country", "Country"))}
                <input id="sa-edit-disp-country" type="text" maxlength="8" value="${countryVal}" placeholder="AT / DE / RS" autocomplete="off">
            </label>
            <p class="sa-detail-settings-hint">${escapeHtml(tf("sa_detail_disp_groups", "Groups"))}: ${escapeHtml(groups || "—")}</p>
            <div class="sa-detail-admin-actions">
                ${btnPrimary(actionAttr("superadminSaveDemoCompanyProfile", [disp.id]), `${escapeHtml(tf("sa_detail_save_profile", "Save email & country"))}`)}
                ${btnSecondary(actionAttr("superadminResetPin", [disp.id]), `${escapeHtml(tf("sa_reset_disp_password", "Reset password"))}`)}
                ${btnSecondary(actionAttr("superadminImpersonate", [disp.id]), `${escapeHtml(tf("sa_inspect_dispatcher", "Inspect"))}`)}
            </div>
        </div>
    `;
}

function superadminSaveDemoCompanyProfile(dispId) {
    if (!USE_LOCAL_STATE) {
        showToast(tf("sa_detail_settings_demo", "Profile edit here is demo-only."), "info");
        return;
    }
    const disp = _findDemoCompanyDispatcher(dispId)
        || (window.state.dispatchers || []).find((d) => d && d.id === dispId);
    if (!disp) {
        showToast(tf("error_generic", "Company not found."), "error");
        return;
    }
    const email = String(document.getElementById("sa-edit-disp-email")?.value || "").trim().toLowerCase();
    const country = String(document.getElementById("sa-edit-disp-country")?.value || "").trim().toUpperCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast(tf("error_invalid_email", "Enter a valid email."), "error");
        return;
    }
    if (country && !/^[A-Z]{2}$/.test(country)) {
        showToast(tf("sa_country_iso_error", "Country must be a 2-letter code (e.g. AT)."), "error");
        return;
    }
    disp.email = email;
    disp.country = country || "";
    saveState();
    showToast(tf("sa_detail_profile_saved", "Email and country saved."), "success");
    superadminOpenCompanyDetail(disp.companyId || disp.id);
    renderSuperAdminDashboard();
}

function renderCompanyDetailSettingsForm(company) {
    const host = document.getElementById("sa-detail-settings");
    if (!host) return;
    const features = company.features || {};
    const trialValue = company.trialEndsAt ? String(company.trialEndsAt).slice(0, 10) : "";
    const current = String(company.licenseType || company.plan || "pro").toLowerCase();
    const resolved = current === "trial" || current === "standard" ? "pro" : current;
    const defaults = packageLimitsForType(resolved);
    const maxDrivers = Number.isFinite(Number(company.maxDrivers))
        ? Number(company.maxDrivers)
        : defaults.maxDrivers;
    const maxDispatchers = Number.isFinite(Number(company.maxDispatchers))
        ? Number(company.maxDispatchers)
        : defaults.maxDispatchers;
    host.innerHTML = `
        <h4 class="sa-detail-subtitle">${escapeHtml(t("sa_detail_settings_title") || "Plan, limits and flags")}</h4>
        <div class="sa-detail-settings-grid">
            <label>${escapeHtml(t("sa_col_plan") || "Plan")}
                <select id="sa-edit-plan" ${changeAttr("superadminOnPlanChange")}>
                    ${["starter", "pro", "fleet_master", "enterprise"].map((value) => {
                        const labels = {
                            starter: "STARTER (15/2)",
                            pro: "PRO (50/5)",
                            fleet_master: "FLEET MASTER (200/15)",
                            enterprise: "ENTERPRISE (∞)"
                        };
                        return `<option value="${value}"${resolved === value ? " selected" : ""}>${labels[value]}</option>`;
                    }).join("")}
                </select>
            </label>
            <label>${escapeHtml(t("sa_detail_max_drivers") || "Max drivers")}
                <input id="sa-edit-max-drivers" type="number" min="1" max="5000" value="${maxDrivers}">
            </label>
            <label>${escapeHtml(t("sa_detail_max_dispatchers") || "Max dispatchers")}
                <input id="sa-edit-max-dispatchers" type="number" min="1" max="500" value="${maxDispatchers}">
            </label>
            <label>${escapeHtml(t("sa_detail_trial") || "Trial ends")}
                <input id="sa-edit-trial-ends" type="date" value="${escapeHtml(trialValue)}">
            </label>
        </div>
        <div class="sa-detail-flags">
            <label class="sa-flag-item"><input type="checkbox" id="sa-flag-supportSession" ${features.supportSession ? "checked" : ""}> supportSession</label>
            <label class="sa-flag-item"><input type="checkbox" id="sa-flag-shiftConfirmationScheduler" ${features.shiftConfirmationScheduler ? "checked" : ""}> shiftConfirmationScheduler</label>
            <label class="sa-flag-item"><input type="checkbox" id="sa-flag-liveGps" ${features.liveGps ? "checked" : ""}> liveGps</label>
            <label class="sa-flag-item"><input type="checkbox" id="sa-flag-liveMap" ${features.liveMap !== false ? "checked" : ""}> liveMap</label>
        </div>
        <p class="sa-detail-settings-hint">${escapeHtml(t("sa_detail_settings_hint") || "liveGps stays off until O2 retention is decided. Changing flags is audited.")}</p>
        <div class="sa-detail-settings-actions">
            <button type="button" class="btn-primary" data-action="superadminSaveCompanySettings" data-action-args='${JSON.stringify([company.id])}'>
                ${escapeHtml(t("sa_detail_save_settings") || "Save settings")}
            </button>
        </div>
    `;
}

async function superadminSaveCompanySettings(companyId) {
    const id = String(companyId || _pendingDetailCompanyId || "").trim();
    if (!id || USE_LOCAL_STATE) {
        showToast(t("sa_detail_settings_demo") || "Settings patch is production-only.", "info");
        return;
    }
    const planValue = document.getElementById("sa-edit-plan")?.value || undefined;
    const payload = {
        plan: planValue,
        licenseType: planValue,
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
        toastApiError(result);
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
                        <i data-lucide="copy" class="bc-icon-sm"></i>
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
        <div id="sa-detail-dispatcher" class="hidden"></div>
        <h4 class="sa-detail-subtitle">${escapeHtml(t("sa_detail_admins_title") || "Company admins")}</h4>
        <div id="sa-detail-admins"></div>
        <div id="sa-detail-reset-link-box" class="sa-detail-reset-box hidden"></div>
    `;

    function showDetailModal() {
        modal.classList.remove("hidden");
        modal.style.display = "flex";
        modal.setAttribute("aria-hidden", "false");
    }

    if (USE_LOCAL_STATE) {
        const disp = _findDemoCompanyDispatcher(id);
        const companyKey = disp?.companyId || disp?.id || id;
        const groupIds = Array.isArray(disp?.groups) ? disp.groups.map(String) : [];
        const drivers = (window.state.drivers || []).filter((d) =>
            groupIds.includes(String(d.groupId)) || String(d.companyId || "") === String(companyKey)
        );
        const admins = (window.state.companyAdmins || [])
            .filter((ca) => ca.companyId === companyKey || ca.companyId === id)
            .map((ca) => ({
                id: ca.id,
                name: ca.name || ca.email || ca.id,
                email: ca.email || "",
                active: ca.active !== false
            }));
        const demoPlan = disp ? _demoCompanyPlan(disp) : "trial";
        const demoLicenseType = String(demoPlan).toLowerCase() === "trial" ? "pro" : String(demoPlan).toLowerCase();
        fillCompanyDetailModal({
            id: companyKey,
            name: disp?.name || companyKey,
            status: disp ? _demoCompanyStatus(disp) : "active",
            plan: demoLicenseType,
            licenseType: demoLicenseType,
            licenseStatus: String(demoPlan).toLowerCase() === "trial" ? "trial" : "active",
            packageLabel: packageLimitsForType(demoLicenseType).label,
            daysRemaining: disp?.trialDaysLeft ?? 30,
            country: disp?.country || "—",
            contactEmail: disp?.email || null,
            trialEndsAt: disp?.trialEndsAt || null,
            maxDrivers: disp?.maxDrivers || packageLimitsForType(demoLicenseType).maxDrivers,
            maxDispatchers: disp?.maxDispatchers || packageLimitsForType(demoLicenseType).maxDispatchers,
            features: disp?.features || {},
            supportSessionEnabled: disp?.features?.supportSession !== false,
            supportSessionActive: !!disp?.supportSessionActive,
            counts: {
                companyAdmins: admins.length,
                dispatchers: disp ? 1 : 0,
                drivers: drivers.length,
                groups: groupIds.length
            },
            admins,
            demoDispatcher: disp
                ? {
                    id: disp.id,
                    name: disp.name || disp.email || disp.id,
                    email: disp.email || "",
                    groups: groupIds,
                    active: disp.active !== false
                }
                : null
        });
        showDetailModal();
        refreshIcons();
        return;
    }

    const res = await ApiClient.getCompanyDetail(id);
    if (!res.success || !res.company) {
        // Network/API failure → unknown: no Create CTA.
        fillCompanyDetailModal({
            id,
            name: id,
            admins: [],
            counts: {},
            caProvisionState: null,
            caCreateEligible: false,
            caSlotClaimed: false,
            _detailUnknown: true
        });
        // Set error after fill — fillCompanyDetailModal clears the banner by design.
        if (errorEl) {
            errorEl.textContent = res.error || t("error_generic");
            errorEl.classList.remove("hidden");
        }
        showDetailModal();
        return;
    }
    fillCompanyDetailModal(res.company);
    showDetailModal();
    refreshIcons();
}

function superadminCloseCompanyDetail() {
    _pendingDetailCompanyId = null;
    clearCreateMissingAdminPasswordLocal();
    const loaded = getSaCreateFlowIfLoaded();
    if (loaded?.superadminCancelCreateMissingAdmin) {
        try { loaded.superadminCancelCreateMissingAdmin(); } catch { /* ignore */ }
    }
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
        if (USE_LOCAL_STATE) {
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
            toastApiError(res);
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
        if (USE_LOCAL_STATE) {
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
                    ${btnSecondary(actionAttr("superadminCopyText", [tempPass]), `${escapeHtml(t("sa_detail_copy_reset_link") || "Copy password")}`)}
                `;
            }
            showToast(t("sa_detail_reset_done") || "Password reset link ready.", "success");
            refreshIcons();
            return;
        }
        const res = await ApiClient.resetCompanyAdminPassword(companyId, uid);
        if (!res.success) {
            toastApiError(res);
            return;
        }
        const box = document.getElementById("sa-detail-reset-link-box");
        if (box && res.resetLink) {
            box.classList.remove("hidden");
            box.innerHTML = `
                <p>${escapeHtml(t("sa_detail_reset_ready", { email: res.email }) || `Reset link for ${res.email}:`)}</p>
                <code class="sa-detail-reset-link">${escapeHtml(res.resetLink)}</code>
                ${btnSecondary(actionAttr("superadminCopyText", [res.resetLink]), `${escapeHtml(t("sa_detail_copy_reset_link") || "Copy reset link")}`)}
            `;
        }
        showToast(t("sa_detail_reset_done") || "Password reset link ready.", "success");
        refreshIcons();
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


function renderCompanyAdminList() {
    const container = document.getElementById('sa-ca-list');
    if (!container) return;
    const list = window.state.companyAdmins || [];
    if (list.length === 0) {
        container.innerHTML = `<p class="bc-empty-note">${t("sa_no_company_admins")}</p>`;
        return;
    }
    container.innerHTML = list.map(ca => `
        <div class="bc-list-row is-split is-plain">
            <div>
                <span class="bc-list-title">${escapeHtml(ca.name)}</span>
                <span class="bc-list-meta">${escapeHtml(ca.email)}</span>
                <span class="bc-list-meta is-accent">firma: ${escapeHtml(ca.companyId)}</span>
            </div>
            ${USE_LOCAL_STATE ? `<button ${actionAttr("superadminDeleteCompanyAdmin", [ca.id])} class="bc-mini-btn is-danger is-solid" title="Demo only">
                <i data-lucide="trash-2" class="bc-icon-xs"></i>
            </button>` : ""}
        </div>
    `).join('');
    refreshIcons();
}

function superadminDeleteCompanyAdmin(id) {
    if (!USE_LOCAL_STATE) {
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
    if (!USE_LOCAL_STATE) {
        showToast(t("sa_impersonate_demo_only") || "Stealth inspect is demo-only. Use a support session in production.", "error");
        return;
    }
    const disp = _findDemoCompanyDispatcher(dispId)
        || (window.state.dispatchers || []).find((d) => d && d.id === dispId);
    if (!disp || disp.isSuperAdmin || disp.id === "superadmin") return;

    // Close SA overlays first — otherwise the detail modal stays on top and blocks Dispo.
    superadminCloseCompanyDetail();
    const supportModal = document.getElementById("sa-support-modal");
    if (supportModal) {
        supportModal.classList.add("hidden");
        supportModal.style.display = "none";
    }
    document.getElementById("global-confirm-modal")?.classList.add("hidden");

    const groups = Array.isArray(disp.groups) ? disp.groups.map(String) : [];
    window.currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        email: disp.email || null,
        companyId: disp.companyId || null,
        groups,
        activeGroupId: disp.activeGroupId || groups[0] || null,
        impersonated: true,
        readOnly: true
    };

    persistUserSession(window.currentUser);
    showAppLayout();
    showToast(
        t("sa_stealth_inspect_toast", { name: disp.name })
        || `Stealth Inspect: ${disp.name} (read-only). Use Exit inspect to return.`,
        "info",
        7000
    );
}

function superadminResetPin(dispId) {
    // Demo staff accounts use email+password (not driver PIN). Reset to known demo password
    // and keep passwordChanged=true so login still works without force-setup deadlock.
    const disp = _findDemoCompanyDispatcher(dispId)
        || (window.state.dispatchers || []).find((d) => d && d.id === dispId);
    if (!disp || disp.isSuperAdmin || disp.id === "superadmin") return;

    const localPass = ["Local", "Qa-", "9"].join("");
    disp.password = localPass;
    disp.passwordChanged = true;
    disp.active = true;
    saveState();
    renderSuperAdminDashboard();
    showToast(
        t("sa_disp_password_reset", { name: disp.name, password: localPass })
        || `Password reset for ${disp.name}: ${localPass}`,
        "success",
        8000
    );
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
    if (USE_LOCAL_STATE) {
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
        toastApiError(res);
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
    if (USE_LOCAL_STATE) {
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
        toastApiError(res);
        return;
    }
    superadminCancelSupportModal();
    showToast(t("sa_support_started"), "success");
    await renderSuperAdminDashboard();
}

async function superadminEndSupport(companyId) {
    if (USE_LOCAL_STATE) {
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
            toastApiError(res);
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
    superadminOpenCreateMissingAdmin,
    superadminSubmitCreateMissingAdmin,
    superadminCancelCreateMissingAdmin,
    superadminSetCompanyAdminStatus,
    superadminResetCompanyAdminPassword,
    superadminCopyText,
    superadminFocusCompanies,
    superadminCopyCompanyId,
    superadminOpenCreateModal,
    superadminCloseCreateModal,
    superadminSubmitCreateModal,
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
    superadminSaveCompanySettings,
    superadminOnPlanChange,
    superadminSaveDemoCompanyProfile
};

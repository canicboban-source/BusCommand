// BusCommand ESM v9.5 — Company Admin: pregled firme, licence, grupe
import { escapeHtml, showToast, refreshIcons, toastApiError } from "../core/utils.js";
import { checkCompanyLicense } from "../core/license.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { companyNeedsBrandingSetup, renderCompanyAdminBranding } from "./company-admin-branding.js";
import {
    calculateGroupStats,
    getCompanyLicenseInfo,
    getCompanyScope,
    itemBelongsToCompany
} from "./company-admin-overview-model.js";
import ApiClient from "../core/api-client.js";
import { openGroupHub } from "../dispatcher/group-hub.js";
import { getFormedLineGroupIds } from "../data/groups.js";
import { canViewOperationalRoster } from "../core/ui-permissions.js";
import { icon, tx, btnSecondary, btnPrimary } from "../ui/markup.js";

let _supportSessionCache = null;

async function refreshSupportSessionBadge() {
    if (USE_LOCAL_STATE) {
        _supportSessionCache = null;
        return;
    }
    try {
        const res = await ApiClient.getCompanySupportSession();
        _supportSessionCache = res.success ? res.session : null;
    } catch {
        _supportSessionCache = null;
    }
}

async function endCompanySupportSession() {
    const res = await ApiClient.endCompanySupportSession();
    if (!res.success) {
        toastApiError(res);
        return;
    }
    _supportSessionCache = null;
    showToast(t("ca_support_ended"), "success");
    renderCompanyAdminDashboard();
}

function licensePackageLabel(license) {
    if (license?.packageLabel) return String(license.packageLabel).toUpperCase();
    const type = String(license?.plan || "").toLowerCase();
    if (type === "starter") return "STARTER";
    if (type === "fleet_master") return "FLEET MASTER";
    if (type === "enterprise") return "ENTERPRISE";
    if (type === "pro" || type === "active" || type === "paid") return "PRO";
    if (type === "unknown" || !type) return t("ca_license_unknown");
    return String(license.plan || "").toUpperCase();
}

/** Unique status: trial+days (warning) OR package name (success). */
function licenseUniqueBadge(license) {
    const status = license.licenseStatus || license.status;
    if (status === "suspended") {
        return { text: t("license_status_suspended"), tone: "is-danger" };
    }
    if (status === "expired") {
        return { text: t("sa_status_expired") || "Istekla licenca", tone: "is-danger" };
    }
    if (status === "trial") {
        const days = license.daysRemaining != null ? license.daysRemaining : "—";
        return {
            text: (t("license_badge_trial_days") || "Probni: {days} dana").replace("{days}", String(days)),
            tone: "is-warning"
        };
    }
    if (status === "unknown") {
        return { text: t("ca_license_unknown"), tone: "is-neutral" };
    }
    return { text: licensePackageLabel(license), tone: "is-success" };
}

function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#3d7ef5";
}

function renderLicenseCard(scope, license, { loading = false, failed = false } = {}) {
    const el = document.getElementById("ca-firm-license-card");
    if (!el) return;

    const branding = window.state.branding || {};
    const companyName = branding.name?.trim() || t("ca_firm_unnamed");
    const admin = window.currentUser;
    const unique = licenseUniqueBadge(license);
    const stateMessage = loading
        ? `<div class="company-overview-license-state"><span class="spinner"></span>${tx("ca_license_loading")}</div>`
        : failed
            ? `<div class="company-overview-license-state is-error">${icon("cloud-off")}<span>${tx("ca_license_failed")}</span><button type="button" class="btn-link" ${actionAttr("switchSection", ["company-admin-dashboard"])}>${tx("btn_retry")}</button></div>`
            : "";

    const support = _supportSessionCache;
    const supportBanner = support?.status === "active"
        ? `<div class="company-overview-support-banner" role="status">
                <strong>${tx("ca_support_active")}</strong>
                <div class="bc-list-sub">
                    ${tx("ca_support_until", { until: support.expiresAt ? new Date(support.expiresAt).toLocaleString() : "—" })}
                    · ${escapeHtml(support.category || "")}
                </div>
                <p>${escapeHtml(support.reason || "")}</p>
                ${btnSecondary(actionAttr("endCompanySupportSession"), `${tx("ca_support_end")}`)}
           </div>`
        : "";

    el.innerHTML = `
        <div class="company-overview-license-main" aria-live="polite">
            <div class="company-overview-license-identity">
                <span class="company-overview-kicker">${tx("ca_firm_license_title")}</span>
                <strong>${escapeHtml(companyName)}</strong>
                <span>${tx("ca_firm_id")}: <b>${escapeHtml(scope.companyId || "—")}</b></span>
                <span>${tx("ca_firm_admin")}: ${escapeHtml(admin.email || admin.name || "—")}</span>
            </div>
            <div class="company-overview-license-metrics">
                <div>
                    <span>${tx("ca_firm_status")}</span>
                    <strong class="${unique.tone}">${escapeHtml(unique.text)}</strong>
                </div>
            </div>
        </div>
        ${supportBanner}
        ${stateMessage}
        <div class="company-overview-license-actions">
            ${btnSecondary(actionAttr("switchSection", ["company-admin-branding"]), `${icon("palette")} ${tx("ca_manage_branding")}`)}
            ${btnSecondary(actionAttr("switchSection", ["company-admin-groups"]), `${icon("layers")} ${tx("ca_manage_groups")}`)}
            ${btnSecondary(actionAttr("switchSection", ["company-admin-team"]), `${icon("users")} ${tx("ca_manage_team")}`)}
            ${btnSecondary(actionAttr("switchSection", ["company-admin-drivers"]), `${icon("contact-round")} ${tx("ca_nav_drivers")}`)}
        </div>`;
}

function renderGroupsTable(scope) {
    const el = document.getElementById("ca-groups-table-wrap");
    if (!el) return;

    if (scope.groups.length === 0) {
        el.innerHTML = `
            <div class="company-overview-empty">
                ${icon("layers-3")}
                <strong>${tx("ca_no_groups_overview")}</strong>
                ${btnPrimary(actionAttr("switchSection", ["company-admin-groups"]), `${icon("plus")} ${tx("btn_add_group")}`)}
            </div>`;
        return;
    }

    const rows = scope.groups.map(g => {
        const st = calculateGroupStats(g, scope);
        const missingText = st.missing.map(key => t(`ca_missing_${key}`)).join(", ");
        const statusBadge = st.ready
            ? `<span class="company-overview-status is-ready">${icon("circle-check")}${tx("ca_status_ready")}</span>`
            : `<span class="company-overview-status is-incomplete" title="${tx("ca_missing_title", { items: missingText })}">${icon("circle-alert")}${tx("ca_status_incomplete")}</span>`;

        return `<tr>
            <td data-label="${tx("ca_col_line")}">
                <span class="company-overview-line">
                    <span style="--line-color:${safeColor(g.color)}"></span>
                    <strong>${escapeHtml(String(g.id))}</strong>
                </span>
            </td>
            <td data-label="${tx("ca_col_name")}"><strong>${escapeHtml(g.name || "—")}</strong></td>
            <td data-label="${tx("ca_col_drivers")}">${st.driverCount}</td>
            <td data-label="${tx("ca_col_buses")}">${st.busCount}</td>
            <td data-label="${tx("ca_col_plans")}">${st.planCount}</td>
            <td data-label="${tx("ca_col_dispatchers")}">${st.dispatcherCount}</td>
            <td data-label="${tx("ca_col_status")}">${statusBadge}</td>
        </tr>`;
    }).join("");

    el.innerHTML = `
        <div class="company-overview-table-wrap">
            <table class="company-overview-table">
                <thead>
                    <tr>
                        <th scope="col">${tx("ca_col_line")}</th>
                        <th scope="col">${tx("ca_col_name")}</th>
                        <th scope="col">${tx("ca_col_drivers")}</th>
                        <th scope="col">${tx("ca_col_buses")}</th>
                        <th scope="col">${tx("ca_col_plans")}</th>
                        <th scope="col">${tx("ca_col_dispatchers")}</th>
                        <th scope="col">${tx("ca_col_status")}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function renderSetupChecklist(scope) {
    const el = document.getElementById("ca-setup-checklist");
    if (!el) return;

    const allGroupsHaveActivePlan = scope.groups.length > 0 && scope.groups.every(group =>
        scope.servicePlans.some(plan => String(plan.groupId) === String(group.id) && plan.status === "active")
    );
    const checks = [
        { ok: !companyNeedsBrandingSetup(), label: t("ca_setup_branding"), section: "company-admin-branding" },
        { ok: scope.groups.length > 0, label: t("ca_setup_groups"), section: "company-admin-groups" },
        { ok: scope.dispatchers.length > 0, label: t("ca_setup_dispatcher"), section: "company-admin-team" },
        { ok: scope.drivers.length > 0, label: t("ca_setup_drivers"), section: "company-admin-drivers" },
        { ok: allGroupsHaveActivePlan, label: t("ca_setup_plans"), section: "company-admin-service-plan" }
    ];

    el.innerHTML = checks.map(c => `
        <button type="button" class="company-overview-check ${c.ok ? "is-complete" : ""}" ${actionAttr("switchSection", [c.section])}>
            <span>
                <i data-lucide="${c.ok ? "check" : "circle"}" class="bc-icon-xs"></i>
            </span>
            <strong>${escapeHtml(c.label)}</strong>
            <i data-lucide="chevron-right" class="company-overview-check-arrow"></i>
        </button>`).join("");
}

function renderDispatchersSummary(scope) {
    const el = document.getElementById("ca-dispatchers-summary");
    if (!el) return;

    if (scope.dispatchers.length === 0) {
        el.innerHTML = `<div class="company-overview-empty is-compact">${icon("users")}<strong>${tx("ca_no_dispatchers_short")}</strong>${btnSecondary(actionAttr("switchSection", ["company-admin-team"]), `${tx("ca_manage_team")}`)}</div>`;
        return;
    }

    el.innerHTML = scope.dispatchers.map(d => {
        const grpNames = (d.groups || []).map(gId => {
            const grp = scope.groups.find(g => g.id === gId);
            return escapeHtml(grp ? grp.name : String(gId));
        }).join(", ") || "—";
        return `<div class="company-overview-dispatcher">
            <div>
                <span class="company-overview-avatar">${escapeHtml(String(d.name || "?").split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase())}</span>
                <span><strong>${escapeHtml(d.name || "—")}</strong><small>${escapeHtml(d.email || "—")}</small></span>
            </div>
            <span class="company-overview-groups">${grpNames}</span>
        </div>`;
    }).join("");
}

async function renderCompanyAdminDashboard() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return;

    await refreshSupportSessionBadge();

    const scope = getCompanyScope(window.state, window.currentUser, USE_LOCAL_STATE);
    const license = getCompanyLicenseInfo(scope.companyId, {
        licenseInfo: window._licenseInfo,
        state: window.state,
        isDemoMode: USE_LOCAL_STATE
    });

    const activePlanCount = new Set(
        scope.servicePlans.filter(plan => plan.status === "active").map(plan => String(plan.groupId))
    ).size;

    const el = id => document.getElementById(id);
    if (el("ca-stat-drivers")) el("ca-stat-drivers").textContent = scope.drivers.length;
    if (el("ca-stat-groups")) el("ca-stat-groups").textContent = scope.groups.length;
    if (el("ca-stat-dispatchers")) el("ca-stat-dispatchers").textContent = scope.dispatchers.length;
    if (el("ca-stat-buses")) el("ca-stat-buses").textContent = scope.buses.length;
    if (el("ca-stat-plans")) el("ca-stat-plans").textContent = activePlanCount;

    renderLicenseCard(scope, license, { loading: !license.available });
    renderGroupsTable(scope);
    renderDispatchersSummary(scope);
    renderSetupChecklist(scope);

    if (scope.companyId) {
        checkCompanyLicense(scope.companyId).then(result => {
            renderLicenseCard(scope, getCompanyLicenseInfo(scope.companyId, {
                licenseInfo: window._licenseInfo,
                state: window.state,
                isDemoMode: USE_LOCAL_STATE
            }), { failed: !result });
            refreshIcons();
        });
    }

    refreshIcons();
}

function openCompanyOpsOverview() {
    if (!canViewOperationalRoster(window.currentUser?.role)) {
        showToast(t("error_access_denied"), "error");
        return;
    }
    const formed = getFormedLineGroupIds();
    const groups = (window.state.groups || []).filter((g) => !formed.length || formed.includes(g.id));
    const first = groups[0];
    if (!first) {
        showToast(t("hub_no_groups") || "No groups created.", "error");
        return;
    }
    openGroupHub(first.id);
    showToast(t("ops_readonly_banner") || "Read-only operational view.", "info");
}

export {
    renderCompanyAdminDashboard,
    renderCompanyAdminBranding,
    companyNeedsBrandingSetup,
    getCompanyScope,
    getCompanyLicenseInfo,
    openCompanyOpsOverview,
    calculateGroupStats,
    itemBelongsToCompany,
    endCompanySupportSession
};

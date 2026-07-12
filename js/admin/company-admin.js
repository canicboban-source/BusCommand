// BusCommand ESM v9.5 — Company Admin: pregled firme, licence, grupe
import { escapeHtml } from "../core/utils.js";
import { countBusesForLineGroup, countPlansForLineGroup, getDriversForLineGroup } from "../data/group-membership.js";
import { isFormedLineGroup } from "../data/groups.js";
import { checkCompanyLicense } from "../core/license.js";
import { applyBrandingToUI, t } from "../ui/i18n.js";
import { actionAttr, changeAttr as _changeAttr } from "../core/action-delegate.js";

function companyNeedsBrandingSetup() {
    const name = window.state.branding?.name;
    return !name || !String(name).trim();
}

function getCompanyScope() {
    const companyId = window.currentUser?.companyId || null;
    const matchCo = item => !companyId || !item?.companyId || item.companyId === companyId;

    return {
        companyId,
        drivers: (window.state.drivers || []).filter(matchCo),
        groups: (window.state.groups || []).filter(matchCo),
        dispatchers: (window.state.dispatchers || []).filter(
            d => d.id !== "superadmin" && !d.isSuperAdmin && matchCo(d)
        )
    };
}

function getCompanyLicenseInfo(companyId) {
    const lic = window._licenseInfo;
    if (lic) {
        return {
            plan: lic.plan || "trial",
            status: lic.status || "active",
            daysRemaining: lic.daysRemaining ?? null
        };
    }
    const disp = (window.state.dispatchers || []).find(
        d => d.companyId === companyId && d.id !== "superadmin" && !d.isSuperAdmin
    );
    const planRaw = disp?.paymentStatus || "Trial";
    return {
        plan: String(planRaw).toLowerCase(),
        status: "active",
        daysRemaining: disp?.trialDaysLeft ?? 30
    };
}

function licensePlanLabel(plan) {
    const key = plan === "trial" ? "license_plan_trial" : plan === "active" ? "license_plan_active" : "license_plan_paid";
    return t(key);
}

function licenseStatusLabel(status) {
    if (status === "suspended") return t("license_status_suspended");
    if (status === "trial") return t("license_status_trial");
    return t("license_status_active");
}

function groupStats(g, allDrivers, allDispatchers) {
    const isLine = isFormedLineGroup(g.id) || /^\d+$/.test(String(g.id));
    const scopeIds = new Set(allDrivers.map(d => d.id));
    const driverCount = isLine
        ? getDriversForLineGroup(g.id).filter(d => scopeIds.has(d.id)).length
        : allDrivers.filter(d => d.groupId === g.id).length;
    const busCount = isLine ? countBusesForLineGroup(g.id) : 0;
    const planCount = isLine ? countPlansForLineGroup(g.id) : 0;
    const dispCount = allDispatchers.filter(d => (d.groups || []).includes(g.id)).length;
    const ready = driverCount > 0 && (planCount > 0 || busCount > 0);
    return { isLine, driverCount, busCount, planCount, dispCount, ready };
}

function renderCompanyAdminBranding() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return;
    applyBrandingToUI();
    const hint = document.getElementById("ca-branding-first-run");
    if (hint) hint.style.display = companyNeedsBrandingSetup() ? "block" : "none";
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderLicenseCard(scope, license) {
    const el = document.getElementById("ca-firm-license-card");
    if (!el) return;

    const branding = window.state.branding || {};
    const companyName = branding.name?.trim() || t("ca_firm_unnamed");
    const admin = window.currentUser;
    const daysText = license.daysRemaining != null
        ? t("ca_firm_days_left", { days: license.daysRemaining })
        : "—";

    const statusColor = license.status === "suspended"
        ? "#ef4444"
        : license.plan === "trial"
            ? "#f59e0b"
            : "#22c55e";

    el.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:flex-start;">
            <div style="flex:1;min-width:200px;">
                <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:6px;">${t("ca_firm_license_title")}</div>
                <div style="font-size:1.35rem;font-weight:800;color:var(--text-main);margin-bottom:4px;">${escapeHtml(companyName)}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);">${t("ca_firm_id")}: <strong style="color:var(--text-main);">${escapeHtml(scope.companyId || "—")}</strong></div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">${t("ca_firm_admin")}: ${escapeHtml(admin.email || admin.name || "—")}</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:12px;">
                <div style="padding:12px 16px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid var(--panel-border);min-width:120px;">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">${t("ca_firm_plan")}</div>
                    <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(licensePlanLabel(license.plan))}</div>
                </div>
                <div style="padding:12px 16px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid var(--panel-border);min-width:120px;">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">${t("ca_firm_status")}</div>
                    <div style="font-weight:700;font-size:0.95rem;color:${statusColor};">${escapeHtml(licenseStatusLabel(license.status))}</div>
                </div>
                <div style="padding:12px 16px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid var(--panel-border);min-width:120px;">
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px;">${t("ca_firm_trial_days")}</div>
                    <div style="font-weight:700;font-size:0.95rem;">${escapeHtml(daysText)}</div>
                </div>
            </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px;padding-top:16px;border-top:1px solid var(--panel-border);">
            <button type="button" class="btn-secondary" style="height:34px;font-size:0.78rem;" ${actionAttr("switchSection", ["company-admin-branding"])}>
                <i data-lucide="palette" style="width:14px;height:14px;"></i> ${t("ca_manage_branding")}
            </button>
            <button type="button" class="btn-secondary" style="height:34px;font-size:0.78rem;" ${actionAttr("switchSection", ["company-admin-groups"])}>
                <i data-lucide="layers" style="width:14px;height:14px;"></i> ${t("ca_manage_groups")}
            </button>
            <button type="button" class="btn-secondary" style="height:34px;font-size:0.78rem;" ${actionAttr("switchSection", ["company-admin-team"])}>
                <i data-lucide="users" style="width:14px;height:14px;"></i> ${t("ca_manage_team")}
            </button>
        </div>`;
}

function renderGroupsTable(scope) {
    const el = document.getElementById("ca-groups-table-wrap");
    if (!el) return;

    if (scope.groups.length === 0) {
        el.innerHTML = `
            <p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:28px 0;">${t("ca_no_groups_overview")}</p>
            <div style="text-align:center;">
                <button type="button" class="btn-primary" ${actionAttr("switchSection", ["company-admin-groups"])}>
                    <i data-lucide="plus"></i> ${t("btn_add_group")}
                </button>
            </div>`;
        return;
    }

    const rows = scope.groups.map(g => {
        const st = groupStats(g, scope.drivers, scope.dispatchers);
        const statusBadge = st.ready
            ? `<span style="font-size:0.72rem;padding:3px 8px;border-radius:12px;font-weight:700;background:rgba(16,185,129,0.15);color:#10b981;">${t("ca_status_ready")}</span>`
            : `<span style="font-size:0.72rem;padding:3px 8px;border-radius:12px;font-weight:700;background:rgba(245,158,11,0.15);color:#f59e0b;">${t("ca_status_incomplete")}</span>`;

        return `<tr style="border-bottom:1px solid var(--panel-border);">
            <td style="padding:10px 8px;">
                <span style="display:inline-flex;align-items:center;gap:8px;">
                    <span style="width:10px;height:10px;border-radius:50%;background:${g.color || "var(--primary-color)"};flex-shrink:0;"></span>
                    <strong>${escapeHtml(String(g.id))}</strong>
                </span>
            </td>
            <td style="padding:10px 8px;font-weight:600;">${escapeHtml(g.name)}</td>
            <td style="padding:10px 8px;text-align:center;">${st.driverCount}</td>
            <td style="padding:10px 8px;text-align:center;">${st.busCount}</td>
            <td style="padding:10px 8px;text-align:center;">${st.planCount}</td>
            <td style="padding:10px 8px;text-align:center;">${st.dispCount}</td>
            <td style="padding:10px 8px;text-align:center;">${statusBadge}</td>
        </tr>`;
    }).join("");

    el.innerHTML = `
        <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead>
                    <tr style="background:rgba(255,255,255,0.04);text-align:left;">
                        <th style="padding:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;">${t("ca_col_line")}</th>
                        <th style="padding:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;">${t("ca_col_name")}</th>
                        <th style="padding:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">${t("ca_col_drivers")}</th>
                        <th style="padding:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">${t("ca_col_buses")}</th>
                        <th style="padding:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">${t("ca_col_plans")}</th>
                        <th style="padding:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">${t("ca_col_dispatchers")}</th>
                        <th style="padding:8px;font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">${t("ca_col_status")}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function renderSetupChecklist(scope) {
    const el = document.getElementById("ca-setup-checklist");
    if (!el) return;

    const checks = [
        { ok: !companyNeedsBrandingSetup(), label: t("ca_setup_branding"), section: "company-admin-branding" },
        { ok: scope.groups.length > 0, label: t("ca_setup_groups"), section: "company-admin-groups" },
        { ok: scope.dispatchers.length > 0, label: t("ca_setup_dispatcher"), section: "company-admin-team" },
        { ok: scope.drivers.length > 0, label: t("ca_setup_drivers"), section: "company-admin-groups" }
    ];

    el.innerHTML = checks.map(c => `
        <button type="button" ${actionAttr("switchSection", [c.section])} style="
            display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:10px 12px;
            background:rgba(255,255,255,0.02);border:1px solid var(--panel-border);border-radius:10px;
            cursor:pointer;margin-bottom:8px;font-family:inherit;">
            <span style="width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
                background:${c.ok ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)"};color:${c.ok ? "#10b981" : "var(--text-muted)"};">
                <i data-lucide="${c.ok ? "check" : "circle"}" style="width:12px;height:12px;"></i>
            </span>
            <span style="font-size:0.85rem;color:var(--text-main);">${escapeHtml(c.label)}</span>
        </button>`).join("");
}

function renderDispatchersSummary(scope) {
    const el = document.getElementById("ca-dispatchers-summary");
    if (!el) return;

    if (scope.dispatchers.length === 0) {
        el.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">${t("ca_no_dispatchers_short")}</p>`;
        return;
    }

    el.innerHTML = scope.dispatchers.map(d => {
        const grpNames = (d.groups || []).map(gId => {
            const grp = scope.groups.find(g => g.id === gId);
            return grp ? escapeHtml(grp.name) : gId;
        }).join(", ") || "—";
        const trial = d.trialDaysLeft != null ? ` · ${t("ca_firm_trial_days", { days: d.trialDaysLeft })}` : "";
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);margin-bottom:8px;">
            <div>
                <span style="font-weight:600;color:var(--text-main);">${escapeHtml(d.name)}</span>
                <span style="display:block;font-size:0.75rem;color:var(--text-muted);">${escapeHtml(d.email || "")}${trial}</span>
            </div>
            <span style="font-size:0.75rem;color:var(--text-muted);max-width:45%;text-align:right;">${grpNames}</span>
        </div>`;
    }).join("");
}

function renderCompanyAdminDashboard() {
    if (!window.currentUser || window.currentUser.role !== "company-admin") return;

    const scope = getCompanyScope();
    const license = getCompanyLicenseInfo(scope.companyId);

    if (scope.companyId) {
        checkCompanyLicense(scope.companyId).then(() => {
            renderLicenseCard(scope, getCompanyLicenseInfo(scope.companyId));
        });
    }

    const onlineDrivers = scope.drivers.filter(d => d.status === "online").length;
    const totalBuses = new Set(scope.drivers.map(d => d.bus).filter(Boolean)).size;

    const el = id => document.getElementById(id);
    if (el("ca-stat-drivers")) el("ca-stat-drivers").textContent = scope.drivers.length;
    if (el("ca-stat-groups")) el("ca-stat-groups").textContent = scope.groups.length;
    if (el("ca-stat-dispatchers")) el("ca-stat-dispatchers").textContent = scope.dispatchers.length;
    if (el("ca-stat-buses")) el("ca-stat-buses").textContent = totalBuses;
    if (el("ca-stat-online")) el("ca-stat-online").textContent = onlineDrivers;

    renderLicenseCard(scope, license);
    renderGroupsTable(scope);
    renderDispatchersSummary(scope);
    renderSetupChecklist(scope);

    if (typeof lucide !== "undefined") lucide.createIcons();
}

export {
    renderCompanyAdminDashboard,
    renderCompanyAdminBranding,
    companyNeedsBrandingSetup,
    getCompanyScope
};

// BusCommand — Company Admin section + remote-render registration (role graph)
import { registerSectionHandlers } from "../layout/section-registry.js";
import { registerRemoteRenderCallbacks } from "../core/remote-render-registry.js";
import { renderCompanyAdminDashboard, renderCompanyAdminBranding } from "../admin/company-admin.js";
import { renderCompanyAdminTeam } from "../admin/company-admin-team.js";
import { renderCompanyAdminGroups } from "../admin/company-admin-groups.js";
import { renderCompanyAdminServicePlan } from "../admin/company-admin-service-plan.js";
import { renderCompanyAdminDrivers } from "../admin/company-admin-drivers.js";
import { renderCompanyAdminSettings } from "../admin/company-admin-settings.js";
import { renderCompanyAdminBuses } from "../admin/company-admin-buses.js";

export function registerCompanyAdminSections() {
    registerRemoteRenderCallbacks({
        renderCompanyAdminDashboard,
        renderCompanyAdminDrivers
    });
    registerSectionHandlers({
        "company-admin-settings": () => renderCompanyAdminSettings(),
        "company-admin-dashboard": () => renderCompanyAdminDashboard(),
        "company-admin-branding": () => renderCompanyAdminBranding(),
        "company-admin-groups": () => renderCompanyAdminGroups(),
        "company-admin-drivers": () => renderCompanyAdminDrivers(),
        "company-admin-buses": () => renderCompanyAdminBuses(),
        "company-admin-service-plan": () => renderCompanyAdminServicePlan(),
        "company-admin-team": () => renderCompanyAdminTeam(),
        "company-admin-audit": async () => {
            const { renderCompanyAdminAudit } = await import("../admin/company-admin-audit.js");
            renderCompanyAdminAudit();
        },
        // CA operational read-only view (D27) — Dispo sections, rendered on demand.
        "dispatcher-group-hub": async () => {
            const { renderGroupHub } = await import("../dispatcher/group-hub.js");
            renderGroupHub();
        },
        "dispatcher-vehicles": async () => {
            const { renderDispatcherVehicles } = await import("../dispatcher/vehicles-panel.js");
            renderDispatcherVehicles();
        },
        "dispatcher-monthly-plans-full": async () => {
            const { renderMonthlyPlansFullPage } = await import("../dispatcher/monthly-plans.js");
            renderMonthlyPlansFullPage();
        },
        "dispatcher-daily-plan-full": async () => {
            const mod = await import("../dispatcher/daily-plan.js");
            mod.bindDailyPlanFullPage();
            mod.renderDailyPlanFullPage();
        },
        "dispatcher-daily-plan-pick": async () => {
            const { renderPlanGroupPicker } = await import("../dispatcher/group-hub.js");
            renderPlanGroupPicker("daily");
        },
        "dispatcher-monthly-plan-pick": async () => {
            const { renderPlanGroupPicker } = await import("../dispatcher/group-hub.js");
            renderPlanGroupPicker("monthly");
        },
        "dispatcher-dashboard": async () => {
            const { renderDispatcherDashboard } = await import("../dispatcher/dashboard.js");
            renderDispatcherDashboard();
        },
        "dispatcher-shifts": async () => {
            const { renderDispatcherShifts } = await import("../dispatcher/shifts.js");
            renderDispatcherShifts();
        },
        "superadmin-dashboard": () => {}
    });
}

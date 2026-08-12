// BusCommand — staff surface section handlers
import { registerSectionHandlers } from "../layout/section-registry.js";
import { renderGroupFilterBar } from "../data/groups.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderDispatcherLostItems } from "../dispatcher/lost-items.js";
import { renderDispatcherReports } from "../dispatcher/reports.js";
import { loadMsgCompose } from "../dispatcher/msg-compose-loader.js";
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { renderCompanyAdminDashboard, renderCompanyAdminBranding } from "../admin/company-admin.js";
import { renderCompanyAdminTeam } from "../admin/company-admin-team.js";
import { renderCompanyAdminGroups } from "../admin/company-admin-groups.js";
import { renderCompanyAdminServicePlan } from "../admin/company-admin-service-plan.js";
import { renderCompanyAdminDrivers } from "../admin/company-admin-drivers.js";
import { renderCompanyAdminAudit } from "../admin/company-admin-audit.js";
import { renderCompanyAdminSettings } from "../admin/company-admin-settings.js";
import { renderCompanyAdminBuses } from "../admin/company-admin-buses.js";
import { renderDispatcherShifts } from "../dispatcher/shifts.js";
import { renderDispatcherVacations } from "../dispatcher/vacations.js";
import { initDispatcherLiveMap } from "../maps/live-map-core.js";
import { renderScheduleHistory } from "../data/schedules.js";
import { refreshDailyPlanOnDateChange, renderDailyPlanFullPage, bindDailyPlanFullPage } from "../dispatcher/daily-plan.js";
import { renderMonthlyPlansView, renderMonthlyPlansFullPage } from "../dispatcher/monthly-plans.js";
import { renderGroupHub, renderPlanGroupPicker } from "../dispatcher/group-hub.js";
import { renderDispatcherVehicles, openVehiclesForGroup } from "../dispatcher/vehicles-panel.js";

export function registerStaffSections() {
    registerSectionHandlers({
        "dispatcher-dashboard": () => renderDispatcherDashboard(),
        "dispatcher-daily-plan-pick": () => renderPlanGroupPicker("daily"),
        "dispatcher-monthly-plan-pick": () => renderPlanGroupPicker("monthly"),
        "dispatcher-vehicles": () => renderDispatcherVehicles(),
        "dispatcher-live-map-section": () => {
            setTimeout(() => initDispatcherLiveMap(), 100);
        },
        "dispatcher-group-hub": () => renderGroupHub(),
        "dispatcher-shifts": () => renderDispatcherShifts(),
        "dispatcher-reports": () => {
            renderGroupFilterBar("group-filter-bar-reports");
            renderDispatcherReports();
        },
        "dispatcher-lost-found": () => renderDispatcherLostItems(),
        "dispatcher-vacations": () => renderDispatcherVacations(),
        "company-admin-settings": () => renderCompanyAdminSettings(),
        "company-admin-dashboard": () => renderCompanyAdminDashboard(),
        "company-admin-branding": () => renderCompanyAdminBranding(),
        "company-admin-groups": () => renderCompanyAdminGroups(),
        "company-admin-drivers": () => renderCompanyAdminDrivers(),
        "company-admin-buses": () => renderCompanyAdminBuses(),
        "company-admin-service-plan": () => renderCompanyAdminServicePlan(),
        "company-admin-team": () => renderCompanyAdminTeam(),
        "company-admin-audit": () => renderCompanyAdminAudit(),
        "dispatcher-daily-schedule": () => {
            renderScheduleHistory();
            refreshDailyPlanOnDateChange();
        },
        "dispatcher-monthly-plans": () => renderMonthlyPlansView(),
        "dispatcher-monthly-plans-full": () => renderMonthlyPlansFullPage(),
        "dispatcher-daily-plan-full": () => {
            bindDailyPlanFullPage();
            renderDailyPlanFullPage();
        },
        "dispatcher-messages": async () => {
            let mod;
            try {
                mod = await loadMsgCompose();
            } catch {
                showToast(t("msg_compose_chunk_load_failed"), "error", 8000);
                return;
            }
            try {
                mod.setMessagesPageTab("personal");
                mod.populateTemplateSelect("message-template-messages");
                mod.renderAllMessagesList();
            } catch (err) {
                console.error("dispatcher-messages section execution failed", err);
                showToast(t("error_generic"), "error", 8000);
            }
        },
        "superadmin-dashboard": () => {}
    });

    window.openVehiclesForGroup = openVehiclesForGroup;
}

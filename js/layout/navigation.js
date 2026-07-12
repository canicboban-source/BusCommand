// BusCommand ESM v9.5
import { renderGroupFilterBar } from "../data/groups.js";
import { clearAllPasswordFields } from "../auth/password-fields.js";
import { isSessionValid } from "../auth/login-session.js";
import { showLoginScreen } from "../auth/login-ui.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderDispatcherLostItems } from "../dispatcher/lost-items.js";
import { populateMessageRecipients, populateTemplateSelect, renderAllMessagesList, setMessagesPageTab } from "../dispatcher/msg-compose.js";
import { renderDispatcherReports } from "../dispatcher/reports.js";
import { renderCompanyAdminDashboard, renderCompanyAdminBranding } from "../admin/company-admin.js";
import { renderCompanyAdminTeam } from "../admin/company-admin-team.js";
import { renderCompanyAdminGroups } from "../admin/company-admin-groups.js";
import { renderDispatcherSettings } from "../dispatcher/settings.js";
import { renderDispatcherShifts } from "../dispatcher/shifts.js";
import { renderDispatcherVacations } from "../dispatcher/vacations.js";
import { renderDriverCalendar } from "../driver/calendar.js";
import { checkSOSStatus, renderDriverDashboard } from "../driver/dashboard.js";
import { renderDriverVacationHistory } from "../driver/reports.js";
import { initDispatcherLiveMap } from "../maps/live-map-core.js";
import { translateUI } from "../ui/i18n.js";
import { renderScheduleHistory } from "../data/schedules.js";
import { refreshDailyPlanOnDateChange, renderDailyPlanFullPage, bindDailyPlanFullPage } from "../dispatcher/daily-plan.js";
import { renderMonthlyPlansView, renderMonthlyPlansFullPage } from "../dispatcher/monthly-plans.js";
import { renderGroupHub, openGroupHub, renderPlanGroupPicker } from "../dispatcher/group-hub.js";

// --- NAVIGACIJA ---
function switchSection(sectionId) {
    if (window.currentUser && !isSessionValid()) {
        window.currentUser = null;
        showLoginScreen(true);
        return;
    }

    clearAllPasswordFields();

    const sections = document.querySelectorAll(".content-section");
    sections.forEach(sec => sec.classList.add("hidden"));

    const target = document.getElementById(sectionId);
    if (target) target.classList.remove("hidden");

    // Uvijek ažuriraj prijevode nakon što sekcija postane vidljiva
    translateUI();
    
    // Ažuriraj sidebar nav
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => item.classList.remove("active"));
    const targetLink = Array.from(navItems).find((item) => {
        if (item.dataset.action !== "switchSection") return false;
        const args = item.dataset.actionArgs || "";
        return args.includes(`"${sectionId}"`) || args.includes(`'${sectionId}'`);
    });
    if (targetLink) targetLink.classList.add("active");
    
    // Ažuriraj mobilnu bottom navigaciju
    const mobMap = {
        "driver-dashboard": "mobnav-dashboard",
        "driver-calendar":  "mobnav-calendar",
        "driver-reports":   "mobnav-reports",
        "driver-vacation":  "mobnav-vacation"
    };
    document.querySelectorAll(".mob-nav-btn").forEach(btn => {
        if (!btn.classList.contains("mob-nav-sos")) btn.classList.remove("active");
    });
    if (mobMap[sectionId]) {
        const mobBtn = document.getElementById(mobMap[sectionId]);
        if (mobBtn) mobBtn.classList.add("active");
    }
    
    if (sectionId === "driver-dashboard") {
        renderDriverDashboard();
    } else if (sectionId === "driver-calendar") {
        renderDriverCalendar();
    } else if (sectionId === "driver-vacation") {
        renderDriverVacationHistory();
    } else if (sectionId === "dispatcher-dashboard") {
        renderDispatcherDashboard();
    } else if (sectionId === "dispatcher-daily-plan-pick") {
        renderPlanGroupPicker("daily");
    } else if (sectionId === "dispatcher-monthly-plan-pick") {
        renderPlanGroupPicker("monthly");
    } else if (sectionId === "dispatcher-live-map-section") {
        setTimeout(() => { initDispatcherLiveMap(); }, 100);
    } else if (sectionId === "dispatcher-group-hub") {
        renderGroupHub();
    } else if (sectionId === "dispatcher-shifts") {
        renderDispatcherShifts();
    } else if (sectionId === "dispatcher-reports") {
        renderGroupFilterBar("group-filter-bar-reports");
        renderDispatcherReports();
    } else if (sectionId === "dispatcher-lost-found") {
        renderDispatcherLostItems();
    } else if (sectionId === "dispatcher-vacations") {
        renderDispatcherVacations();
    } else if (sectionId === "dispatcher-settings") {
        renderDispatcherSettings();
    } else if (sectionId === "company-admin-dashboard") {
        renderCompanyAdminDashboard();
    } else if (sectionId === "company-admin-branding") {
        renderCompanyAdminBranding();
    } else if (sectionId === "company-admin-groups") {
        renderCompanyAdminGroups();
    } else if (sectionId === "company-admin-team") {
        renderCompanyAdminTeam();
    } else if (sectionId === "dispatcher-daily-schedule") {
        renderScheduleHistory();
        refreshDailyPlanOnDateChange();
    } else if (sectionId === "dispatcher-monthly-plans") {
        renderMonthlyPlansView();
    } else if (sectionId === "dispatcher-monthly-plans-full") {
        renderMonthlyPlansFullPage();
    } else if (sectionId === "dispatcher-daily-plan-full") {
        bindDailyPlanFullPage();
        renderDailyPlanFullPage();
    } else if (sectionId === "dispatcher-messages") {
        setMessagesPageTab("personal");
        populateTemplateSelect("message-template-messages");
        renderAllMessagesList();
    }

    checkSOSStatus();
    lucide.createIcons();
}

function openDataImportHub() {
    const gid = window.state.activeGroupFilter
        || window.currentUser?.activeGroupId
        || window.state.groups?.[0]?.id;
    if (gid) {
        openGroupHub(gid);
        return;
    }
    switchSection("dispatcher-dashboard");
}

export {
    switchSection,
    openDataImportHub
};

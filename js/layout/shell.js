// BusCommand ESM v9.5
import { renderCompanyAdminDashboard, renderCompanyAdminBranding } from "../admin/company-admin.js";
import { exitImpersonation, switchToGroupSetup } from "../admin/dispatcher-setup.js";
import { renderSuperAdminDashboard } from "../admin/superadmin.js";
import { updateAvatarUI } from "../driver/avatar.js";
import { checkSOSStatus } from "../driver/dashboard.js";
import { showCompanyAdminOnboarding, shouldShowCompanyAdminOnboarding } from "../admin/company-admin-onboarding.js";
import { rejectDispatcherWithoutGroups, clearAllSensitiveAuthFields } from "../auth/login-ui.js";
import { syncUserSession } from "../auth/login-session.js";
import { switchSection } from "./navigation.js";
import { showPreTripModal } from "./pretrip.js";
import { requestNotificationPermission, startDriverGpsTracking } from "../maps/gps-track.js";
import { initDispatcherLiveMap } from "../maps/live-map-core.js";
import { showOnboardingWizard } from "../features/onboarding.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

function showAppLayout() {
    if (window.currentUser && window.currentUser.role === "driver" && !sessionStorage.getItem("buscommand_pretrip_done")) {
        clearAllSensitiveAuthFields();
        showPreTripModal();
        return;
    }

    clearAllSensitiveAuthFields();
    
    document.getElementById("login-screen").classList.add("hidden");
    const modal = document.getElementById("pre-trip-modal");
    if (modal) modal.classList.add("hidden");
    
    document.getElementById("app-container").classList.remove("hidden");
    
    document.getElementById("header-user-name").innerText = t(window.currentUser.name);
    updateAvatarUI();
    
    const roleBadge = document.getElementById("current-role-badge");
    roleBadge.innerText = window.currentUser.role === "driver" ? t("driver") : t("dispatcher");
    
    const driverNav = document.getElementById("driver-nav");
    const dispNav = document.getElementById("dispatcher-nav");
    const saNav = document.getElementById("superadmin-nav");
    const caNav = document.getElementById("company-admin-nav");

    if (window.currentUser.role === "driver") {
        document.getElementById("header-user-sub").innerText = `${t("vehicle")} ${window.currentUser.bus || ""}`;
        driverNav.classList.remove("hidden");
        dispNav.classList.add("hidden");
        if (saNav) saNav.classList.add("hidden");
        if (caNav) caNav.classList.add("hidden");
        // Pokaži mobilnu bottom navigaciju za vozača
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.remove("hidden");
        // Pokreni GPS praćenje
        startDriverGpsTracking();
        switchSection("driver-dashboard");
    } else if (window.currentUser.role === "superadmin") {
        document.getElementById("header-user-sub").innerText = "Super Admin";
        roleBadge.innerText = "Super Admin";
        driverNav.classList.add("hidden");
        dispNav.classList.add("hidden");
        if (saNav) saNav.classList.remove("hidden");
        if (caNav) caNav.classList.add("hidden");
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.add("hidden");

        renderSuperAdminDashboard();
        switchSection("superadmin-dashboard");
    } else if (window.currentUser.role === "company-admin") {
        document.getElementById("header-user-sub").innerText = t("role_company_admin");
        roleBadge.innerText = t("role_company_admin");
        driverNav.classList.add("hidden");
        dispNav.classList.add("hidden");
        if (saNav) saNav.classList.add("hidden");
        if (caNav) caNav.classList.remove("hidden");
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.add("hidden");
        renderCompanyAdminDashboard();
        if (shouldShowCompanyAdminOnboarding()) {
            switchSection("company-admin-dashboard");
            setTimeout(() => showCompanyAdminOnboarding(), 350);
        } else if (!window.state.branding?.name?.trim()) {
            switchSection("company-admin-branding");
        } else {
            switchSection("company-admin-dashboard");
        }
    } else {
        const disp = window.state.dispatchers.find(d => d.id === window.currentUser.id);
        if (disp && rejectDispatcherWithoutGroups(disp)) {
            return;
        }
        if (disp && !window.currentUser.activeGroupId && disp.groups && disp.groups.length > 0) {
            window.currentUser.activeGroupId = disp.groups[0];
            syncUserSession(window.currentUser);
        } else if (!window.currentUser.activeGroupId) {
            rejectDispatcherWithoutGroups(disp || {});
            return;
        }
        
        document.getElementById("header-user-sub").innerHTML = `Group: ${window.currentUser.activeGroupId} <button ${actionAttr("switchToGroupSetup")} style="background:rgba(255,255,255,0.1); border:none; color:var(--primary-color); border-radius:4px; padding:2px 8px; margin-left:8px; font-size:0.75rem; cursor:pointer;">Switch</button>`;
        
        if (window.currentUser.impersonated) {
            document.getElementById("header-user-sub").innerHTML += ` <button ${actionAttr("exitImpersonation")} style="background:#ff4d4d; border:none; color:white; border-radius:4px; padding:3px 12px; margin-left:8px; font-size:0.75rem; cursor:pointer; font-weight:600;">⬅ Exit Inspect</button>`;
            
            // Show read-only banner
            const readOnlyBanner = document.createElement("div");
            readOnlyBanner.id = "readonly-banner";
            readOnlyBanner.style.cssText = "position:fixed; top:0; left:0; right:0; z-index:10000; background:linear-gradient(90deg, #f59e0b, #d97706); color:#000; text-align:center; padding:6px 12px; font-size:0.8rem; font-weight:700; letter-spacing:0.5px; font-family:'Outfit',sans-serif;";
            readOnlyBanner.innerHTML = "👁️ STEALTH INSPECT MODE — Read-Only View — No changes will be saved";
            const existingBanner = document.getElementById("readonly-banner");
            if (existingBanner) existingBanner.remove();
            document.body.prepend(readOnlyBanner);
        } else {
            const existingBanner = document.getElementById("readonly-banner");
            if (existingBanner) existingBanner.remove();
        }
        
        driverNav.classList.add("hidden");
        dispNav.classList.remove("hidden");
        if (saNav) saNav.classList.add("hidden");
        if (caNav) caNav.classList.add("hidden");
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.add("hidden");
        switchSection("dispatcher-dashboard");
        setTimeout(() => { initDispatcherLiveMap(); }, 300);
        requestNotificationPermission();

        // Onboarding wizard — pokaži samo ako firma nije konfigurirana
        if (!window.state.onboardingDone && !window.state.branding.name && !window.currentUser.impersonated) {
            setTimeout(() => showOnboardingWizard(), 600);
        }
    }
    
    checkSOSStatus();
}
export {
    showAppLayout
};

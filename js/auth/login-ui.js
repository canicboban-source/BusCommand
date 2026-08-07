// BusCommand ESM v9.5
import { isMobileDevice } from "../core/utils.js";
import { t, translateUI } from "../ui/i18n.js";
import { isDriverSurface, isStaffSurface } from "../core/app-surface.js";
import { clearUserSession } from "./login-session.js";
import { initializeLoginSelects } from "./login-selects.js";
import {
    clearAllPasswordFields,
    clearAllSensitiveAuthFields,
    clearAuthSetupFields,
    clearLoginFormFields
} from "./password-fields.js";
import { updateTrialBadge } from "../core/license.js";

function showLoginScreen(preferDispatcherTab = false) {
    const hideIds = [
        "app-container",
        "dispatcher-password-setup-view",
        "dispatcher-group-setup-view",
        "driver-activation-modal",
        "onboarding-wizard",
        "ca-onboarding-wizard",
        "mobile-bottom-nav",
        "fp-mobile-nav",
        "pre-trip-modal",
        "msg-fullscreen-alert",
        "clear-sos-modal",
        "factory-reset-modal",
        "monthly-day-edit-modal",
        "sos-confirm-modal",
        "sos-trigger-modal",
        "global-confirm-modal"
    ];
    const overlayIds = new Set([
        "driver-activation-modal",
        "onboarding-wizard",
        "ca-onboarding-wizard",
        "pre-trip-modal",
        "msg-fullscreen-alert",
        "clear-sos-modal",
        "factory-reset-modal",
        "monthly-day-edit-modal",
        "sos-confirm-modal",
        "sos-trigger-modal",
        "global-confirm-modal"
    ]);
    hideIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add("hidden");
            if (overlayIds.has(id)) {
                el.style.display = "none";
                if (el.hasAttribute("aria-hidden") || el.getAttribute("role") === "dialog") {
                    el.setAttribute("aria-hidden", "true");
                }
            }
        }
    });

    const msgAlert = document.getElementById("msg-fullscreen-alert");
    if (msgAlert) delete msgAlert.dataset.msgId;

    const loginScreen = document.getElementById("login-screen");
    if (loginScreen) loginScreen.classList.remove("hidden");

    clearAllSensitiveAuthFields();

    // Surface-locked login: driver PWA never shows staff tab, staff never shows driver tab
    if (isDriverSurface()) {
        switchLoginTab("driver");
        document.getElementById("tab-dispatcher-btn")?.classList.add("hidden");
        document.getElementById("tab-driver-btn")?.classList.add("active");
        document.querySelector(".login-tabs")?.classList.add("surface-single-tab");
    } else if (isStaffSurface()) {
        switchLoginTab("dispatcher");
        document.getElementById("tab-driver-btn")?.classList.add("hidden");
        document.getElementById("tab-dispatcher-btn")?.classList.add("active");
        document.querySelector(".login-tabs")?.classList.add("surface-single-tab");
    } else if (preferDispatcherTab) {
        switchLoginTab("dispatcher");
    } else {
        switchLoginTab("driver");
    }

    translateUI();
    initializeLoginSelects();
    updateTrialBadge();
}

function rejectDispatcherWithoutGroups(disp) {
    if (!disp || disp.id === "superadmin" || disp.isSuperAdmin) return false;
    if (window.currentUser?.activeGroupId) return false;
    if (disp.groups && disp.groups.length > 0) return false;

    window.currentUser = null;
    clearUserSession();
    showLoginScreen(true);
    const errEl = document.getElementById("login-error-dispatcher");
    if (errEl) {
        errEl.textContent = t("disp_no_groups_assigned")
            || "Nemate dodeljene grupe. Administrator firme mora da vas dodeli liniji pre prijave.";
        errEl.classList.remove("hidden");
    }
    return true;
}

function getCleanLoginUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    url.searchParams.delete("mode");
    return url.pathname + url.search + url.hash;
}

function switchLoginTab(role) {
    if (isDriverSurface() && role !== "driver") return;
    if (isStaffSurface() && role === "driver") return;

    const driverTab = document.getElementById("tab-driver-btn");
    const dispTab = document.getElementById("tab-dispatcher-btn");
    const driverForm = document.getElementById("driver-login-form");
    const dispForm = document.getElementById("dispatcher-login-form");
    const staffHint = document.getElementById("staff-login-role-hint");

    clearAllPasswordFields();
    clearAuthSetupFields();

    if (role === "driver") {
        driverTab?.classList.add("active");
        dispTab?.classList.remove("active");
        driverForm?.classList.remove("hidden");
        dispForm?.classList.add("hidden");
        staffHint?.classList.add("hidden");
        const passInput = document.getElementById("login-dispatcher-password");
        const emailInput = document.getElementById("login-dispatcher-email");
        if (passInput) passInput.value = "";
        if (emailInput) emailInput.value = "";
    } else {
        driverTab?.classList.remove("active");
        dispTab?.classList.add("active");
        driverForm?.classList.add("hidden");
        dispForm?.classList.remove("hidden");
        staffHint?.classList.remove("hidden");

        const pinInput = document.getElementById("login-driver-pin");
        if (pinInput) pinInput.value = "";

        const mobileBlock = document.getElementById("dispatcher-mobile-block");
        const loginFields = document.getElementById("dispatcher-login-fields");
        if (isMobileDevice()) {
            if (mobileBlock) mobileBlock.classList.remove("hidden");
            if (loginFields) loginFields.style.display = "none";
        } else {
            if (mobileBlock) mobileBlock.classList.add("hidden");
            if (loginFields) loginFields.style.display = "";
        }
    }

    ["login-error-driver", "login-error-dispatcher"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = "";
            el.classList.add("hidden");
        }
    });
}

export {
    showLoginScreen,
    switchLoginTab,
    getCleanLoginUrl,
    rejectDispatcherWithoutGroups,
    clearLoginFormFields,
    clearAllSensitiveAuthFields
};

export { initializeLoginSelects } from "./login-selects.js";

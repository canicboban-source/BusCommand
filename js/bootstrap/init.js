// BusCommand ESM v9.5
import { initializeLoginSelects, showLoginScreen } from "../auth/login-ui.js";
import {
    clearUserSession,
    initLoginSessionGuards,
    persistUserSession,
    restoreUserSession
} from "../auth/login-session.js";
import { initPasswordFieldGuards } from "../auth/password-fields.js";
import { initFirebase, initializeFirebaseClient } from "../core/firebase-service.js";
import { checkCompanyLicense } from "../core/license.js";
import { getBaseState, loadStateFromStorage, clearTenantStateCache, resetInMemoryTenantState, applyUiLanguagePreference, resolveUiLanguage } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { applyBrandingToUI, t, translateUI } from "../ui/i18n.js";
import { showModeBadge } from "../ui/mode-badge.js";
import { applyStoredTheme } from "../ui/theme.js";
import { EXPECTED_FIREBASE_PROJECT_ID } from "../core/firebase-web-config.js";
import { createProductionAuthGate } from "../core/production-auth-gate.js";
import { closeDriverActivationForSignedOut, openDriverActivation } from "../auth/driver-activation.js";
import { setDriverActivationPending } from "../auth/driver-access-gate.js";
import { prepareDriverWorkSession } from "../driver/work-session.js";
import { isDriverSurface, isStaffSurface } from "../core/app-surface.js";

function setAuthLoading(visible, errorKey = null) {
    let overlay = document.getElementById("production-auth-loading");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "production-auth-loading";
        overlay.className = "login-screen hidden";
        overlay.innerHTML = `<div class="login-card" style="text-align:center;"><div class="logo bc-brand" style="justify-content:center;"><img class="bc-brand-mark bc-brand-mark--lg" src="/brand/logo-mark.png" width="48" height="48" alt="BusCommand"><span class="bc-brand-text">BusCommand</span></div><p id="production-auth-loading-text"></p></div>`;
        document.body.appendChild(overlay);
    }
    const text = overlay.querySelector("#production-auth-loading-text");
    if (text) text.textContent = t(errorKey || "auth_loading");
    overlay.classList.toggle("hidden", !visible);
    document.getElementById("login-screen")?.classList.toggle("hidden", visible);
    document.getElementById("app-container")?.classList.add("hidden");
    ["mobile-bottom-nav", "fp-mobile-nav"].forEach((id) => {
        const navigation = document.getElementById(id);
        if (!navigation) return;
        navigation.classList.add("hidden");
        navigation.style.display = visible ? "none" : "";
    });
}

function handleSessionInvalidated() {
    window.currentUser = null;
    clearUserSession();
    showLoginScreen(true);
    showToast(t("session_invalidated_toast"), "info", 5000);
}

// The underlying error names internal configuration and belongs in the console,
// not on a login screen a driver is looking at.
function showFirebaseConfigurationError(error) {
    console.error("Firebase configuration rejected", error);
    showLoginScreen(false);
    ["login-error-driver", "login-error-dispatcher"].forEach((id) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = t("auth_config_error");
        element.classList.remove("hidden");
    });
}

async function bootstrapBusCommand() {
    applyStoredTheme();
    showModeBadge();
    initPasswordFieldGuards();
    initLoginSessionGuards(handleSessionInvalidated);

    const savedLang = resolveUiLanguage();
    document.documentElement.lang = savedLang;

    if (IS_DEMO_MODE) {
        loadStateFromStorage(COMPANY_ID);
        applyUiLanguagePreference(savedLang);
    } else {
        window.state = { ...getBaseState(), language: savedLang };
        applyUiLanguagePreference(savedLang);
        try {
            initializeFirebaseClient();
            Auth.init();
        } catch (error) {
            console.error("Firebase preview configuration rejected.");
            showFirebaseConfigurationError(error);
            lucide.createIcons();
            return;
        }
    }

    const forceLogin = localStorage.getItem("buscommand_force_login")
        || sessionStorage.getItem("buscommand_force_login");

    window.currentUser = null;
    if (!forceLogin) {
        window.currentUser = restoreUserSession();
        // Drivers must always pass login — never auto-enter on message/pretrip overlays
        if (window.currentUser?.role === "driver") {
            clearUserSession();
            window.currentUser = null;
        }
    }

    applyBrandingToUI();
    initializeLoginSelects();

    const loginSel  = document.getElementById("login-lang-select");
    const headerSel = document.getElementById("header-lang-select");
    if (loginSel)  loginSel.value  = savedLang;
    if (headerSel) headerSel.value = savedLang;

    translateUI();

    if (forceLogin) {
        localStorage.removeItem("buscommand_force_login");
        sessionStorage.removeItem("buscommand_force_login");
        clearUserSession();
        window.currentUser = null;
        if (IS_DEMO_MODE) {
            loadStateFromStorage(COMPANY_ID);
        } else {
            window.state = { ...getBaseState(), language: savedLang };
        }
        applyUiLanguagePreference(savedLang);
        applyBrandingToUI();
        initializeLoginSelects();
        translateUI();
        showLoginScreen(false);
        lucide.createIcons();
        return;
    }

    const quickRole = BusCommandConfig.QUICK_DEMO_ROLE;
    if (quickRole === "driver" && isStaffSurface()) {
        window.location.replace("/driver.html" + window.location.search);
        return;
    }
    if ((quickRole === "dispatcher" || quickRole === "admin") && isDriverSurface()) {
        window.location.replace("/staff.html" + window.location.search);
        return;
    }
    if (quickRole === "driver") {
        const demoDriver = window.state.drivers[0];
        if (!demoDriver) {
            showLoginScreen(true);
            lucide.createIcons();
            return;
        }
        const demoRoute = window.state.routes.find(r => r.groupId === demoDriver.groupId) || window.state.routes[0];
        window.currentUser = {
            role: "driver", name: demoDriver.name, bus: demoDriver.bus || "104",
            routeId: demoRoute ? demoRoute.id : null, currentStopIndex: 0,
            companyId: "demo", isDemo: true
        };
        demoDriver.active = true;
        persistUserSession(window.currentUser);
        showAppLayout();
        showToast("Demo — prijavljen kao Vozač", "info", 5000);
        lucide.createIcons();
        return;
    }
    if (quickRole === "dispatcher") {
        const demoDisp = window.state.dispatchers.find(d => d.id !== "superadmin") || window.state.dispatchers[0];
        window.currentUser = {
            role: "dispatcher",
            name: demoDisp ? demoDisp.name : "Demo Dispečer",
            id: demoDisp ? demoDisp.id : "dispo-demo",
            activeGroupId: (demoDisp && demoDisp.groups && demoDisp.groups[0])
                || window.state.groups[0]?.id
                || null,
            companyId: "demo", isDemo: true
        };
        persistUserSession(window.currentUser);
        showAppLayout();
        showToast("Demo — prijavljen kao Dispečer", "info", 5000);
        lucide.createIcons();
        return;
    }

    if (!IS_DEMO_MODE) {
        const handleAuthState = createProductionAuthGate({
            firebaseProjectId: EXPECTED_FIREBASE_PROJECT_ID,
            onPending: () => setAuthLoading(true),
            onSignedOut: () => {
                const companyId = window.currentUser?.companyId || null;
                window.currentUser = null;
                clearTenantStateCache(companyId);
                resetInMemoryTenantState();
                closeDriverActivationForSignedOut();
                setAuthLoading(false);
                showLoginScreen(false);
            },
            onInvalidTenant: () => {
                const companyId = window.currentUser?.companyId || null;
                window.currentUser = null;
                clearTenantStateCache(companyId);
                resetInMemoryTenantState();
                setAuthLoading(true, "auth_company_invalid");
            },
            onActivationRequired: () => {
                window.currentUser = null;
                clearUserSession();
                setAuthLoading(false);
                openDriverActivation();
            },
            onAuthenticated: async (authUser, confirmedCompanyId) => {
                setDriverActivationPending(false);
                window.currentUser = {
                    uid: authUser.uid, email: authUser.email, name: authUser.name,
                    role: authUser.role, companyId: confirmedCompanyId,
                    id: authUser.uid, groups: authUser.groups || [],
                    activeGroupId: authUser.groups?.[0] || null
                };
                if (authUser.role === "superadmin") {
                    setAuthLoading(false);
                    showAppLayout();
                    return;
                }
                try {
                    await checkCompanyLicense(confirmedCompanyId);
                    if (authUser.role === "driver" && !(await prepareDriverWorkSession())) {
                        setAuthLoading(false);
                        return;
                    }
                    await initFirebase(confirmedCompanyId);
                    persistUserSession(window.currentUser);
                    applyBrandingToUI();
                    setAuthLoading(false);
                    showAppLayout();
                } catch (error) {
                    console.warn("Authenticated company initialization failed.", error);
                    setAuthLoading(true, "auth_cloud_load_failed");
                }
            }
        });
        Auth.onAuthStateChanged(handleAuthState);
    }

    if (window.currentUser && IS_DEMO_MODE) {
        showAppLayout();
    } else if (IS_DEMO_MODE) {
        showLoginScreen(false);
    }
    lucide.createIcons();
}
export {
    bootstrapBusCommand
};

// BusCommand ESM v9.5
import { initializeLoginSelects, showLoginScreen } from "../auth/login-ui.js";
import {
    clearUserSession,
    initLoginSessionGuards,
    persistUserSession,
    restoreUserSession
} from "../auth/login-session.js";
import { initPasswordFieldGuards } from "../auth/password-fields.js";
import { initFirebase } from "../core/firebase-service.js";
import { checkCompanyLicense } from "../core/license.js";
import { getBaseState, loadStateFromStorage } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { applyBrandingToUI, translateUI } from "../ui/i18n.js";
import { showModeBadge } from "../ui/mode-badge.js";
import { applyStoredTheme } from "../ui/theme.js";

function handleSessionInvalidated() {
    window.currentUser = null;
    clearUserSession();
    showLoginScreen(true);
    showToast("Sesija je istekla ili je prijava aktivna na drugom tabu.", "info", 5000);
}

async function bootstrapBusCommand() {
    applyStoredTheme();
    showModeBadge();
    initPasswordFieldGuards();
    initLoginSessionGuards(handleSessionInvalidated);

    const savedLang = localStorage.getItem("buscommand_lang") || "de";
    document.documentElement.lang = savedLang;

    if (IS_DEMO_MODE) {
        loadStateFromStorage(COMPANY_ID);
        window.state.language = savedLang;
    } else {
        window.state = { ...getBaseState(), language: savedLang };
        Auth.init();
    }

    const forceLogin = localStorage.getItem("buscommand_force_login")
        || sessionStorage.getItem("buscommand_force_login");

    window.currentUser = null;
    if (!forceLogin) {
        window.currentUser = restoreUserSession();
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
        applyBrandingToUI();
        initializeLoginSelects();
        translateUI();
        showLoginScreen(true);
        lucide.createIcons();
        return;
    }

    const quickRole = BusCommandConfig.QUICK_DEMO_ROLE;
    if (quickRole === "driver") {
        const demoDriver = window.state.drivers[0] || { name: "Demo Vozač", bus: "104", groupId: "105" };
        const demoRoute  = window.state.routes.find(r => r.groupId === demoDriver.groupId) || window.state.routes[0];
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
            activeGroupId: (demoDisp && demoDisp.groups && demoDisp.groups[0]) || "105",
            companyId: "demo", isDemo: true
        };
        persistUserSession(window.currentUser);
        showAppLayout();
        showToast("Demo — prijavljen kao Dispečer", "info", 5000);
        lucide.createIcons();
        return;
    }

    if (!IS_DEMO_MODE) {
        await checkCompanyLicense(COMPANY_ID);
        if (true) {
            try {
                await initFirebase(COMPANY_ID);
                applyBrandingToUI();
                initializeLoginSelects();
                translateUI();
            } catch (e) {
                console.warn("Firebase init failed:", e);
            }
        }
        Auth.onAuthStateChanged(async (authUser) => {
            if (!authUser) return;
            if (window.currentUser && window.currentUser.uid === authUser.uid) return;
            window.currentUser = {
                uid: authUser.uid, email: authUser.email, name: authUser.name,
                role: authUser.role, companyId: authUser.companyId || COMPANY_ID,
                id: authUser.uid,
                activeGroupId: authUser.permissions?.groups?.[0] || null
            };
            persistUserSession(window.currentUser);
            await initFirebase(window.currentUser.companyId || COMPANY_ID);
            showAppLayout();
        });
    }

    if (window.currentUser) {
        showAppLayout();
    } else {
        showLoginScreen(true);
    }
    lucide.createIcons();
}
export {
    bootstrapBusCommand
};

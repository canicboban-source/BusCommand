// BusCommand ESM v9.5
import { getCleanLoginUrl } from "../auth/login-ui.js";
import { clearUserSession } from "../auth/login-session.js";
import { clearAllSensitiveAuthFields } from "../auth/password-fields.js";
import { resolveSOS } from "../maps/sos-siren.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { canRunCompanyAdminAction, canRunFactoryReset } from "../core/ui-permissions.js";
import { showToast } from "../core/utils.js";
import { t } from "./i18n.js";

const FORCE_LOGIN_KEY = "buscommand_force_login";

function signOutAllSessions() {
    window.currentUser = null;
    clearUserSession();
    clearAllSensitiveAuthFields();
    if (!IS_DEMO_MODE && typeof Auth !== "undefined" && Auth.logout) {
        try { Auth.logout(); } catch { /* ignore */ }
    }
    if (typeof firebase !== "undefined" && firebase.auth) {
        firebase.auth().signOut().catch(() => {});
    }
}

function confirmFactoryReset() {
    if (!canRunFactoryReset(window.currentUser?.role, IS_DEMO_MODE)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    closeModal("factory-reset-modal");
    signOutAllSessions();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(FORCE_LOGIN_KEY, "1");
    window.location.href = getCleanLoginUrl();
    return true;
}

// ============================================================
// MODAL HELPERS — showModal / closeModal
// ============================================================

function showModal(id) {
    if (id === "factory-reset-modal" && !canRunFactoryReset(window.currentUser?.role, IS_DEMO_MODE)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    if (["clear-sos-modal", "print-schedule-modal"].includes(id)
        && !canRunCompanyAdminAction(window.currentUser?.role)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("hidden");
        el.style.display = "flex";
        if (el.hasAttribute("aria-hidden") || el.getAttribute("role") === "dialog") {
            el.setAttribute("aria-hidden", "false");
        }
        return true;
    }
    return false;
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("hidden");
        el.style.display = "none";
        if (el.hasAttribute("aria-hidden") || el.getAttribute("role") === "dialog") {
            el.setAttribute("aria-hidden", "true");
        }
    }
}

// ============================================================
// SOS MODAL FUNCTIONS
// ============================================================

function closeSosConfirmModal() {
    closeModal("sos-confirm-modal");
}

function confirmResolveSOS() {
    closeSosConfirmModal();
    resolveSOS();
}

function confirmClearSOS() {
    closeModal("clear-sos-modal");
    resolveSOS();
}
export {
    confirmFactoryReset,
    showModal,
    closeModal,
    closeSosConfirmModal,
    confirmResolveSOS,
    confirmClearSOS
};

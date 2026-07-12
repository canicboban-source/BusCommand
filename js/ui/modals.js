// BusCommand ESM v9.5
import { getStateStorageKey } from "../core/state.js";
import { getCleanLoginUrl } from "../auth/login-ui.js";
import { clearUserSession } from "../auth/login-session.js";
import { clearAllSensitiveAuthFields } from "../auth/password-fields.js";
import { resolveSOS } from "../driver/dashboard.js";

const FORCE_LOGIN_KEY = "buscommand_force_login";

function signOutAllSessions() {
    window.currentUser = null;
    clearUserSession();
    clearAllSensitiveAuthFields();
    if (!IS_DEMO_MODE && typeof Auth !== "undefined" && Auth.logout) {
        try { Auth.logout(); } catch (_) { /* ignore */ }
    }
    if (typeof firebase !== "undefined" && firebase.auth) {
        firebase.auth().signOut().catch(() => {});
    }
}

function resetApp() {
    const key = getStateStorageKey(COMPANY_ID);
    localStorage.removeItem(key);
    if (IS_DEMO_MODE) {
        localStorage.removeItem("buscommand_demo_state_v2");
        localStorage.removeItem("buscommand_demo_state_v3");
    }
    sessionStorage.clear();
    signOutAllSessions();
    localStorage.setItem(FORCE_LOGIN_KEY, "1");
    window.location.href = getCleanLoginUrl();
}

function confirmFactoryReset() {
    closeModal("factory-reset-modal");
    signOutAllSessions();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(FORCE_LOGIN_KEY, "1");
    window.location.href = getCleanLoginUrl();
}

// ============================================================
// MODAL HELPERS — showModal / closeModal
// ============================================================

function showModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("hidden");
        el.style.display = "flex";
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("hidden");
        el.style.display = "none";
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
    resetApp,
    confirmFactoryReset,
    showModal,
    closeModal,
    closeSosConfirmModal,
    confirmResolveSOS,
    confirmClearSOS
};

// BusCommand ESM v9.5
import { getCleanLoginUrl } from "../auth/login-ui.js";
import { clearUserSession } from "../auth/login-session.js";
import { clearAllSensitiveAuthFields } from "../auth/password-fields.js";
import { resolveSOS } from "../maps/sos-siren.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { canRunCompanyAdminAction, canRunFactoryReset } from "../core/ui-permissions.js";
import { showToast } from "../core/utils.js";
import { t } from "./i18n.js";
import { attachFocusTrap, detachFocusTrap } from "./focus-trap.js";

const FORCE_LOGIN_KEY = "buscommand_force_login";

function signOutAllSessions() {
    window.currentUser = null;
    clearUserSession();
    clearAllSensitiveAuthFields();
    if (!USE_LOCAL_STATE && typeof Auth !== "undefined" && Auth.logout) {
        try { Auth.logout(); } catch { /* ignore */ }
    }
    if (typeof firebase !== "undefined" && firebase.auth) {
        firebase.auth().signOut().catch(() => {});
    }
}

function confirmFactoryReset() {
    if (!canRunFactoryReset(window.currentUser?.role, USE_LOCAL_STATE)) {
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

/**
 * #sos-confirm-driver-info was never written to by anything, so the dialog showed an
 * unlabelled empty tinted box. Fill it with who raised the alarm, or hide it.
 */
function renderSosConfirmContext() {
    const info = document.getElementById("sos-confirm-driver-info");
    if (info) {
        const driver = String(window.state?.sosDriver || "").trim();
        const bus = String(window.state?.sosBus || "").trim();
        const parts = [];
        if (driver) parts.push(`${t("driver")}: ${driver}`);
        if (bus) parts.push(`${t("vehicle")} ${bus}`);
        info.textContent = parts.join(" · ");
        info.hidden = parts.length === 0;
        info.style.display = parts.length === 0 ? "none" : "";
    }
    const note = document.getElementById("sos-resolve-note");
    if (note) note.value = "";
}

function showModal(id) {
    if (id === "factory-reset-modal" && !canRunFactoryReset(window.currentUser?.role, USE_LOCAL_STATE)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    if (["clear-sos-modal", "print-schedule-modal"].includes(id)
        && !canRunCompanyAdminAction(window.currentUser?.role)) {
        showToast(t("error_access_denied"), "error");
        return false;
    }
    // Prefer the i18n’d SOS confirm dialog over the legacy clear-sos duplicate.
    if (id === "clear-sos-modal" && document.getElementById("sos-confirm-modal")) {
        id = "sos-confirm-modal";
    }
    if (id === "sos-confirm-modal") renderSosConfirmContext();
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("hidden");
        el.style.display = "flex";
        el.setAttribute("aria-hidden", "false");
        attachFocusTrap(el);
        if (typeof lucide !== "undefined") lucide.createIcons();
        return true;
    }
    return false;
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("hidden");
        el.style.display = "none";
        el.setAttribute("aria-hidden", "true");
        detachFocusTrap(el);
    }
}

function closeSosConfirmModal() {
    closeModal("sos-confirm-modal");
    closeModal("clear-sos-modal");
}

/** Optional note; empty falls back to a default on the server so audit keeps a reason. */
function readSosResolutionNote() {
    const field = document.getElementById("sos-resolve-note");
    const note = String(field?.value || "").trim();
    if (field) field.value = "";
    return note;
}

function confirmResolveSOS() {
    const note = readSosResolutionNote();
    closeSosConfirmModal();
    return resolveSOS(note);
}

function confirmClearSOS() {
    const note = readSosResolutionNote();
    closeModal("clear-sos-modal");
    closeModal("sos-confirm-modal");
    return resolveSOS(note);
}

export {
    confirmFactoryReset,
    renderSosConfirmContext,
    showModal,
    closeModal,
    closeSosConfirmModal,
    confirmResolveSOS,
    confirmClearSOS
};

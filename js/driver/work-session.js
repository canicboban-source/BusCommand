import Auth from "../core/auth-client.js";
import ApiClient from "../core/api-client.js";
import { stopFirestoreSync } from "../core/firebase-service.js";
import { stopDriverGpsTracking, configureDriverGpsGate } from "../maps/gps-track.js";
import { clearUserSession } from "../auth/login-session.js";
import { showLoginScreen } from "../auth/login-ui.js";
import { showToast } from "../core/utils.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { t } from "../ui/i18n.js";
import { saveDriverOfflineSnapshot, clearDriverSensitiveCaches } from "./offline-snapshot.js";

let policy = null;
let restTimer = null;
let logoutTimer = null;
let visibilityBound = false;

function driverWorkPolicy() {
    return policy;
}

function isDriverWorkSessionActive() {
    return USE_LOCAL_STATE || (policy?.status === "active" && Date.now() < Date.parse(policy.notificationsUntil));
}

function clearWorkTimers() {
    if (restTimer) clearTimeout(restTimer);
    if (logoutTimer) clearTimeout(logoutTimer);
    restTimer = null;
    logoutTimer = null;
}

async function terminateDriverSession(messageKey = "driver_session_ended") {
    clearWorkTimers();
    configureDriverGpsGate({ liveGps: false, sessionActive: false });
    stopDriverGpsTracking();
    stopFirestoreSync();
    policy = null;
    try { await clearDriverSensitiveCaches(); } catch { /* best-effort */ }
    clearUserSession();
    window.currentUser = null;
    document.getElementById("driver-rest-overlay")?.remove();
    try { await Auth.logout(); } catch { /* login screen still closes local session */ }
    showLoginScreen(true);
    showToast(t(messageKey), "info", 6000);
}

function showRestOverlay() {
    if (document.getElementById("driver-rest-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "driver-rest-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;z-index:20000;background:#07111f;display:grid;place-items:center;padding:24px;color:#fff;text-align:center;";
    const card = document.createElement("div");
    card.style.cssText = "max-width:520px;padding:32px;border:1px solid rgba(255,255,255,.14);border-radius:18px;background:#101c2e;box-shadow:0 24px 80px rgba(0,0,0,.45);";
    const title = document.createElement("h2");
    title.textContent = t("driver_rest_title");
    const description = document.createElement("p");
    description.textContent = t("driver_rest_description");
    description.style.cssText = "color:#a9b7ca;line-height:1.6;margin:12px 0 22px;";
    const button = document.createElement("button");
    button.className = "btn-primary";
    button.textContent = t("driver_logout_now");
    button.addEventListener("click", () => terminateDriverSession());
    card.append(title, description, button);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    button.focus();
}

function enterDriverRestMode() {
    configureDriverGpsGate({
        liveGps: policy?.features?.liveGps === true,
        sessionActive: false
    });
    stopDriverGpsTracking();
    stopFirestoreSync();
    if (window.state?.messages) window.state.messages = [];
    showRestOverlay();
}

function enforceCurrentTime() {
    if (!policy || USE_LOCAL_STATE) return;
    const current = Date.now();
    if (current >= Date.parse(policy.sessionEndsAt)) {
        terminateDriverSession();
    } else if (current >= Date.parse(policy.notificationsUntil)) {
        enterDriverRestMode();
    }
}

function startDriverWorkSessionGuard() {
    if (USE_LOCAL_STATE || !policy) return;
    clearWorkTimers();
    const untilRest = Math.max(0, Date.parse(policy.notificationsUntil) - Date.now());
    const untilLogout = Math.max(0, Date.parse(policy.sessionEndsAt) - Date.now());
    restTimer = setTimeout(enterDriverRestMode, untilRest);
    logoutTimer = setTimeout(() => terminateDriverSession(), untilLogout);
    if (!visibilityBound) {
        visibilityBound = true;
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") enforceCurrentTime();
        });
    }
    enforceCurrentTime();
}

async function prepareDriverWorkSession() {
    if (USE_LOCAL_STATE) return true;
    const result = await ApiClient.getDriverWorkSession();
    if (!result.success || result.policy?.status !== "active") {
        policy = result.policy || null;
        await terminateDriverSession(result.policy?.status === "grace" ? "driver_shift_ended" : "driver_off_duty");
        return false;
    }
    policy = result.policy;
    configureDriverGpsGate({
        liveGps: policy?.features?.liveGps === true,
        sessionActive: policy?.status === "active"
    });
    try {
        saveDriverOfflineSnapshot({
            companyId: window.currentUser?.companyId,
            driverId: window.currentUser?.id || window.currentUser?.uid,
            policy,
            messages: window.state?.messages || []
        });
    } catch { /* offline snapshot is best-effort */ }
    return true;
}

function driverLiveGpsEnabled() {
    return USE_LOCAL_STATE ? false : policy?.features?.liveGps === true;
}

async function confirmUpcomingShifts(dates = null) {
    const pending = policy?.confirmationTargets?.filter((target) => !target.confirmed) || [];
    const targets = Array.isArray(dates) && dates.length
        ? pending.filter((target) => dates.includes(target.date))
        : pending;
    if (!targets.length || policy?.status !== "active") return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        showToast(t("driver_critical_needs_network"), "error");
        return false;
    }
    const result = await ApiClient.confirmDriverShifts(targets.map((target) => target.date));
    if (!result.success) {
        showToast(result.error || t("shift_confirm_failed"), "error");
        return false;
    }
    const confirmed = new Set(result.confirmedDates || []);
    policy.confirmationTargets = policy.confirmationTargets.map((target) => ({
        ...target, confirmed: target.confirmed || confirmed.has(target.date)
    }));
    showToast(t("shift_confirmed_toast"), "success");
    return true;
}

export {
    driverWorkPolicy, isDriverWorkSessionActive, prepareDriverWorkSession,
    startDriverWorkSessionGuard, enterDriverRestMode, terminateDriverSession,
    confirmUpcomingShifts, driverLiveGpsEnabled
};

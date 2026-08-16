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
let shiftEndTimer = null;
let visibilityBound = false;

function driverWorkPolicy() {
    return policy;
}

/** True only inside an active driving window — gates GPS telemetry (GDPR),
 *  never the app itself: drivers stay logged in 24/7. */
function isDriverWorkSessionActive() {
    return USE_LOCAL_STATE || (policy?.status === "active" && Date.now() < Date.parse(policy.notificationsUntil));
}

function clearWorkTimers() {
    if (shiftEndTimer) clearTimeout(shiftEndTimer);
    shiftEndTimer = null;
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
    try { await Auth.logout(); } catch { /* login screen still closes local session */ }
    showLoginScreen(true);
    if (messageKey) showToast(t(messageKey), "info", 6000);
}

/** Shift ended but the driver stays signed in (24/7): close the GPS gate,
 *  drop live sync and surface the neutral off-duty status. */
function enterDriverIdleMode(announce = true) {
    configureDriverGpsGate({ liveGps: false, sessionActive: false });
    stopDriverGpsTracking();
    policy = { ...(policy || {}), status: "off_duty" };
    if (announce) showToast(t("driver_shift_idle_24_7") || t("driver_session_ended"), "info", 6000);
}

function enforceCurrentTime() {
    if (!policy || USE_LOCAL_STATE) return;
    if (policy.status !== "active" && policy.status !== "grace") return;
    const current = Date.now();
    if (current >= Date.parse(policy.sessionEndsAt)) {
        enterDriverIdleMode();
    }
}

function startDriverWorkSessionGuard() {
    if (USE_LOCAL_STATE || !policy) return;
    clearWorkTimers();
    if (policy.status !== "active" && policy.status !== "grace") return;
    const untilEnd = Math.max(0, Date.parse(policy.sessionEndsAt) - Date.now());
    shiftEndTimer = setTimeout(() => enterDriverIdleMode(), untilEnd);
    if (!visibilityBound) {
        visibilityBound = true;
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") enforceCurrentTime();
        });
    }
    enforceCurrentTime();
}

/** 24/7 contract: a valid login always opens the app. Off-duty drivers get
 *  the neutral "no shift today" status with every feature except live GPS. */
async function prepareDriverWorkSession() {
    if (USE_LOCAL_STATE) return true;
    const result = await ApiClient.getDriverWorkSession();
    if (!result.success) {
        policy = result.policy || null;
        await terminateDriverSession("driver_session_ended");
        return false;
    }
    policy = result.policy || null;
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
    if (!targets.length) return false;
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
    startDriverWorkSessionGuard, enterDriverIdleMode, terminateDriverSession,
    confirmUpcomingShifts, driverLiveGpsEnabled
};

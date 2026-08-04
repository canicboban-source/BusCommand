// BusCommand ESM v9.5 — GPS tracking (flag-gated, active shift only)
import { syncUserSession } from "../auth/login-session.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";

let _lastUploadAt = 0;
let _gpsNoticeShown = false;
let _liveGpsEnabled = false;
let _sessionActive = false;
const UPLOAD_MIN_MS = 30_000;

/** Called from work-session / shell after policy fetch. */
function configureDriverGpsGate({ liveGps = false, sessionActive = false } = {}) {
    _liveGpsEnabled = liveGps === true;
    _sessionActive = sessionActive === true;
    if (!_liveGpsEnabled || !_sessionActive) {
        stopDriverGpsTracking();
    }
}

function isLiveGpsAllowed() {
    if (IS_DEMO_MODE) return false;
    return _liveGpsEnabled && _sessionActive;
}

function showGpsNoticeOnce() {
    if (_gpsNoticeShown) return;
    _gpsNoticeShown = true;
    showToast(
        t("gps_tracking_notice")
            || "Lokacija se šalje samo tokom aktivne smene, radi operativne podrške.",
        "info",
        7000
    );
}

async function uploadLocationSample(coords) {
    if (!isLiveGpsAllowed()) return;
    const now = Date.now();
    if (now - _lastUploadAt < UPLOAD_MIN_MS) return;
    _lastUploadAt = now;
    try {
        await ApiClient.postDriverLocation({
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
            recordedAt: new Date(coords.timestamp || now).toISOString()
        });
    } catch {
        // Network failure — next tick retries after throttle.
    }
}

function startDriverGpsTracking() {
    if (!navigator.geolocation) return;
    if (!isLiveGpsAllowed()) {
        stopDriverGpsTracking();
        return;
    }
    if (window._gpsWatchId !== undefined && window._gpsWatchId !== null) {
        navigator.geolocation.clearWatch(window._gpsWatchId);
    }
    showGpsNoticeOnce();
    window._gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            if (!isLiveGpsAllowed()) {
                stopDriverGpsTracking();
                return;
            }
            if (window.currentUser && window.currentUser.role === "driver") {
                window.currentUser.lat = pos.coords.latitude;
                window.currentUser.lng = pos.coords.longitude;
                try { syncUserSession(window.currentUser); } catch { /* ignore */ }
                uploadLocationSample({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy: pos.coords.accuracy,
                    timestamp: pos.timestamp
                });
            }
        },
        () => {},
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );
}

function stopDriverGpsTracking() {
    if (window._gpsWatchId !== undefined && window._gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(window._gpsWatchId);
    }
    window._gpsWatchId = null;
    _lastUploadAt = 0;
    if (window.currentUser?.role === "driver") {
        delete window.currentUser.lat;
        delete window.currentUser.lng;
        try { syncUserSession(window.currentUser); } catch { /* session may already be closing */ }
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
    }
}

export {
    configureDriverGpsGate,
    startDriverGpsTracking,
    stopDriverGpsTracking,
    requestNotificationPermission,
    isLiveGpsAllowed
};

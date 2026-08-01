// BusCommand ESM v9.5
import { syncUserSession } from "../auth/login-session.js";

function startDriverGpsTracking() {
    if (!navigator.geolocation) return;
    if (window._gpsWatchId !== undefined && window._gpsWatchId !== null) {
        navigator.geolocation.clearWatch(window._gpsWatchId);
    }
    window._gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            if (window.currentUser && window.currentUser.role === "driver") {
                window.currentUser.lat = pos.coords.latitude;
                window.currentUser.lng = pos.coords.longitude;
                try { syncUserSession(window.currentUser); } catch {}
            }
        },
        () => {}, // GPS odbijen — tiho ignoriši
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );
}

function stopDriverGpsTracking() {
    if (window._gpsWatchId !== undefined && window._gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(window._gpsWatchId);
    }
    window._gpsWatchId = null;
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
    startDriverGpsTracking,
    stopDriverGpsTracking,
    requestNotificationPermission
};

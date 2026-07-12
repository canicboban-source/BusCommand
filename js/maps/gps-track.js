// BusCommand ESM v9.5
import { syncUserSession } from "../auth/login-session.js";

function startDriverGpsTracking() {
    if (!navigator.geolocation) return;
    if (window._gpsWatchId) navigator.geolocation.clearWatch(window._gpsWatchId);
    window._gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            if (window.currentUser && window.currentUser.role === "driver") {
                window.currentUser.lat = pos.coords.latitude;
                window.currentUser.lng = pos.coords.longitude;
                try { syncUserSession(window.currentUser); } catch(e) {}
            }
        },
        () => {}, // GPS odbijen — tiho ignoriši
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
    }
}
export {
    startDriverGpsTracking,
    requestNotificationPermission
};

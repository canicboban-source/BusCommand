// BusCommand — dispatcher live map
import { saveState } from "../core/state.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { t } from "../ui/i18n.js";
import { mapState, ROUTE_GPS_PATHS } from "./map-data.js";

const LOCATION_MAX_AGE_MS = 5 * 60_000;
const FUTURE_TOLERANCE_MS = 60_000;

function list(value) {
    return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

const HTML_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(v) {
    return v == null ? "" : String(v).replace(/[&<>"']/g, (c) => HTML_MAP[c]);
}

function liveCoordinates(driver, now = Date.now()) {
    const s = driver?.lastLocation && typeof driver.lastLocation === "object" ? driver.lastLocation : driver;
    const lat = finiteNumber(s?.latitude ?? s?.lat ?? s?.location?.latitude ?? s?.location?.lat);
    const lng = finiteNumber(s?.longitude ?? s?.lng ?? s?.location?.longitude ?? s?.location?.lng);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const t = s?.recordedAt || s?.updatedAt;
    if (t) {
        const ms = new Date(t).getTime();
        if (Number.isFinite(ms) && (ms > now + 60000 || now - ms > 300000)) return null;
    }
    return [lat, lng];
}

function driverVisibleOnDispatcherMap(driver) {
    if (!driver || driver.active === false) return false;
    const role = window.currentUser?.role;
    if (role === "company_admin" || role === "company-admin") return true;
    const groups = Array.isArray(window.currentUser?.groups) ? window.currentUser.groups : [];
    if (!groups.length) return true;
    const gid = driver.groupId || driver.lineId || null;
    return Boolean(gid && groups.includes(gid));
}

function demoRoutePosition(driver, index) {
    if (!USE_LOCAL_STATE) return null;
    const routes = list(window.state?.routes);
    if (!routes.length) return null;
    const route = routes[index % routes.length];
    if (!route?.id) return null;
    const path = list(ROUTE_GPS_PATHS[route.id] || ROUTE_GPS_PATHS["rt-1"]);
    if (!path.length) return null;
    const position = Number.isInteger(driver?.gpsIndex) ? driver.gpsIndex : 0;
    return { route, path, coords: path[position] || path[0] };
}

function initDispatcherLiveMap() {
    const mapContainer = document.getElementById("dispatcher-live-map");
    if (!mapContainer) return;
    if (typeof L === "undefined") {
        console.error("Leaflet is not loaded yet.");
        return;
    }

    if (mapState.dispatcherMap) {
        mapState.dispatcherMap.invalidateSize();
        updateMapMarkers();
        return;
    }

    mapState.dispatcherMap = L.map("dispatcher-live-map", {
        zoomControl: true,
        fadeAnimation: true
    }).setView([47.95, 16.20], 11);

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20
    }).addTo(mapState.dispatcherMap);

    // Simulated positions are strictly demo-only. Production accepts only
    // coordinates supplied by an authenticated, active driver session.
    if (USE_LOCAL_STATE && !mapState.gpsSimulationInterval) startGpsSimulation();
    updateMapMarkers();

    if (!USE_LOCAL_STATE && !mapState.mapAccessLogged) {
        mapState.mapAccessLogged = true;
        import("../core/api-client.js").then(({ default: ApiClient }) => {
            ApiClient.reportStaffMapAccess?.().catch(() => {});
        }).catch(() => {});
    }
}

function startGpsSimulation() {
    if (!USE_LOCAL_STATE || mapState.gpsSimulationInterval) return;
    mapState.gpsSimulationInterval = setInterval(() => {
        const drivers = list(window.state?.drivers);
        const routes = list(window.state?.routes);
        if (!drivers.length || !routes.length) return;

        drivers.forEach((driver, index) => {
            if (!driver?.active) return;
            const route = routes[index % routes.length];
            if (!route?.id) return;
            const path = list(ROUTE_GPS_PATHS[route.id] || ROUTE_GPS_PATHS["rt-1"]);
            if (path.length < 2) return;

            let direction = driver.gpsDirection || 1;
            let position = Number.isInteger(driver.gpsIndex)
                ? driver.gpsIndex
                : Math.floor(Math.random() * path.length);
            position += direction;
            if (position >= path.length) {
                position = path.length - 2;
                direction = -1;
            } else if (position < 0) {
                position = 1;
                direction = 1;
            }
            driver.gpsIndex = position;
            driver.gpsDirection = direction;

            const stops = list(route.stops);
            if (stops.length) {
                const progress = position / (path.length - 1);
                driver.currentStopIndex = Math.min(Math.floor(progress * stops.length), stops.length - 1);
            }
        });

        saveState();
        if (window.currentUser?.role === "dispatcher") {
            const active = document.querySelector(".content-section:not(.hidden)");
            if (active?.id === "dispatcher-dashboard") {
                renderDispatcherDashboard();
                updateMapMarkers();
            }
        }
    }, 4000);
}

function removeMarker(driverId) {
    const marker = mapState.busMarkers[driverId];
    if (!marker) return;
    if (mapState.dispatcherMap) {
        mapState.dispatcherMap.removeLayer(marker);
    }
    delete mapState.busMarkers[driverId];
}

function updateMapMarkers() {
    if (!mapState.dispatcherMap) return;
    const activeDriverIds = new Set();

    list(window.state?.drivers).forEach((driver, index) => {
        const driverId = driver?.id || driver?.name;
        if (!driverId) return;

        if (!driverVisibleOnDispatcherMap(driver)) {
            removeMarker(driverId);
            return;
        }

        const demoPosition = demoRoutePosition(driver, index);
        const coords = USE_LOCAL_STATE ? demoPosition?.coords : liveCoordinates(driver);
        if (!coords) {
            // No fabricated fallback in production: without a current driver
            // coordinate there must be no marker on the dispatcher map.
            removeMarker(driverId);
            return;
        }

        const route = demoPosition?.route || null;
        const busNumber = driver.bus || "—";
        const driverName = driver.name || [driver.firstName, driver.lastName].filter(Boolean).join(" ") || "—";
        const isSos = Boolean(window.state?.sosActive && (window.state?.sosDriver === driver.name || window.state?.sosDriver === driverId));
        const markerClass = isSos ? "bus-map-marker sos-active-marker" : "bus-map-marker";
        const markerLabel = route?.number || busNumber || "•";
        const safeMarkerLabel = escapeHtml(markerLabel);
        const icon = L.divIcon({
            className: markerClass,
            html: `<span>${safeMarkerLabel}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        const safeBusNumber = escapeHtml(busNumber);
        const safeDriverName = escapeHtml(driverName);
        const safeRouteNum = escapeHtml(route?.number || "—");
        const safeRouteName = escapeHtml(route?.name || "—");
        const popup = `<div style="font-family:'Outfit',sans-serif;font-size:.85rem;line-height:1.4;"><h4 style="margin:0 0 5px;font-size:.95rem;color:${isSos ? "var(--danger-color)" : "var(--primary-color)"};font-weight:700;">${isSos ? `🚨 ${escapeHtml(t("sos_alert_title"))}` : `🚌 ${escapeHtml(t("vehicle"))} ${safeBusNumber}`}</h4><strong>${escapeHtml(t("driver"))}:</strong> ${safeDriverName}<br>${route ? `<strong>${escapeHtml(t("table_route"))}:</strong> ${safeRouteNum} (${safeRouteName})<br>` : ""}<strong>${escapeHtml(t("current_location"))}:</strong> ${escapeHtml(t("gps_live") || "GPS live")}</div>`;

        activeDriverIds.add(driverId);
        const existing = mapState.busMarkers[driverId];
        if (existing) {
            existing.setLatLng(coords);
            existing.setPopupContent(popup);
            existing.setIcon(icon);
        } else {
            mapState.busMarkers[driverId] = L.marker(coords, { icon })
                .bindPopup(popup)
                .addTo(mapState.dispatcherMap);
        }
    });

    Object.keys(mapState.busMarkers).forEach(driverId => {
        if (!activeDriverIds.has(driverId)) removeMarker(driverId);
    });
}

export {
    initDispatcherLiveMap,
    startGpsSimulation,
    updateMapMarkers,
    removeMarker,
    liveCoordinates,
    escapeHtml
};
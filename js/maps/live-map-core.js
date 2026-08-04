// BusCommand — dispatcher live map
import { saveState } from "../core/state.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { t } from "../ui/i18n.js";
import { mapState, ROUTE_GPS_PATHS } from "./map-data.js";

function list(value) {
    return Array.isArray(value) ? value : [];
}

function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function liveCoordinates(driver) {
    const source = driver?.lastLocation && typeof driver.lastLocation === "object"
        ? driver.lastLocation
        : driver;
    const lat = finiteNumber(source?.latitude ?? source?.lat ?? source?.location?.latitude ?? source?.location?.lat);
    const lng = finiteNumber(source?.longitude ?? source?.lng ?? source?.location?.longitude ?? source?.location?.lng);
    return lat === null || lng === null ? null : [lat, lng];
}

function driverVisibleOnDispatcherMap(driver) {
    if (!driver?.name || driver.active === false) return false;
    const role = window.currentUser?.role;
    if (role === "company_admin" || role === "company-admin") return true;
    const groups = Array.isArray(window.currentUser?.groups) ? window.currentUser.groups : [];
    if (!groups.length) return true;
    const gid = driver.groupId || driver.lineId || null;
    return Boolean(gid && groups.includes(gid));
}

function demoRoutePosition(driver, index) {
    if (!IS_DEMO_MODE) return null;
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
    if (IS_DEMO_MODE && !mapState.gpsSimulationInterval) startGpsSimulation();
    updateMapMarkers();

    if (!IS_DEMO_MODE && !mapState.mapAccessLogged) {
        mapState.mapAccessLogged = true;
        import("../core/api-client.js").then(({ default: ApiClient }) => {
            ApiClient.reportStaffMapAccess?.().catch(() => {});
        }).catch(() => {});
    }
}

function startGpsSimulation() {
    if (!IS_DEMO_MODE || mapState.gpsSimulationInterval) return;
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

function removeMarker(driverName) {
    const marker = mapState.busMarkers[driverName];
    if (!marker || !mapState.dispatcherMap) return;
    mapState.dispatcherMap.removeLayer(marker);
    delete mapState.busMarkers[driverName];
}

function updateMapMarkers() {
    if (!mapState.dispatcherMap) return;
    const activeDriverNames = new Set();

    list(window.state?.drivers).forEach((driver, index) => {
        if (!driverVisibleOnDispatcherMap(driver)) {
            if (driver?.name) removeMarker(driver.name);
            return;
        }

        const demoPosition = demoRoutePosition(driver, index);
        const coords = IS_DEMO_MODE ? demoPosition?.coords : liveCoordinates(driver);
        if (!coords) {
            // No fabricated fallback in production: without a current driver
            // coordinate there must be no marker on the dispatcher map.
            removeMarker(driver.name);
            return;
        }

        const route = demoPosition?.route || null;
        const busNumber = driver.bus || "—";
        const isSos = Boolean(window.state?.sosActive && window.state?.sosDriver === driver.name);
        const markerClass = isSos ? "bus-map-marker sos-active-marker" : "bus-map-marker";
        const markerLabel = route?.number || busNumber || "•";
        const icon = L.divIcon({
            className: markerClass,
            html: `<span>${markerLabel}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        const popup = `<div style="font-family:'Outfit',sans-serif;font-size:.85rem;line-height:1.4;">
            <h4 style="margin:0 0 5px;font-size:.95rem;color:${isSos ? "var(--danger-color)" : "var(--primary-color)"};font-weight:700;">
                ${isSos ? `🚨 ${t("sos_alert_title")}` : `🚌 ${t("vehicle")} ${busNumber}`}
            </h4>
            <strong>${t("driver")}:</strong> ${driver.name}<br>
            ${route ? `<strong>${t("table_route")}:</strong> ${route.number || "—"} (${route.name || "—"})<br>` : ""}
            <strong>${t("current_location")}:</strong> ${t("gps_live") || "GPS live"}
        </div>`;

        activeDriverNames.add(driver.name);
        const existing = mapState.busMarkers[driver.name];
        if (existing) {
            existing.setLatLng(coords);
            existing.setPopupContent(popup);
            existing.setIcon(icon);
        } else {
            mapState.busMarkers[driver.name] = L.marker(coords, { icon })
                .bindPopup(popup)
                .addTo(mapState.dispatcherMap);
        }
    });

    Object.keys(mapState.busMarkers).forEach(name => {
        if (!activeDriverNames.has(name)) removeMarker(name);
    });
}

export {
    initDispatcherLiveMap,
    startGpsSimulation,
    updateMapMarkers
};

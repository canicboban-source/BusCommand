// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { t } from "../ui/i18n.js";
import { mapState, ROUTE_GPS_PATHS } from "./map-data.js";

// Inicijalizacija Leaflet mape
function initDispatcherLiveMap() {
    const mapContainer = document.getElementById("dispatcher-live-map");
    if (!mapContainer) return;
    
    // Provera da li Leaflet postoji (L)
    if (typeof L === 'undefined') {
        console.error("Leaflet is not loaded yet.");
        return;
    }
    
    // Ako mapa već postoji, samo osveži dimenzije i markere
    if (mapState.dispatcherMap) {
        mapState.dispatcherMap.invalidateSize();
        updateMapMarkers();
        return;
    }
    
    // Kreiranje mape centrirane na Baden / Teesdorf regiju
    mapState.dispatcherMap = L.map('dispatcher-live-map', {
        zoomControl: true,
        fadeAnimation: true
    }).setView([47.95, 16.20], 11);
    
    // Uvoz tamne teme za mapu (CartoDB Dark Matter) za premium estetiku
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(mapState.dispatcherMap);
    
    // Pokretanje GPS simulacije ako već nije pokrenuta
    if (!mapState.gpsSimulationInterval) {
        startGpsSimulation();
    }
    
    updateMapMarkers();
}

// Simulacija kretanja autobusa
function startGpsSimulation() {
    mapState.gpsSimulationInterval = setInterval(() => {
        window.state.drivers.forEach((drv, index) => {
            if (!drv.active) return;
            
            const route = window.state.routes[index % window.state.routes.length];
            const path = ROUTE_GPS_PATHS[route.id] || ROUTE_GPS_PATHS["rt-1"];
            
            let direction = drv.gpsDirection || 1;
            let currentGpsIdx = drv.gpsIndex !== undefined ? drv.gpsIndex : Math.floor(Math.random() * path.length);
            
            currentGpsIdx += direction;
            
            if (currentGpsIdx >= path.length) {
                currentGpsIdx = path.length - 2;
                direction = -1;
            } else if (currentGpsIdx < 0) {
                currentGpsIdx = 1;
                direction = 1;
            }
            
            drv.gpsIndex = currentGpsIdx;
            drv.gpsDirection = direction;
            
            // Sinhronizujemo trenutnu stanicu na osnovu približne pozicije u GPS nizu
            const stopPercent = currentGpsIdx / (path.length - 1);
            const stopIdx = Math.min(Math.floor(stopPercent * route.stops.length), route.stops.length - 1);
            drv.currentStopIndex = stopIdx;
        });
        
        saveState();
        
        // Osveži tabelu i markere ako smo na dispečerskom dashboard-u
        if (window.currentUser && window.currentUser.role === "dispatcher") {
            const activeSection = document.querySelector(".content-section:not(.hidden)");
            if (activeSection && activeSection.id === "dispatcher-dashboard") {
                renderDispatcherDashboard();
                updateMapMarkers();
            }
        }
    }, 4000);
}

// Ažuriranje markera na mapi uživo
function updateMapMarkers() {
    if (!mapState.dispatcherMap) return;
    
    const activeDriverIds = new Set();
    
    window.state.drivers.forEach((drv, index) => {
        if (!drv.active) {
            // Ako je vozač neaktivan, ukloni marker ako postoji
            if (mapState.busMarkers[drv.name]) {
                mapState.dispatcherMap.removeLayer(mapState.busMarkers[drv.name]);
                delete mapState.busMarkers[drv.name];
            }
            return;
        }
        
        const busNum = drv.bus || (window.state.buses[index % window.state.buses.length]?.number || "N/A");
        const route = window.state.routes[index % window.state.routes.length];
        const path = ROUTE_GPS_PATHS[route.id] || ROUTE_GPS_PATHS["rt-1"];
        
        const currentGpsIdx = drv.gpsIndex !== undefined ? drv.gpsIndex : 0;
        const coords = path[currentGpsIdx] || path[0];
        
        activeDriverIds.add(drv.name);
        
        // Proveri da li je SOS aktivan za ovog vozača
        const isSOSForDriver = window.state.sosActive && window.state.sosDriver === drv.name;
        
        // Kreiraj ikonicu markera
        const markerClass = isSOSForDriver ? "bus-map-marker sos-active-marker" : "bus-map-marker";
        const busLabel = route.number;
        
        const customIcon = L.divIcon({
            className: markerClass,
            html: `<span>${busLabel}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const popupContent = `
            <div style="font-family:'Outfit',sans-serif; font-size:0.85rem; line-height:1.4;">
                <h4 style="margin:0 0 5px 0; font-size:0.95rem; color:${isSOSForDriver ? 'var(--danger-color)' : 'var(--primary-color)'}; font-weight:700;">
                    ${isSOSForDriver ? '🚨 ' + t("sos_alert_title") : '🚌 ' + t("vehicle") + ' ' + busNum}
                </h4>
                <strong>${t("driver")}:</strong> ${drv.name}<br>
                <strong>${t("table_route")}:</strong> ${route.number} (${route.name})<br>
                <strong>${t("current_location")}:</strong> ${route.stops[drv.currentStopIndex || 0] || t("no_data")}
            </div>
        `;
        
        if (mapState.busMarkers[drv.name]) {
            // Pomeri postojeći marker
            mapState.busMarkers[drv.name].setLatLng(coords);
            mapState.busMarkers[drv.name].setPopupContent(popupContent);
            
            // Ažuriraj ikonicu (ako se promenilo SOS stanje)
            const oldIcon = mapState.busMarkers[drv.name].options.icon;
            if (oldIcon.options.className !== markerClass) {
                mapState.busMarkers[drv.name].setIcon(customIcon);
            }
        } else {
            // Kreiraj novi marker
            const marker = L.marker(coords, { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(mapState.dispatcherMap);
            
            mapState.busMarkers[drv.name] = marker;
        }
    });
    
    // Obriši stare markere za vozače koji više nisu aktivni
    for (const name in mapState.busMarkers) {
        if (!activeDriverIds.has(name)) {
            mapState.dispatcherMap.removeLayer(mapState.busMarkers[name]);
            delete mapState.busMarkers[name];
        }
    }
}

export {
    initDispatcherLiveMap,
    startGpsSimulation,
    updateMapMarkers
};

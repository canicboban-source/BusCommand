// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { syncUserSession } from "../auth/login-session.js";
import { showToast } from "../core/utils.js";
import { renderDriverDashboard } from "../driver/dashboard.js";
import { dayseed } from "./helpers.js";
import { t } from "../ui/i18n.js";

// --- RENDEROVANJE STANICA TRASIRANJA ---
function renderRouteStops() {
    const container = document.getElementById("route-stops-container");
    if (!container) return;
    container.innerHTML = "";
    
    const route = window.state.routes.find(r => r.id === window.currentUser.routeId) || window.state.routes[0];
    
    route.stops.forEach((stop, index) => {
        const div = document.createElement("div");
        div.className = "stop-item-row";
        
        let statusText = t("stop_planned");
        
        if (index < window.currentUser.currentStopIndex) {
            statusText = t("stop_passed");
        } else if (index === window.currentUser.currentStopIndex) {
            statusText = t("stop_next");
        }
        
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.05); cursor:pointer; transition:var(--transition-fast); background:" + 
            (index === window.currentUser.currentStopIndex ? "rgba(var(--primary-rgb), 0.1)" : "rgba(255,255,255,0.02)") + ";";
        
        if (index === window.currentUser.currentStopIndex) {
            div.style.borderColor = "var(--primary-color)";
        }
        
        div.onclick = () => checkInStop(index);
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="width:24px; height:24px; border-radius:50%; background:${index <= window.currentUser.currentStopIndex ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">
                    ${index + 1}
                </span>
                <span style="font-weight:600; color:${index === window.currentUser.currentStopIndex ? 'var(--text-main)' : 'var(--text-muted)'};">${stop}</span>
            </div>
            <div style="font-size:0.75rem; font-weight:700; color:${index === window.currentUser.currentStopIndex ? 'var(--primary-color)' : (index < window.currentUser.currentStopIndex ? 'var(--success-color)' : 'var(--text-muted-dark)')};">
                ${statusText}
            </div>
        `;
        container.appendChild(div);
    });
}

function checkInStop(index) {
    if (index === window.currentUser.currentStopIndex) {
        const route = window.state.routes.find(r => r.id === window.currentUser.routeId) || window.state.routes[0];
        if (window.currentUser.currentStopIndex < route.stops.length - 1) {
            window.currentUser.currentStopIndex++;
            syncUserSession(window.currentUser);
            
            const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
            if (driver) {
                driver.currentStopIndex = window.currentUser.currentStopIndex;
                saveState();
            }
            
            renderDriverDashboard();
        } else {
            showToast(t("js_alert_route_done"), "success");
        }
    }
}

function resetRouteProgress() {
    window.currentUser.currentStopIndex = 0;
    syncUserSession(window.currentUser);
    
    const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
    if (driver) {
        driver.currentStopIndex = 0;
        saveState();
    }
    
    renderDriverDashboard();
}

// --- CRTANJE SHEMATSKE SVG MAPE TRASERSTVA ---
function renderRouteSchematicSVG() {
    const driverContainer = document.getElementById("route-schematic-container");
    const dispContainer = document.getElementById("disp-route-schematic-container");
    
    const container = (window.currentUser && window.currentUser.role === "driver") ? driverContainer : dispContainer;
    if (!container) return;
    
    container.innerHTML = "";
    
    let route, currentIdx;
    
    if (window.currentUser && window.currentUser.role === "driver") {
        route = window.state.routes.find(r => r.id === window.currentUser.routeId) || window.state.routes[0];
        currentIdx = window.currentUser.currentStopIndex;
    } else {
        const select = document.getElementById("disp-quick-driver-select");
        const driverName = select ? select.value : "";
        const driver = window.state.drivers.find(d => d.name === driverName);
        if (driver) {
            const driverIndex = window.state.drivers.indexOf(driver);
            route = window.state.routes[driverIndex % window.state.routes.length];
            currentIdx = driver.currentStopIndex !== undefined ? driver.currentStopIndex : (dayseed(driverIndex) % route.stops.length);
        } else {
            route = window.state.routes[0];
            currentIdx = 0;
        }
    }
    
    if (!route || !route.stops || route.stops.length === 0) return;
    
    const numStops = route.stops.length;
    const width = 600;
    const height = 80;
    const padding = 40;
    const step = (width - padding * 2) / Math.max(1, numStops - 1);
    
    let svgHtml = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="80px" style="overflow: visible;">`;
    
    // Pozadinska linija trase
    svgHtml += `<line x1="${padding}" y1="${height/2}" x2="${width - padding}" y2="${height/2}" stroke="rgba(255,255,255,0.15)" stroke-width="4" stroke-linecap="round" />`;
    
    // Aktivna linija za pređeni put
    if (currentIdx > 0) {
        const activeX = padding + currentIdx * step;
        svgHtml += `<line x1="${padding}" y1="${height/2}" x2="${activeX}" y2="${height/2}" stroke="var(--primary-color)" stroke-width="4" stroke-linecap="round" />`;
    }
    
    // Crtanje stanica (čvorova)
    route.stops.forEach((stop, i) => {
        const cx = padding + i * step;
        const cy = height / 2;
        
        let color = "rgba(255, 255, 255, 0.3)";
        let radius = 6;
        let fontStyle = "fill: var(--text-muted); font-size: 8px; font-weight: 500;";
        let isCurrent = (i === currentIdx);
        let isPassed = (i < currentIdx);
        
        if (isCurrent) {
            color = "var(--primary-color)";
            radius = 10;
            fontStyle = "fill: var(--text-main); font-weight: 700; font-size: 9px;";
            
            // Pulsirajući prsten oko trenutne stanice
            svgHtml += `<circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="var(--primary-color)" stroke-width="2" opacity="0.5">
                            <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                        </circle>`;
        } else if (isPassed) {
            color = "var(--success-color)";
            radius = 7;
            fontStyle = "fill: var(--text-muted); font-size: 8px;";
        }
        
        // Kružić stanice
        svgHtml += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" stroke="#05070c" stroke-width="2" style="cursor: pointer;" />`;
        
        // Naziv stanice (uklanjamo platforme / brojeve na kraju radi preglednosti)
        const displayName = stop.replace(/\s\d+$/, "");
        
        // Naizmenična visina naziva da se ne bi preklapali
        const textY = (i % 2 === 0) ? cy - 18 : cy + 22;
        
        svgHtml += `<text x="${cx}" y="${textY}" text-anchor="middle" style="${fontStyle}">${displayName}</text>`;
    });
    
    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}
export {
    renderRouteStops,
    checkInStop,
    resetRouteProgress,
    renderRouteSchematicSVG
};

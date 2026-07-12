// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { syncUserSession } from "../auth/login-session.js";
import { showToast } from "../core/utils.js";
import { getCurrentShiftForDriver } from "../dispatcher/shift-utils.js";
import { renderDriverMessages } from "./messages-inbox.js";
import { startSOSSiren, stopSOSSiren } from "../maps/sos-siren.js";
import { t } from "../ui/i18n.js";

function renderDriverDashboard() {
    // Prikaz dnevnog rasporeda od dispečera
    if (typeof loadDriverScheduleForToday === 'function') loadDriverScheduleForToday();

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthNum = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();
    
    const currentYearMonth = `${currentYear}-${String(currentMonthNum).padStart(2, "0")}`;
    const todayShift = getCurrentShiftForDriver(window.currentUser.name, currentYearMonth, currentDay);
    
    if (todayShift && todayShift.type !== "off" && todayShift.type !== "vacation") {
        const parsedBus = todayShift.name.match(/\b(91\d{3})\b/);
        if (parsedBus) window.currentUser.bus = parsedBus[1];
        
        const lineCode = todayShift.name.match(/^(\d{3})/);
        if (lineCode) {
            const foundRoute = window.state.routes.find(r => r.number === lineCode[1]);
            if (foundRoute) {
                window.currentUser.routeId = foundRoute.id;
            }
        }
        
        document.getElementById("driver-shift-type").innerText = todayShift.type === "morning" ? t("shift_morning") : t("shift_afternoon");
    } else {
        document.getElementById("driver-shift-type").innerText = t("shift_off");
    }
    
    const route = window.state.routes.find(r => r.id === window.currentUser.routeId) || window.state.routes[0];
    
    document.getElementById("driver-route-num").innerText = route.number;
    document.getElementById("driver-route-name").innerText = route.name;
    document.getElementById("driver-bus-num").innerText = window.currentUser.bus;
    
    const activeDelay = window.state.reports.find(r => r.driver === window.currentUser.name && r.status === "Aktivno" && r.type.includes("Kašnjenje"));
    const delayStatusLabel = document.getElementById("driver-delay-status");
    if (activeDelay) {
        const mins = activeDelay.type.startsWith("delay:") ? activeDelay.type.replace("delay:", "") : (activeDelay.type.match(/\d+/) ? activeDelay.type.match(/\d+/)[0] : "15");
        const minVal = mins;
        delayStatusLabel.innerText = t("status_delay_fmt", { min: minVal });
        delayStatusLabel.className = "status-delay";
    } else {
        delayStatusLabel.innerText = t("status_no_delay");
        delayStatusLabel.className = "status-ok";
    }
    
    const lang = window.state.language || "en";
    const localeMap = {
        en: "en-GB", de: "de-AT", sr: "sr-Latn-RS",
        hr: "hr-HR", fr: "fr-FR", it: "it-IT",
        pl: "pl-PL", cs: "cs-CZ"
    };
    const locale = localeMap[lang] || "en-GB";
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById("current-date-badge").innerText = new Date().toLocaleDateString(locale, options);
    
    renderStopsTimeline(route.stops);
    renderDriverMessages();
    checkSOSStatus();
}

function renderStopsTimeline(stops) {
    const container = document.getElementById("stops-timeline-container");
    if (!container) return;
    container.innerHTML = "";
    
    stops.forEach((stop, index) => {
        const div = document.createElement("div");
        div.className = "stop-item";
        
        if (index < window.currentUser.currentStopIndex) {
            div.classList.add("passed");
        } else if (index === window.currentUser.currentStopIndex) {
            div.classList.add("next");
        }
        
        div.onclick = () => checkInAtStop(index);
        
        let stopStatusText = t("stop_planned");
        if (index < window.currentUser.currentStopIndex) {
            stopStatusText = `<i class="lucide-icon" data-lucide="check" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>` + t("stop_passed");
        } else if (index === window.currentUser.currentStopIndex) {
            stopStatusText = t("stop_next");
        }
        
        div.innerHTML = `
            <div class="stop-marker"></div>
            <div class="stop-info">
                <span class="stop-name">${stop}</span>
                <span class="stop-time">${stopStatusText}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

function checkInAtStop(index) {
    const route = window.state.routes.find(r => r.id === window.currentUser.routeId) || window.state.routes[0];
    
    if (index === window.currentUser.currentStopIndex) {
        window.currentUser.currentStopIndex++;
        if (window.currentUser.currentStopIndex >= route.stops.length) {
            showToast(t("js_alert_route_done"), "success");
            window.currentUser.currentStopIndex = 0;
        }
        syncUserSession(window.currentUser);
        renderDriverDashboard();
        lucide.createIcons();
    }
}

// --- HITAN SOS ALARM LOGIKA ---
function triggerSOSAlert() {
    const modal = document.getElementById("sos-trigger-modal");
    if (!modal) return;
    // Translate modal text
    const titleEl = modal.querySelector("[data-i18n='sos_trigger_title']");
    const bodyEl  = modal.querySelector("[data-i18n='js_confirm_sos']");
    const btnEl   = modal.querySelector("[data-i18n='sos_trigger_btn']");
    if (titleEl) titleEl.textContent = t("sos_trigger_title") || "SOS ALARM";
    if (bodyEl)  bodyEl.textContent  = t("js_confirm_sos");
    if (btnEl)   btnEl.textContent   = t("sos_trigger_btn") || "🚨 SEND SOS";
    modal.classList.remove("hidden");
    lucide.createIcons();
}

function closeSosTriggerModal() {
    const modal = document.getElementById("sos-trigger-modal");
    if (modal) modal.classList.add("hidden");
}

function confirmSOSTrigger() {
    closeSosTriggerModal();
    window.state.sosActive = true;
    window.state.sosDriver = window.currentUser.name;
    window.state.sosBus = window.currentUser.bus;
    saveState();
    checkSOSStatus();
    showToast(t("js_alert_sos_sent") || "SOS alarm sent!", "error");
}

function checkSOSStatus() {
    const dispBanner = document.getElementById("dispatcher-sos-banner");
    const driverBanner = document.getElementById("driver-sos-banner");

    if (window.state.sosActive) {
        if (window.currentUser && window.currentUser.role === "dispatcher") {
            if (dispBanner) {
                // Inline styles — zaobilazi svaki CSS specificity ili cache problem
                dispBanner.style.cssText = `
                    display: flex !important;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 16px 24px;
                    background-color: #b91c1c;
                    border-bottom: 3px solid #fca5a5;
                    animation: sosPulse 0.8s ease-in-out infinite, sosBorderPulse 0.8s ease-in-out infinite;
                    position: relative;
                    z-index: 9000;
                `;
                dispBanner.classList.remove("hidden");

                // Popuni podatke o vozaču i busu
                const infoEl = document.getElementById("dispatcher-sos-info");
                if (infoEl) {
                    infoEl.style.cssText = "display:block; color:#fff; font-size:0.92rem; font-weight:600; margin-top:4px;";
                    infoEl.innerText = `🚌 ${t("vehicle")} ${window.state.sosBus} — ${window.state.sosDriver}`;
                }

                // Titl
                const titleEl = dispBanner.querySelector("strong");
                if (titleEl) {
                    titleEl.style.cssText = "display:block; color:#fff; font-size:1.05rem; font-weight:900; letter-spacing:1px; text-transform:uppercase;";
                    titleEl.innerText = "⚠ " + t("sos_alert_title");
                }

                // Dugme
                const btn = dispBanner.querySelector(".btn-sos-resolve");
                if (btn) {
                    btn.style.cssText = `
                        background: white;
                        color: #b91c1c;
                        border: none;
                        padding: 10px 22px;
                        border-radius: 10px;
                        font-size: 0.88rem;
                        font-weight: 800;
                        cursor: pointer;
                        white-space: nowrap;
                        font-family: 'Outfit', sans-serif;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        flex-shrink: 0;
                    `;
                }

                // Ikona
                const icon = dispBanner.querySelector(".pulse-icon");
                if (icon) {
                    icon.style.cssText = "color:#fff; width:32px; height:32px; flex-shrink:0; animation: sosIconPulse 0.8s ease-in-out infinite;";
                }

                startSOSSiren();
            }
            if (driverBanner) driverBanner.classList.add("hidden");

        } else if (window.currentUser && window.currentUser.role === "driver" && window.currentUser.name === window.state.sosDriver) {
            if (driverBanner) driverBanner.classList.remove("hidden");
            if (dispBanner) { dispBanner.style.display = "none"; }
        } else {
            if (dispBanner) { dispBanner.style.display = "none"; }
            if (driverBanner) driverBanner.classList.add("hidden");
        }
    } else {
        if (dispBanner) {
            dispBanner.style.display = "none";
            dispBanner.classList.add("hidden");
        }
        if (driverBanner) driverBanner.classList.add("hidden");
        stopSOSSiren();
    }
}

function resolveSOS() {
    window.state.sosActive = false;
    window.state.sosDriver = "";
    window.state.sosBus = "";
    saveState();
    
    checkSOSStatus();
    showToast(t("js_alert_sos_resolved"), "success");
}
export {
    renderDriverDashboard,
    renderStopsTimeline,
    checkInAtStop,
    triggerSOSAlert,
    closeSosTriggerModal,
    confirmSOSTrigger,
    checkSOSStatus,
    resolveSOS
};

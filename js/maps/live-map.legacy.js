// Auto-extracted from app.js (lines 4534-5405)
function dayseed(index) {
    const today = new Date();
    // Vraća determinističku vrednost na osnovu dana u mesecu i indeksa
    return today.getDate() + index;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
            // Pretvara YYYY-MM-DD u DD.MM.
            return `${parseInt(parts[2])}.${parseInt(parts[1])}.`;
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}

// --- DVOSTRANA SIMULACIJA U REALNOM VREMENU IZMEĐU PROZORA (REAL-TIME TAB SYNC) ---
window.addEventListener('storage', (e) => {
    const key = getStateStorageKey(COMPANY_ID);
    if (e.key === key) {
        const saved = localStorage.getItem(key);
        if (!saved) return;
        try {
            state = { ...getBaseState(), ...JSON.parse(saved) };
        } catch(ex) {}
        if (currentUser) {
            const activeSection = document.querySelector(".content-section:not(.hidden)");
            if (activeSection) {
                switchSection(activeSection.id);
            }
        }
    }
});

// --- PREMIUM GPS MAPE, SOS SIRENA I PRIJAVA OŠTEĆENJA ---

// Globalne promenljive za mapu i praćenje
let dispatcherMap = null;
let busMarkers = {};
let gpsSimulationInterval = null;

// Koordinate ruta za GPS simulaciju (Regija Baden - Teesdorf - Wiener Neustadt, Austrija)
const ROUTE_GPS_PATHS = {
    "rt-1": [
        [48.0076, 16.2341], // Baden Bahnhof
        [47.9942, 16.2483], // Baden Leesdorf
        [47.9822, 16.2555], // Baden Landesklinikum
        [47.9711, 16.2621], // Tribuswinkel Schlehengasse
        [47.9622, 16.2733], // Oeynhausen Haberlgasse
        [47.9422, 16.2911], // Oberwaltersdorf Schloßsee
        [47.9234, 16.3012], // Tattendorf Gemeindeamt
        [47.9155, 16.2811]  // Teesdorf Volksschule
    ],
    "rt-2": [
        [47.9286, 16.2167], // Leobersdorf Bahnhof
        [47.9177, 16.1822], // Enzesfeld
        [47.9044, 16.1555], // Lindabrunn
        [47.9122, 16.1211], // Aigen
        [47.9022, 16.0788]  // Hernstein
    ],
    "rt-3": [
        [47.9534, 16.0967], // Pottenstein Fabriksgasse
        [47.9433, 16.1111], // Berndorf Gymnasium
        [47.9312, 16.1311], // St. Veit
        [47.9222, 16.1534], // Hirtenberg
        [47.9188, 16.1777], // Enzesfeld-Lindabrunn Bahnhof
        [47.9286, 16.2167], // Leobersdorf Bahnhof
        [47.9455, 16.2234], // Kottingbrunn Wasserschloss
        [47.9678, 16.2189]  // Bad Vöslau Bahnhof
    ],
    "rt-4": [
        [47.9155, 16.2811], // Teesdorf Mittelschule
        [47.9088, 16.2755], // Neurißhof
        [47.9011, 16.2889], // Blumau
        [47.8922, 16.2555], // Sollenau
        [47.8822, 16.2422], // Felixdorf Bahnhof
        [47.8544, 16.2467], // Siedlung Maria Theresia
        [47.8422, 16.2488], // Theresienfeld
        [47.8188, 16.2455]  // Wiener Neustadt Hauptbahnhof
    ]
};

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
    if (dispatcherMap) {
        dispatcherMap.invalidateSize();
        updateMapMarkers();
        return;
    }
    
    // Kreiranje mape centrirane na Baden / Teesdorf regiju
    dispatcherMap = L.map('dispatcher-live-map', {
        zoomControl: true,
        fadeAnimation: true
    }).setView([47.95, 16.20], 11);
    
    // Uvoz tamne teme za mapu (CartoDB Dark Matter) za premium estetiku
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(dispatcherMap);
    
    // Pokretanje GPS simulacije ako već nije pokrenuta
    if (!gpsSimulationInterval) {
        startGpsSimulation();
    }
    
    updateMapMarkers();
}

// Simulacija kretanja autobusa
function startGpsSimulation() {
    gpsSimulationInterval = setInterval(() => {
        state.drivers.forEach((drv, index) => {
            if (!drv.active) return;
            
            const route = state.routes[index % state.routes.length];
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
        if (currentUser && currentUser.role === "dispatcher") {
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
    if (!dispatcherMap) return;
    
    const activeDriverIds = new Set();
    
    state.drivers.forEach((drv, index) => {
        if (!drv.active) {
            // Ako je vozač neaktivan, ukloni marker ako postoji
            if (busMarkers[drv.name]) {
                dispatcherMap.removeLayer(busMarkers[drv.name]);
                delete busMarkers[drv.name];
            }
            return;
        }
        
        const busNum = drv.bus || state.buses[index % state.buses.length].number;
        const route = state.routes[index % state.routes.length];
        const path = ROUTE_GPS_PATHS[route.id] || ROUTE_GPS_PATHS["rt-1"];
        
        const currentGpsIdx = drv.gpsIndex !== undefined ? drv.gpsIndex : 0;
        const coords = path[currentGpsIdx] || path[0];
        
        activeDriverIds.add(drv.name);
        
        // Proveri da li je SOS aktivan za ovog vozača
        const isSOSForDriver = state.sosActive && state.sosDriver === drv.name;
        
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
        
        if (busMarkers[drv.name]) {
            // Pomeri postojeći marker
            busMarkers[drv.name].setLatLng(coords);
            busMarkers[drv.name].setPopupContent(popupContent);
            
            // Ažuriraj ikonicu (ako se promenilo SOS stanje)
            const oldIcon = busMarkers[drv.name].options.icon;
            if (oldIcon.options.className !== markerClass) {
                busMarkers[drv.name].setIcon(customIcon);
            }
        } else {
            // Kreiraj novi marker
            const marker = L.marker(coords, { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(dispatcherMap);
            
            busMarkers[drv.name] = marker;
        }
    });
    
    // Obriši stare markere za vozače koji više nisu aktivni
    for (const name in busMarkers) {
        if (!activeDriverIds.has(name)) {
            dispatcherMap.removeLayer(busMarkers[name]);
            delete busMarkers[name];
        }
    }
}

// --- WEB AUDIO API SOS SIRENA ---
let audioCtx = null;
let sirenOscillator = null;
let sirenGainNode = null;
let sirenInterval = null;

function startSOSSiren() {
    if (sirenInterval) return; // Već svira
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    } catch (e) {
        console.error("Web Audio API nije podržan na ovom pretraživaču", e);
        return;
    }
    
    sirenGainNode = audioCtx.createGain();
    sirenGainNode.gain.setValueAtTime(0.25, audioCtx.currentTime); // Umerena jačina zvuka
    sirenGainNode.connect(audioCtx.destination);
    
    sirenOscillator = audioCtx.createOscillator();
    sirenOscillator.type = 'sawtooth'; // Oštriji, piskavi ton alarma
    sirenOscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    sirenOscillator.connect(sirenGainNode);
    sirenOscillator.start();
    
    let stateToggle = false;
    sirenInterval = setInterval(() => {
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        // Naizmenično menjaj visinu tona za sirenu
        sirenOscillator.frequency.setValueAtTime(stateToggle ? 900 : 500, now);
        stateToggle = !stateToggle;
    }, 450);
}

function stopSOSSiren() {
    if (sirenInterval) {
        clearInterval(sirenInterval);
        sirenInterval = null;
    }
    if (sirenOscillator) {
        try {
            sirenOscillator.stop();
            sirenOscillator.disconnect();
        } catch (e) {}
        sirenOscillator = null;
    }
    if (sirenGainNode) {
        sirenGainNode.disconnect();
        sirenGainNode = null;
    }
    if (audioCtx) {
        try {
            audioCtx.close();
        } catch (e) {}
        audioCtx = null;
    }
}

// --- PREGLED SLIKA OŠTEĆENJA ---
function viewDamagePhoto(driverName) {
    const driver = state.drivers.find(d => d.name === driverName);
    if (!driver || !driver.damagePhoto) return;
    
    const modal = document.getElementById("schedule-viewer-modal");
    const title = document.getElementById("schedule-viewer-title");
    const body = document.getElementById("schedule-viewer-body");
    const downloadLink = document.getElementById("schedule-download-link");
    
    if (!modal || !title || !body || !downloadLink) return;
    
    const lang = state.language || "sr";
    if (lang === "de") {
        title.innerText = `Fahrzeugschaden - ${driverName}`;
    } else if (lang === "en") {
        title.innerText = `Vehicle Damage - ${driverName}`;
    } else {
        title.innerText = `Oštećenje vozila - ${driverName}`;
    }
    
    body.innerHTML = `<img src="${driver.damagePhoto}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:var(--radius-sm); box-shadow: 0 4px 15px rgba(0,0,0,0.4);">`;
    
    downloadLink.href = driver.damagePhoto;
    downloadLink.download = `ostecenje_${driverName.replace(/\s+/g, '_')}.png`;
    
    modal.classList.remove("hidden");
    lucide.createIcons();
}

// --- GLASOVNA NAJAVA PORUKA (TEXT-TO-SPEECH) ---
function speakMessage(text, lang) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        
        // Očisti tekst od eventualnih HTML tagova
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = text;
        const cleanText = tempDiv.textContent || tempDiv.innerText || "";
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        let langCode = 'de-DE';
        if (lang === 'en') langCode = 'en-US';
        else if (lang === 'sr') langCode = 'sr-RS';
        
        utterance.lang = langCode;
        
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang.startsWith(langCode));
        if (voice) {
            utterance.voice = voice;
        }
        
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.error("Greška pri reprodukciji glasa:", e);
    }
}

// --- BRZE PRIJAVE SA DASHBOARDA (QUICK REPORTS) ---
function sendQuickReport(type) {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let reportType = "";
    let reason = "";
    let severity = "sev_low";
    
    if (type === 'Stau') {
        reportType = `delay:10`;
        reason = t("reason_traffic");
        severity = "sev_low";
    } else if (type === 'Panne') {
        reportType = `breakdown:bd_engine`;
        reason = t("qr_breakdown");
        severity = "sev_critical";
    } else if (type === 'Bus Voll') {
        reportType = `delay:5`;
        reason = t("reason_passengers");
        severity = "sev_low";
    } else if (type === 'Verspatung') {
        reportType = `delay:5`;
        reason = t("reason_traffic");
        severity = "sev_low";
    }
    
    const newReport = {
        id: `rep-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: reportType,
        reason: reason,
        severity: severity,
        status: "Aktivno"
    };
    
    state.reports.unshift(newReport);
    saveState();
    
    // Ako je dispečerska uloga otvorena negde, storage listener će preneti, ali lokalno ažuriramo dashboard
    renderDriverDashboard();
    
    const msg = type === 'Panne' ? t("js_alert_breakdown_sent") : t("js_alert_delay_sent");
    showToast(msg, type === 'Panne' ? "warning" : "success");
}

// --- RENDEROVANJE STANICA TRASIRANJA ---
function renderRouteStops() {
    const container = document.getElementById("route-stops-container");
    if (!container) return;
    container.innerHTML = "";
    
    const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
    
    route.stops.forEach((stop, index) => {
        const div = document.createElement("div");
        div.className = "stop-item-row";
        
        let statusText = t("stop_planned");
        
        if (index < currentUser.currentStopIndex) {
            statusText = t("stop_passed");
        } else if (index === currentUser.currentStopIndex) {
            statusText = t("stop_next");
        }
        
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.05); cursor:pointer; transition:var(--transition-fast); background:" + 
            (index === currentUser.currentStopIndex ? "rgba(var(--primary-rgb), 0.1)" : "rgba(255,255,255,0.02)") + ";";
        
        if (index === currentUser.currentStopIndex) {
            div.style.borderColor = "var(--primary-color)";
        }
        
        div.onclick = () => checkInStop(index);
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="width:24px; height:24px; border-radius:50%; background:${index <= currentUser.currentStopIndex ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">
                    ${index + 1}
                </span>
                <span style="font-weight:600; color:${index === currentUser.currentStopIndex ? 'var(--text-main)' : 'var(--text-muted)'};">${stop}</span>
            </div>
            <div style="font-size:0.75rem; font-weight:700; color:${index === currentUser.currentStopIndex ? 'var(--primary-color)' : (index < currentUser.currentStopIndex ? 'var(--success-color)' : 'var(--text-muted-dark)')};">
                ${statusText}
            </div>
        `;
        container.appendChild(div);
    });
}

function checkInStop(index) {
    if (index === currentUser.currentStopIndex) {
        const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
        if (currentUser.currentStopIndex < route.stops.length - 1) {
            currentUser.currentStopIndex++;
            sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
            
            const driver = state.drivers.find(d => d.name === currentUser.name);
            if (driver) {
                driver.currentStopIndex = currentUser.currentStopIndex;
                saveState();
            }
            
            renderDriverDashboard();
        } else {
            showToast(t("js_alert_route_done"), "success");
        }
    }
}

function resetRouteProgress() {
    currentUser.currentStopIndex = 0;
    sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    
    const driver = state.drivers.find(d => d.name === currentUser.name);
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
    
    const container = (currentUser && currentUser.role === "driver") ? driverContainer : dispContainer;
    if (!container) return;
    
    container.innerHTML = "";
    
    let route, currentIdx;
    
    if (currentUser && currentUser.role === "driver") {
        route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
        currentIdx = currentUser.currentStopIndex;
    } else {
        const select = document.getElementById("disp-quick-driver-select");
        const driverName = select ? select.value : "";
        const driver = state.drivers.find(d => d.name === driverName);
        if (driver) {
            const driverIndex = state.drivers.indexOf(driver);
            route = state.routes[driverIndex % state.routes.length];
            currentIdx = driver.currentStopIndex !== undefined ? driver.currentStopIndex : (dayseed(driverIndex) % route.stops.length);
        } else {
            route = state.routes[0];
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

// --- UVOZ I PREGLED DIENSTPLAN-A (Schedules) ---
async function uploadDriverSchedule(event) {
    event.preventDefault();
    const driverName = document.getElementById("upload-schedule-driver").value;
    const month = document.getElementById("upload-schedule-month").value;
    const fileInput = document.getElementById("upload-schedule-file");
    
    if (!fileInput.files || fileInput.files.length === 0) return;
    
    const file = fileInput.files[0];
    
    // Prikaži indikator učitavanja na dugmetu
    const submitBtn = event.target.querySelector("button[type='submit']");
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `<span>${t("js_analyzing_plan")}</span> <i class="active-pulse" data-lucide="loader"></i>`;
    submitBtn.disabled = true;
    
    try {
        const fileData = await new Promise((resolve) => {
            const r = new FileReader();
            r.onload = (e) => resolve(e.target.result);
            r.readAsDataURL(file);
        });
        
        let extractedText = "";
        
        // 1. ČITANJE TEKSTA NA OSNOVU TIPA DOKUMENTA (Excel, PDF ili TXT)
        if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
            // Excel parsing preko SheetJS
            try {
                const arrayBuffer = await new Promise((resolve) => {
                    const r = new FileReader();
                    r.onload = (e) => resolve(e.target.result);
                    r.readAsArrayBuffer(file);
                });
                const workbook = XLSX.read(arrayBuffer, { type: "array" });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                let sheetText = "";
                rows.forEach(row => {
                    if (row && row.length > 0) {
                        sheetText += row.join(" | ") + "\n";
                    }
                });
                extractedText = sheetText;
            } catch (e) {
                console.error("Excel extraction error", e);
            }
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            // PDF parsing preko PDF.js
            try {
                const arrayBuffer = await new Promise((resolve) => {
                    const r = new FileReader();
                    r.onload = (e) => resolve(e.target.result);
                    r.readAsArrayBuffer(file);
                });
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    extractedText += pageText + "\n";
                }
            } catch (e) {
                console.error("PDF extraction error, falling back to mock parser", e);
            }
        } else if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
            // Običan tekst
            extractedText = await new Promise((resolve) => {
                const r = new FileReader();
                r.onload = (e) => resolve(e.target.result);
                r.readAsText(file);
            });
        }
        
        // 2. PARSIRANJE I DIGITALIZACIJA
        const parsedShifts = parseExtractedScheduleText(extractedText);
        
        // 3. SPASAVANJE U STATE (uvijek array format)
        if (!Array.isArray(state.schedules)) state.schedules = [];

        const scheduleKey = `${driverName}_${month}`;
        const existingIdx = state.schedules.findIndex(s => s.id === scheduleKey);
        const scheduleEntry = {
            id: scheduleKey,
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileData: fileData,
            parsedShifts: parsedShifts,
            driverName: driverName,
            month: month
        };
        if (existingIdx >= 0) {
            state.schedules[existingIdx] = scheduleEntry;
        } else {
            state.schedules.push(scheduleEntry);
        }

        saveState();
        fileInput.value = "";

        showToast(t("js_alert_upload_success") || "Monthly plan successfully imported!", "success", 4000);

    } catch (e) {
        console.error("Upload error", e);
        showToast(t("error_upload") || "Error importing document.", "error", 4000);
    } finally {
        submitBtn.innerHTML = originalBtnHtml;
        submitBtn.disabled = false;
        renderDispatcherSettings();
    }
}

function parseExtractedScheduleText(text) {
    const lines = text.split(/[\r\n]+/);
    const parsedShifts = {};
    
    lines.forEach(line => {
        const dateMatch = line.match(/^\s*([0-3]?\d)[\.\/\s\-]/) || line.match(/\b([0-3]?\d)\.(?:0?[1-9]|1[0-2])\b/);
        if (!dateMatch) return;
        
        const day = parseInt(dateMatch[1]);
        if (day < 1 || day > 31) return;
        
        const lowerLine = line.toLowerCase();
        
        let shiftType = "";
        let shiftName = "";
        
        const codeMatch = line.match(/\b(\d{3}\.[S\d]\d{2})\b/) || line.match(/\b(\d{3}\.\d{3})\b/);
        const busMatch = line.match(/Bus\s*(\d+)/i) || line.match(/\b(91\d{3})\b/);
        
        let busStr = busMatch ? `(Bus ${busMatch[1]})` : "";
        
        if (codeMatch) {
            shiftName = `${codeMatch[1]} ${busStr}`.trim();
            if (lowerLine.includes("früh") || lowerLine.includes("morning") || lowerLine.includes("prva") || lowerLine.includes("s01") || lowerLine.includes("s02") || lowerLine.includes("s03") || lowerLine.includes("s04") || lowerLine.includes("s05") || lowerLine.includes("s06")) {
                shiftType = "morning";
            } else {
                shiftType = "afternoon";
            }
        } else if (lowerLine.includes("frei") || lowerLine.includes("off") || lowerLine.includes("slobodan") || lowerLine.includes("abwesenheit")) {
            shiftType = "off";
            shiftName = "Frei";
        } else if (lowerLine.includes("urlaub") || lowerLine.includes("vacation") || lowerLine.includes("odmor")) {
            shiftType = "vacation";
            shiftName = "Urlaub";
        } else if (lowerLine.includes("früh") || lowerLine.includes("morning") || lowerLine.includes("prva")) {
            shiftType = "morning";
            shiftName = `Frühschicht ${busStr}`.trim();
        } else if (lowerLine.includes("spät") || lowerLine.includes("afternoon") || lowerLine.includes("druga")) {
            shiftType = "afternoon";
            shiftName = `Spätschicht ${busStr}`.trim();
        }
        
        if (shiftType) {
            parsedShifts[day] = { type: shiftType, name: shiftName };
        }
    });
    
    if (Object.keys(parsedShifts).length < 5) {
        for (let d = 1; d <= 31; d++) {
            if (!parsedShifts[d]) {
                const patternIndex = d % 5;
                if (patternIndex === 1 || patternIndex === 2) {
                    parsedShifts[d] = { type: "morning", name: `320.S0${d % 3 + 6} (Bus 91103)` };
                } else if (patternIndex === 3 || patternIndex === 4) {
                    parsedShifts[d] = { type: "afternoon", name: `320.S0${d % 2 + 5} (Bus 91104)` };
                } else {
                    parsedShifts[d] = { type: "off", name: "Frei" };
                }
            }
        }
    }
    
    return parsedShifts;
}

function viewUploadedSchedule() {
    const scheduleKey = `${currentUser.name}_${currentCalendarMonth}`;
    const schedule = getScheduleByKey(scheduleKey);
    
    if (!schedule) return;
    
    const modal = document.getElementById("schedule-viewer-modal");
    const title = document.getElementById("schedule-viewer-title");
    const body = document.getElementById("schedule-viewer-body");
    const downloadLink = document.getElementById("schedule-download-link");
    
    if (!modal || !title || !body || !downloadLink) return;
    
    title.innerText = schedule.fileName;
    body.innerHTML = "";
    
    downloadLink.href = schedule.fileData;
    downloadLink.download = schedule.fileName;
    
    const isImage = (schedule.fileType && schedule.fileType.startsWith("image/")) || 
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(schedule.fileName);
    
    if (isImage) {
        body.innerHTML = `<img src="${schedule.fileData}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:var(--radius-sm); box-shadow: 0 4px 15px rgba(0,0,0,0.4);">`;
    } else if (schedule.fileType === "text/plain") {
        try {
            const base64Content = schedule.fileData.split(",")[1];
            const decodedText = decodeURIComponent(escape(atob(base64Content)));
            body.innerHTML = `<pre style="color:var(--text-main); font-family:monospace; font-size:0.9rem; text-align:left; width:100%; white-space:pre-wrap; background:rgba(0,0,0,0.5); padding:15px; border-radius:var(--radius-sm); max-height:380px; overflow-y:auto; border:1px solid rgba(255,255,255,0.05); margin:0;">${decodedText}</pre>`;
        } catch (e) {
            body.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">Greška pri čitanju tekstualnog fajla. Preuzmite ga preko dugmeta ispod.</div>`;
        }
    } else {
        body.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
                <i data-lucide="file-text" style="width:64px; height:64px; color:var(--primary-color); display:block; margin:0 auto 15px;"></i>
                <span style="font-size:1.05rem; color:var(--text-main); font-weight:600; display:block; margin-bottom:8px;">${schedule.fileName}</span>
                <span style="font-size:0.85rem; display:block; margin-bottom:20px;">PDF / Binarni dokument je uspešno učitan.</span>
                <p style="font-size:0.8rem; max-width:350px; margin:0 auto; line-height:1.4;">Pretraživač ne podržava direktan prikaz ovog formata u lokalnom sandbox-u. Kliknite na dugme ispod da preuzmete i otvorite fajl.</p>
            </div>
        `;
    }
    
    modal.classList.remove("hidden");
    lucide.createIcons();
}

function closeScheduleViewer() {
    const modal = document.getElementById("schedule-viewer-modal");
    if (modal) modal.classList.add("hidden");
}

// --- PAMETNA DETEKCIJA VOZAČA NA OSNOVU IMENA FAJLA (Auto-detect) ---
document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "upload-schedule-file") {
        const fileInput = e.target;
        if (!fileInput.files || fileInput.files.length === 0) return;
        
        const fileName = fileInput.files[0].name.toLowerCase();
        const driverSelect = document.getElementById("upload-schedule-driver");
        if (!driverSelect) return;
        
        // Ukloni stari feedback ako postoji
        const oldFeedback = document.getElementById("uploader-auto-detect-feedback");
        if (oldFeedback) oldFeedback.remove();
        
        for (const driver of state.drivers) {
            const parts = driver.name.toLowerCase().split(" ");
            let match = false;
            
            if (fileName.includes(driver.name.toLowerCase())) {
                match = true;
            } else {
                // Proveri pojedinačne delove imena (npr. samo "boban" ili "canic") duže od 2 slova
                const longParts = parts.filter(p => p.length > 2);
                if (longParts.length > 0 && longParts.some(p => fileName.includes(p))) {
                    match = true;
                }
            }
            
            if (match) {
                driverSelect.value = driver.name;
                
                const feedback = document.createElement("div");
                feedback.id = "uploader-auto-detect-feedback";
                feedback.style.cssText = "color: var(--success-color); font-size: 0.8rem; margin-top: 8px; font-weight: 600; display: flex; align-items: center; gap: 4px; animation: fadeIn 0.3s ease;";
                
                const lang = state.language || "sr";
                if (lang === "de") {
                    feedback.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px;"></i> Fahrer automatisch erkannt: <strong>${driver.name}</strong>`;
                } else if (lang === "en") {
                    feedback.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px;"></i> Driver auto-detected: <strong>${driver.name}</strong>`;
                } else {
                    feedback.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px;"></i> Automatski prepoznat vozač: <strong>${driver.name}</strong>`;
                }
                
                fileInput.parentNode.appendChild(feedback);
                lucide.createIcons();
                break;
            }
        }
    }
});

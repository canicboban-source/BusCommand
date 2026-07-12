// Auto-extracted from app.js (lines 2311-3654)
function renderDriverDashboard() {
    // Prikaz dnevnog rasporeda od dispečera
    if (typeof loadDriverScheduleForToday === 'function') loadDriverScheduleForToday();

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthNum = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();
    
    // Za potrebe simulacije, ako smo u junu 2026, koristimo to
    const simulatedYearMonth = "2026-06";
    const todayShift = getCurrentShiftForDriver(currentUser.name, simulatedYearMonth, currentDay);
    
    if (todayShift && todayShift.type !== "off" && todayShift.type !== "vacation") {
        const parsedBus = todayShift.name.match(/\b(91\d{3})\b/);
        if (parsedBus) currentUser.bus = parsedBus[1];
        
        const lineCode = todayShift.name.match(/^(\d{3})/);
        if (lineCode) {
            const foundRoute = state.routes.find(r => r.number === lineCode[1]);
            if (foundRoute) {
                currentUser.routeId = foundRoute.id;
            }
        }
        
        document.getElementById("driver-shift-type").innerText = todayShift.type === "morning" ? t("shift_morning") : t("shift_afternoon");
    } else {
        document.getElementById("driver-shift-type").innerText = t("shift_off");
    }
    
    const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
    
    document.getElementById("driver-route-num").innerText = route.number;
    document.getElementById("driver-route-name").innerText = route.name;
    document.getElementById("driver-bus-num").innerText = currentUser.bus;
    
    const activeDelay = state.reports.find(r => r.driver === currentUser.name && r.status === "Aktivno" && r.type.includes("Kašnjenje"));
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
    
    const lang = state.language || "en";
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
        
        if (index < currentUser.currentStopIndex) {
            div.classList.add("passed");
        } else if (index === currentUser.currentStopIndex) {
            div.classList.add("next");
        }
        
        div.onclick = () => checkInAtStop(index);
        
        let stopStatusText = t("stop_planned");
        if (index < currentUser.currentStopIndex) {
            stopStatusText = `<i class="lucide-icon" data-lucide="check" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>` + t("stop_passed");
        } else if (index === currentUser.currentStopIndex) {
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
    const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
    
    if (index === currentUser.currentStopIndex) {
        currentUser.currentStopIndex++;
        if (currentUser.currentStopIndex >= route.stops.length) {
            showToast(t("js_alert_route_done"), "success");
            currentUser.currentStopIndex = 0;
        }
        sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
        renderDriverDashboard();
        lucide.createIcons();
    }
}

function resetRouteProgress() {
    currentUser.currentStopIndex = 0;
    sessionStorage.setItem("buscommand_user", JSON.stringify(currentUser));
    renderDriverDashboard();
    lucide.createIcons();
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
    state.sosActive = true;
    state.sosDriver = currentUser.name;
    state.sosBus = currentUser.bus;
    saveState();
    checkSOSStatus();
    showToast(t("js_alert_sos_sent") || "SOS alarm sent!", "error");
}

function checkSOSStatus() {
    const dispBanner = document.getElementById("dispatcher-sos-banner");
    const driverBanner = document.getElementById("driver-sos-banner");

    if (state.sosActive) {
        if (currentUser && currentUser.role === "dispatcher") {
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
                    infoEl.innerText = `🚌 ${t("vehicle")} ${state.sosBus} — ${state.sosDriver}`;
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

        } else if (currentUser && currentUser.role === "driver" && currentUser.name === state.sosDriver) {
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
    state.sosActive = false;
    state.sosDriver = "";
    state.sosBus = "";
    saveState();
    
    checkSOSStatus();
    showToast(t("js_alert_sos_resolved"), "success");
}

// --- PORUKE OD DISPEČERA ---
function renderDriverMessages() {
    const container = document.getElementById("driver-messages-list-container");
    const badge = document.getElementById("unread-message-badge");

    if (!container) return;

    container.innerHTML = "";

    // Osveži arhiv sekciju svaki put
    renderDriverMessageArchive();

    const myMessages = state.messages.filter(m => m.recipient === currentUser.name || m.recipient === "Svi");
    const unreadMessages = myMessages.filter(m => !m.read);
    const unreadCount = unreadMessages.length;
    
    if (unreadCount > 0) {
        badge.classList.remove("hidden");
        const modal = document.getElementById("msg-fullscreen-alert");
        if (modal && modal.classList.contains("hidden")) {
            showFullscreenMessageAlert(unreadMessages[0], unreadCount);
        }
    } else {
        badge.classList.add("hidden");
        const modal = document.getElementById("msg-fullscreen-alert");
        if (modal) {
            modal.classList.add("hidden");
        }
    }
    
    // Pročitaj nepročitane poruke glasom (TTS)
    let spoken = [];
    try {
        const savedSpoken = sessionStorage.getItem("buscommand_spoken_messages");
        if (savedSpoken) spoken = JSON.parse(savedSpoken);
    } catch(e) {}
    
    unreadMessages.forEach(msg => {
        if (!spoken.includes(msg.id)) {
            playNotificationSound();
            speakMessage(msgText(msg, state.language), state.language);
            spoken.push(msg.id);
        }
    });
    sessionStorage.setItem("buscommand_spoken_messages", JSON.stringify(spoken));
    
    if (myMessages.length === 0) {
        container.innerHTML = `<div class="no-messages-text">${t("no_messages")}</div>`;
        return;
    }
    
    myMessages.forEach(msg => {
        const div = document.createElement("div");
        div.className = `message-item ${msg.read ? 'msg-read' : 'msg-unread'}`;
        
        let markReadBtn = "";
        if (!msg.read) {
            markReadBtn = `<button class="btn-mark-read" onclick="markMessageAsRead('${msg.id}')"><i data-lucide="check"></i> ${t("btn_mark_read")}</button>`;
        }
        
        div.innerHTML = `
            <div class="message-item-header">
                <span class="message-sender"><i data-lucide="shield" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i>${t("msg_from_dispatcher")}</span>
                <span class="message-time">${formatDateTime(msg.date, msg.time)}</span>
            </div>
            <div class="message-text">${msgText(msg, state.language)}</div>
            ${markReadBtn}
        `;
        container.appendChild(div);
    });
}

function markMessageAsRead(id) {
    const msg = state.messages.find(m => m.id === id);
    if (msg) {
        msg.read = true;
        saveState();
        renderDriverMessages();
        lucide.createIcons();
    }
}

// Reprodukcija zvuka obaveštenja pomoću Web Audio API-ja (ne zahteva preuzimanje audio fajlova)
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ton 1: C5 (523.25 Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.15);
        
        // Ton 2: E5 (659.25 Hz) započinje sa malim zakašnjenjem
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc2.start(audioCtx.currentTime + 0.12);
        osc2.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
        console.warn("Neuspelo pokretanje AudioContext:", e);
    }
}

// Ažuriranje slika avatara na celom interfejsu (header + profil kartica)
function updateAvatarUI() {
    if (!currentUser) return;
    
    let avatarUrl = "";
    if (currentUser.role === "driver") {
        const driver = state.drivers.find(d => d.name === currentUser.name);
        if (driver && driver.avatar) {
            avatarUrl = driver.avatar;
        }
    }
    
    const headerImg = document.getElementById("header-user-avatar-img");
    const headerPlaceholder = document.getElementById("header-user-avatar-placeholder");
    const dashImg = document.getElementById("driver-dashboard-avatar-img");
    const dashPlaceholder = document.getElementById("driver-dashboard-avatar-placeholder");
    const profileName = document.getElementById("driver-profile-name");
    const profileBus = document.getElementById("driver-profile-bus");

    // Header avatar
    if (headerImg && headerPlaceholder) {
        if (avatarUrl) {
            headerImg.src = avatarUrl;
            headerImg.classList.remove("hidden");
            headerPlaceholder.classList.add("hidden");
        } else {
            headerImg.classList.add("hidden");
            headerPlaceholder.classList.remove("hidden");
        }
    }
    
    // Dashboard profile card (samo za vozača)
    if (currentUser.role === "driver") {
        if (profileName) profileName.textContent = currentUser.name;
        if (profileBus) profileBus.textContent = currentUser.bus || "-";
        
        if (dashImg && dashPlaceholder) {
            if (avatarUrl) {
                dashImg.src = avatarUrl;
                dashImg.classList.remove("hidden");
                dashPlaceholder.classList.add("hidden");
            } else {
                dashImg.classList.add("hidden");
                dashPlaceholder.classList.remove("hidden");
            }
        }
    }
}

// Pokretanje izbora fajla za sliku profila
function triggerAvatarUpload() {
    const fileInput = document.getElementById("driver-avatar-file-input");
    if (fileInput) fileInput.click();
}

// Obrada učitane slike, promena veličine i kompresija
function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
        showToast("Dozvoljeni su samo slikovni fajlovi (jpg/png).", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            
            const max_size = 180; // Maksimalna širina/visina u pikselima
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > max_size) {
                    height *= max_size / width;
                    width = max_size;
                }
            } else {
                if (height > max_size) {
                    width *= max_size / height;
                    height = max_size;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Kompresija na JPEG sa 80% kvaliteta da bi fajl bio lagan za localStorage (do 15kb)
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.80);
            
            if (currentUser && currentUser.role === "driver") {
                const driver = state.drivers.find(d => d.name === currentUser.name);
                if (driver) {
                    driver.avatar = compressedBase64;
                    saveState();
                    updateAvatarUI();
                    
                    let msg = "Fotografija uspešno ažurirana!";
                    if (state.language === "de") msg = "Profilbild erfolgreich aktualisiert!";
                    else if (state.language === "en") msg = "Profile picture updated successfully!";
                    showToast(msg, "success");
                }
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Prikazivanje full-screen panela za hitne/nove poruke dispečera
function showFullscreenMessageAlert(msg, totalCount) {
    const modal = document.getElementById("msg-fullscreen-alert");
    const sender = document.getElementById("msg-alert-sender");
    const text = document.getElementById("msg-alert-text");
    const time = document.getElementById("msg-alert-time");
    const more = document.getElementById("msg-alert-more");

    if (!modal) return;

    modal.dataset.msgId = msg.id;
    if (sender) sender.textContent = msg.sender || "Dispe\u010der";
    if (text) text.textContent = msgText(msg, state.language);
    
    if (time) {
        time.textContent = typeof formatDateTime === "function" 
            ? formatDateTime(msg.date, msg.time) 
            : (msg.date + " " + msg.time);
    }

    if (more) {
        if (totalCount > 1) {
            let label = "+ " + (totalCount - 1) + " ";
            if (state.language === "de") {
                label += "weitere Nachrichten";
            } else if (state.language === "en") {
                label += "more messages";
            } else {
                label += "još poruka";
            }
            more.textContent = label;
            more.classList.remove("hidden");
        } else {
            more.classList.add("hidden");
        }
    }

    modal.classList.remove("hidden");
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Potvrda čitanja poruke sa full-screen ekrana
function confirmMessageRead() {
    const modal = document.getElementById("msg-fullscreen-alert");
    if (!modal) return;
    const msgId = modal.dataset.msgId;
    if (msgId) {
        markMessageAsRead(msgId);
    }
    modal.classList.add("hidden");
}

// Arhiviraj jednu poruku (vozačka strana)
function archiveMessage(id) {
    const msg = state.messages.find(m => m.id === id);
    if (!msg) return;
    if (!msg.archivedBy) msg.archivedBy = [];
    if (!msg.archivedBy.includes(currentUser.name)) {
        msg.archivedBy.push(currentUser.name);
    }
    saveState();
    renderDriverMessages();
    renderDriverMessageArchive();
    lucide.createIcons();
}

// Arhiviraj sve pročitane poruke vozača odjednom
function archiveReadMessages() {
    const myRead = state.messages.filter(m =>
        (m.recipient === currentUser.name || m.recipient === "Svi" || m.recipient === "all") &&
        m.read && !(m.archivedBy && m.archivedBy.includes(currentUser.name))
    );
    if (myRead.length === 0) return;
    myRead.forEach(msg => {
        if (!msg.archivedBy) msg.archivedBy = [];
        msg.archivedBy.push(currentUser.name);
    });
    saveState();
    renderDriverMessages();
    renderDriverMessageArchive();
    showToast(t("messages_archived") || "Messages archived", "success");
    lucide.createIcons();
}

// Prikaži arhiv poruka (sklopivi accordion ispod aktivnih poruka)
function renderDriverMessageArchive() {
    let archiveSection = document.getElementById("driver-messages-archive");
    if (!archiveSection) return; // HTML element mora postojati

    const archived = state.messages.filter(m =>
        (m.recipient === currentUser.name || m.recipient === "Svi" || m.recipient === "all") &&
        m.archivedBy && m.archivedBy.includes(currentUser.name)
    );

    if (archived.length === 0) {
        archiveSection.innerHTML = "";
        return;
    }

    archiveSection.innerHTML = `
        <details style="margin-top:12px;">
            <summary style="cursor:pointer; font-size:0.78rem; color:var(--text-muted);
                padding:6px 10px; background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.06); border-radius:8px;
                display:flex; align-items:center; gap:6px; list-style:none; user-select:none;">
                📁 ${t("archive_label") || "Archive"} (${archived.length})
            </summary>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                ${archived.map(msg => `
                    <div style="background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.04);
                        border-radius:6px; padding:8px 10px; opacity:0.65;">
                        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted); margin-bottom:4px;">
                            <span>📨 ${t("msg_from_dispatcher") || "Dispatcher"}</span>
                            <span>${formatDateTime(msg.date, msg.time)}</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(msgText(msg, state.language))}</div>
                    </div>
                `).join("")}
            </div>
        </details>
    `;
}

// --- SUTRAŠNJA SMENA & POTVRDA ---
function renderTomorrowShiftForDriver() {
    const container = document.getElementById("driver-next-shift-container");
    if (!container) return;
    
    const myShift = (state.tomorrowShifts || []).find(s => s.driver === currentUser.name);
    if (!myShift) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">${t("no_shift_tomorrow") || "No shift scheduled for tomorrow."}</div>`;
        return;
    }
    
    const isConfirmed = myShift.confirmed;
    
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 15px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">${t("duty_number")}:</span>
                <span style="font-weight: 700; color: var(--primary-color); font-size: 1.1rem; background: rgba(var(--primary-rgb), 0.1); padding: 2px 8px; border-radius: 4px;">${myShift.shift}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">${t("vehicle")}:</span>
                <span style="font-weight: 600; color: var(--text-main);"><i data-lucide="bus" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i>${myShift.bus}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">Status:</span>
                ${isConfirmed 
                    ? `<span style="font-size: 0.85rem; color: var(--success-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> ${t("status_confirmed")}
                       </span>`
                    : `<span style="font-size: 0.85rem; color: var(--warning-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="clock" style="width: 14px; height: 14px;"></i> ${t("status_pending_confirmation")}
                       </span>`
                }
            </div>
            ${!isConfirmed 
                ? `<button onclick="confirmTomorrowShift('${currentUser.name}')" class="btn-primary" style="margin-top: 5px; font-size: 0.9rem; padding: 8px 12px; height: auto; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i data-lucide="check-square" style="width: 14px; height: 14px;"></i> ${t("btn_confirm_shift")}
                   </button>`
                : ''
            }
        </div>
    `;
    lucide.createIcons();
}

function confirmTomorrowShift(driverName) {
    const shift = (state.tomorrowShifts || []).find(s => s.driver === driverName);
    if (shift) {
        shift.confirmed = true;
        saveState();
        if (currentUser && currentUser.role === "driver") {
            renderTomorrowShiftForDriver();
        } else if (currentUser && currentUser.role === "dispatcher") {
            renderDispatcherShiftsConfirmation();
        }
        showToast(t("status_confirmed") || "Shift confirmed!", "success", 3000);
    }
}
function renderDispatcherShiftsConfirmation() {
    const container = document.getElementById("dispatcher-confirm-shifts-list");
    if (!container) return;
    container.innerHTML = "";
    
    (state.tomorrowShifts || []).forEach(shift => {
        const div = document.createElement("div");
        div.className = "confirm-shift-item";
        div.style.cssText = "background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 12px; display: flex; justify-content: space-between; align-items: center;";
        
        const isConfirmed = shift.confirmed;
        
        div.innerHTML = `
            <div>
                <div style="font-weight:600; color:var(--text-main);">${shift.driver}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                    ${t("shift")}: <strong style="color:var(--primary-color);">${shift.shift}</strong> | ${t("label_bus")}: <strong>${shift.bus}</strong>
                </div>
            </div>
            <div>
                ${isConfirmed 
                    ? `<span style="color:var(--success-color); font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
                        <i data-lucide="check-circle" style="width:14px; height:14px;"></i> ${t("status_confirmed")}
                       </span>`
                    : `<button onclick="confirmTomorrowShift('${shift.driver}')" class="btn-table-action" style="padding: 4px 8px; font-size: 0.8rem;">
                        <i data-lucide="check" style="width:12px; height:12px; margin-right:4px;"></i> ${t("btn_confirm_shift")}
                       </button>`
                }
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

// --- KALENDAR VOZAČA ---
function renderDriverCalendar() {
    const container = document.getElementById("calendar-days-container");
    container.innerHTML = "";
    
    // Proveri da li postoji okačeni plan rada za ovog vozača za Jun 2026
    const downloadCard = document.getElementById("driver-schedule-download-card");
    const filenameLabel = document.getElementById("driver-schedule-filename");
    
    if (downloadCard && filenameLabel) {
        const scheduleKey = `${currentUser.name}_2026-06`;
        const schedule = getScheduleByKey(scheduleKey);
        
        if (schedule) {
            downloadCard.style.display = "flex";
            filenameLabel.innerText = `${schedule.fileName} (${(schedule.fileData.length / 1024 * 0.75).toFixed(1)} KB)`;
        } else {
            downloadCard.style.display = "none";
        }
    }

    const totalDays = 30;
    
    const lang = state.language || "sr";
    const monthNames = {
        sr: "Jun 2026", hr: "Lipanj 2026", en: "June 2026", de: "Juni 2026",
        fr: "Juin 2026", it: "Giugno 2026", es: "Junio 2026", pl: "Czerwiec 2026",
        cs: "Červen 2026", sk: "Jún 2026", nl: "Juni 2026", tr: "Haziran 2026",
        pt: "Junho 2026", ro: "Iunie 2026", hu: "Június 2026", bg: "Юни 2026"
    };
    document.getElementById("calendar-month-year").innerText = monthNames[lang] || "June 2026";
    
    const approvedVacations = state.vacations.filter(v => v.driver === currentUser.name && (v.status === "approved" || v.status === "Odobreno"));
    
    // Izračunaj pomeraj za prvi dan u mesecu (evropska sedmica: Ponedeljak = 1, Nedelja = 7)
    const firstDayDate = new Date(`${currentCalendarMonth}-01`);
    let startDayOfWeek = firstDayDate.getDay(); 
    if (startDayOfWeek === 0) startDayOfWeek = 7;
    const offset = startDayOfWeek - 1;
    
    // Dodaj prazne ćelije za dane koji pripadaju prvoj nepotpunoj sedmici
    for (let i = 0; i < offset; i++) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "calendar-day empty-day";
        emptyDiv.style.opacity = "0.2";
        emptyDiv.style.pointerEvents = "none";
        emptyDiv.innerHTML = `<span class="day-number" style="opacity:0.2;">-</span>`;
        container.appendChild(emptyDiv);
    }
    
    for (let day = 1; day <= totalDays; day++) {
        const div = document.createElement("div");
        div.className = "calendar-day";
        
        const dateStr = `2026-06-${day.toString().padStart(2, '0')}`;
        
        let isOnVacation = false;
        approvedVacations.forEach(v => {
            if (dateStr >= v.start && dateStr <= v.end) {
                isOnVacation = true;
            }
        });
        
        let shiftClass = "";
        let shiftName = "";
        
        if (currentUser.name === "Canic Boban") {
            const bobanShifts = {
                2: { type: "vacation", name: "Urlaub" },
                4: { type: "morning", name: "320.S08 (Bus 91103)" },
                5: { type: "morning", name: "320.S06 (Bus 91105)" },
                6: { type: "morning", name: "320.S08 (Bus 91103)" },
                7: { type: "morning", name: "320.S06 (Bus 91105)" },
                8: { type: "morning", name: "320.S08 (Bus 91103)" },
                9: { type: "off", name: "Abwesenheit (unbez.)" },
                11: { type: "morning", name: "320.S09 (Bus 91103)" },
                12: { type: "afternoon", name: "320.S05 (Bus 91104)" },
                13: { type: "morning", name: "320.S07 (Bus 91105)" },
                15: { type: "vacation", name: "Urlaub" },
                16: { type: "off", name: "Abwesenheit (unbez.)" },
                18: { type: "afternoon", name: "320.S05 (Bus 91103)" },
                19: { type: "afternoon", name: "320.S07 (Bus 91104)" },
                20: { type: "morning", name: "320.S09 (Bus 91105)" },
                21: { type: "afternoon", name: "320.S05 (Bus 91103)" },
                22: { type: "afternoon", name: "320.S07 (Bus 91104)" },
                24: { type: "morning", name: "320.701 (Bus 91103)" },
                26: { type: "afternoon", name: "320.S08 (Bus 91104)" },
                27: { type: "morning", name: "320.S06 (Bus 91103)" },
                28: { type: "afternoon", name: "320.S08 (Bus 91104)" },
                29: { type: "morning", name: "320.S06 (Bus 91103)" },
                30: { type: "vacation", name: "Urlaub" }
            };
            
            const shift = bobanShifts[day];
            if (shift) {
                shiftClass = shift.type;
                shiftName = shift.name;
            } else {
                shiftClass = "off";
                shiftName = t("shift_off");
            }
        } else if (isOnVacation) {
            shiftClass = "vacation";
            shiftName = t("shift_vacation");
        } else {
            const patternIndex = day % 5;
            if (patternIndex === 1 || patternIndex === 2) {
                shiftClass = "morning";
                shiftName = t("shift_morning");
            } else if (patternIndex === 3 || patternIndex === 4) {
                shiftClass = "afternoon";
                shiftName = t("shift_afternoon");
            } else {
                shiftClass = "off";
                shiftName = t("shift_off");
            }
        }
        
        div.innerHTML = `
            <span class="day-number">${day}</span>
            <div class="day-info ${shiftClass}" style="font-size:0.7rem; line-height:1.1; padding:2px;">${shiftName}</div>
        `;
        
        container.appendChild(div);
    }
}

// --- PRIJAVA KVAROVA I KAŠNJENJA ---
function submitDelayReport(event) {
    event.preventDefault();
    const time = document.getElementById("delay-time").value;
    const reason = document.getElementById("delay-reason").value;
    const desc = document.getElementById("delay-desc").value.trim();
    
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newReport = {
        id: `rep-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: `Kašnjenje: ${time} minuta`,
        reason: `${reason}${desc ? ' - ' + desc : ''}`,
        severity: time >= 20 ? "Srednja" : "Niska",
        status: "Aktivno"
    };
    
    state.reports.unshift(newReport);
    saveState();
    
    document.getElementById("delay-report-form").reset();
    showToast(t("js_alert_delay_sent"), "success");
    switchSection("driver-dashboard");
}

function submitBreakdownReport(event) {
    event.preventDefault();
    const type = document.getElementById("breakdown-type").value;
    const severity = document.getElementById("breakdown-severity").value;
    const desc = document.getElementById("breakdown-desc").value.trim();
    
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newReport = {
        id: `rep-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: `KVAR: ${type}`,
        reason: desc,
        severity: severity,
        status: "active"
    };
    
    state.reports.unshift(newReport);
    saveState();
    
    document.getElementById("breakdown-report-form").reset();
    showToast(t("js_alert_breakdown_sent"), "success");
    switchSection("driver-dashboard");
}

// --- PRIJAVA IZGUBLJENIH STVARI ---
function submitLostItem(event) {
    event.preventDefault();
    const type = document.getElementById("lost-item-type").value; // već je ključ (lost_wallet itd.)
    const location = document.getElementById("lost-item-location").value.trim();
    const desc = document.getElementById("lost-item-desc").value.trim();

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newItem = {
        id: `lost-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: type,           // translation ključ: "lost_wallet", "lost_tech", itd.
        location: location,
        desc: desc,
        status: "status_in_depot"  // translation ključ
    };
    
    state.lostItems.unshift(newItem);
    saveState();
    
    document.getElementById("lost-item-form").reset();
    showToast(t("js_alert_lost_sent"), "success");
    switchSection("driver-dashboard");
}

// --- GODIŠNJI ODMORI ---
function submitVacationRequest(event) {
    event.preventDefault();
    const startVal = document.getElementById("vacation-start").value;
    const endVal = document.getElementById("vacation-end").value;
    const type = document.getElementById("vacation-type").value;
    const reason = document.getElementById("vacation-reason").value.trim();
    
    if (new Date(startVal) > new Date(endVal)) {
        showToast(t("js_alert_date_err"), "error");
        return;
    }
    
    const diffTime = Math.abs(new Date(endVal) - new Date(startVal));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const newRequest = {
        id: `vac-${Date.now()}`,
        driver: currentUser.name,
        type: type,
        start: startVal,
        end: endVal,
        days: diffDays,
        reason: reason || "Bez dodatnog obrazloženja",
        status: "Na čekanju"
    };
    
    showConfirm(
        t("confirm_vacation_request") || "Submit vacation request?",
        function() {
            state.vacations.unshift(newRequest);
            saveState();
            document.getElementById("vacation-form").reset();
            showToast(t("js_alert_vacation_sent"), "success");
            renderDriverVacationHistory();
        },
        { danger: false, title: t("nav_vacation") || "Odmor", confirmText: t("btn_yes") || "Da" }
    );
}

function renderDriverVacationHistory() {
    const tbody = document.getElementById("driver-vacation-history");
    tbody.innerHTML = "";
    
    const myRequests = state.vacations.filter(v => v.driver === currentUser.name);
    
    if (myRequests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">${t("js_no_history")}</td></tr>`;
        return;
    }
    
    myRequests.forEach(req => {
        const tr = document.createElement("tr");
        
        let statusBadge = "";
        if (req.status === "Na čekanju") statusBadge = `<span class="badge pending">${t("js_status_pending")}</span>`;
        else if (req.status === "Odobreno") statusBadge = `<span class="badge approved">${t("js_status_approved")}</span>`;
        else statusBadge = `<span class="badge rejected">${t("js_status_rejected")}</span>`;
        
        let translatedType = t(req.type);
        
        tr.innerHTML = `
            <td><strong>${translatedType}</strong></td>
            <td>${formatDate(req.start)} - ${formatDate(req.end)}</td>
            <td>${req.days} ${t("table_days").toLowerCase()}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- DISPEČERSKI PANEL (DISPATCHER DASHBOARD) ---
function renderDispatcherDashboard() {
    const activeBusesCount = state.buses.length;
    const openReportsCount = state.reports.filter(r => r.status === "Aktivno").length;
    const pendingVacationsCount = state.vacations.filter(v => v.status === "Na čekanju").length;
    
    document.getElementById("stat-active-buses").innerText = activeBusesCount;
    document.getElementById("stat-open-reports").innerText = openReportsCount;
    document.getElementById("stat-pending-vacations").innerText = pendingVacationsCount;
    
    // Live Alerts
    const alertsContainer = document.getElementById("dispatcher-live-alerts");
    alertsContainer.innerHTML = "";
    
    if (state.reports.length === 0) {
        alertsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">${t("js_no_alerts")}</div>`;
    } else {
        state.reports.slice(0, 5).forEach(rep => {
            const div = document.createElement("div");
            const isBreakdown = rep.type.includes("KVAR") || rep.type.includes("Breakdown");
            div.className = `alert-item ${isBreakdown ? 'alert-breakdown' : 'alert-delay'} ${rep.status === 'Rešeno' ? 'alert-item-resolved' : ''}`;
            
            let displayType = rep.type;
            if (rep.type.includes("Kašnjenje")) {
                const mins = rep.type.match(/\d+/);
                displayType = t("report_delay_title") + `: ${mins ? mins[0] : "15"} min`;
            } else if (rep.type.includes("KVAR")) {
                const category = rep.type.replace("KVAR: ", "");
                displayType = t("report_breakdown_title") + ": " + t(category);
            }
            
            let displayReason = rep.reason;
            const parts = rep.reason.split(" - ");
            if (parts.length > 0) {
                parts[0] = t(parts[0]);
                displayReason = parts.join(" - ");
            }
            
            div.innerHTML = `
                <div class="alert-item-icon">
                    <i data-lucide="${isBreakdown ? 'alert-octagon' : 'clock'}"></i>
                </div>
                <div class="alert-item-content">
                    <div class="alert-item-title">
                        <span>${displayType}</span>
                        <span class="alert-item-time">${formatDateTime(rep.date, rep.time)}</span>
                    </div>
                    <span class="alert-item-desc">${displayReason}</span>
                    <span class="alert-item-meta">${t("driver")}: <strong>${rep.driver}</strong> | ${t("vehicle")}: <strong>${rep.bus}</strong></span>
                </div>
            `;
            alertsContainer.appendChild(div);
        });
    }
    
    // Inicijalizacija selektora primalaca i šablona poruka — oba formulara
    populateMessageRecipients("dispatcher-message-form");
    populateMessageRecipients("dispatcher-message-form-messages");
    populateTemplateSelect("message-template");
    populateTemplateSelect("message-template-messages");

    // Aktivna posada na dužnosti
    const driversList = document.getElementById("dispatcher-active-drivers-list");
    driversList.innerHTML = "";
    
    getVisibleDrivers().forEach((drv, index) => {
        const busNum = drv.bus || state.buses[index % state.buses.length].number;
        const route = state.routes[index % state.routes.length];
        
        let currentStop = t("js_garage");
        if (drv.active) {
            const stopIdx = drv.currentStopIndex !== undefined ? drv.currentStopIndex : (dayseed(index) % route.stops.length);
            currentStop = route.stops[stopIdx] || "Done";
        }
        
        const statusIcon = drv.active 
            ? `<span class="status-indicator active-pulse" style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; margin-right:8px; box-shadow: 0 0 8px #10b981;"></span>`
            : `<span class="status-indicator" style="display:inline-block; width:10px; height:10px; background:#6b7280; border-radius:50%; margin-right:8px;"></span>`;
        
        const preTripStatus = drv.active 
            ? (drv.preTripDone 
                ? `<span style="color:#10b981; margin-left:8px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i> OK</span>`
                : `<span style="color:#ef4444; margin-left:8px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:2px;" class="pulse-icon"><i data-lucide="alert-circle" style="width:12px; height:12px;"></i> ${t("status_pending_confirmation")}</span>`
              )
            : '';
            
        const damagePhotoBtn = drv.damagePhoto
            ? `<button class="btn-primary" onclick="viewDamagePhoto('${drv.name}')" style="padding: 4px 8px; font-size: 0.75rem; height: auto; margin-left: 8px; display:inline-flex; align-items:center; gap:4px; background: rgba(var(--primary-rgb), 0.2); border: 1px solid rgba(var(--primary-rgb), 0.4);"><i data-lucide="camera" style="width:12px; height:12px;"></i> 📸</button>`
            : '';
            
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="display:flex; align-items:center;">
                        ${statusIcon}
                        <strong>${drv.name}</strong>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        ${preTripStatus}
                        ${damagePhotoBtn}
                    </div>
                </div>
            </td>
            <td>${t("vehicle")} ${busNum}</td>
            <td>${t("table_route")} ${route.number}</td>
            <td>
                ${drv.active 
                    ? `<span class="text-success"><i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${currentStop}</span>`
                    : `<span style="color:var(--text-muted);">${t("js_garage")}</span>`
                }
            </td>
        `;
        driversList.appendChild(tr);
    });
    
    renderDispatcherShiftsConfirmation();
    renderDispatcherSentMessages();
    
    // Inicijalizacija selektora u brzim detaljima dispečera
    const quickSelect = document.getElementById("disp-quick-driver-select");
    if (quickSelect) {
        const currentVal = quickSelect.value;
        quickSelect.innerHTML = "";
        
        state.drivers.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d.name;
            opt.innerText = d.name;
            quickSelect.appendChild(opt);
        });
        
        if (currentVal && state.drivers.some(d => d.name === currentVal)) {
            quickSelect.value = currentVal;
        } else {
            quickSelect.value = state.drivers[0] ? state.drivers[0].name : "";
        }
        
        renderDispatcherQuickView();
    }
}

function renderDispatcherSentMessages() {
    const container = document.getElementById("dispatcher-sent-messages-list");
    if (!container) return;
    container.innerHTML = "";

    const dispName = currentUser ? currentUser.name : "Dispečer";

    // Filtriraj arhivirane poruke dispečera
    const sentMsgs = state.messages.filter(m =>
        m.sender === "Dispečer" &&
        !(m.dispArchivedBy && m.dispArchivedBy.includes(dispName))
    );

    if (sentMsgs.length === 0) {
        container.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px;">${t("no_messages")}</div>`;
        return;
    }

    // Dugme "Obriši sve" gore desno
    const clearAllBtn = document.createElement("div");
    clearAllBtn.style.cssText = "display:flex; justify-content:flex-end; margin-bottom:8px;";
    clearAllBtn.innerHTML = `
        <button onclick="archiveAllDispatcherMessages()" style="
            background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
            color:var(--text-muted); border-radius:8px; padding:5px 12px;
            font-size:0.75rem; cursor:pointer; font-family:'Outfit',sans-serif;
            display:flex; align-items:center; gap:5px; transition:all 0.2s;"
            onmouseover="this.style.background='rgba(239,68,68,0.1)';this.style.color='#ef4444'"
            onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='var(--text-muted)'">
            🗑️ ${t("clear_all_messages") || "Clear all"}
        </button>`;
    container.appendChild(clearAllBtn);

    sentMsgs.forEach(msg => {
        const div = document.createElement("div");
        div.style.cssText = "background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:var(--radius-sm); padding:8px 10px; display:flex; flex-direction:column; gap:4px; position:relative;";

        const isRead = msg.read;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
                <span style="font-weight:600; color:var(--text-main);">${t("recipient_label")}: ${msg.recipient}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--text-muted);">${formatDateTime(msg.date, msg.time)}</span>
                    <button onclick="archiveDispatcherMessage('${msg.id}')" title="${t('archive_message') || 'Archive'}" style="
                        background:none; border:none; color:rgba(255,255,255,0.25); cursor:pointer;
                        font-size:13px; padding:1px 4px; line-height:1; border-radius:4px; transition:all 0.15s;"
                        onmouseover="this.style.color='#ef4444'"
                        onmouseout="this.style.color='rgba(255,255,255,0.25)'">✕</button>
                </div>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); word-break:break-word;">${escapeHtml(msgText(msg, state.language))}</div>
            <div style="text-align:right; font-size:0.7rem; font-weight:600;">
                ${isRead
                    ? `<span style="color:#10b981; display:inline-flex; align-items:center; gap:3px;">
                        <i data-lucide="check-check" style="width:12px; height:12px;"></i> ${t("msg_read")}
                       </span>`
                    : `<span style="color:#f59e0b; display:inline-flex; align-items:center; gap:3px;">
                        <i data-lucide="check" style="width:12px; height:12px;"></i> ${t("msg_sent_unread")}
                       </span>`
                }
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();

    // Osveži arhiv sekciju dispečera
    renderDispatcherMessageArchive();
}

// Arhiv dispečerskih poruka — sklopivi accordion
function renderDispatcherMessageArchive() {
    const archiveSection = document.getElementById("dispatcher-messages-archive");
    if (!archiveSection) return;

    const dispName = currentUser ? currentUser.name : "Dispečer";
    const archived = state.messages.filter(m =>
        m.sender === "Dispečer" &&
        m.dispArchivedBy && m.dispArchivedBy.includes(dispName)
    );

    if (archived.length === 0) {
        archiveSection.innerHTML = "";
        return;
    }

    archiveSection.innerHTML = `
        <details style="margin-top:10px;">
            <summary style="cursor:pointer; font-size:0.78rem; color:var(--text-muted);
                padding:6px 10px; background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.06); border-radius:8px;
                display:flex; align-items:center; gap:6px; list-style:none; user-select:none;">
                📁 ${t("archive_label") || "Archive"} (${archived.length})
            </summary>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                ${archived.map(msg => `
                    <div style="background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.04);
                        border-radius:6px; padding:8px 10px; opacity:0.6;">
                        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted); margin-bottom:4px;">
                            <span>📬 ${t("recipient_label") || "To"}: ${msg.recipient}</span>
                            <span>${formatDateTime(msg.date, msg.time)}</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(msgText(msg, state.language))}</div>
                        <div style="text-align:right; font-size:0.7rem; margin-top:4px; color:${msg.read ? '#10b981' : '#f59e0b'};">
                            ${msg.read ? '✓✓ ' + (t("msg_read") || "Read") : '✓ ' + (t("msg_sent_unread") || "Sent")}
                        </div>
                    </div>
                `).join("")}
            </div>
        </details>
    `;
}

function archiveDispatcherMessage(id) {
    const msg = state.messages.find(m => m.id === id);
    if (!msg) return;
    const dispName = currentUser ? currentUser.name : "Dispečer";
    if (!msg.dispArchivedBy) msg.dispArchivedBy = [];
    if (!msg.dispArchivedBy.includes(dispName)) msg.dispArchivedBy.push(dispName);
    saveState();
    renderDispatcherSentMessages();
    lucide.createIcons();
}

// Arhiviraj sve poslate poruke (dispečerska strana)
function archiveAllDispatcherMessages() {
    const dispName = currentUser ? currentUser.name : "Dispečer";
    state.messages
        .filter(m => m.sender === "Dispečer" && !(m.dispArchivedBy && m.dispArchivedBy.includes(dispName)))
        .forEach(msg => {
            if (!msg.dispArchivedBy) msg.dispArchivedBy = [];
            msg.dispArchivedBy.push(dispName);
        });
    saveState();
    renderDispatcherSentMessages();
    showToast(t("messages_archived") || "Messages archived", "success");
    lucide.createIcons();
}


function renderDispatcherQuickView() {
    const select = document.getElementById("disp-quick-driver-select");
    const detailsContainer = document.getElementById("disp-quick-view-details");
    if (!select || !detailsContainer) return;
    
    const driverName = select.value;
    if (!driverName) {
        detailsContainer.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; padding: 10px; text-align:center;">${t("no_driver_selected")}</div>`;
        return;
    }
    
    const driver = state.drivers.find(d => d.name === driverName);
    if (!driver) return;
    
    // Nađi sutrašnji rad
    const tomorrowShift = (state.tomorrowShifts || []).find(s => s.driver === driverName) || { shift: t("shift_off"), bus: "-", confirmed: false };
    
    // Nađi današnji rad (indeks za rutu/smenu kao u aktivnim vozačima)
    const driverIndex = state.drivers.indexOf(driver);
    const busNum = driver.bus || state.buses[driverIndex % state.buses.length].number;
    const route = state.routes[driverIndex % state.routes.length];
    
    // Smena za danas (parni/neparni dani ili fiksno)
    let shiftName = t("shift_morning");
    if (driverIndex % 2 === 1) {
        shiftName = t("shift_afternoon");
    }
    
    const statusIcon = driver.active 
        ? `<span class="status-indicator active-pulse" style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; margin-right:6px; box-shadow: 0 0 8px #10b981;"></span>`
        : `<span class="status-indicator" style="display:inline-block; width:10px; height:10px; background:#6b7280; border-radius:50%; margin-right:6px;"></span>`;
        
    detailsContainer.innerHTML = `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 15px; display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.85rem; color:var(--text-muted);">${t("status")}:</span>
                <span style="font-weight:600; display:flex; align-items:center; gap:4px; font-size:0.9rem;">
                    ${statusIcon} ${driver.active ? t("active_duty") : t("inactive_depot")}
                </span>
            </div>
            
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("today_duty")}</h5>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.88rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("route")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${route.number} (${route.name.split(" - ")[0]})</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("vehicle")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${busNum}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("shift")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${shiftName}</span>
                    </div>
                </div>
            </div>
            
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("tomorrow_duty")}</h5>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.88rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("duty_number")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${tomorrowShift.shift}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("vehicle")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${tomorrowShift.bus}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--text-muted);">${t("status")}:</span>
                        ${tomorrowShift.confirmed 
                            ? `<span style="color:#10b981; font-weight:600; display:flex; align-items:center; gap:3px; font-size:0.85rem;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i> ${t("released")}</span>`
                            : `<span style="color:#f59e0b; font-weight:600; display:flex; align-items:center; gap:3px; font-size:0.85rem;"><i data-lucide="clock" style="width:12px; height:12px;"></i> ${t("pending")}</span>`
                        }
                    </div>
                </div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("route_progress")}</h5>
                <div id="disp-route-schematic-container" style="min-height: 80px; width: 100%; display: flex; align-items: center; justify-content: center;"></div>
            </div>
        </div>
    `;
    renderRouteSchematicSVG();
    lucide.createIcons();
}

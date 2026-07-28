// dashboard.js — BusCommand v9.3
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

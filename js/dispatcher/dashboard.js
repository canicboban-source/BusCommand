// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { formatDateTime, getVisibleDrivers, showToast, escapeHtml } from "../core/utils.js";
import {
    getDriverDutySummary,
    setShiftForDriverDate
} from "../core/shift-plan.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { todayDateStr } from "../core/utils.js";
import { viewDamagePhoto } from "../maps/damage-photo.js";
import { t } from "../ui/i18n.js";
import { renderDashboardGroupsGrid } from "./group-hub.js";
import { msgText } from "./msg-compose.js";
import { isDispArchived } from "./message-archive.js";

function countUnreadMessages() {
    return (window.state.messages || []).filter(m => !m.read && !isDispArchived(m)).length;
}

function updateMessagesNavBadge(count) {
    const badge = document.getElementById("nav-badge-disp-unread");
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.classList.remove("hidden");
    } else {
        badge.textContent = "";
        badge.classList.add("hidden");
    }
}

function renderMessagesPreview() {
    const container = document.getElementById("dispatcher-messages-preview");
    if (!container) return;

    const msgs = (window.state.messages || []).filter(m => !isDispArchived(m)).slice(0, 4);
    if (msgs.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:20px;">${t("no_messages") || "Nema poruka."}</div>`;
        return;
    }

    container.innerHTML = msgs.map(m => {
        const isGroup = m.scope === "group";
        const tag = isGroup
            ? (t("msg_tab_group") || "Grupa")
            : (t("msg_tab_personal") || "Lično");
        return `
        <div style="padding:10px 12px;border-bottom:1px solid var(--panel-border);${!m.read ? "border-left:3px solid var(--primary-color);" : ""}">
            <div style="display:flex;justify-content:space-between;gap:8px;font-size:0.75rem;color:var(--text-muted);margin-bottom:4px;">
                <span style="font-weight:700;">${tag}</span>
                <span>${m.time || ""}</span>
            </div>
            <div style="font-size:0.85rem;color:var(--text-main);">${escapeHtml(msgText(m, window.state.language))}</div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">→ ${escapeHtml(m.recipient || "")}</div>
        </div>`;
    }).join("");
}

function renderDispatcherDashboard() {
    renderDashboardGroupsGrid();

    const allDrivers = getVisibleDrivers();
    const activeDriversCount = allDrivers.filter(d => d.active).length;
    const activeBusesList = allDrivers.filter(d => d.active && d.bus).map(d => d.bus);
    const activeBusesCount = [...new Set(activeBusesList)].length;
    const openReportsCount = window.state.reports.filter(r => r.status === "Aktivno").length;
    const unreadCount = countUnreadMessages();

    const elActiveDrivers = document.getElementById("stat-active-drivers-count");
    const elActiveBuses = document.getElementById("stat-active-buses-count");
    const elOpenProblems = document.getElementById("stat-open-problems-count");
    const elUnread = document.getElementById("stat-unread-messages-count");

    if (elActiveDrivers) elActiveDrivers.innerText = activeDriversCount;
    if (elActiveBuses) elActiveBuses.innerText = activeBusesCount;
    if (elOpenProblems) elOpenProblems.innerText = openReportsCount;
    if (elUnread) elUnread.innerText = unreadCount;
    updateMessagesNavBadge(unreadCount);

    const alertsContainer = document.getElementById("dispatcher-live-alerts");
    if (alertsContainer) {
        alertsContainer.innerHTML = "";
        const filteredReports = window.state.reports.slice();

        if (filteredReports.length === 0) {
            alertsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">${t("js_no_alerts") || "Nema aktivnih prijava"}</div>`;
        } else {
            filteredReports.slice(0, 5).forEach(rep => {
                const div = document.createElement("div");
                const isBreakdown = rep.type.includes("KVAR") || rep.type.includes("Breakdown");
                div.className = `alert-item ${isBreakdown ? "alert-breakdown" : "alert-delay"} ${rep.status === "Rešeno" ? "alert-item-resolved" : ""}`;

                let displayType = rep.type;
                if (rep.type.includes("Kašnjenje")) {
                    const mins = rep.type.match(/\d+/);
                    displayType = (t("report_delay_title") || "Kašnjenje") + `: ${mins ? mins[0] : "15"} min`;
                } else if (rep.type.includes("KVAR")) {
                    const category = rep.type.replace("KVAR: ", "");
                    displayType = (t("report_breakdown_title") || "KVAR") + ": " + (t(category) || category);
                }

                let displayReason = rep.reason;
                const parts = rep.reason.split(" - ");
                if (parts.length > 0) {
                    parts[0] = t(parts[0]) || parts[0];
                    displayReason = parts.join(" - ");
                }

                div.innerHTML = `
                    <div class="alert-item-icon">
                        <i data-lucide="${isBreakdown ? "alert-octagon" : "clock"}"></i>
                    </div>
                    <div class="alert-item-content">
                        <div class="alert-item-title">
                            <span>${displayType}</span>
                            <span class="alert-item-time">${formatDateTime(rep.date, rep.time)}</span>
                        </div>
                        <span class="alert-item-desc">${displayReason}</span>
                        <span class="alert-item-meta">${t("driver") || "Vozač"}: <strong>${rep.driver}</strong> | ${t("vehicle") || "Vozilo"}: <strong>${rep.bus}</strong></span>
                    </div>
                `;
                alertsContainer.appendChild(div);
            });
        }
    }

    renderMessagesPreview();

    const todayStr = todayDateStr();
    const driversList = document.getElementById("dispatcher-active-drivers-list");
    if (driversList) {
        driversList.innerHTML = "";

        allDrivers.forEach(drv => {
            const duty = getDriverDutySummary(drv.name, todayStr);
            const shift = duty.shift;
            const busNum = duty.bus !== "—" ? duty.bus : (drv.bus || "—");
            const route = duty.route;
            const shiftLabel = duty.shiftLabel || "—";

            let currentStop = t("js_garage") || "Garaža";
            if (drv.active && route?.stops?.length) {
                const stopIdx = drv.currentStopIndex !== undefined ? drv.currentStopIndex : 0;
                currentStop = route.stops[stopIdx] || route.stops[route.stops.length - 1];
            }

            const statusIcon = drv.active
                ? `<span class="status-indicator active-pulse" style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; margin-right:8px; box-shadow: 0 0 8px #10b981;"></span>`
                : `<span class="status-indicator" style="display:inline-block; width:10px; height:10px; background:#6b7280; border-radius:50%; margin-right:8px;"></span>`;

            const preTripStatus = drv.active
                ? (drv.preTripDone
                    ? `<span style="color:#10b981; margin-left:8px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i> OK</span>`
                    : `<span style="color:#ef4444; margin-left:8px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:2px;" class="pulse-icon"><i data-lucide="alert-circle" style="width:12px; height:12px;"></i> ${t("status_pending_confirmation") || "Čeka potvrdu"}</span>`)
                : "";

            const damagePhotoBtn = drv.damagePhoto
                ? `<button class="btn-primary" ${actionAttr("viewDamagePhoto", [drv.name])} style="padding: 4px 8px; font-size: 0.75rem; height: auto; margin-left: 8px; display:inline-flex; align-items:center; gap:4px; background: rgba(var(--primary-rgb), 0.2); border: 1px solid rgba(var(--primary-rgb), 0.4);"><i data-lucide="camera" style="width:12px; height:12px;"></i> 📸</button>`
                : "";

            const busSelectOptions = window.state.buses.map(b =>
                `<option value="${b.number}" ${String(b.number) === String(busNum) ? "selected" : ""}>Bus ${b.number}</option>`
            ).join("");

            const shiftTypes = [
                { value: "morning", label: "Prepodne" },
                { value: "afternoon", label: "Popodne" },
                { value: "night", label: "Noćna" },
                { value: "off", label: "Slobodan" },
                { value: "vacation", label: "Odmor" },
                { value: "sick", label: "Bolovanje" }
            ];

            const shiftSelectOptions = shiftTypes.map(st =>
                `<option value="${st.value}" ${shift && shift.type === st.value ? "selected" : ""}>${st.label}</option>`
            ).join("");

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
                <td>
                    <select ${changeAttr("updateDriverBusInline", [drv.name], "args-value")} style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; border-radius:6px; padding:4px 8px; font-size:0.8rem; cursor:pointer; font-family:'Outfit',sans-serif; outline:none;">
                        ${busSelectOptions}
                    </select>
                </td>
                <td>
                    <select ${changeAttr("updateDriverShiftInline", [drv.name], "args-value")} style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:white; border-radius:6px; padding:4px 8px; font-size:0.8rem; cursor:pointer; font-family:'Outfit',sans-serif; outline:none; max-width:140px;">
                        <option value="" ${!shift || shift.type === "off" ? "selected" : ""}>— Slobodan —</option>
                        ${shiftSelectOptions}
                    </select>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${shiftLabel}">${shiftLabel}</div>
                </td>
                <td>
                    ${drv.active
                        ? `<span class="text-success"><i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${currentStop}</span>`
                        : `<span style="color:var(--text-muted);">${route ? route.number + " · " : ""}${t("js_garage") || "Garaža"}</span>`
                    }
                </td>
            `;
            driversList.appendChild(tr);
        });
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function updateDriverBusInline(driverName, newBus) {
    const driver = window.state.drivers.find(d => d.name === driverName);
    if (driver) {
        driver.bus = newBus;
        saveState();
        showToast(`Bus ${newBus} dodeljen vozaču ${driverName}`, "success");
        renderDispatcherDashboard();
    }
}

function updateDriverShiftInline(driverName, newShiftType) {
    const todayStr = todayDateStr();
    if (!newShiftType) {
        setShiftForDriverDate(driverName, todayStr, { type: "clear" });
    } else {
        setShiftForDriverDate(driverName, todayStr, { type: newShiftType });
    }
    saveState();
    showToast(`Smena za ${driverName} ažurirana za danas`, "success");
    renderDispatcherDashboard();
}

window.renderDispatcherDashboard = renderDispatcherDashboard;

export {
    renderDispatcherDashboard,
    countUnreadMessages,
    updateMessagesNavBadge,
    updateDriverBusInline,
    updateDriverShiftInline
};

// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { switchSection } from "../layout/navigation.js";
import { formatDate } from "../maps/helpers.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";

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
        driver: window.currentUser.name,
        bus: window.currentUser.bus,
        type: `Kašnjenje: ${time} minuta`,
        reason: `${reason}${desc ? ' - ' + desc : ''}`,
        severity: time >= 20 ? "Srednja" : "Niska",
        status: "Aktivno"
    };
    
    window.state.reports.unshift(newReport);
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
        driver: window.currentUser.name,
        bus: window.currentUser.bus,
        type: `KVAR: ${type}`,
        reason: desc,
        severity: severity,
        status: "active"
    };
    
    window.state.reports.unshift(newReport);
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
        driver: window.currentUser.name,
        bus: window.currentUser.bus,
        type: type,           // translation ključ: "lost_wallet", "lost_tech", itd.
        location: location,
        desc: desc,
        status: "status_in_depot"  // translation ključ
    };
    
    window.state.lostItems.unshift(newItem);
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
        driver: window.currentUser.name,
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
            window.state.vacations.unshift(newRequest);
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
    
    const myRequests = window.state.vacations.filter(v => v.driver === window.currentUser.name);
    
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
export {
    submitDelayReport,
    submitBreakdownReport,
    submitLostItem,
    submitVacationRequest,
    renderDriverVacationHistory
};

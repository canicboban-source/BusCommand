// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { renderDriverDashboard } from "./dashboard.js";
import { t } from "../ui/i18n.js";

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
        driver: window.currentUser.name,
        bus: window.currentUser.bus,
        type: reportType,
        reason: reason,
        severity: severity,
        status: "Aktivno"
    };
    
    window.state.reports.unshift(newReport);
    saveState();
    
    // Ako je dispečerska uloga otvorena negde, storage listener će preneti, ali lokalno ažuriramo dashboard
    renderDriverDashboard();
    
    const msg = type === 'Panne' ? t("js_alert_breakdown_sent") : t("js_alert_delay_sent");
    showToast(msg, type === 'Panne' ? "warning" : "success");
}
export {
    sendQuickReport
};

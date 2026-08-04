// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { renderDriverDashboard } from "./dashboard.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import {
    enqueueOfflineWrite,
    isProbablyOfflineError,
    newIdempotencyKey
} from "./offline-queue.js";
import { renderNetworkStatus } from "./network-status.js";

let quickReportPending = false;
let lastQuickReportAt = 0;

async function sendQuickReport(type) {
    const invokedAt = Date.now();
    if (quickReportPending || invokedAt - lastQuickReportAt < 750
        || !window.currentUser || window.currentUser.role !== "driver") return;

    const definitions = {
        Stau: { type: "delay:10", reason: t("reason_traffic"), severity: "sev_low" },
        Panne: { type: "breakdown:bd_engine", reason: t("qr_breakdown"), severity: "sev_critical" },
        "Bus Voll": { type: "delay:5", reason: t("reason_passengers"), severity: "sev_low" },
        Verspatung: { type: "delay:5", reason: t("reason_traffic"), severity: "sev_low" }
    };
    const definition = definitions[type];
    if (!definition) {
        showToast(t("driver_report_invalid") || "Invalid report type.", "error");
        return;
    }

    const now = new Date();
    const report = {
        id: `rep-${Date.now()}`,
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        driverId: window.currentUser.id || window.currentUser.uid,
        driver: window.currentUser.name,
        bus: window.currentUser.bus || "",
        groupId: window.currentUser.groupId || window.currentUser.lineId || "",
        ...definition,
        status: "Aktivno"
    };

    quickReportPending = true;
    try {
        if (!IS_DEMO_MODE) {
            const idempotencyKey = newIdempotencyKey();
            const body = {
                ...definition,
                bus: report.bus,
                idempotencyKey,
                clientCreatedAt: now.toISOString()
            };
            report.idempotencyKey = idempotencyKey;
            try {
                const result = await ApiClient.createDriverReport(body);
                if (!result.success) {
                    if (isProbablyOfflineError(result)) {
                        report.status = "queued";
                        report.syncStatus = "queued";
                        const queued = enqueueOfflineWrite({
                            kind: "report",
                            payload: body,
                            localRecord: report
                        });
                        if (queued.ok) {
                            if (!Array.isArray(window.state.reports)) window.state.reports = [];
                            window.state.reports.unshift(report);
                            lastQuickReportAt = Date.now();
                            renderDriverDashboard();
                            renderNetworkStatus();
                            showToast(t("driver_report_queued"), "info");
                            return;
                        }
                    }
                    showToast(result.error || t("driver_report_failed"), "error");
                    return;
                }
                Object.assign(report, result.report || {}, { syncStatus: "sent" });
            } catch {
                report.status = "queued";
                report.syncStatus = "queued";
                const queued = enqueueOfflineWrite({
                    kind: "report",
                    payload: body,
                    localRecord: report
                });
                if (queued.ok) {
                    if (!Array.isArray(window.state.reports)) window.state.reports = [];
                    window.state.reports.unshift(report);
                    lastQuickReportAt = Date.now();
                    renderDriverDashboard();
                    renderNetworkStatus();
                    showToast(t("driver_report_queued"), "info");
                    return;
                }
                showToast(t("driver_report_failed"), "error");
                return;
            }
        }
        if (!Array.isArray(window.state.reports)) window.state.reports = [];
        window.state.reports.unshift(report);
        lastQuickReportAt = Date.now();
        if (IS_DEMO_MODE) saveState();
        renderDriverDashboard();
        const message = type === "Panne" ? t("js_alert_breakdown_sent") : t("js_alert_delay_sent");
        showToast(message, type === "Panne" ? "warning" : "success");
    } finally {
        quickReportPending = false;
    }
}

export { sendQuickReport };

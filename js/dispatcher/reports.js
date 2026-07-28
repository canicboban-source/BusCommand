// BusCommand — dispatcher report lifecycle: active queue -> immutable resolved history
import { actionAttr } from "../core/action-delegate.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { escapeHtml, formatDateTime, showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { renderDispatcherDashboard } from "./dashboard.js";
import {
    isActiveReport,
    isResolvedReport,
    reportKind,
    scopedDispatcherReports,
    sortReportsForOperations
} from "./report-model.js";

const pendingReportResolutions = new Set();

function visibleReports() {
    return sortReportsForOperations(scopedDispatcherReports({
        reports: window.state.reports,
        drivers: window.state.drivers,
        dispatchers: window.state.dispatchers,
        currentUser: window.currentUser,
        activeGroupId: window.state.activeGroupFilter || "",
        demo: IS_DEMO_MODE
    }));
}

function reportTypeLabel(report) {
    const kind = reportKind(report);
    if (kind.kind === "coverage") {
        return t("report_coverage_title") || "Nepokrivena smena";
    }
    if (kind.kind === "breakdown") {
        return `${t("report_breakdown_title")}: ${t(kind.detail) || kind.detail}`;
    }
    const minutes = /^\d+$/.test(kind.detail) ? kind.detail : "";
    return minutes ? `${t("report_delay_title")}: ${minutes} min` : (t("report_delay_title") || String(report.type || ""));
}

function reportReasonLabel(report) {
    const translated = t(report.reason) || report.reason || "";
    const description = String(report.description || "").trim();
    return description && description !== translated ? `${translated} · ${description}` : translated;
}

function reportWhen(report) {
    if (report.date || report.time) return formatDateTime(report.date, report.time);
    const createdAt = report.createdAt;
    const date = typeof createdAt?.toDate === "function" ? createdAt.toDate()
        : Number.isFinite(createdAt?.seconds) ? new Date(createdAt.seconds * 1000)
            : createdAt ? new Date(createdAt) : null;
    if (!date || Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat(window.state.language || "en", {
        dateStyle: "short", timeStyle: "short"
    }).format(date);
}

function severityBadge(report) {
    const severity = ["sev_low", "sev_medium", "sev_critical"].includes(report.severity)
        ? report.severity
        : "sev_critical";
    const className = severity === "sev_low" ? "severity-low"
        : severity === "sev_medium" ? "severity-medium" : "severity-critical";
    const labelKey = severity === "sev_low" ? "js_severity_low"
        : severity === "sev_medium" ? "js_severity_medium" : "js_severity_critical";
    return `<span class="badge ${className}">${escapeHtml(t(labelKey))}</span>`;
}

function renderDispatcherReports() {
    const tbody = document.getElementById("dispatcher-all-reports-table");
    if (!tbody) return;
    const reports = visibleReports();
    tbody.replaceChildren();

    if (reports.length === 0) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.className = "dispatcher-reports-empty";
        cell.textContent = window.state.activeGroupFilter ? t("no_drivers_in_group") : t("js_no_alerts");
        return;
    }

    reports.forEach(report => {
        const kind = reportKind(report);
        const active = isActiveReport(report);
        const resolved = isResolvedReport(report);
        const pending = pendingReportResolutions.has(report.id);
        const action = active
            ? `<button class="btn-table-action" ${pending ? "disabled aria-disabled=\"true\"" : actionAttr("resolveReport", [report.id])}>
                <i data-lucide="${pending ? "loader-circle" : "check-check"}"></i> ${escapeHtml(t(pending ? "report_resolving" : "btn_resolve"))}
               </button>`
            : `<span class="text-success dispatcher-report-resolved"><i data-lucide="check"></i> ${escapeHtml(t(resolved ? "status_resolved" : "report_status_unavailable"))}</span>`;
        const row = tbody.insertRow();
        row.className = active ? "is-active" : "is-resolved";
        row.innerHTML = `
            <td data-label="${escapeHtml(t("table_time"))}">${escapeHtml(reportWhen(report))}</td>
            <td data-label="${escapeHtml(t("table_driver"))}"><strong>${escapeHtml(report.driver || "—")}</strong><br><span class="dispatcher-report-bus">${escapeHtml(t("vehicle"))} ${escapeHtml(report.bus || "—")}</span></td>
            <td data-label="${escapeHtml(t("table_type"))}"><span class="${["breakdown", "coverage"].includes(kind.kind) ? "text-danger" : "text-warning"} dispatcher-report-type">${escapeHtml(reportTypeLabel(report))}</span></td>
            <td data-label="${escapeHtml(t("table_reason"))}">${escapeHtml(reportReasonLabel(report))}</td>
            <td data-label="${escapeHtml(t("table_severity"))}">${severityBadge(report)}</td>
            <td data-label="${escapeHtml(t("table_status"))}">${action}</td>`;
    });
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function resolveReport(id) {
    if (!id || pendingReportResolutions.has(id) || window.currentUser?.role !== "dispatcher") return false;
    const report = visibleReports().find(item => item.id === id);
    if (!report || !isActiveReport(report)) return false;
    pendingReportResolutions.add(id);
    renderDispatcherReports();
    try {
        let result = { success: true, report: { status: "resolved" } };
        if (!IS_DEMO_MODE) result = await ApiClient.resolveStaffReport(id);
        if (!result.success) {
            showToast(result.error || t("report_resolve_failed"), "error");
            return false;
        }
        Object.assign(report, result.report || {}, {
            status: "resolved",
            resolvedAt: result.report?.resolvedAt || new Date().toISOString(),
            resolvedBy: result.report?.resolvedBy || window.currentUser.id || window.currentUser.uid
        });
        if (IS_DEMO_MODE) saveState();
        showToast(t("report_resolved_toast"), "success", 3000);
        return true;
    } finally {
        pendingReportResolutions.delete(id);
        renderDispatcherReports();
        renderDispatcherDashboard();
    }
}

export {
    pendingReportResolutions,
    renderDispatcherReports,
    reportReasonLabel,
    reportTypeLabel,
    reportWhen,
    resolveReport,
    visibleReports
};

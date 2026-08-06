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


function ensureReportResolutionModal() {
    let modal = document.getElementById("report-resolution-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "report-resolution-modal";
    modal.className = "ops-modal-layer hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "report-resolution-title");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <form class="ops-incident-dialog ops-resolution-dialog">
            <div class="ops-incident-heading">
                <span class="ops-incident-icon is-amber"><i data-lucide="clipboard-check"></i></span>
                <div>
                    <h2 id="report-resolution-title">${escapeHtml(t("report_resolution_title"))}</h2>
                    <p id="report-resolution-context"></p>
                </div>
            </div>
            <p class="ops-resolution-intro">${escapeHtml(t("report_resolution_effect"))}</p>
            <label for="report-resolution-type">${escapeHtml(t("report_resolution_type"))}</label>
            <select id="report-resolution-type" required>
                <option value="restored">${escapeHtml(t("report_resolution_restored"))}</option>
                <option value="replacement">${escapeHtml(t("report_resolution_replacement"))}</option>
                <option value="cancelled">${escapeHtml(t("report_resolution_cancelled"))}</option>
            </select>
            <label for="report-resolution-summary">${escapeHtml(t("report_resolution_summary"))}</label>
            <textarea id="report-resolution-summary" minlength="3" maxlength="1000" rows="4" required
                placeholder="${escapeHtml(t("report_resolution_summary_placeholder"))}"></textarea>
            <p id="report-resolution-status" class="ops-resolution-status" role="status" aria-live="polite"></p>
            <div class="ops-incident-actions">
                <button type="button" class="btn-secondary" ${actionAttr("closeReportResolution")}>${escapeHtml(t("btn_cancel"))}</button>
                <button type="submit" class="urgent-action ops-resolution-submit"><i data-lucide="clipboard-check"></i> ${escapeHtml(t("report_resolution_confirm"))}</button>
            </div>
        </form>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
        if (event.target === modal) closeReportResolution();
    });
    modal.querySelector("form").addEventListener("submit", submitReportResolution);
    if (typeof lucide !== "undefined") lucide.createIcons();
    return modal;
}

function openReportResolution(id) {
    const report = visibleReports().find(item => item.id === id && isActiveReport(item));
    if (!report) return false;
    if (reportKind(report).kind === "coverage") {
        return typeof window.openCoverageResolver === "function"
            ? window.openCoverageResolver(id)
            : false;
    }
    const modal = ensureReportResolutionModal();
    modal.dataset.reportId = id;
    modal.querySelector("#report-resolution-context").textContent =
        `${report.driver || "—"} · ${reportTypeLabel(report)}`;
    modal.querySelector("form").reset();
    modal.querySelector("#report-resolution-status").textContent = "";
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#report-resolution-type")?.focus(), 0);
    return true;
}

function closeReportResolution() {
    const modal = document.getElementById("report-resolution-modal");
    if (!modal || modal.dataset.pending === "true") return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    delete modal.dataset.reportId;
}

async function submitReportResolution(event) {
    event.preventDefault();
    const modal = document.getElementById("report-resolution-modal");
    const id = String(modal?.dataset.reportId || "");
    const type = String(modal?.querySelector("#report-resolution-type")?.value || "");
    const summary = String(modal?.querySelector("#report-resolution-summary")?.value || "").trim();
    const status = modal?.querySelector("#report-resolution-status");
    if (!id || summary.length < 3) {
        if (status) status.textContent = t("report_resolution_required");
        return;
    }
    modal.dataset.pending = "true";
    modal.querySelector("button[type='submit']").disabled = true;
    if (status) status.textContent = t("report_resolving");
    const resolved = await resolveReport(id, { type, summary });
    delete modal.dataset.pending;
    modal.querySelector("button[type='submit']").disabled = false;
    if (resolved) closeReportResolution();
    else if (status) status.textContent = t("report_resolve_failed");
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
        // Empty reports ≠ empty roster — keep field-report copy (plan gaps live in Needs attention).
        cell.textContent = t("js_no_alerts");
        return;
    }

    reports.forEach(report => {
        const kind = reportKind(report);
        const active = isActiveReport(report);
        const resolved = isResolvedReport(report);
        const pending = pendingReportResolutions.has(report.id);
        const action = active
            ? `<button class="btn-table-action urgent-action" ${pending ? "disabled aria-disabled=\"true\"" : actionAttr(reportKind(report).kind === "coverage" ? "openCoverageResolver" : "openReportResolution", [report.id])}>
                <i data-lucide="${pending ? "loader-circle" : "wrench"}"></i> ${escapeHtml(t(pending ? "report_resolving" : "ops_btn_resolve"))}
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

async function resolveReport(id, resolution = null) {
    if (!resolution) return openReportResolution(id);
    if (!id || pendingReportResolutions.has(id) || window.currentUser?.role !== "dispatcher") return false;
    const report = visibleReports().find(item => item.id === id);
    if (!report || !isActiveReport(report)) return false;
    pendingReportResolutions.add(id);
    renderDispatcherReports();
    try {
        let result = { success: true, report: { status: "resolved", resolution } };
        if (!IS_DEMO_MODE) result = await ApiClient.resolveStaffReport(id, resolution);
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
    } catch (error) {
        showToast(error?.message || t("report_resolve_failed"), "error");
        return false;
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
    openReportResolution,
    closeReportResolution,
    resolveReport,
    visibleReports
};

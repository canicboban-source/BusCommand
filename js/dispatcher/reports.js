// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { formatDateTime, showToast } from "../core/utils.js";
import { renderDispatcherDashboard } from "./dashboard.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr as _changeAttr } from "../core/action-delegate.js";

// --- DISPEČERSKI KVAROVI I KAŠNJENJA ---
function renderDispatcherReports() {
    const tbody = document.getElementById("dispatcher-all-reports-table");
    tbody.innerHTML = "";

    // Filtriraj po grupi ako je aktivan filter
    let reports = window.state.reports;
    if (window.state.activeGroupFilter) {
        const driversInGroup = (window.state.drivers || [])
            .filter(d => d.groupId === window.state.activeGroupFilter)
            .map(d => d.name);
        reports = reports.filter(r => driversInGroup.includes(r.driver));
    }

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">${window.state.activeGroupFilter ? (t("no_drivers_in_group") || "Nema prijava za ovu grupu") : t("js_no_alerts")}</td></tr>`;
        return;
    }

    reports.forEach(rep => {
        const tr = document.createElement("tr");
        
        let severityBadge = "";
        if (rep.severity === "sev_low" || rep.severity === "Niska" || rep.severity === "Niedrig") severityBadge = `<span class="badge severity-low">${t("js_severity_low")}</span>`;
        else if (rep.severity === "sev_medium" || rep.severity === "Srednja" || rep.severity === "Mittel") severityBadge = `<span class="badge severity-medium">${t("js_severity_medium")}</span>`;
        else severityBadge = `<span class="badge severity-critical">${t("js_severity_critical")}</span>`;
        
        let actionBtn = "";
        const deleteBtn = `<button class="btn-table-action" ${actionAttr("deleteReport", [rep.id])} style="background:rgba(239,68,68,0.1); color:var(--danger-color); border-color:rgba(239,68,68,0.3); margin-left:6px;" title="${t('btn_delete')}"><i data-lucide="trash-2"></i></button>`;
        
        const isResolved = rep.status === "status_resolved" || rep.status === "Rešeno" || rep.status === "resolved";

        if (!isResolved) {
            actionBtn = `<div style="display:flex; align-items:center; gap:4px;">
                <button class="btn-table-action" ${actionAttr("resolveReport", [rep.id])}><i data-lucide="check-check"></i> ${t("btn_resolve")}</button>
                ${deleteBtn}
            </div>`;
        } else {
            actionBtn = `<div style="display:flex; align-items:center; gap:4px;">
                <span class="text-success" style="font-weight:600;"><i data-lucide="check"></i> ${t("status_resolved")}</span>
                ${deleteBtn}
            </div>`;
        }
        
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
        
        tr.innerHTML = `
            <td>${formatDateTime(rep.date, rep.time)}</td>
            <td><strong>${rep.driver}</strong><br><span style="font-size:12px;color:var(--text-muted);">${t("vehicle")} ${rep.bus}</span></td>
            <td><span class="${rep.type.startsWith('breakdown:') || rep.type.includes('KVAR') ? 'text-danger' : 'text-warning'}" style="font-weight:600;">${displayType}</span></td>
            <td>${displayReason}</td>
            <td>${severityBadge}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

function resolveReport(id) {
    const rep = window.state.reports.find(r => r.id === id);
    if (rep) {
        rep.status = "status_resolved";
        saveState();
        renderDispatcherReports();
        showToast(t("status_resolved") || "Report resolved", "success", 3000);
        lucide.createIcons();
    }
}

function deleteReport(id) {
    window.state.reports = (window.state.reports || []).filter(r => r.id !== id);
    saveState();
    renderDispatcherReports();
    renderDispatcherDashboard();
    lucide.createIcons();
}
export {
    renderDispatcherReports,
    resolveReport,
    deleteReport
};

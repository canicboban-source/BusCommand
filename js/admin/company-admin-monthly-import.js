import ApiClient from "../core/api-client.js";
import { loadStateFromFirestore } from "../core/firebase-service.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { readGroupMonthlyPlanFile } from "../imports/group-monthly-plan.js";
import { t } from "../ui/i18n.js";

let parsedFile = null;
let serverPreview = null;
let selectedFileName = "";
let pending = false;
let previewErrors = [];

function groupsForCompany() {
    const companyId = window.currentUser?.companyId;
    return (window.state.groups || []).filter(group =>
        !companyId || !group.companyId || group.companyId === companyId
    );
}

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function renderGroupOptions() {
    const select = document.getElementById("ca-monthly-import-group");
    if (!select) return;
    const previous = select.value;
    select.innerHTML = `<option value="">${escapeHtml(t("ca_plan_group_placeholder"))}</option>`
        + groupsForCompany().map(group =>
            `<option value="${escapeHtml(String(group.id))}">${escapeHtml(group.name || String(group.id))}</option>`
        ).join("");
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
}

function errorText(error) {
    const code = String(error?.code || error?.message || "monthly_import_generic").toLowerCase();
    const key = code.startsWith("monthly_import_") ? `ca_${code}` : `ca_monthly_import_${code}`;
    const translated = t(key, error?.params || {});
    return translated !== key ? translated : t("ca_monthly_import_generic");
}

function renderErrors(details) {
    if (!Array.isArray(details) || !details.length) return "";
    return `<div class="service-plan-errors" role="alert">
        <div class="service-plan-errors-title">${escapeHtml(t("ca_monthly_import_errors"))}</div>
        <ul>${details.slice(0, 50).map(item => {
            const key = `ca_monthly_import_${String(item.code || "").toLowerCase()}`;
            const text = t(key, { row: item.row || "—", duty: item.dutyCode || "" });
            return `<li>${escapeHtml(text !== key ? text : item.code || t("ca_monthly_import_generic"))}</li>`;
        }).join("")}</ul>
    </div>`;
}

function renderPreview() {
    const host = document.getElementById("ca-monthly-import-preview");
    if (!host) return;
    if (!parsedFile) {
        host.innerHTML = `<div class="service-plan-empty">${escapeHtml(t("ca_monthly_import_empty"))}</div>`;
        return;
    }
    if (!serverPreview) {
        host.innerHTML = `<div class="ca-monthly-local-preview">
            <i data-lucide="file-check-2"></i>
            <div><strong>${escapeHtml(selectedFileName)}</strong><span>${escapeHtml(t("ca_monthly_import_local_rows", { count: parsedFile.length }))}</span></div>
            <button type="button" class="btn-primary" ${pending ? "disabled" : actionAttr("previewCompanyGroupMonthlyImport")}>
                ${pending ? `<span class="spinner"></span>` : `<i data-lucide="scan-search"></i>`}
                ${escapeHtml(t("ca_monthly_import_preview_action"))}
            </button>
        </div>${renderErrors(previewErrors)}`;
    } else {
        const summary = serverPreview.summary;
        host.innerHTML = `<div class="ca-monthly-preview-card">
            <div class="ca-monthly-preview-summary">
                <div><span>${escapeHtml(t("ca_monthly_import_summary_drivers"))}</span><strong>${summary.drivers}</strong></div>
                <div><span>${escapeHtml(t("ca_monthly_import_summary_assignments"))}</span><strong>${summary.assignments}</strong></div>
                <div><span>${escapeHtml(t("ca_monthly_import_summary_removals"))}</span><strong>${summary.removals}</strong></div>
            </div>
            <div class="service-plan-table-wrap">
                <table class="service-plan-table">
                    <thead><tr>
                        <th>${escapeHtml(t("plan_import_driver"))}</th>
                        <th>${escapeHtml(t("plan_import_month"))}</th>
                        <th>${escapeHtml(t("ca_plan_col_duty"))}</th>
                        <th>${escapeHtml(t("ca_monthly_import_action"))}</th>
                    </tr></thead>
                    <tbody>${serverPreview.rows.slice(0, 30).map(row => `<tr>
                        <td>${escapeHtml(row.driverName)}</td>
                        <td>${escapeHtml(row.date)}</td>
                        <td><code>${escapeHtml(row.dutyCode)}</code></td>
                        <td>${escapeHtml(t(row.action === "remove" ? "ca_monthly_import_remove" : "ca_monthly_import_assign"))}</td>
                    </tr>`).join("")}</tbody>
                </table>
            </div>
            ${serverPreview.rows.length > 30 ? `<p class="service-plan-format-note">${escapeHtml(t("ca_monthly_import_more_rows", { count: serverPreview.rows.length - 30 }))}</p>` : ""}
            <div class="ca-monthly-activation-bar">
                <div><strong>${escapeHtml(t("ca_monthly_import_ready"))}</strong><span>${escapeHtml(t("ca_monthly_import_ready_hint"))}</span></div>
                <button type="button" class="btn-secondary" ${pending ? "disabled" : actionAttr("clearCompanyGroupMonthlyImport")}>${escapeHtml(t("btn_clear_preview"))}</button>
                <button type="button" class="btn-primary" ${pending ? "disabled" : actionAttr("commitCompanyGroupMonthlyImport")}>
                    ${pending ? `<span class="spinner"></span>` : `<i data-lucide="calendar-check-2"></i>`}
                    ${escapeHtml(t("ca_monthly_import_commit"))}
                </button>
            </div>
        </div>`;
    }
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function handleCompanyGroupMonthlyFile(event) {
    const file = event?.target?.files?.[0];
    event.target.value = "";
    if (!file) return;
    const month = document.getElementById("ca-monthly-import-month")?.value || "";
    if (!month) {
        showToast(t("ca_monthly_import_month_required"), "error");
        return;
    }
    try {
        parsedFile = await readGroupMonthlyPlanFile(file, { month });
        selectedFileName = file.name;
        serverPreview = null;
        previewErrors = [];
        renderPreview();
    } catch (error) {
        parsedFile = null;
        selectedFileName = "";
        serverPreview = null;
        previewErrors = [];
        renderPreview();
        showToast(errorText(error), "error", 7000);
    }
}

async function previewCompanyGroupMonthlyImport() {
    if (pending || !parsedFile) return;
    const companyId = window.currentUser?.companyId;
    const groupId = document.getElementById("ca-monthly-import-group")?.value || "";
    const month = document.getElementById("ca-monthly-import-month")?.value || "";
    const mode = document.getElementById("ca-monthly-import-mode")?.value || "merge";
    const reason = document.getElementById("ca-monthly-import-reason")?.value.trim() || "";
    if (!groupId) return showToast(t("ca_plan_group_required"), "error");
    if (!month) return showToast(t("ca_monthly_import_month_required"), "error");
    if (reason.length < 3) return showToast(t("ca_monthly_import_reason_required"), "error");
    if (IS_DEMO_MODE) return showToast(t("ca_monthly_import_production_only"), "info");

    pending = true;
    previewErrors = [];
    renderPreview();
    try {
        const result = await ApiClient.previewGroupMonthlyPlanImport({
            companyId,
            groupId,
            month,
            mode,
            sourceName: selectedFileName,
            reason,
            rows: parsedFile
        });
        if (!result.success) {
            const error = new Error(result.code || "monthly_import_generic");
            error.code = result.code;
            error.details = result.details;
            throw error;
        }
        serverPreview = result.preview;
        showToast(t("ca_monthly_import_preview_success"), "success");
    } catch (error) {
        previewErrors = Array.isArray(error.details) ? error.details : [];
        showToast(errorText(error), "error", 7000);
    } finally {
        pending = false;
        renderPreview();
    }
}

async function commitCompanyGroupMonthlyImport() {
    if (pending || !serverPreview) return;
    pending = true;
    renderPreview();
    try {
        const result = await ApiClient.commitGroupMonthlyPlanImport(
            window.currentUser?.companyId,
            serverPreview.id,
            serverPreview.fingerprint
        );
        if (!result.success) {
            const error = new Error(result.code || "monthly_import_generic");
            error.code = result.code;
            error.details = result.details;
            throw error;
        }
        try {
            const refreshed = await loadStateFromFirestore(window.currentUser.companyId);
            if (refreshed?.shifts) window.state.shifts = refreshed.shifts;
            if (refreshed?.schedules) window.state.schedules = refreshed.schedules;
        } catch {
            // The server commit is authoritative. A later observer/refresh reloads the roster.
        }
        clearCompanyGroupMonthlyImport();
        showToast(t("ca_monthly_import_commit_success", {
            assignments: result.summary?.assignments || 0,
            removals: result.summary?.removals || 0
        }), "success", 6000);
    } catch (error) {
        showToast(errorText(error), "error", 8000);
    } finally {
        pending = false;
        renderPreview();
    }
}

function clearCompanyGroupMonthlyImport() {
    parsedFile = null;
    serverPreview = null;
    selectedFileName = "";
    previewErrors = [];
    const file = document.getElementById("ca-monthly-import-file");
    if (file) file.value = "";
    renderPreview();
}

function invalidateCompanyGroupMonthlyPreview() {
    serverPreview = null;
    renderPreview();
}

function renderCompanyGroupMonthlyImport() {
    if (window.currentUser?.role !== "company-admin") return;
    renderGroupOptions();
    const month = document.getElementById("ca-monthly-import-month");
    if (month && !month.value) month.value = currentMonth();
    renderPreview();
}

export {
    clearCompanyGroupMonthlyImport,
    commitCompanyGroupMonthlyImport,
    handleCompanyGroupMonthlyFile,
    invalidateCompanyGroupMonthlyPreview,
    previewCompanyGroupMonthlyImport,
    renderCompanyGroupMonthlyImport
};

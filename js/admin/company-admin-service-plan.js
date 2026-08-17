import ApiClient from "../core/api-client.js";
import { applyServicePlanToCatalog, findDemoPlan } from "../core/service-plan.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml, showToast, refreshIcons, toastApiError } from "../core/utils.js";
import { readServicePlanFile } from "../imports/service-plan-excel.js";
import { t } from "../ui/i18n.js";
import { icon, tx, btnSecondary, btnPrimary, statCell } from "../ui/markup.js";

let pendingImport = null;
let currentPlans = new Map();
let planHistories = new Map();
let historyDetails = new Map();
let loadingPlans = false;
let loadingHistoryGroupId = null;
let selectedHistoryId = null;
let selectedDutyCode = null;
let dutyReturnFocusCode = null;
let pendingDraft = null;
let draftFormMode = null;
let draftFormCode = null;

if (typeof document !== "undefined") {
    document.addEventListener("keydown", event => {
        if (!selectedDutyCode) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeCompanyServicePlanDuty();
            return;
        }
        if (event.key !== "Tab") return;
        const drawer = document.querySelector(".service-plan-duty-drawer");
        const focusable = [...(drawer?.querySelectorAll("button, [href], select, input, [tabindex]:not([tabindex='-1'])") || [])]
            .filter(element => !element.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

function isCompanyAdmin() {
    return ["company-admin", "company_admin"].includes(window.currentUser?.role);
}

function companyGroups() {
    const companyId = window.currentUser?.companyId;
    return (window.state.groups || []).filter(group =>
        (!companyId || !group.companyId || group.companyId === companyId)
    );
}

function selectedGroupId() {
    return String(document.getElementById("ca-service-plan-group")?.value || "").trim();
}

function renderGroupSelector() {
    const select = document.getElementById("ca-service-plan-group");
    if (!select) return;
    const previous = select.value;
    const groups = companyGroups();
    select.innerHTML = `<option value="">${tx("ca_plan_group_placeholder")}</option>`
        + groups.map(group => `<option value="${escapeHtml(String(group.id))}">${escapeHtml(group.name || String(group.id))}</option>`).join("");
    if (groups.some(group => String(group.id) === previous)) select.value = previous;
}

function formatServicePlanError(error) {
    const params = { ...(error?.params || {}) };
    const code = String(error?.code || "").trim();
    if (code) {
        const key = `ca_plan_err_${code}`;
        const translated = t(key, params);
        if (translated !== key) return translated;
    }
    const raw = String(error?.message || "").trim();
    if (raw.startsWith("ca_plan_")) {
        const translated = t(raw, params);
        if (translated !== raw) return translated;
    }
    return raw || t("ca_plan_err_generic");
}

function renderErrors(errors) {
    if (!errors?.length) return "";
    return `<div class="service-plan-errors" role="alert">
        <div class="service-plan-errors-title">${tx("ca_plan_errors_title")}</div>
        <ul>${errors.slice(0, 50).map(error => `<li><code>${escapeHtml(error.path || "PDF")}</code> ${escapeHtml(formatServicePlanError(error))}</li>`).join("")}</ul>
        ${errors.length > 50 ? `<p>${tx("ca_plan_errors_more", { count: errors.length - 50 })}</p>` : ""}
    </div>`;
}

function dayTypeLabel(dayType) {
    const labels = {
        SCHOOL_WEEKDAY: "ca_plan_day_school",
        HOLIDAY_WEEKDAY: "ca_plan_day_holiday_weekday",
        SATURDAY: "ca_plan_day_saturday",
        SUNDAY_HOLIDAY: "ca_plan_day_sunday",
        ALL_DAYS: "ca_plan_day_all"
    };
    return t(labels[dayType] || "ca_plan_day_other");
}

const DRAFT_DAY_TYPES = ["SCHOOL_WEEKDAY", "HOLIDAY_WEEKDAY", "SATURDAY", "SUNDAY_HOLIDAY", "ALL_DAYS"];
const TIME_REGEX = /^([0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;

function isValidTime(value) {
    return typeof value === "string" && TIME_REGEX.test(value);
}

function isValidDayType(value) {
    return DRAFT_DAY_TYPES.includes(value);
}

function bumpVersion(version) {
    const match = String(version || "").match(/^\d+/);
    return match ? String(Number(match[0]) + 1) : "1";
}

function deepCloneDuties(duties = []) {
    return duties.map(duty => ({
        ...duty,
        activities: (duty.activities || []).map(activity => ({ ...activity }))
    }));
}

function dutySignature(duty) {
    return JSON.stringify({
        dayType: duty.dayType,
        workStart: duty.workStart,
        firstTripStart: duty.firstTripStart,
        lastTripEnd: duty.lastTripEnd,
        workEnd: duty.workEnd,
        activities: duty.activities || []
    });
}

function comparePlanDuties(activePlan, nextPlan) {
    if (!activePlan?.duties?.length) {
        return { firstPublish: true, added: nextPlan?.duties?.length || 0, changed: 0, removed: 0 };
    }
    const active = new Map(activePlan.duties.map(duty => [duty.code, duty]));
    const next = new Map((nextPlan?.duties || []).map(duty => [duty.code, duty]));
    let added = 0;
    let changed = 0;
    let removed = 0;
    next.forEach((duty, code) => {
        if (!active.has(code)) added += 1;
        else if (dutySignature(active.get(code)) !== dutySignature(duty)) changed += 1;
    });
    active.forEach((_duty, code) => { if (!next.has(code)) removed += 1; });
    return { firstPublish: false, added, changed, removed };
}

function renderPlanComparison(activePlan, nextPlan) {
    const comparison = comparePlanDuties(activePlan, nextPlan);
    if (comparison.firstPublish) {
        return `<div class="service-plan-comparison is-first">
            ${icon("sparkles")}
            <div><strong>${tx("ca_plan_first_publish")}</strong><span>${tx("ca_plan_first_publish_hint", { count: comparison.added })}</span></div>
        </div>`;
    }
    return `<div class="service-plan-comparison">
        ${statCell("ca_plan_compare_active", activePlan.planVersion || "—")}
        <div class="positive"><span>${tx("ca_plan_compare_added")}</span><strong>+${comparison.added}</strong></div>
        <div><span>${tx("ca_plan_compare_changed")}</span><strong>${comparison.changed}</strong></div>
        <div class="negative"><span>${tx("ca_plan_compare_removed")}</span><strong>−${comparison.removed}</strong></div>
    </div>`;
}

function renderGroupMismatch(plan) {
    const groupId = String(pendingImport?.groupId || "").trim();
    const planCode = String(plan?.planCode || "").trim();
    if (!/^\d+$/.test(groupId) || groupId === planCode) return "";
    return `<div class="service-plan-warning" role="status">
        ${icon("triangle-alert")}
        <span>${tx("ca_plan_group_mismatch", { plan: planCode, group: pendingImport.groupName })}</span>
    </div>`;
}

function renderDutyTable(plan) {
    const duties = plan?.duties || [];
    if (!duties.length) return "";
    return `<div class="service-plan-table-wrap">
        <table class="service-plan-table">
            <thead><tr>
                <th>${tx("ca_plan_col_duty")}</th>
                <th>${tx("ca_plan_col_work_start")}</th>
                <th>${tx("ca_plan_col_first_trip")}</th>
                <th>${tx("ca_plan_col_last_trip")}</th>
                <th>${tx("ca_plan_col_work_end")}</th>
                <th>${tx("ca_plan_col_day_type")}</th>
                <th><span class="sr-only">${tx("ca_plan_col_details")}</span></th>
            </tr></thead>
            <tbody>${duties.map(duty => `<tr>
                <td><button type="button" class="service-plan-duty-link" ${actionAttr("openCompanyServicePlanDuty", duty.code)}>${escapeHtml(duty.code)}</button></td>
                <td>${escapeHtml(duty.workStart)}</td>
                <td>${escapeHtml(duty.firstTripStart)}</td>
                <td>${escapeHtml(duty.lastTripEnd)}</td>
                <td>${escapeHtml(duty.workEnd)}${duty.endDayOffset ? `<sup>+${escapeHtml(duty.endDayOffset)}</sup>` : ""}</td>
                <td><span class="service-plan-day-badge">${escapeHtml(dayTypeLabel(duty.dayType))}</span></td>
                <td><button type="button" class="service-plan-row-action" aria-label="${tx("ca_plan_open_duty", { duty: duty.code })}" ${actionAttr("openCompanyServicePlanDuty", duty.code)}>${icon("chevron-right")}</button></td>
            </tr>`).join("")}</tbody>
        </table>
    </div>`;
}

function renderDutyDrawer(plan) {
    if (!selectedDutyCode) return "";
    const duty = (plan?.duties || []).find(item => item.code === selectedDutyCode);
    if (!duty) return "";
    return `<div class="service-plan-drawer-backdrop" role="presentation" ${actionAttr("closeCompanyServicePlanDuty", undefined, { self: true })}>
        <aside class="service-plan-duty-drawer" role="dialog" aria-modal="true" aria-labelledby="ca-duty-title">
            <div class="service-plan-duty-drawer-header">
                <div><span class="service-plan-kicker">${tx("ca_plan_duty_details")}</span><h3 id="ca-duty-title">${escapeHtml(duty.code)}</h3></div>
                <button type="button" class="btn-icon-nav" aria-label="${tx("ca_plan_close")}" ${actionAttr("closeCompanyServicePlanDuty")}>${icon("x")}</button>
            </div>
            <div class="service-plan-duty-summary">
                ${statCell("ca_plan_col_work_start", duty.workStart)}
                ${statCell("ca_plan_col_first_trip", duty.firstTripStart)}
                ${statCell("ca_plan_col_last_trip", duty.lastTripEnd)}
                ${statCell("ca_plan_col_work_end", duty.workEnd)}
            </div>
            <div class="service-plan-activity-list">${(duty.activities || []).map(activity => `<article>
                <span class="service-plan-activity-sequence">${escapeHtml(activity.sequence)}</span>
                <div><strong>${escapeHtml(activity.type)}</strong><span>${escapeHtml(activity.from || activity.startLocation || "—")} → ${escapeHtml(activity.to || activity.endLocation || "—")}</span></div>
                <time>${escapeHtml(activity.start)}–${escapeHtml(activity.end)}</time>
            </article>`).join("")}</div>
        </aside>
    </div>`;
}

function renderServicePlanPreview() {
    const container = document.getElementById("ca-service-plan-preview");
    if (!container) return;
    if (!pendingImport) {
        container.innerHTML = `<div class="service-plan-empty">${tx("ca_plan_preview_empty")}</div>`;
        return;
    }

    const result = pendingImport.result;
    const plan = result.plan || pendingImport.rawPlan;
    const summary = result.summary || {};
    const activePlan = currentPlans.get(pendingImport.groupId);
    const activateLabel = t("ca_plan_activate_specific", {
        version: plan?.planVersion || "—",
        group: pendingImport.groupName
    });
    const blocking = !result.valid;
    const warningCount = Array.isArray(result.errors)
        ? result.errors.filter(error => error?.severity === "warning").length
        : 0;
    container.innerHTML = `
        <div class="service-plan-preview-card ${result.valid ? "is-valid" : "is-invalid"}">
            <div class="service-plan-preview-header">
                <div>
                    <span class="service-plan-kicker">${tx("ca_plan_preview_kicker")}</span>
                    <h3>${tx("ca_plan_preview_title")}</h3>
                    <p>${escapeHtml(pendingImport.fileName)}</p>
                </div>
                <span class="service-plan-status ${result.valid ? "success" : "error"}">
                    ${escapeHtml(result.valid ? t("ca_plan_ready") : t("ca_plan_needs_fix"))}
                </span>
            </div>
            <div class="service-plan-preview-strip">
                <div>${icon("bus-front")}<span>${tx("ca_plan_group")}</span><strong>${escapeHtml(pendingImport.groupName)}</strong></div>
                ${statCell("ca_plan_version_short", plan?.planVersion || "—")}
                ${statCell("ca_plan_valid_from", plan?.validFrom || "—")}
                <div><span>${tx("ca_plan_duties")}</span><strong>${summary.dutyCount || 0}</strong></div>
                ${statCell("ca_plan_timezone", plan?.timezone || "—")}
            </div>
            ${renderGroupMismatch(plan)}
            ${renderPlanComparison(activePlan, plan)}
            ${renderErrors(result.errors)}
            ${renderDutyTable(plan)}
            <div class="service-plan-actions">
                ${btnSecondary(actionAttr("clearCompanyServicePlanPreview"), `${tx("btn_clear_preview")}`)}
            </div>
        </div>
        <div class="ca-catalog-activation-bar" role="region" aria-label="${tx("ca_plan_activate_bar")}">
            <div>
                <strong>${escapeHtml(pendingImport.groupName)} · ${tx("ca_plan_version_short")} ${escapeHtml(plan?.planVersion || "—")}</strong>
                <span>${tx("ca_plan_activate_bar_hint", {
                    duties: summary.dutyCount || 0,
                    warnings: warningCount,
                    validFrom: plan?.validFrom || "—"
                })}</span>
            </div>
            <button type="button" id="ca-publish-service-plan" class="btn-primary" ${actionAttr("publishCompanyServicePlan")} ${blocking ? "disabled" : ""}>
                ${icon("badge-check")} ${escapeHtml(activateLabel)}
            </button>
        </div>
        ${renderDutyDrawer(plan)}`;
    refreshIcons();
}

function renderCurrentServicePlans() {
    const container = document.getElementById("ca-current-service-plans");
    if (!container) return;
    const groups = companyGroups();
    if (!groups.length) {
        container.innerHTML = `<div class="service-plan-empty">${tx("ca_plan_groups_required")}</div>`;
        return;
    }
    container.innerHTML = groups.map(group => {
        const groupId = String(group.id);
        const plan = currentPlans.get(groupId);
        const dutyCount = plan?.dutyCount ?? plan?.duties?.length;
        return `<article class="service-plan-current-card ${selectedGroupId() === groupId ? "is-selected" : ""}">
            <div class="service-plan-current-icon">${icon("route")}</div>
            <div>
                <strong>${escapeHtml(group.name || String(group.id))}</strong>
                <span>${plan
                    ? `${escapeHtml(plan.planCode)} · ${tx("ca_plan_version_short")} ${escapeHtml(plan.planVersion)} · ${escapeHtml(plan.validFrom)}${Number.isFinite(dutyCount) ? ` · ${tx("ca_plan_duty_count", { count: dutyCount })}` : ""}`
                    : escapeHtml(loadingPlans ? t("loading") : t("ca_plan_not_published"))}</span>
            </div>
            ${plan ? `<span class="service-plan-status success">${tx("ca_plan_active")}</span>` : ""}
        </article>`;
    }).join("");
    refreshIcons();
}

function formatPublishedAt(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    const locale = document.documentElement.lang === "de" ? "de-AT" : document.documentElement.lang === "sr" ? "sr-Latn-RS" : "en-GB";
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function historyStatus(plan) {
    if (plan.status === "active") return t("ca_plan_active");
    if (plan.status === "staged") return t("ca_plan_staged");
    return t("ca_plan_superseded");
}

function renderHistoryDutyDetails(plan) {
    if (!plan?.duties?.length) return `<div class="service-plan-empty">${tx("ca_plan_history_no_duties")}</div>`;
    return `<div class="service-plan-history-detail">
        <div class="service-plan-history-detail-header">
            <div><span>${tx("ca_plan_history_viewing")}</span><strong>${escapeHtml(plan.planCode)} · ${tx("ca_plan_version_short")} ${escapeHtml(plan.planVersion)}</strong></div>
            ${btnSecondary(actionAttr("closeCompanyServicePlanHistory"), `${icon("x")}${tx("ca_plan_history_close")}`)}
        </div>
        <div class="service-plan-preview-strip">
            ${statCell("ca_plan_valid_from", plan.validFrom || "—")}
            ${statCell("ca_plan_timezone", plan.timezone || "—")}
            ${statCell("ca_plan_duties", plan.duties.length)}
            ${statCell("ca_plan_history_published", formatPublishedAt(plan.publishedAt))}
        </div>
        <div class="service-plan-history-duties">${plan.duties.map(duty => `<details>
            <summary>
                <span><strong>${escapeHtml(duty.code)}</strong><small>${escapeHtml(dayTypeLabel(duty.dayType))}</small></span>
                <span>${escapeHtml(duty.workStart)}–${escapeHtml(duty.workEnd)} ${icon("chevron-down")}</span>
            </summary>
            <div class="service-plan-duty-summary">
                ${statCell("ca_plan_col_work_start", duty.workStart)}
                ${statCell("ca_plan_col_first_trip", duty.firstTripStart)}
                ${statCell("ca_plan_col_last_trip", duty.lastTripEnd)}
                ${statCell("ca_plan_col_work_end", duty.workEnd)}
            </div>
            <div class="service-plan-activity-list">${(duty.activities || []).map(activity => `<article>
                <span class="service-plan-activity-sequence">${escapeHtml(activity.sequence)}</span>
                <div><strong>${escapeHtml(activity.type)}</strong><span>${escapeHtml(activity.from || activity.startLocation || "—")} → ${escapeHtml(activity.to || activity.endLocation || "—")}</span></div>
                <time>${escapeHtml(activity.start)}–${escapeHtml(activity.end)}</time>
            </article>`).join("")}</div>
        </details>`).join("")}</div>
    </div>`;
}

function renderServicePlanHistory() {
    const container = document.getElementById("ca-service-plan-history");
    if (!container) return;
    const groupId = selectedGroupId();
    if (!groupId) {
        container.innerHTML = `<div class="service-plan-empty">${tx("ca_plan_history_select_group")}</div>`;
        return;
    }
    if (loadingHistoryGroupId === groupId) {
        container.innerHTML = `<div class="service-plan-empty">${tx("loading")}</div>`;
        return;
    }
    const history = planHistories.get(groupId) || [];
    if (!history.length) {
        container.innerHTML = `<div class="service-plan-empty">${tx("ca_plan_history_empty")}</div>`;
        return;
    }
    const rows = history.map(plan => {
        const canActivate = plan.status === "staged" || plan.status === "superseded";
        const activateLabel = plan.status === "superseded" ? t("ca_plan_rollback") : t("ca_plan_activate");
        return `<tr class="${plan.status === "active" ? "is-active" : ""}">
        <td data-label="${tx("ca_plan_code")}"><strong>${escapeHtml(plan.planCode)}</strong></td>
        <td data-label="${tx("ca_plan_version_short")}">${escapeHtml(plan.planVersion)}</td>
        <td data-label="${tx("ca_plan_valid_from")}">${escapeHtml(plan.validFrom)}</td>
        <td data-label="${tx("ca_plan_duties")}">${escapeHtml(plan.dutyCount ?? "—")}</td>
        <td data-label="${tx("ca_plan_history_published")}">${escapeHtml(formatPublishedAt(plan.publishedAt))}</td>
        <td data-label="${tx("ca_col_status")}"><span class="service-plan-status ${plan.status === "active" ? "success" : plan.status === "staged" ? "warning" : "neutral"}">${escapeHtml(historyStatus(plan))}</span></td>
        <td data-label="${tx("table_actions")}" class="service-plan-history-actions">
            <button type="button" class="btn-secondary service-plan-history-view" ${actionAttr("openCompanyServicePlanHistory", [plan.id])} ${selectedHistoryId === plan.id ? "aria-current=\"true\"" : ""}>${icon("eye")}${tx("ca_plan_history_view")}</button>
            ${canActivate ? `<button type="button" class="btn-primary service-plan-history-activate" ${actionAttr("activateCompanyServicePlanVersion", [plan.id])}>${icon("badge-check")}${escapeHtml(activateLabel)}</button>` : ""}
        </td>
    </tr>`;
    }).join("");
    const selected = selectedHistoryId ? historyDetails.get(selectedHistoryId) : null;
    container.innerHTML = `<div class="service-plan-table-wrap"><table class="service-plan-table service-plan-history-table">
        <thead><tr><th>${tx("ca_plan_code")}</th><th>${tx("ca_plan_version_short")}</th><th>${tx("ca_plan_valid_from")}</th><th>${tx("ca_plan_duties")}</th><th>${tx("ca_plan_history_published")}</th><th>${tx("ca_col_status")}</th><th>${tx("table_actions")}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        ${selected ? renderHistoryDutyDetails(selected) : ""}`;
    refreshIcons();
}

async function loadServicePlanHistory() {
    if (!isCompanyAdmin()) return;
    const groupId = selectedGroupId();
    if (!groupId || loadingHistoryGroupId === groupId) {
        renderServicePlanHistory();
        return;
    }
    loadingHistoryGroupId = groupId;
    selectedHistoryId = null;
    renderServicePlanHistory();
    try {
        if (USE_LOCAL_STATE) {
            const plans = (window.state.servicePlans || [])
                .filter(plan => String(plan.groupId) === groupId)
                .map(plan => ({
                    ...plan,
                    dutyCount: plan.dutyCount ?? plan.duties?.length ?? 0
                }))
                .sort((left, right) => String(right.publishedAt || right.validFrom).localeCompare(String(left.publishedAt || left.validFrom)));
            planHistories.set(groupId, plans);
            plans.forEach(plan => historyDetails.set(plan.id, plan));
        } else {
            const result = await ApiClient.getServicePlanHistory(window.currentUser.companyId, groupId);
            if (!result.success) throw new Error(result.error || t("ca_plan_history_failed"));
            planHistories.set(groupId, result.plans || []);
        }
    } catch (error) {
        planHistories.set(groupId, []);
        showToast(error.message || t("ca_plan_history_failed"), "error");
    } finally {
        loadingHistoryGroupId = null;
        renderServicePlanHistory();
    }
}

async function openCompanyServicePlanHistory(planId) {
    const groupId = selectedGroupId();
    if (!groupId) return;
    selectedHistoryId = planId;
    if (!historyDetails.has(planId) && !USE_LOCAL_STATE) {
        renderServicePlanHistory();
        const result = await ApiClient.getServicePlanVersion(window.currentUser.companyId, groupId, planId);
        if (!result.success) {
            selectedHistoryId = null;
            renderServicePlanHistory();
            showToast(result.error || t("ca_plan_history_failed"), "error");
            return;
        }
        historyDetails.set(planId, result.plan);
    }
    renderServicePlanHistory();
    document.querySelector(".service-plan-history-detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeCompanyServicePlanHistory() {
    const planId = selectedHistoryId;
    selectedHistoryId = null;
    renderServicePlanHistory();
    document.querySelector(`[data-action="openCompanyServicePlanHistory"][data-action-args='["${CSS.escape(planId || "")}"]']`)?.focus();
}

async function loadCurrentServicePlans() {
    if (!isCompanyAdmin() || loadingPlans) return;
    loadingPlans = true;
    renderCurrentServicePlans();
    const companyId = window.currentUser?.companyId;
    try {
        const groups = companyGroups();
        const results = await Promise.all(groups.map(async group => {
            const code = String(group.id);
            if (USE_LOCAL_STATE) return [code, findDemoPlan(code)];
            const result = await ApiClient.getActiveServicePlan(companyId, code);
            return [code, result.success ? result.plan : null];
        }));
        currentPlans = new Map(results);
    } finally {
        loadingPlans = false;
        renderCurrentServicePlans();
        renderServicePlanPreview();
    }
}

function renderCompanyAdminServicePlan() {
    if (!isCompanyAdmin()) return;
    renderGroupSelector();
    renderServicePlanEditor();
    renderServicePlanPreview();
    renderCurrentServicePlans();
    renderServicePlanHistory();
    loadCurrentServicePlans();
    loadServicePlanHistory();
}

async function handleCompanyServicePlanFile(event) {
    if (!isCompanyAdmin()) return;
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const groupId = selectedGroupId();
    const group = companyGroups().find(item => String(item.id) === groupId);
    if (!group) {
        showToast(t("ca_plan_group_required"), "error");
        return;
    }
    try {
        const result = await readServicePlanFile(file);
        selectedDutyCode = null;
        pendingImport = {
            fileName: file.name,
            contentType: file.type || null,
            byteSize: Number.isFinite(file.size) ? file.size : null,
            groupId,
            groupName: group.name || groupId,
            result,
            rawPlan: result.plan
        };
        renderServicePlanPreview();
        showToast(result.valid ? t("ca_plan_ready") : t("ca_plan_needs_fix"), result.valid ? "success" : "error");
    } catch (error) {
        pendingImport = null;
        renderServicePlanPreview();
        const msg = String(error?.message || "").trim();
        showToast(msg.startsWith("ca_plan_") ? t(msg) : (msg || t("error_generic")), "error");
    }
}

function handleCompanyServicePlanGroupChange() {
    if (pendingImport && pendingImport.groupId !== selectedGroupId()) {
        pendingImport = null;
        selectedDutyCode = null;
        dutyReturnFocusCode = null;
        renderServicePlanPreview();
    }
    renderCurrentServicePlans();
    selectedHistoryId = null;
    renderServicePlanHistory();
    loadServicePlanHistory();
}

function clearCompanyServicePlanPreview() {
    pendingImport = null;
    selectedDutyCode = null;
    dutyReturnFocusCode = null;
    renderServicePlanPreview();
}

function openCompanyServicePlanDuty(dutyCode) {
    if (!pendingImport?.result?.plan?.duties?.some(duty => duty.code === dutyCode)) return;
    dutyReturnFocusCode = dutyCode;
    selectedDutyCode = dutyCode;
    renderServicePlanPreview();
    document.querySelector(".service-plan-duty-drawer .btn-icon-nav")?.focus();
}

function closeCompanyServicePlanDuty() {
    const returnCode = dutyReturnFocusCode;
    selectedDutyCode = null;
    renderServicePlanPreview();
    const trigger = [...document.querySelectorAll(".service-plan-duty-link")]
        .find(button => button.textContent?.trim() === returnCode);
    trigger?.focus();
}

async function publishCompanyServicePlan() {
    if (!isCompanyAdmin() || !pendingImport?.result?.valid) return;
    const groupId = selectedGroupId();
    if (!groupId || groupId !== pendingImport.groupId) {
        showToast(t("ca_plan_group_required"), "error");
        return;
    }
    const button = document.getElementById("ca-publish-service-plan");
    if (button?.disabled) return;
    if (button) button.disabled = true;
    const plan = pendingImport.result.plan;
    const source = {
        fileName: pendingImport.fileName || null,
        contentType: pendingImport.contentType || null,
        byteSize: pendingImport.byteSize ?? null
    };
    try {
        if (USE_LOCAL_STATE) {
            if (!Array.isArray(window.state.servicePlans)) window.state.servicePlans = [];
            const planId = `${groupId}-${plan.planCode}-${plan.planVersion}-${plan.validFrom}`;
            if (window.state.servicePlans.some(existing => existing.id === planId)) {
                throw new Error(t("ca_plan_version_exists"));
            }
            window.state.servicePlans.forEach(existing => {
                if (existing.groupId === groupId && existing.status === "active") {
                    existing.status = "superseded";
                    existing.supersededBy = planId;
                }
            });
            const published = {
                ...plan,
                groupId,
                id: planId,
                status: "active",
                sourceHash: "demo",
                publishedAt: new Date().toISOString(),
                publishedBy: window.currentUser.id || window.currentUser.email || "company-admin",
                activatedAt: new Date().toISOString(),
                activatedBy: window.currentUser.id || window.currentUser.email || "company-admin"
            };
            window.state.servicePlans.push(published);
            applyServicePlanToCatalog(published, groupId);
            saveState();
        } else {
            const companyId = window.currentUser.companyId;
            const preview = await ApiClient.previewServicePlan(companyId, groupId, plan);
            if (!preview.success) {
                pendingImport.result = { ...pendingImport.result, valid: false, errors: preview.details || preview.errors || [] };
                renderServicePlanPreview();
                showToast(preview.error || t("ca_plan_needs_fix"), "error");
                return;
            }
            const staged = await ApiClient.publishServicePlan(companyId, groupId, plan, source);
            if (!staged.success) {
                toastApiError(staged);
                return;
            }
            const activated = await ApiClient.activateServicePlan(companyId, groupId, staged.planId);
            if (!activated.success) {
                showToast(activated.error || t("ca_plan_activate_failed"), "error");
                await loadServicePlanHistory();
                return;
            }
            applyServicePlanToCatalog({ ...plan, groupId }, groupId);
        }

        pendingImport = null;
        selectedDutyCode = null;
        currentPlans.set(groupId, { ...plan, groupId, status: "active" });
        renderServicePlanPreview();
        renderCurrentServicePlans();
        await loadServicePlanHistory();
        showToast(t("ca_plan_activate_success"), "success", 5000);
    } catch (error) {
        console.error("Service plan activate failed", error);
        showToast(error.message || t("error_generic"), "error");
    } finally {
        if (button) button.disabled = false;
    }
}

async function activateCompanyServicePlanVersion(planId) {
    if (!isCompanyAdmin() || !planId) return;
    const groupId = selectedGroupId();
    if (!groupId) {
        showToast(t("ca_plan_group_required"), "error");
        return;
    }
    try {
        if (USE_LOCAL_STATE) {
            if (!Array.isArray(window.state.servicePlans)) return;
            const target = window.state.servicePlans.find(plan => plan.id === planId && plan.groupId === groupId);
            if (!target) {
                showToast(t("ca_plan_history_failed"), "error");
                return;
            }
            window.state.servicePlans.forEach(plan => {
                if (plan.groupId !== groupId) return;
                if (plan.id === planId) {
                    plan.status = "active";
                    plan.activatedAt = new Date().toISOString();
                } else if (plan.status === "active") {
                    plan.status = "superseded";
                    plan.supersededBy = planId;
                }
            });
            applyServicePlanToCatalog(target, groupId);
            currentPlans.set(groupId, { ...target, status: "active" });
            saveState();
        } else {
            const companyId = window.currentUser.companyId;
            const activated = await ApiClient.activateServicePlan(companyId, groupId, planId);
            if (!activated.success) {
                showToast(activated.error || t("ca_plan_activate_failed"), "error");
                return;
            }
            const version = await ApiClient.getServicePlanVersion(companyId, groupId, planId);
            if (version?.success && version.plan) {
                applyServicePlanToCatalog(version.plan, groupId);
                currentPlans.set(groupId, version.plan);
            }
        }
        renderCurrentServicePlans();
        await loadServicePlanHistory();
        showToast(t("ca_plan_activate_success"), "success", 5000);
    } catch (error) {
        console.error("Service plan rollback/activate failed", error);
        showToast(error.message || t("error_generic"), "error");
    }
}

function resetDutyForm() {
    const ids = ["ca-duty-form-code", "ca-duty-form-work-start", "ca-duty-form-first-trip", "ca-duty-form-last-trip-ends", "ca-duty-form-work-end"];
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) el.value = "";
    }
    const dayType = document.getElementById("ca-duty-form-day-type");
    if (dayType) dayType.value = "SCHOOL_WEEKDAY";
    const error = document.getElementById("ca-duty-form-error");
    if (error) {
        error.hidden = true;
        error.textContent = "";
    }
}

function setDutyInput(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = String(value || "");
}

function showDutyFormError(message) {
    const error = document.getElementById("ca-duty-form-error");
    if (error) {
        error.hidden = false;
        error.textContent = message;
    }
}

function closeDutyFormCommon() {
    draftFormMode = null;
    draftFormCode = null;
    const form = document.getElementById("ca-duty-form");
    if (form) form.hidden = true;
    resetDutyForm();
}

function currentDraftGroup() {
    return pendingDraft?.groupId || selectedGroupId();
}

function startServicePlanDraft() {
    if (!isCompanyAdmin()) return;
    const groupId = selectedGroupId();
    if (!groupId) {
        showToast(t("ca_plan_group_required"), "error");
        return;
    }
    const activePlan = currentPlans.get(groupId);
    if (!activePlan) {
        showToast(t("ca_plan_draft_no_active"), "error");
        return;
    }
    pendingDraft = {
        ...activePlan,
        groupId,
        planVersion: bumpVersion(activePlan.planVersion),
        duties: deepCloneDuties(activePlan.duties)
    };
    pendingImport = null;
    selectedDutyCode = null;
    dutyReturnFocusCode = null;
    renderCompanyAdminServicePlan();
}

function discardServicePlanDraft() {
    pendingDraft = null;
    draftFormMode = null;
    draftFormCode = null;
    closeDutyFormCommon();
    renderCompanyAdminServicePlan();
}

function openAddDutyForm() {
    if (!pendingDraft) return;
    draftFormMode = "add";
    draftFormCode = null;
    resetDutyForm();
    const form = document.getElementById("ca-duty-form");
    if (form) form.hidden = false;
    const save = document.getElementById("ca-duty-form-save");
    if (save) {
        save.setAttribute("data-action", "submitAddDuty");
        save.innerHTML = `${icon("plus")} ${escapeHtml(t("ca_plan_duty_save"))}`;
    }
    const cancel = document.getElementById("ca-duty-form-cancel");
    if (cancel) cancel.setAttribute("data-action", "closeAddDutyForm");
    const title = document.getElementById("ca-duty-form-title");
    if (title) title.textContent = t("ca_plan_duty_form_title_add");
    refreshIcons();
}

function closeAddDutyForm() {
    closeDutyFormCommon();
}

function openEditDutyForm(dutyCode) {
    if (!pendingDraft || !dutyCode) return;
    const duty = pendingDraft.duties.find(item => item.code === dutyCode);
    if (!duty) return;
    draftFormMode = "edit";
    draftFormCode = dutyCode;
    setDutyInput("ca-duty-form-code", duty.code);
    setDutyInput("ca-duty-form-work-start", duty.workStart);
    setDutyInput("ca-duty-form-first-trip", duty.firstTripStart);
    setDutyInput("ca-duty-form-last-trip-ends", duty.lastTripEnd);
    setDutyInput("ca-duty-form-work-end", duty.workEnd);
    setDutyInput("ca-duty-form-day-type", duty.dayType);
    const form = document.getElementById("ca-duty-form");
    if (form) form.hidden = false;
    const save = document.getElementById("ca-duty-form-save");
    if (save) {
        save.setAttribute("data-action", "submitEditDuty");
        save.innerHTML = `${icon("save")} ${escapeHtml(t("ca_plan_duty_save"))}`;
    }
    const cancel = document.getElementById("ca-duty-form-cancel");
    if (cancel) cancel.setAttribute("data-action", "closeEditDutyForm");
    const title = document.getElementById("ca-duty-form-title");
    if (title) title.textContent = t("ca_plan_duty_form_title_edit", { duty: duty.code });
    refreshIcons();
}

function closeEditDutyForm() {
    closeDutyFormCommon();
}

function submitAddDuty() {
    return submitDutyForm("add");
}

function submitEditDuty() {
    return submitDutyForm("edit");
}

function submitDutyForm(mode) {
    if (!pendingDraft) return;
    const code = String(document.getElementById("ca-duty-form-code")?.value || "").trim();
    const workStart = String(document.getElementById("ca-duty-form-work-start")?.value || "").trim();
    const firstTrip = String(document.getElementById("ca-duty-form-first-trip")?.value || "").trim();
    const lastTrip = String(document.getElementById("ca-duty-form-last-trip-ends")?.value || "").trim();
    const workEnd = String(document.getElementById("ca-duty-form-work-end")?.value || "").trim();
    const dayType = String(document.getElementById("ca-duty-form-day-type")?.value || "").trim();

    if (!code) {
        showDutyFormError(t("ca_plan_duty_code_required"));
        return;
    }
    const codeExists = pendingDraft.duties.some(item => item.code === code);
    if (mode === "add" && codeExists) {
        showDutyFormError(t("ca_plan_duty_duplicate"));
        return;
    }
    if (mode === "edit" && code !== draftFormCode && codeExists) {
        showDutyFormError(t("ca_plan_duty_duplicate"));
        return;
    }
    if ([workStart, firstTrip, lastTrip, workEnd].some(value => !isValidTime(value))) {
        showDutyFormError(t("ca_plan_duty_invalid_time"));
        return;
    }
    if (!isValidDayType(dayType)) {
        showDutyFormError(t("ca_plan_duty_invalid_day_type"));
        return;
    }

    const existingIndex = pendingDraft.duties.findIndex(item => item.code === draftFormCode);
    const newDuty = {
        code,
        workStart,
        firstTripStart: firstTrip,
        lastTripEnd: lastTrip,
        workEnd,
        dayType,
        activities: mode === "edit" && existingIndex >= 0
            ? (pendingDraft.duties[existingIndex].activities || [])
            : []
    };
    if (mode === "edit" && existingIndex >= 0) {
        pendingDraft.duties[existingIndex] = newDuty;
    } else {
        pendingDraft.duties.push(newDuty);
    }
    closeDutyFormCommon();
    renderServicePlanEditor();
}

function deleteDraftDuty(dutyCode) {
    if (!pendingDraft || !dutyCode) return;
    pendingDraft.duties = pendingDraft.duties.filter(item => item.code !== dutyCode);
    if (draftFormCode === dutyCode) closeDutyFormCommon();
    renderServicePlanEditor();
}

async function publishServicePlanDraft() {
    if (!isCompanyAdmin() || !pendingDraft) return;
    const groupId = currentDraftGroup();
    if (!groupId) {
        showToast(t("ca_plan_group_required"), "error");
        return;
    }
    const button = document.getElementById("ca-publish-draft");
    if (button?.disabled) return;
    if (button) button.disabled = true;
    const plan = pendingDraft;
    const source = {};
    try {
        if (USE_LOCAL_STATE) {
            if (!Array.isArray(window.state.servicePlans)) window.state.servicePlans = [];
            const planId = `${groupId}-${plan.planCode}-${plan.planVersion}-${plan.validFrom}`;
            if (window.state.servicePlans.some(existing => existing.id === planId)) {
                throw new Error(t("ca_plan_version_exists"));
            }
            window.state.servicePlans.forEach(existing => {
                if (existing.groupId === groupId && existing.status === "active") {
                    existing.status = "superseded";
                    existing.supersededBy = planId;
                }
            });
            const published = {
                ...plan,
                id: planId,
                status: "active",
                sourceHash: "draft",
                publishedAt: new Date().toISOString(),
                publishedBy: window.currentUser.id || window.currentUser.email || "company-admin",
                activatedAt: new Date().toISOString(),
                activatedBy: window.currentUser.id || window.currentUser.email || "company-admin"
            };
            window.state.servicePlans.push(published);
            applyServicePlanToCatalog(published, groupId);
            saveState();
        } else {
            const companyId = window.currentUser.companyId;
            const preview = await ApiClient.previewServicePlan(companyId, groupId, plan);
            if (!preview.success) {
                showToast(preview.error || t("ca_plan_needs_fix"), "error");
                if (button) button.disabled = false;
                return;
            }
            const staged = await ApiClient.publishServicePlan(companyId, groupId, plan, source);
            if (!staged.success) {
                toastApiError(staged);
                if (button) button.disabled = false;
                return;
            }
            const activated = await ApiClient.activateServicePlan(companyId, groupId, staged.planId);
            if (!activated.success) {
                showToast(activated.error || t("ca_plan_activate_failed"), "error");
                await loadServicePlanHistory();
                if (button) button.disabled = false;
                return;
            }
            const version = await ApiClient.getServicePlanVersion(companyId, groupId, staged.planId);
            if (version?.success && version.plan) {
                applyServicePlanToCatalog(version.plan, groupId);
                currentPlans.set(groupId, version.plan);
            }
        }
        pendingDraft = null;
        draftFormMode = null;
        draftFormCode = null;
        currentPlans.set(groupId, { ...plan, groupId, status: "active" });
        renderCompanyAdminServicePlan();
        await loadServicePlanHistory();
        showToast(t("ca_plan_draft_published"), "success", 5000);
    } catch (error) {
        console.error("Service plan draft publish failed", error);
        showToast(error.message || t("ca_plan_draft_publish_failed"), "error");
    } finally {
        if (button) button.disabled = false;
    }
}

function renderServicePlanEditor() {
    const editor = document.getElementById("ca-service-plan-editor");
    if (!editor) return;
    if (!pendingDraft) {
        editor.hidden = true;
        editor.innerHTML = "";
        return;
    }
    editor.hidden = false;
    const group = companyGroups().find(item => String(item.id) === pendingDraft.groupId);
    editor.innerHTML = `
        <div class="service-plan-editor-header">
            <div>
                <span class="service-plan-kicker">${tx("ca_plan_draft_kicker")}</span>
                <h3>${tx("ca_plan_draft_title")}</h3>
                <p>${tx("ca_plan_draft_hint")}</p>
            </div>
            <div class="service-plan-editor-meta">
                ${statCell("ca_plan_group", escapeHtml(group?.name || pendingDraft.groupId))}
                ${statCell("ca_plan_draft_version", escapeHtml(String(pendingDraft.planVersion)))}
            </div>
        </div>
        <div id="ca-draft-duty-table"></div>
        <div class="service-plan-editor-actions">
            ${btnSecondary(actionAttr("openAddDutyForm"), `${icon("plus")} ${tx("ca_plan_add_duty")}`)}
            ${btnPrimary(actionAttr("publishServicePlanDraft"), `${icon("badge-check")} ${tx("ca_plan_publish_draft")}`, `id="ca-publish-draft"`)}
            ${btnSecondary(actionAttr("discardServicePlanDraft"), `${icon("x")} ${tx("ca_plan_discard_draft")}`)}
        </div>
    `;
    renderDraftDutyTable();
    refreshIcons();
}

function renderDraftDutyTable() {
    const container = document.getElementById("ca-draft-duty-table");
    if (!container) return;
    const duties = pendingDraft?.duties || [];
    if (!duties.length) {
        container.innerHTML = `<div class="service-plan-empty">${tx("ca_plan_draft_no_duties")}</div>`;
        return;
    }
    container.innerHTML = `
        <div class="service-plan-table-wrap">
            <table class="service-plan-table">
                <thead><tr>
                    <th>${tx("ca_plan_col_duty")}</th>
                    <th>${tx("ca_plan_col_work_start")}</th>
                    <th>${tx("ca_plan_col_first_trip")}</th>
                    <th>${tx("ca_plan_col_last_trip")}</th>
                    <th>${tx("ca_plan_col_work_end")}</th>
                    <th>${tx("ca_plan_col_day_type")}</th>
                    <th>${tx("ca_plan_duty_actions")}</th>
                </tr></thead>
                <tbody>${duties.map(duty => `<tr>
                    <td>${escapeHtml(duty.code)}</td>
                    <td>${escapeHtml(duty.workStart)}</td>
                    <td>${escapeHtml(duty.firstTripStart)}</td>
                    <td>${escapeHtml(duty.lastTripEnd)}</td>
                    <td>${escapeHtml(duty.workEnd)}${duty.endDayOffset ? `<sup>+${escapeHtml(duty.endDayOffset)}</sup>` : ""}</td>
                    <td><span class="service-plan-day-badge">${escapeHtml(dayTypeLabel(duty.dayType))}</span></td>
                    <td class="service-plan-row-actions">
                        <button type="button" class="btn-secondary" aria-label="${tx("ca_plan_duty_edit", { duty: duty.code })}" ${actionAttr("openEditDutyForm", [duty.code])}>${icon("pen-line")}</button>
                        <button type="button" class="btn-secondary" aria-label="${tx("ca_plan_duty_delete", { duty: duty.code })}" ${actionAttr("deleteDraftDuty", [duty.code])}>${icon("trash-2")}</button>
                    </td>
                </tr>`).join("")}</tbody>
            </table>
        </div>`;
    refreshIcons();
}

export {
    activateCompanyServicePlanVersion,
    clearCompanyServicePlanPreview,
    closeCompanyServicePlanDuty,
    closeCompanyServicePlanHistory,
    closeAddDutyForm,
    closeEditDutyForm,
    deleteDraftDuty,
    discardServicePlanDraft,
    handleCompanyServicePlanFile,
    handleCompanyServicePlanGroupChange,
    openAddDutyForm,
    openCompanyServicePlanDuty,
    openCompanyServicePlanHistory,
    openEditDutyForm,
    publishCompanyServicePlan,
    publishServicePlanDraft,
    renderCompanyAdminServicePlan,
    renderDraftDutyTable,
    renderServicePlanEditor,
    startServicePlanDraft,
    submitAddDuty,
    submitEditDuty
};

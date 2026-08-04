import ApiClient from "../core/api-client.js";
import { applyServicePlanToCatalog, findDemoPlan } from "../core/service-plan.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { readServicePlanFile } from "../imports/service-plan-excel.js";
import { t } from "../ui/i18n.js";

let pendingImport = null;
let currentPlans = new Map();
let planHistories = new Map();
let historyDetails = new Map();
let loadingPlans = false;
let loadingHistoryGroupId = null;
let selectedHistoryId = null;
let selectedDutyCode = null;
let dutyReturnFocusCode = null;

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
    select.innerHTML = `<option value="">${escapeHtml(t("ca_plan_group_placeholder"))}</option>`
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
        <div class="service-plan-errors-title">${escapeHtml(t("ca_plan_errors_title"))}</div>
        <ul>${errors.slice(0, 50).map(error => `<li><code>${escapeHtml(error.path || "PDF")}</code> ${escapeHtml(formatServicePlanError(error))}</li>`).join("")}</ul>
        ${errors.length > 50 ? `<p>${escapeHtml(t("ca_plan_errors_more", { count: errors.length - 50 }))}</p>` : ""}
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
            <i data-lucide="sparkles"></i>
            <div><strong>${escapeHtml(t("ca_plan_first_publish"))}</strong><span>${escapeHtml(t("ca_plan_first_publish_hint", { count: comparison.added }))}</span></div>
        </div>`;
    }
    return `<div class="service-plan-comparison">
        <div><span>${escapeHtml(t("ca_plan_compare_active"))}</span><strong>${escapeHtml(activePlan.planVersion || "—")}</strong></div>
        <div class="positive"><span>${escapeHtml(t("ca_plan_compare_added"))}</span><strong>+${comparison.added}</strong></div>
        <div><span>${escapeHtml(t("ca_plan_compare_changed"))}</span><strong>${comparison.changed}</strong></div>
        <div class="negative"><span>${escapeHtml(t("ca_plan_compare_removed"))}</span><strong>−${comparison.removed}</strong></div>
    </div>`;
}

function renderGroupMismatch(plan) {
    const groupId = String(pendingImport?.groupId || "").trim();
    const planCode = String(plan?.planCode || "").trim();
    if (!/^\d+$/.test(groupId) || groupId === planCode) return "";
    return `<div class="service-plan-warning" role="status">
        <i data-lucide="triangle-alert"></i>
        <span>${escapeHtml(t("ca_plan_group_mismatch", { plan: planCode, group: pendingImport.groupName }))}</span>
    </div>`;
}

function renderDutyTable(plan) {
    const duties = plan?.duties || [];
    if (!duties.length) return "";
    return `<div class="service-plan-table-wrap">
        <table class="service-plan-table">
            <thead><tr>
                <th>${escapeHtml(t("ca_plan_col_duty"))}</th>
                <th>${escapeHtml(t("ca_plan_col_work_start"))}</th>
                <th>${escapeHtml(t("ca_plan_col_first_trip"))}</th>
                <th>${escapeHtml(t("ca_plan_col_last_trip"))}</th>
                <th>${escapeHtml(t("ca_plan_col_work_end"))}</th>
                <th>${escapeHtml(t("ca_plan_col_day_type"))}</th>
                <th><span class="sr-only">${escapeHtml(t("ca_plan_col_details"))}</span></th>
            </tr></thead>
            <tbody>${duties.map(duty => `<tr>
                <td><button type="button" class="service-plan-duty-link" ${actionAttr("openCompanyServicePlanDuty", duty.code)}>${escapeHtml(duty.code)}</button></td>
                <td>${escapeHtml(duty.workStart)}</td>
                <td>${escapeHtml(duty.firstTripStart)}</td>
                <td>${escapeHtml(duty.lastTripEnd)}</td>
                <td>${escapeHtml(duty.workEnd)}${duty.endDayOffset ? `<sup>+${escapeHtml(duty.endDayOffset)}</sup>` : ""}</td>
                <td><span class="service-plan-day-badge">${escapeHtml(dayTypeLabel(duty.dayType))}</span></td>
                <td><button type="button" class="service-plan-row-action" aria-label="${escapeHtml(t("ca_plan_open_duty", { duty: duty.code }))}" ${actionAttr("openCompanyServicePlanDuty", duty.code)}><i data-lucide="chevron-right"></i></button></td>
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
                <div><span class="service-plan-kicker">${escapeHtml(t("ca_plan_duty_details"))}</span><h3 id="ca-duty-title">${escapeHtml(duty.code)}</h3></div>
                <button type="button" class="btn-icon-nav" aria-label="${escapeHtml(t("ca_plan_close"))}" ${actionAttr("closeCompanyServicePlanDuty")}><i data-lucide="x"></i></button>
            </div>
            <div class="service-plan-duty-summary">
                <div><span>${escapeHtml(t("ca_plan_col_work_start"))}</span><strong>${escapeHtml(duty.workStart)}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_col_first_trip"))}</span><strong>${escapeHtml(duty.firstTripStart)}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_col_last_trip"))}</span><strong>${escapeHtml(duty.lastTripEnd)}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_col_work_end"))}</span><strong>${escapeHtml(duty.workEnd)}</strong></div>
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
        container.innerHTML = `<div class="service-plan-empty">${escapeHtml(t("ca_plan_preview_empty"))}</div>`;
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
                    <span class="service-plan-kicker">${escapeHtml(t("ca_plan_preview_kicker"))}</span>
                    <h3>${escapeHtml(t("ca_plan_preview_title"))}</h3>
                    <p>${escapeHtml(pendingImport.fileName)}</p>
                </div>
                <span class="service-plan-status ${result.valid ? "success" : "error"}">
                    ${escapeHtml(result.valid ? t("ca_plan_ready") : t("ca_plan_needs_fix"))}
                </span>
            </div>
            <div class="service-plan-preview-strip">
                <div><i data-lucide="bus-front"></i><span>${escapeHtml(t("ca_plan_group"))}</span><strong>${escapeHtml(pendingImport.groupName)}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_version_short"))}</span><strong>${escapeHtml(plan?.planVersion || "—")}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_valid_from"))}</span><strong>${escapeHtml(plan?.validFrom || "—")}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_duties"))}</span><strong>${summary.dutyCount || 0}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_timezone"))}</span><strong>${escapeHtml(plan?.timezone || "—")}</strong></div>
            </div>
            ${renderGroupMismatch(plan)}
            ${renderPlanComparison(activePlan, plan)}
            ${renderErrors(result.errors)}
            ${renderDutyTable(plan)}
            <div class="service-plan-actions">
                <button type="button" class="btn-secondary" ${actionAttr("clearCompanyServicePlanPreview")}>
                    ${escapeHtml(t("btn_clear_preview"))}
                </button>
            </div>
        </div>
        <div class="ca-catalog-activation-bar" role="region" aria-label="${escapeHtml(t("ca_plan_activate_bar"))}">
            <div>
                <strong>${escapeHtml(pendingImport.groupName)} · ${escapeHtml(t("ca_plan_version_short"))} ${escapeHtml(plan?.planVersion || "—")}</strong>
                <span>${escapeHtml(t("ca_plan_activate_bar_hint", {
                    duties: summary.dutyCount || 0,
                    warnings: warningCount,
                    validFrom: plan?.validFrom || "—"
                }))}</span>
            </div>
            <button type="button" id="ca-publish-service-plan" class="btn-primary" ${actionAttr("publishCompanyServicePlan")} ${blocking ? "disabled" : ""}>
                <i data-lucide="badge-check"></i> ${escapeHtml(activateLabel)}
            </button>
        </div>
        ${renderDutyDrawer(plan)}`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderCurrentServicePlans() {
    const container = document.getElementById("ca-current-service-plans");
    if (!container) return;
    const groups = companyGroups();
    if (!groups.length) {
        container.innerHTML = `<div class="service-plan-empty">${escapeHtml(t("ca_plan_groups_required"))}</div>`;
        return;
    }
    container.innerHTML = groups.map(group => {
        const groupId = String(group.id);
        const plan = currentPlans.get(groupId);
        const dutyCount = plan?.dutyCount ?? plan?.duties?.length;
        return `<article class="service-plan-current-card ${selectedGroupId() === groupId ? "is-selected" : ""}">
            <div class="service-plan-current-icon"><i data-lucide="route"></i></div>
            <div>
                <strong>${escapeHtml(group.name || String(group.id))}</strong>
                <span>${plan
                    ? `${escapeHtml(plan.planCode)} · ${escapeHtml(t("ca_plan_version_short"))} ${escapeHtml(plan.planVersion)} · ${escapeHtml(plan.validFrom)}${Number.isFinite(dutyCount) ? ` · ${escapeHtml(t("ca_plan_duty_count", { count: dutyCount }))}` : ""}`
                    : escapeHtml(loadingPlans ? t("loading") : t("ca_plan_not_published"))}</span>
            </div>
            ${plan ? `<span class="service-plan-status success">${escapeHtml(t("ca_plan_active"))}</span>` : ""}
        </article>`;
    }).join("");
    if (typeof lucide !== "undefined") lucide.createIcons();
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
    if (!plan?.duties?.length) return `<div class="service-plan-empty">${escapeHtml(t("ca_plan_history_no_duties"))}</div>`;
    return `<div class="service-plan-history-detail">
        <div class="service-plan-history-detail-header">
            <div><span>${escapeHtml(t("ca_plan_history_viewing"))}</span><strong>${escapeHtml(plan.planCode)} · ${escapeHtml(t("ca_plan_version_short"))} ${escapeHtml(plan.planVersion)}</strong></div>
            <button type="button" class="btn-secondary" ${actionAttr("closeCompanyServicePlanHistory")}><i data-lucide="x"></i>${escapeHtml(t("ca_plan_history_close"))}</button>
        </div>
        <div class="service-plan-preview-strip">
            <div><span>${escapeHtml(t("ca_plan_valid_from"))}</span><strong>${escapeHtml(plan.validFrom || "—")}</strong></div>
            <div><span>${escapeHtml(t("ca_plan_timezone"))}</span><strong>${escapeHtml(plan.timezone || "—")}</strong></div>
            <div><span>${escapeHtml(t("ca_plan_duties"))}</span><strong>${escapeHtml(plan.duties.length)}</strong></div>
            <div><span>${escapeHtml(t("ca_plan_history_published"))}</span><strong>${escapeHtml(formatPublishedAt(plan.publishedAt))}</strong></div>
        </div>
        <div class="service-plan-history-duties">${plan.duties.map(duty => `<details>
            <summary>
                <span><strong>${escapeHtml(duty.code)}</strong><small>${escapeHtml(dayTypeLabel(duty.dayType))}</small></span>
                <span>${escapeHtml(duty.workStart)}–${escapeHtml(duty.workEnd)} <i data-lucide="chevron-down"></i></span>
            </summary>
            <div class="service-plan-duty-summary">
                <div><span>${escapeHtml(t("ca_plan_col_work_start"))}</span><strong>${escapeHtml(duty.workStart)}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_col_first_trip"))}</span><strong>${escapeHtml(duty.firstTripStart)}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_col_last_trip"))}</span><strong>${escapeHtml(duty.lastTripEnd)}</strong></div>
                <div><span>${escapeHtml(t("ca_plan_col_work_end"))}</span><strong>${escapeHtml(duty.workEnd)}</strong></div>
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
        container.innerHTML = `<div class="service-plan-empty">${escapeHtml(t("ca_plan_history_select_group"))}</div>`;
        return;
    }
    if (loadingHistoryGroupId === groupId) {
        container.innerHTML = `<div class="service-plan-empty">${escapeHtml(t("loading"))}</div>`;
        return;
    }
    const history = planHistories.get(groupId) || [];
    if (!history.length) {
        container.innerHTML = `<div class="service-plan-empty">${escapeHtml(t("ca_plan_history_empty"))}</div>`;
        return;
    }
    const rows = history.map(plan => {
        const canActivate = plan.status === "staged" || plan.status === "superseded";
        const activateLabel = plan.status === "superseded" ? t("ca_plan_rollback") : t("ca_plan_activate");
        return `<tr class="${plan.status === "active" ? "is-active" : ""}">
        <td data-label="${escapeHtml(t("ca_plan_code"))}"><strong>${escapeHtml(plan.planCode)}</strong></td>
        <td data-label="${escapeHtml(t("ca_plan_version_short"))}">${escapeHtml(plan.planVersion)}</td>
        <td data-label="${escapeHtml(t("ca_plan_valid_from"))}">${escapeHtml(plan.validFrom)}</td>
        <td data-label="${escapeHtml(t("ca_plan_duties"))}">${escapeHtml(plan.dutyCount ?? "—")}</td>
        <td data-label="${escapeHtml(t("ca_plan_history_published"))}">${escapeHtml(formatPublishedAt(plan.publishedAt))}</td>
        <td data-label="${escapeHtml(t("ca_col_status"))}"><span class="service-plan-status ${plan.status === "active" ? "success" : plan.status === "staged" ? "warning" : "neutral"}">${escapeHtml(historyStatus(plan))}</span></td>
        <td data-label="${escapeHtml(t("table_actions"))}" class="service-plan-history-actions">
            <button type="button" class="btn-secondary service-plan-history-view" ${actionAttr("openCompanyServicePlanHistory", [plan.id])} ${selectedHistoryId === plan.id ? "aria-current=\"true\"" : ""}><i data-lucide="eye"></i>${escapeHtml(t("ca_plan_history_view"))}</button>
            ${canActivate ? `<button type="button" class="btn-primary service-plan-history-activate" ${actionAttr("activateCompanyServicePlanVersion", [plan.id])}><i data-lucide="badge-check"></i>${escapeHtml(activateLabel)}</button>` : ""}
        </td>
    </tr>`;
    }).join("");
    const selected = selectedHistoryId ? historyDetails.get(selectedHistoryId) : null;
    container.innerHTML = `<div class="service-plan-table-wrap"><table class="service-plan-table service-plan-history-table">
        <thead><tr><th>${escapeHtml(t("ca_plan_code"))}</th><th>${escapeHtml(t("ca_plan_version_short"))}</th><th>${escapeHtml(t("ca_plan_valid_from"))}</th><th>${escapeHtml(t("ca_plan_duties"))}</th><th>${escapeHtml(t("ca_plan_history_published"))}</th><th>${escapeHtml(t("ca_col_status"))}</th><th>${escapeHtml(t("table_actions"))}</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
        ${selected ? renderHistoryDutyDetails(selected) : ""}`;
    if (typeof lucide !== "undefined") lucide.createIcons();
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
        if (IS_DEMO_MODE) {
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
    if (!historyDetails.has(planId) && !IS_DEMO_MODE) {
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
            if (IS_DEMO_MODE) return [code, findDemoPlan(code)];
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
        if (IS_DEMO_MODE) {
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
                showToast(staged.error || t("error_generic"), "error");
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
        if (IS_DEMO_MODE) {
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

export {
    activateCompanyServicePlanVersion,
    clearCompanyServicePlanPreview,
    closeCompanyServicePlanDuty,
    closeCompanyServicePlanHistory,
    handleCompanyServicePlanFile,
    handleCompanyServicePlanGroupChange,
    openCompanyServicePlanDuty,
    openCompanyServicePlanHistory,
    publishCompanyServicePlan,
    renderCompanyAdminServicePlan
};

// BusCommand ESM v9.5 — Operativni centar (editable)
import { formatDateTime, getDriverById, getVisibleDrivers, showToast, escapeHtml, todayDateStr } from "../core/utils.js";
import { getDriverDutySummary, getShiftForDriverDate, getShiftForDriverIdOnly, setShiftForDriverIdOnly } from "../core/shift-plan.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { t } from "../ui/i18n.js";
import { renderDashboardGroupsGrid } from "./group-hub.js";
import { msgText } from "../core/message-text.js";
import { isDispArchived } from "./message-archive.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import {
    isActiveReport,
    reportKind,
    scopedDispatcherReports,
    sortReportsForOperations
} from "./report-model.js";
import { persistShift, openShiftCell } from "./shifts.js";
import { ApiClient } from "../core/api-client.js";
import { saveState } from "../core/state.js";
import { busHasGroup } from "../data/bus-group-membership.js";
import { busIsAssignable } from "../data/bus-ops.js";
import { driverKnowsGroup } from "../data/driver-known-groups.js";
import {
    collectOpsAttentionItems,
    collectAllAttentionItems,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
    focusOpsAttentionItem,
    refreshOpsAttentionPanelIfOpen,
    applyOpsAttentionFix,
    applyCoverageResolution,
    syncOpsPlanHealthAttentionState
} from "./ops-attention.js";
import { paintPlanHealthBanner } from "./plan-health-banner.js";
import {
    dispoBusIncidentReasonOptions,
    dispoDriverIncidentReasonOptions,
    reasonLabel,
    recordDemoChangeReason
} from "./change-reason.js";

const SHIFT_TYPE_OPTIONS = Object.freeze([
    { value: "morning", labelKey: "shift_type_morning", fallback: "Prepodne" },
    { value: "afternoon", labelKey: "shift_type_afternoon", fallback: "Popodne" },
    { value: "night", labelKey: "shift_type_night", fallback: "Noćna" },
    { value: "bereitschaft", labelKey: "shift_type_bereitschaft", fallback: "Pripravnost" },
    { value: "off", labelKey: "shift_type_off", fallback: "Slobodan" },
    { value: "vacation", labelKey: "shift_type_vacation", fallback: "Odmor" },
    { value: "sick", labelKey: "shift_type_sick", fallback: "Bolovanje" }
]);

let _confirmFetchAt = 0;
let _confirmFetchInFlight = false;
let _confirmFetchFailed = false;
let _confirmFetchErrorToastedAt = 0;
let _confirmNeedsPaint = false;
let _autoRefreshTimer = null;
let _lastDashboardRenderAt = 0;

function driverUid(drv) {
    return drv?.id || drv?.uid || drv?.driverId || "";
}

function hasConfirmedShift(driverId, dateStr) {
    return (window.state.shiftConfirmations || []).some(
        (row) => row.driverId === driverId && row.date === dateStr
    );
}

function confirmationAttentionRows() {
    if (Array.isArray(window.state.confirmationAttention) && window.state.confirmationAttention.length) {
        return window.state.confirmationAttention;
    }
    const confirmed = new Set(
        (window.state.shiftConfirmations || []).map((row) => `${row.driverId}|${row.date}`)
    );
    return (window.state.confirmationOutbox || [])
        .filter((row) => {
            if (!row?.driverId || !row?.targetDate) return false;
            if (["confirmed", "cancelled"].includes(row.status)) return false;
            return !confirmed.has(`${row.driverId}|${row.targetDate}`);
        })
        .map((row) => {
            const today = todayDateStr();
            const expired = today && String(row.targetDate) < String(today);
            return {
                kind: expired ? "expired"
                    : row.status === "failed" ? "delivery_failed"
                        : row.status === "pending" ? "pending_send"
                            : "awaiting_confirm",
                severity: row.status === "failed" ? "critical" : "warning",
                driverId: row.driverId,
                targetDate: row.targetDate,
                label: row.label || "next_shift",
                attempts: Number(row.attempts || 0),
                lastError: row.lastError || null,
                status: row.status
            };
        })
        .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

function pendingConfirmationRows() {
    return confirmationAttentionRows();
}

function _confirmationAttentionTitle(row) {
    if (row.kind === "delivery_failed") {
        return t("status_confirmation_delivery_failed") || "Slanje potvrde nije uspelo";
    }
    if (row.kind === "pending_send") {
        return t("status_confirmation_pending_send") || "Čeka slanje zahteva";
    }
    if (row.kind === "expired") {
        return t("status_confirmation_expired") || "Potvrda istekla";
    }
    return t("status_pending_confirmation") || "Čeka potvrdu";
}

function shiftConfirmStatus(drv, dateStr) {
    const uid = driverUid(drv);
    if (!uid) return "unknown";
    if (hasConfirmedShift(uid, dateStr)) return "confirmed";
    const row = pendingConfirmationRows().find(
        (entry) => entry.driverId === uid && entry.targetDate === dateStr
    );
    if (!row) return "neutral";
    if (row.kind === "expired") return "expired";
    if (row.kind === "delivery_failed") return "failed";
    return "pending";
}

function _problemStatusLabel(status) {
    const key = String(status || "open").toLowerCase();
    const map = {
        open: "problem_status_open",
        active: "problem_status_open",
        acknowledged: "problem_status_acknowledged",
        solution_proposed: "problem_status_proposed",
        applying: "problem_status_applying",
        resolved: "problem_status_resolved",
        cancelled: "problem_status_cancelled"
    };
    return t(map[key] || "problem_status_open") || key;
}

async function refreshStaffShiftConfirmations(force = false) {
    if (USE_LOCAL_STATE) return false;
    if (!window.currentUser || !["dispatcher", "company_admin"].includes(window.currentUser.role)) return false;
    const now = Date.now();
    if (!force && (now - _confirmFetchAt < 20_000 || _confirmFetchInFlight)) return false;
    _confirmFetchInFlight = true;
    try {
        const result = await ApiClient.getStaffShiftConfirmations();
        if (!result?.success) {
            _confirmFetchFailed = true;
            _confirmFetchAt = Date.now();
            _confirmNeedsPaint = true;
            toastConfirmFetchFailureOnce();
            return false;
        }
        window.state.shiftConfirmations = Array.isArray(result.confirmations) ? result.confirmations : [];
        window.state.confirmationOutbox = Array.isArray(result.outbox) ? result.outbox : [];
        window.state.confirmationAttention = Array.isArray(result.attention) ? result.attention : [];
        window.state.confirmationSummary = result.summary || null;
        window.state.confirmationDispatchHealth = result.dispatchHealth || null;
        _confirmFetchAt = Date.now();
        _confirmFetchFailed = false;
        return true;
    } catch {
        _confirmFetchFailed = true;
        _confirmFetchAt = Date.now();
        _confirmNeedsPaint = true;
        toastConfirmFetchFailureOnce();
        return false;
    } finally {
        _confirmFetchInFlight = false;
    }
}

function toastConfirmFetchFailureOnce() {
    const now = Date.now();
    if (now - _confirmFetchErrorToastedAt < 60_000) return;
    _confirmFetchErrorToastedAt = now;
    showToast(t("ops_confirmations_load_failed") || "Potvrde smena nisu mogle biti učitane.", "error");
}

function updateOpsPlanHealth({ openReportsCount, pendingConfirms, failedDeliveries }) {
    const health = document.getElementById("ops-plan-health");
    if (!health) return;
    const attentionItems = collectOpsAttentionItems();
    const attentionCount = attentionItems.length;
    const needsAttention = attentionCount > 0 || _confirmFetchFailed;
    health.classList.toggle("is-loading", _confirmFetchInFlight);
    health.setAttribute("aria-busy", _confirmFetchInFlight ? "true" : "false");

    if (_confirmFetchFailed) {
        health.classList.add("is-attention");
        health.classList.remove("is-plan-gap");
        paintPlanHealthBanner(health);
        const titleEl = health.querySelector("[data-plan-health-title]");
        const hintEl = health.querySelector("[data-plan-health-hint]");
        if (titleEl) titleEl.textContent = t("ops_plan_stale") || "Podaci potvrda nisu ažurni";
        if (hintEl) {
            hintEl.textContent = t("ops_plan_stale_hint")
                || "Provera potvrda smena nije uspela — prikaz može biti zastareo.";
        }
        syncOpsPlanHealthAttentionState(true, attentionCount);
        return;
    }

    // Shared status window: problems stacked one under another; click opens that fix.
    paintPlanHealthBanner(health);
    if (needsAttention && attentionCount === 0 && (openReportsCount || pendingConfirms.length || failedDeliveries)) {
        const titleEl = health.querySelector("[data-plan-health-title]");
        const hintEl = health.querySelector("[data-plan-health-hint]");
        if (titleEl) titleEl.textContent = t("ops_plan_attention") || "Plan zahteva pažnju";
        if (hintEl) {
            const parts = [];
            if (openReportsCount > 0) parts.push(`${openReportsCount} ${t("ops_plan_attention_reports") || "prijava"}`);
            if (pendingConfirms.length > 0) parts.push(`${pendingConfirms.length} ${t("ops_plan_attention_confirms") || "potvrda"}`);
            if (failedDeliveries > 0) parts.push(`${failedDeliveries} ${t("ops_plan_attention_failed") || "neuspelo slanje"}`);
            hintEl.textContent = parts.join(" · ")
                || (t("ops_plan_attention_hint") || "Kliknite — problemi su ispod.");
        }
    }
    syncOpsPlanHealthAttentionState(needsAttention, attentionCount);
}

function visibleOperationalReports() {
    return sortReportsForOperations(scopedDispatcherReports({
        reports: window.state.reports,
        drivers: window.state.drivers,
        dispatchers: window.state.dispatchers,
        currentUser: window.currentUser,
        activeGroupId: window.state.activeGroupFilter || "",
        demo: USE_LOCAL_STATE
    })).filter(isActiveReport);
}

function _dashboardReportWhen(report) {
    if (report.date && report.time) return formatDateTime(report.date, report.time);
    if (report.date) {
        const dateOnly = new Date(`${report.date}T00:00:00`);
        if (!Number.isNaN(dateOnly.getTime())) {
            return new Intl.DateTimeFormat(window.state.language || "en", { dateStyle: "short" }).format(dateOnly);
        }
        return String(report.date);
    }
    if (report.time) return String(report.time);
    const value = report.createdAt;
    const date = typeof value?.toDate === "function" ? value.toDate()
        : Number.isFinite(value?.seconds) ? new Date(value.seconds * 1000)
            : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat(window.state.language || "en", { dateStyle: "short", timeStyle: "short" }).format(date)
        : "—";
}

function _dashboardReportType(report) {
    const kind = reportKind(report);
    if (kind.kind === "coverage") return t("report_coverage_title") || "Nepokrivena smena";
    if (kind.kind === "breakdown") return `${t("report_breakdown_title")}: ${t(kind.detail) || kind.detail}`;
    return /^\d+$/.test(kind.detail) ? `${t("report_delay_title")}: ${kind.detail} min` : t("report_delay_title");
}

function countUnreadMessages() {
    // Outbound awaiting driver receipt (read or critical ack) — not "staff unread inbox".
    return (window.state.messages || []).filter((m) => {
        if (isDispArchived(m)) return false;
        if (m.requiresAck === true) return !m.ackedAt;
        if (m.status === "read") return false;
        if (m.broadcast !== true && m.read === true) return false;
        if (Array.isArray(m.readBy) && m.readBy.length && m.broadcast !== true) return false;
        return true;
    }).length;
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

function tomorrowDateStr() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

function renderTomorrowPreview() {
    const el = document.getElementById("ops-tomorrow-preview");
    if (!el) return;
    const tomorrow = tomorrowDateStr();
    const allDrivers = getVisibleDrivers().filter(d => d.active);
    let uncoveredCount = 0;
    let coveredCount = 0;
    for (const drv of allDrivers) {
        const duty = getShiftForDriverDate(drv.name, tomorrow);
        if (!duty || duty.type === "off" || duty.type === "clear") {
            uncoveredCount++;
        } else {
            coveredCount++;
        }
    }
    const total = allDrivers.length;
    if (!total) {
        el.innerHTML = "";
        return;
    }
    const percent = total > 0 ? Math.round((coveredCount / total) * 100) : 0;
    const isOk = uncoveredCount === 0;
    const statusClass = isOk ? "is-ok" : (uncoveredCount > 2 ? "is-critical" : "is-warning");
    el.innerHTML = `
        <div class="ops-tomorrow-card ${statusClass}">
            <div class="ops-panel-kicker">${escapeHtml(t("ops_tomorrow_kicker") || "Sutra")}</div>
            <div class="ops-tomorrow-stats">
                <strong>${percent}%</strong>
                <span>${escapeHtml(t("ops_tomorrow_coverage") || "pokrivenost")}</span>
                <span class="ops-tomorrow-detail">${coveredCount}/${total} ${escapeHtml(t("ops_tomorrow_drivers") || "vozača")}</span>
            </div>
            ${uncoveredCount > 0 ? `<p class="ops-tomorrow-warn">${escapeHtml(t("ops_tomorrow_gaps", { count: uncoveredCount }) || `${uncoveredCount} vozač(a) bez smene za sutra`)}</p>` : ""}
        </div>
    `;
}

function renderMessagesPreview() {
    const container = document.getElementById("dispatcher-messages-preview");
    if (!container) return;

    const msgs = (window.state.messages || []).filter(m => !isDispArchived(m)).slice(0, 4);
    if (msgs.length === 0) {
        container.innerHTML = `<div class="ops-empty">${t("no_messages") || "Nema poruka."}</div>`;
        return;
    }

    container.innerHTML = msgs.map(m => {
        const isGroup = m.scope === "group";
        const tag = isGroup
            ? (t("msg_tab_group") || "Grupa")
            : (t("msg_tab_personal") || "Lično");
        return `
        <article class="ops-msg-item ${m.read ? "" : "is-unread"}">
            <div class="ops-msg-meta">
                <span>${tag}</span>
                <span>${escapeHtml(m.time || "")}</span>
            </div>
            <p>${escapeHtml(msgText(m, window.state.language))}</p>
            <span class="ops-msg-to">→ ${escapeHtml(m.recipient || "")}</span>
        </article>`;
    }).join("");
}

function driverInitials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


function shiftTypeLabel(value) {
    const opt = SHIFT_TYPE_OPTIONS.find(item => item.value === value);
    return opt ? (t(opt.labelKey) || opt.fallback) : value;
}

function busSelectHtml(driverId, selectedBus, selectIdSuffix = "") {
    const options = (window.state.buses || []).map(b => {
        const num = String(b.number ?? "");
        return `<option value="${escapeHtml(num)}" ${num === String(selectedBus) ? "selected" : ""}>Bus ${escapeHtml(num)}</option>`;
    }).join("");
    const emptySelected = !selectedBus || selectedBus === "—" ? "selected" : "";
    const idSuffix = selectIdSuffix || String(driverId || "");
    return `<select class="ops-edit-select" ${changeAttr("updateDriverBusInline", [driverId], "args-value")} aria-label="${escapeHtml(t("table_bus") || "Bus")}" id="ops-bus-${escapeHtml(idSuffix)}">
        <option value="" ${emptySelected}>—</option>
        ${options}
    </select>`;
}

function shiftSelectHtml(driverId, currentType, selectIdSuffix = "") {
    const options = SHIFT_TYPE_OPTIONS.map(st =>
        `<option value="${st.value}" ${currentType === st.value ? "selected" : ""}>${escapeHtml(shiftTypeLabel(st.value))}</option>`
    ).join("");
    const idSuffix = selectIdSuffix || String(driverId || "");
    return `<select class="ops-edit-select" ${changeAttr("updateDriverShiftInline", [driverId], "args-value")} aria-label="${escapeHtml(t("table_shift_route") || "Smena")}" id="ops-shift-${escapeHtml(idSuffix)}">
        ${options}
    </select>`;
}

function paintLastRefreshedIndicator() {
    const el = document.getElementById("ops-last-refreshed");
    if (!el) return;
    if (!_lastDashboardRenderAt) {
        el.textContent = "";
        return;
    }
    const d = new Date(_lastDashboardRenderAt);
    el.textContent = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function startAutoRefresh() {
    if (_autoRefreshTimer) return;
    _autoRefreshTimer = setInterval(() => {
        const container = document.getElementById("dispatcher-dashboard");
        if (!container || container.classList.contains("hidden") || container.offsetParent === null) {
            clearInterval(_autoRefreshTimer);
            _autoRefreshTimer = null;
            return;
        }
        renderDispatcherDashboard();
    }, 30000);
}

function renderDispatcherDashboard() {
    _lastDashboardRenderAt = Date.now();
    renderDashboardGroupsGrid();
    paintLastRefreshedIndicator();
    startAutoRefresh();
    void refreshStaffShiftConfirmations().then((updated) => {
        if (updated || _confirmNeedsPaint) {
            _confirmNeedsPaint = false;
            renderDispatcherDashboard();
        }
    });

    const allDrivers = getVisibleDrivers();
    const activeDriversCount = allDrivers.filter(d => d.active).length;
    // Buses are assigned per shift, not stored as a static driver.bus field in
    // real usage — read today's actual duty (same source as the daily plan
    // table below) instead of a field that is almost always empty.
    const todayForBusCount = todayDateStr();
    const activeBusesList = allDrivers
        .filter(d => d.active)
        .map(d => {
            const duty = getDriverDutySummary(d.name, todayForBusCount);
            return duty.bus !== "—" ? duty.bus : (d.bus || "");
        })
        .filter(Boolean);
    const activeBusesCount = [...new Set(activeBusesList)].length;
    const operationalReports = visibleOperationalReports();
    const openReportsCount = operationalReports.length;
    const unreadCount = countUnreadMessages();
    const pendingConfirms = confirmationAttentionRows();
    const failedDeliveries = pendingConfirms.filter((row) => row.kind === "delivery_failed").length;
    // Single source of truth with Needs attention / plan-health (includes missing bus, gaps, confirms).
    const liveAttentionItems = collectAllAttentionItems();

    const elActiveDrivers = document.getElementById("stat-active-drivers-count");
    const elActiveBuses = document.getElementById("stat-active-buses-count");
    const elOpenProblems = document.getElementById("stat-open-problems-count");
    const elUnread = document.getElementById("stat-unread-messages-count");

    if (elActiveDrivers) elActiveDrivers.innerText = activeDriversCount;
    if (elActiveBuses) elActiveBuses.innerText = activeBusesCount;
    if (elOpenProblems) elOpenProblems.innerText = liveAttentionItems.length;
    if (elUnread) elUnread.innerText = unreadCount;
    updateMessagesNavBadge(unreadCount);

    updateOpsPlanHealth({ openReportsCount, pendingConfirms, failedDeliveries });

    const alertsContainer = document.getElementById("dispatcher-live-alerts");
    if (alertsContainer) {
        alertsContainer.innerHTML = "";

        if (_confirmFetchInFlight && !_confirmFetchAt && liveAttentionItems.length === 0) {
            alertsContainer.innerHTML = `<div class="ops-empty ops-loading" aria-busy="true">${escapeHtml(t("loading") || "Učitavanje…")}</div>`;
        } else if (_confirmFetchFailed && liveAttentionItems.length === 0) {
            alertsContainer.innerHTML = `<div class="ops-empty is-error" role="status">${escapeHtml(t("ops_confirmations_load_failed") || "Potvrde smena nisu mogle biti učitane.")}</div>`;
        } else if (liveAttentionItems.length === 0) {
            alertsContainer.innerHTML = `<div class="ops-empty">${escapeHtml(t("ops_attn_empty") || t("js_no_alerts") || "Nema aktivnih stavki")}</div>`;
        } else {
            liveAttentionItems.slice(0, 6).forEach((item) => {
                const div = document.createElement("article");
                const critical = item.severity === "critical";
                div.className = `ops-action-card alert-item ${critical ? "alert-breakdown is-critical" : "alert-delay is-warning"}`;
                const metaParts = [
                    item.driverName || "",
                    item.dutyCode || item.bus || "",
                    item.date || ""
                ].filter(Boolean);
                div.innerHTML = `
                    <div class="ops-action-rail" aria-hidden="true"></div>
                    <div class="alert-item-content ops-action-body">
                        <div class="alert-item-title">
                            <span>${escapeHtml(item.title || item.kind || "—")}</span>
                            <span class="alert-item-time">${escapeHtml(item.radarDayLabel ? `${item.radarDayLabel} · ${item.date || ""}` : (item.date || ""))}</span>
                        </div>
                        <span class="alert-item-desc">${escapeHtml(item.summary || item.detail || "—")}</span>
                        <span class="alert-item-meta">${escapeHtml(metaParts.join(" · ") || "—")}</span>
                        <div class="alert-item-actions">
                            <button type="button" class="urgent-action alert-item-resolve" ${actionAttr("openOpsAttentionPanel", [item.id])}>
                                <i data-lucide="zap"></i> ${escapeHtml(t("ops_btn_resolve") || t("ops_attn_solve_now") || "Reši problem")}
                            </button>
                        </div>
                    </div>
                `;
                alertsContainer.appendChild(div);
            });
        }
        refreshOpsAttentionPanelIfOpen();
    }

    renderMessagesPreview();
    renderTomorrowPreview();
    void renderOpsActivityFeed();

    const todayStr = todayDateStr();
    const dailyRows = document.getElementById("ops-daily-plan-rows");
    if (dailyRows) {
        const planDrivers = allDrivers.slice(0, 10);
        if (!planDrivers.length) {
            dailyRows.innerHTML = `<tr><td colspan="5" class="ops-empty">${t("js_no_drivers") || "Nema vozača"}</td></tr>`;
        } else {
            dailyRows.innerHTML = planDrivers.map(drv => {
                const duty = getDriverDutySummary(drv.name, todayStr);
                const busNum = duty.bus !== "—" ? duty.bus : (drv.bus || "");
                const shiftType = duty.shift?.type || "";
                const incident = activeCoverageIncident(drv, todayStr);
                const uncovered = !duty.shift || duty.shift.type === "off" || duty.shift.type === "clear" || Boolean(incident);
                const confirmStatus = uncovered ? "uncovered" : shiftConfirmStatus(drv, todayStr);
                const statusLabel = uncovered
                    ? (t("ops_shift_uncovered") || "Nepokriveno / van dužnosti")
                    : (confirmStatus === "confirmed"
                        ? (t("ops_shift_confirmed") || "Potvrđeno")
                        : (confirmStatus === "expired"
                            ? (t("status_confirmation_expired") || "Isteklo")
                            : (confirmStatus === "failed"
                                ? (t("status_confirmation_delivery_failed") || "Slanje nije uspelo")
                                : (confirmStatus === "pending"
                                    ? (t("status_pending_confirmation") || "Čeka potvrdu")
                                    : (t("ops_shift_planned") || "Po planu")))));
                const rowClass = uncovered
                    ? "is-uncovered"
                    : (confirmStatus === "confirmed" ? "is-ok"
                        : (confirmStatus === "expired" || confirmStatus === "failed" ? "is-uncovered"
                            : (confirmStatus === "pending" ? "is-pending" : "is-neutral")));
                const drvId = driverUid(drv);
                const busOutBtn = !uncovered && busNum
                    ? `<button type="button" class="btn-danger-ghost ops-row-action" ${actionAttr("openVehicleOperationalIncident", [busNum, drvId])} aria-label="${escapeHtml(t("ops_bus_out") || "Vozilo van operacije")}"><i data-lucide="bus"></i></button>`
                    : "";
                const actionBtn = incident
                    ? `<button type="button" class="ops-row-action urgent-action" ${actionAttr("openOpsAttentionPanel", [`coverage:${incident.id}`])}><i data-lucide="zap"></i> ${escapeHtml(t("ops_attn_solve_now") || "Reši odmah")}</button>`
                    : uncovered
                    ? `<button type="button" class="ops-row-action urgent-action" ${actionAttr("openOpsAttentionPanel", [])}><i data-lucide="zap"></i> ${escapeHtml(t("ops_attn_solve_now") || "Reši odmah")}</button>`
                    : !busNum
                    ? `<button type="button" class="ops-row-action urgent-action" ${actionAttr("openOpsAttentionPanel", [`bus:${drvId}`])}><i data-lucide="zap"></i> ${escapeHtml(t("ops_attn_solve_now") || "Reši odmah")}</button>`
                    : `<span class="ops-row-actions">${busOutBtn}<button type="button" class="btn-danger-ghost ops-row-action" ${actionAttr("openOperationalIncident", [drvId])} aria-label="${escapeHtml(t("ops_incident_open") || "Prijavi problem")}"><i data-lucide="user-x"></i> ${escapeHtml(t("ops_incident_open") || "Problem")}</button></span>`;
                return `<tr class="${rowClass}">
                    <td><strong>${escapeHtml(drv.name || "")}</strong></td>
                    <td>${busSelectHtml(drvId, busNum, `day-${drvId}`)}</td>
                    <td>${shiftSelectHtml(drvId, shiftType, `day-${drvId}`)}</td>
                    <td><span class="ops-status-pill" data-status="${escapeHtml(confirmStatus)}">${escapeHtml(statusLabel)}</span></td>
                    <td>${actionBtn}</td>
                </tr>`;
            }).join("");
        }
    }

    const driversList = document.getElementById("dispatcher-active-drivers-list");
    if (driversList) {
        driversList.innerHTML = "";

        const visibleCrew = allDrivers.slice(0, 12);
        if (!visibleCrew.length) {
            driversList.innerHTML = `<div class="ops-empty">${t("js_no_drivers") || "Nema vozača"}</div>`;
        }

        visibleCrew.forEach(drv => {
            const drvId = driverUid(drv);
            const duty = getDriverDutySummary(drv.name, todayStr);
            const shift = duty.shift;
            const busNum = duty.bus !== "—" ? duty.bus : (drv.bus || "");
            const route = duty.route;
            const shiftLabel = duty.shiftLabel || "—";

            let currentStop = t("js_garage") || "Garaža";
            if (drv.active && route?.stops?.length) {
                const stopIdx = drv.currentStopIndex !== undefined ? drv.currentStopIndex : 0;
                currentStop = route.stops[stopIdx] || route.stops[route.stops.length - 1];
            }

            const incident = activeCoverageIncident(drv, todayStr);
            const uncovered = !shift || shift.type === "off" || shift.type === "clear" || Boolean(incident);
            const confirmStatus = uncovered ? "uncovered" : shiftConfirmStatus(drv, todayStr);
            const statusLabel = drv.active
                ? (uncovered
                    ? (t("ops_driver_available") || "Dostupan")
                    : (confirmStatus === "confirmed"
                        ? (t("ops_driver_on_duty") || "Na dužnosti")
                        : (confirmStatus === "expired"
                            ? (t("status_confirmation_expired") || "Isteklo")
                            : (confirmStatus === "failed"
                                ? (t("status_confirmation_delivery_failed") || "Slanje nije uspelo")
                                : (t("status_pending_confirmation") || "Čeka potvrdu")))))
                : (t("ops_driver_off") || "Van dužnosti");
            const statusClass = !drv.active
                ? "is-off"
                : (uncovered ? "is-available"
                    : (confirmStatus === "confirmed" ? "is-on-duty"
                        : (confirmStatus === "expired" || confirmStatus === "failed" ? "is-available" : "is-pending")));

            const card = document.createElement("article");
            card.className = `ops-crew-card ${statusClass}`;
            card.innerHTML = `
                <div class="ops-crew-avatar" aria-hidden="true">${escapeHtml(driverInitials(drv.name))}</div>
                <div class="ops-crew-main">
                    <div class="ops-crew-name-row">
                        <strong>${escapeHtml(drv.name || "")}</strong>
                        <span class="ops-crew-status">${escapeHtml(statusLabel)}</span>
                    </div>
                    <div class="ops-crew-meta">${escapeHtml(shiftLabel)} · ${escapeHtml(String(busNum || "—"))} · ${escapeHtml(currentStop)}</div>
                    <div class="ops-crew-controls">
                        ${busSelectHtml(drvId, busNum, `crew-${drvId}`)}
                        ${shiftSelectHtml(drvId, shift?.type || "", `crew-${drvId}`)}
                    </div>
                    <div class="ops-crew-actions">
                        <button type="button" class="btn-primary ops-assign-btn" ${actionAttr("opsAssignDriver", [drvId, uncovered ? "morning" : (shift?.type || "morning")])}>
                            ${escapeHtml(uncovered ? (t("ops_btn_assign") || "Dodeli") : (t("ops_btn_edit") || "Izmeni"))}
                        </button>
                    </div>
                </div>
            `;
            driversList.appendChild(card);
        });
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
}

/** Buses follow a duty code (assigned via the monthly plan / duty catalog),
 * never the other way around. If the driver has no catalog-linked duty yet,
 * a bus-only quick-pick here would create an invalid "wrong/missing duty"
 * shift — route to the real duty assignment flow instead. */
function hasCatalogDuty(shift) {
    return Boolean(shift && shift.type !== "clear" && shift.type !== "off" && shift.routeCode);
}

async function updateDriverBusInline(driverId, newBus) {
    const driver = getDriverById(driverId);
    if (!driver) return;
    const today = todayDateStr();
    const existing = getShiftForDriverIdOnly(driverId, today);
    if (!hasCatalogDuty(existing)) {
        showToast(
            t("ops_bus_needs_duty_first") || "Prvo dodelite šifru dužnosti iz kataloga — bus se vezuje za smenu.",
            "info"
        );
        openShiftCell(driverId, today);
        return;
    }
    const saved = await persistShift(
        driver,
        today,
        existing.type,
        existing.name || existing.routeCode || "",
        existing.start || null,
        existing.end || null,
        newBus
    );
    if (!saved) return;
    showToast(t("ops_bus_assigned", { bus: newBus || "—", driver: driver.name }) || `Bus ${newBus} → ${driver.name}`, "success");
    renderDispatcherDashboard();
}

async function updateDriverShiftInline(driverId, newShiftType) {
    const driver = getDriverById(driverId);
    if (!driver) return;
    const today = todayDateStr();
    const type = newShiftType || "clear";
    if (["clear", "off", "vacation", "sick"].includes(type)) {
        openOperationalIncident(driverId);
        renderDispatcherDashboard();
        return;
    }
    // A working shift type without a real catalog duty code (and its paired
    // bus, imported together via the monthly plan) is not a valid duty —
    // send the dispatcher to the real assignment flow instead of persisting
    // a bare type that would immediately show up as "wrong/missing duty".
    showToast(
        t("ops_shift_needs_duty_first") || "Izaberite šifru dužnosti iz kataloga — tip smene se time postavlja automatski.",
        "info"
    );
    openShiftCell(driverId, today);
    return;
}

function activeCoverageIncident(driver, date) {
    const id = driverUid(driver);
    return visibleOperationalReports().find(report =>
        reportKind(report).kind === "coverage"
        && report.driverId === id
        && report.date === date
    ) || null;
}


const AVAILABLE_REPLACEMENT_TYPES = new Set(["off", "clear", "bereitschaft", "standby"]);

function coverageDriverCandidates(report) {
    const groupId = String(report?.groupId || report?.lineId || "");
    return getVisibleDrivers().filter(driver => {
        if (driver.active === false || driverUid(driver) === report.driverId) return false;
        if (!driverKnowsGroup(driver, groupId)) return false;
        const duty = getShiftForDriverIdOnly(driverUid(driver), report.date);
        return !duty || AVAILABLE_REPLACEMENT_TYPES.has(String(duty.type || "").toLowerCase());
    });
}

function coverageBusCandidates(report) {
    const groupId = String(report?.groupId || report?.lineId || "");
    const used = new Set();
    getVisibleDrivers().forEach(driver => {
        if (driverUid(driver) === report.driverId) return;
        const duty = getShiftForDriverIdOnly(driverUid(driver), report.date);
        if (duty && !AVAILABLE_REPLACEMENT_TYPES.has(String(duty.type || "").toLowerCase()) && duty.bus) {
            used.add(String(duty.bus));
        }
    });
    return (window.state.buses || []).filter(bus => {
        const number = String(bus.number || "");
        const keep = number === String(report.bus || "");
        if (!keep && !busIsAssignable(bus)) return false;
        return busHasGroup(bus, groupId)
            && (!used.has(number) || keep);
    });
}

function ensureCoverageResolverModal() {
    let modal = document.getElementById("ops-coverage-resolver-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "ops-coverage-resolver-modal";
    modal.className = "ops-modal-layer hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "ops-coverage-resolver-title");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <form class="ops-incident-dialog ops-resolution-dialog">
            <div class="ops-incident-heading">
                <span class="ops-incident-icon is-amber"><i data-lucide="wrench"></i></span>
                <div>
                    <h2 id="ops-coverage-resolver-title">${escapeHtml(t("ops_coverage_resolver_title"))}</h2>
                    <p id="ops-coverage-resolver-original"></p>
                </div>
            </div>
            <p class="ops-resolution-intro">${escapeHtml(t("ops_coverage_resolver_effect"))}</p>
            <label for="ops-coverage-driver">${escapeHtml(t("ops_coverage_replacement_driver"))}</label>
            <select id="ops-coverage-driver" required></select>
            <label for="ops-coverage-bus">${escapeHtml(t("ops_coverage_replacement_bus"))}</label>
            <select id="ops-coverage-bus" required></select>
            <p id="ops-coverage-resolver-status" class="ops-resolution-status" role="status" aria-live="polite"></p>
            <div class="ops-incident-actions">
                <button type="button" class="btn-secondary" ${actionAttr("closeCoverageResolver")}>${escapeHtml(t("btn_cancel"))}</button>
                <button type="submit" class="urgent-action ops-resolution-submit"><i data-lucide="wrench"></i> ${escapeHtml(t("ops_coverage_confirm"))}</button>
            </div>
        </form>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", event => {
        if (event.target === modal) closeCoverageResolver();
    });
    modal.querySelector("form").addEventListener("submit", submitCoverageResolution);
    if (typeof lucide !== "undefined") lucide.createIcons();
    return modal;
}

function openCoverageResolver(reportId, preferredReplacementDriverId = "") {
    const report = visibleOperationalReports().find(item =>
        item.id === reportId && reportKind(item).kind === "coverage"
    );
    if (!report) return false;
    const modal = ensureCoverageResolverModal();
    const drivers = coverageDriverCandidates(report);
    const buses = coverageBusCandidates(report);
    const driverSelect = modal.querySelector("#ops-coverage-driver");
    const busSelect = modal.querySelector("#ops-coverage-bus");
    const preferred = String(preferredReplacementDriverId || "");
    driverSelect.innerHTML = drivers.length
        ? drivers.map(driver => `<option value="${escapeHtml(driverUid(driver))}" ${driverUid(driver) === preferred ? "selected" : ""}>${escapeHtml(driver.name)}</option>`).join("")
        : `<option value="" disabled selected>${escapeHtml(t("ops_coverage_no_drivers"))}</option>`;
    busSelect.innerHTML = buses.length
        ? buses.map(bus => {
            const number = String(bus.number || "");
            return `<option value="${escapeHtml(number)}" ${number === String(report.bus || "") ? "selected" : ""}>${escapeHtml(number)}</option>`;
        }).join("")
        : `<option value="" disabled selected>${escapeHtml(t("ops_coverage_no_buses"))}</option>`;
    modal.dataset.reportId = report.id;
    modal.querySelector("#ops-coverage-resolver-original").textContent =
        t("ops_coverage_original_driver", { driver: report.driver || "—" });
    modal.querySelector("#ops-coverage-resolver-status").textContent =
        !drivers.length ? t("ops_coverage_no_drivers") : (!buses.length ? t("ops_coverage_no_buses") : "");
    modal.querySelector("button[type='submit']").disabled = !drivers.length || !buses.length;
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => driverSelect.focus(), 0);
    return true;
}

function closeCoverageResolver() {
    const modal = document.getElementById("ops-coverage-resolver-modal");
    if (!modal || modal.dataset.pending === "true") return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    delete modal.dataset.reportId;
}

async function submitCoverageResolution(event) {
    event.preventDefault();
    const modal = document.getElementById("ops-coverage-resolver-modal");
    const reportId = String(modal?.dataset.reportId || "");
    const replacementDriverId = String(modal?.querySelector("#ops-coverage-driver")?.value || "");
    const replacementBus = String(modal?.querySelector("#ops-coverage-bus")?.value || "");
    const status = modal?.querySelector("#ops-coverage-resolver-status");
    const submit = modal?.querySelector("button[type='submit']");
    if (!modal || !reportId) return;
    modal.dataset.pending = "true";
    if (submit) submit.disabled = true;
    try {
        const ok = await applyCoverageResolution(reportId, replacementDriverId, replacementBus, status);
        if (ok) closeCoverageResolver();
    } finally {
        delete modal.dataset.pending;
        if (submit) submit.disabled = false;
    }
}

function incidentReasonSelectHtml(options) {
    const opts = (options || [])
        .map((row) => `<option value="${escapeHtml(row.value)}">${escapeHtml(row.label)}</option>`)
        .join("");
    return `
        <label for="ops-incident-reason-code">${escapeHtml(t("dispo_reason_label") || "Razlog")}</label>
        <select id="ops-incident-reason-code" name="reasonCode" class="ops-incident-reason-select" required>
            <option value="">${escapeHtml(t("dispo_reason_placeholder") || "Izaberite razlog")}</option>
            ${opts}
        </select>
        <label for="ops-incident-description" id="ops-incident-note-label" class="hidden">${escapeHtml(t("dispo_reason_note_label") || "Napomena (opciono)")}</label>
        <textarea id="ops-incident-description" name="description" class="hidden" maxlength="120" rows="2"
            placeholder="${escapeHtml(t("dispo_reason_note_placeholder") || "Kratka napomena — samo ako treba")}"></textarea>
    `;
}

function bindIncidentReasonUi(modal) {
    const select = modal.querySelector("#ops-incident-reason-code");
    const note = modal.querySelector("#ops-incident-description");
    const noteLabel = modal.querySelector("#ops-incident-note-label");
    if (!select || select.dataset.bound === "1") return;
    select.dataset.bound = "1";
    const sync = () => {
        const show = select.value === "other";
        note?.classList.toggle("hidden", !show);
        noteLabel?.classList.toggle("hidden", !show);
        if (!show && note) note.value = "";
    };
    select.addEventListener("change", sync);
    sync();
}

function paintIncidentReasonOptions(modal, affectedEntity) {
    const options = affectedEntity === "vehicle"
        ? dispoBusIncidentReasonOptions()
        : dispoDriverIncidentReasonOptions();
    const host = modal.querySelector("#ops-incident-reason-host");
    if (!host) return;
    host.innerHTML = incidentReasonSelectHtml(options);
    bindIncidentReasonUi(modal);
}

function ensureIncidentModal() {
    let modal = document.getElementById("ops-incident-modal");
    const needsRebuild = modal && !modal.querySelector("#ops-incident-reason-code");
    if (needsRebuild) {
        modal.remove();
        modal = null;
    }
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "ops-incident-modal";
    modal.className = "ops-modal-layer hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "ops-incident-title");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <form id="ops-incident-form" class="ops-incident-dialog">
            <div class="ops-incident-heading">
                <span class="ops-incident-icon"><i data-lucide="user-x"></i></span>
                <div>
                    <h2 id="ops-incident-title">${escapeHtml(t("ops_incident_title") || "Vozač ne može da nastavi smenu")}</h2>
                    <p id="ops-incident-driver"></p>
                </div>
            </div>
            <div id="ops-incident-reason-host"></div>
            <div class="ops-incident-warning">${escapeHtml(t("ops_incident_effect") || "Plan će pokazati rupu dok ne dodelite zamenu.")}</div>
            <div class="ops-incident-actions">
                <button type="button" class="btn-secondary" ${actionAttr("closeOperationalIncident")}>${escapeHtml(t("btn_cancel") || "Otkaži")}</button>
                <button type="submit" class="btn-danger-ghost ops-incident-submit">${escapeHtml(t("ops_incident_confirm") || "Označi i traži zamenu")}</button>
            </div>
        </form>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
        if (event.target === modal) closeOperationalIncident();
    });
    modal.querySelector("form").addEventListener("submit", submitOperationalIncident);
    if (typeof lucide !== "undefined") lucide.createIcons();
    return modal;
}

async function transitionOperationalIncident(reportId, toStatus) {
    const report = (window.state.reports || []).find((row) => row.id === reportId);
    if (!report) return;
    const expectedRevision = Number.isInteger(report.revision) ? report.revision : 0;
    try {
        let result = { success: true, report: { status: toStatus, revision: expectedRevision + 1 } };
        if (!USE_LOCAL_STATE) {
            result = await ApiClient.transitionStaffOperationalIncident(reportId, {
                toStatus,
                expectedRevision,
                assigneeId: window.currentUser?.uid || window.currentUser?.id
            });
        }
        if (!result?.success) {
            showToast(result?.error || t("problem_transition_failed") || "Status nije promenjen.", "error");
            return;
        }
        Object.assign(report, result.report || {}, { status: toStatus });
        if (USE_LOCAL_STATE) {
            report.revision = expectedRevision + 1;
            report.assigneeId = window.currentUser?.uid || window.currentUser?.id;
            saveState();
        }
        showToast(t("problem_transition_ok") || "Status incidenta ažuriran.", "success");
        renderDispatcherDashboard();
    } catch (error) {
        showToast(error?.message || t("problem_transition_failed") || "Status nije promenjen.", "error");
    }
}

function openVehicleOperationalIncident(busNumber, driverName = "") {
    const bus = String(busNumber || "").trim();
    if (!bus) return;
    const today = todayDateStr();
    const duplicate = visibleOperationalReports().find((report) =>
        reportKind(report).kind === "coverage"
        && report.affectedEntity === "vehicle"
        && String(report.bus || "") === bus
        && report.date === today
    );
    if (duplicate) {
        openCoverageResolver(duplicate.id);
        return;
    }
    const modal = ensureIncidentModal();
    modal.dataset.affectedEntity = "vehicle";
    modal.dataset.busNumber = bus;
    modal.dataset.driverName = driverName || "";
    modal.querySelector("#ops-incident-driver").textContent =
        `${t("vehicle") || "Vozilo"} ${bus}${driverName ? ` · ${driverName}` : ""}`;
    const title = modal.querySelector("h2");
    if (title) title.textContent = t("ops_bus_incident_title") || "Vozilo ne može da nastavi smenu";
    paintIncidentReasonOptions(modal, "vehicle");
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#ops-incident-reason-code")?.focus(), 0);
}

function opsActivityLabel(event) {
    const action = String(event?.action || "");
    const map = {
        operational_incident_created: "ops_activity_incident_created",
        operational_incident_transitioned: "ops_activity_incident_transitioned",
        operational_incident_resolved: "ops_activity_incident_resolved",
        shift_assigned: "ops_activity_shift_assigned",
        shift_removed: "ops_activity_shift_removed",
        shift_undone: "ops_activity_shift_undone",
        report_resolved: "ops_activity_report_resolved",
        staff_message_sent: "ops_activity_message_sent"
    };
    return t(map[action]) || action;
}

async function renderOpsActivityFeed() {
    const el = document.getElementById("ops-recent-activity");
    if (!el) return;
    let events = Array.isArray(window.state.opsActivity) ? window.state.opsActivity : [];
    if (!USE_LOCAL_STATE) {
        try {
            const result = await ApiClient.getStaffOpsActivity(12);
            if (result?.success && Array.isArray(result.events)) {
                events = result.events;
                window.state.opsActivity = events;
            }
        } catch {
            /* keep cached */
        }
    } else if (!events.length) {
        events = (window.state.reports || [])
            .slice()
            .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
            .slice(0, 8)
            .map((rep) => ({
                id: rep.id,
                action: rep.status === "resolved" ? "operational_incident_resolved" : "operational_incident_created",
                timestamp: rep.resolvedAt || rep.createdAt || null,
                details: {
                    driverId: rep.driverId,
                    bus: rep.bus,
                    groupId: rep.groupId,
                    date: rep.date,
                    status: rep.status
                }
            }));
    }
    if (!events.length) {
        el.innerHTML = `<div class="ops-empty">${escapeHtml(t("ops_activity_empty") || "Nema nedavnih operativnih izmena.")}</div>`;
        return;
    }
    el.innerHTML = events.slice(0, 10).map((event) => {
        const when = event.timestamp
            ? formatDateTime(event.timestamp)
            : "—";
        const detail = [
            event.details?.date,
            event.details?.bus ? `bus ${event.details.bus}` : "",
            event.details?.status || ""
        ].filter(Boolean).join(" · ");
        return `<article class="ops-activity-item">
            <strong>${escapeHtml(opsActivityLabel(event))}</strong>
            <span>${escapeHtml(detail || "—")}</span>
            <time>${escapeHtml(when)}</time>
        </article>`;
    }).join("");
}

function openOperationalIncident(driverId, preferredReplacementDriverId = "") {
    const driver = getDriverById(driverId);
    if (!driver) return;
    const today = todayDateStr();
    const driverIdValue = driverUid(driver);
    const duplicate = visibleOperationalReports().find(report =>
        reportKind(report).kind === "coverage"
        && report.driverId === driverIdValue
        && report.date === today
    );
    if (duplicate) {
        openCoverageResolver(duplicate.id, preferredReplacementDriverId);
        return;
    }
    const modal = ensureIncidentModal();
    modal.dataset.affectedEntity = "driver";
    delete modal.dataset.busNumber;
    modal.dataset.driverId = driverIdValue;
    modal.dataset.driverName = driver.name || "";
    modal.dataset.preferredReplacementDriverId = String(preferredReplacementDriverId || "");
    const title = modal.querySelector("h2");
    if (title) title.textContent = t("ops_incident_title") || "Vozač ne može da nastavi smenu";
    modal.querySelector("#ops-incident-driver").textContent = driver.name || "";
    paintIncidentReasonOptions(modal, "driver");
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#ops-incident-reason-code")?.focus(), 0);
}

function closeOperationalIncident() {
    const modal = document.getElementById("ops-incident-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    delete modal.dataset.driverName;
    delete modal.dataset.preferredReplacementDriverId;
    delete modal.dataset.affectedEntity;
    delete modal.dataset.busNumber;
}

function alignPlanAfterDriverIncident(driver, reasonCode, today) {
    if (!driver?.id) return;
    const shiftType = reasonCode === "sick" ? "sick" : "clear";
    const label = reasonCode === "sick"
        ? (t("shift_type_sick") || "Bolovanje")
        : "";
    // Bypass persistShift gate: incident is already being opened.
    setShiftForDriverIdOnly(driverUid(driver), driver.name || "", today, {
        type: shiftType,
        name: label,
        bus: "",
        syncSchedule: true
    });
}

function alignPlanAfterBusIncident(busNumber, reasonCode, today) {
    const number = String(busNumber || "").trim();
    if (!number) return;
    const bus = (window.state.buses || []).find(
        (b) => String(b.number || "").trim() === number
    );
    if (bus) {
        const outOfService = reasonCode === "sold_out";
        // D21: no separate "out" status — sold-out buses leave the fleet (active=false)
        // and both incident outcomes report as Kvar (breakdown).
        bus.opsStatus = "breakdown";
        if (outOfService) bus.active = false;
        bus.revision = (Number.isInteger(bus.revision) ? bus.revision : 0) + 1;
    }
    for (const drv of getVisibleDrivers()) {
        const drvId = driverUid(drv);
        const shift = getShiftForDriverIdOnly(drvId, today);
        if (!shift || String(shift.bus || "") !== number) continue;
        setShiftForDriverIdOnly(drvId, drv.name || "", today, {
            type: shift.type || "morning",
            name: shift.name || "",
            bus: "",
            start: shift.start || null,
            end: shift.end || null,
            routeCode: shift.routeCode || null,
            syncSchedule: true
        });
    }
}

async function submitOperationalIncident(event) {
    event.preventDefault();
    const modal = document.getElementById("ops-incident-modal");
    const affectedEntity = modal?.dataset.affectedEntity === "vehicle" ? "vehicle" : "driver";
    const driver = affectedEntity === "driver" ? getDriverById(modal?.dataset.driverId) : null;
    const busNumber = String(modal?.dataset.busNumber || "").trim();
    const reasonCode = String(modal?.querySelector("#ops-incident-reason-code")?.value || "").trim();
    const description = String(modal?.querySelector("#ops-incident-description")?.value || "").trim().slice(0, 120);
    if (!reasonCode) {
        showToast(t("dispo_reason_required") || "Select a reason.", "error");
        modal?.querySelector("#ops-incident-reason-code")?.focus();
        return;
    }
    if (affectedEntity === "driver" && !driver) return;
    if (affectedEntity === "vehicle" && !busNumber) return;
    const prefix = affectedEntity === "vehicle" ? "dispo_inc_bus_" : "dispo_inc_driver_";
    const reason = reasonLabel(reasonCode, prefix) || reasonCode;
    const submit = modal.querySelector("button[type='submit']");
    submit.disabled = true;
    const today = todayDateStr();
    const shift = driver ? getShiftForDriverIdOnly(driverUid(driver), today) : null;
    const bus = affectedEntity === "vehicle"
        ? busNumber
        : (shift?.bus || driver?.bus || "");
    let result = {
        success: true,
        report: {
            id: `incident-${Date.now()}`,
            type: "coverage:disruption",
            status: "open",
            revision: 0,
            affectedEntity,
            severity: "sev_critical",
            date: today,
            driverId: driver ? driverUid(driver) : null,
            driver: driver?.name || "",
            groupId: driver?.groupId || driver?.lineId || window.state?.activeGroupHubId || "",
            reason,
            reasonCode,
            description,
            bus,
            // Snapshot duty before plan align clears the original (needed for replacement apply).
            shiftType: shift?.type || "",
            shiftName: shift?.name || shift?.routeCode || "",
            routeCode: shift?.routeCode || "",
            start: shift?.start || null,
            end: shift?.end || null,
            createdAt: new Date().toISOString(),
            createdBy: window.currentUser?.uid || window.currentUser?.id || null
        }
    };
    try {
        if (!USE_LOCAL_STATE) {
            result = await ApiClient.createStaffOperationalIncident({
                affectedEntity,
                driverId: driver ? driverUid(driver) : undefined,
                date: today,
                reason,
                description: [reasonCode, description].filter(Boolean).join(": ").slice(0, 1000),
                bus,
                shiftType: shift?.type || "",
                shiftName: shift?.name || ""
            });
        }
        if (!result?.success) {
            showToast(result?.error || t("ops_incident_save_failed") || "Incident nije sačuvan.", "error");
            return;
        }
        if (result.report && !result.report.reasonCode) result.report.reasonCode = reasonCode;
        window.state.reports = Array.isArray(window.state.reports) ? window.state.reports : [];
        window.state.reports.push(result.report);

        if (affectedEntity === "driver") {
            alignPlanAfterDriverIncident(driver, reasonCode, today);
        } else {
            alignPlanAfterBusIncident(busNumber, reasonCode, today);
        }

        recordDemoChangeReason({
            type: affectedEntity === "vehicle" ? "bus_incident_opened" : "driver_incident_opened",
            reason: reasonCode,
            note: description,
            driverId: driver ? driverUid(driver) : null,
            bus: bus || null,
            reportId: result.report?.id || null,
            date: today
        });
        if (USE_LOCAL_STATE) saveState();

        const preferredReplacementDriverId = String(modal.dataset.preferredReplacementDriverId || "");
        closeOperationalIncident();
        showToast(t("ops_incident_created"), "success");
        renderDispatcherDashboard();
        paintPlanHealthBanner("ops-plan-health");
        paintPlanHealthBanner("daily-plan-health");
        if (result.report?.id) {
            openOpsAttentionPanel(`coverage:${result.report.id}`);
        } else if (preferredReplacementDriverId) {
            openOpsAttentionPanel();
        }
    } finally {
        submit.disabled = false;
    }
}

/** Reši / Dodeli — dodeli tip smene (default morning) i osveži ops centar. */
async function opsAssignDriver(driverId, shiftType = "morning") {
    const driver = getDriverById(driverId);
    if (!driver) {
        showToast(t("js_no_drivers") || "Vozač nije pronađen.", "error");
        return;
    }
    const today = todayDateStr();
    const type = shiftType && shiftType !== "clear" ? shiftType : "morning";
    const saved = await persistShift(driver, today, type, "", null, null, driver.bus || "");
    if (!saved) return;
    showToast(t("ops_assigned_toast", { driver: driver.name, type: shiftTypeLabel(type) }) || `${driver.name} · ${shiftTypeLabel(type)}`, "success");
    renderDispatcherDashboard();
}

window.renderDispatcherDashboard = renderDispatcherDashboard;

/** Explicit manual refresh — dispatchers should never have to guess whether
 * the view is current. Re-renders immediately and confirms with a toast so
 * the action feels deliberate, not silent. */
function refreshOpsCenterNow() {
    renderDispatcherDashboard();
    showToast(t("ops_refreshed_toast") || "Operativni centar osvežen.", "success", 1600);
}

export {
    renderDispatcherDashboard,
    refreshOpsCenterNow,
    countUnreadMessages,
    updateMessagesNavBadge,
    updateDriverBusInline,
    updateDriverShiftInline,
    opsAssignDriver,
    openOperationalIncident,
    openVehicleOperationalIncident,
    closeOperationalIncident,
    openCoverageResolver,
    closeCoverageResolver,
    transitionOperationalIncident,
    openOpsAttentionPanel,
    closeOpsAttentionPanel,
    focusOpsAttentionItem,
    applyOpsAttentionFix
};

window.openCoverageResolver = openCoverageResolver;
window.openOpsAttentionPanel = openOpsAttentionPanel;
window.focusOpsAttentionItem = focusOpsAttentionItem;
window.closeOpsAttentionPanel = closeOpsAttentionPanel;

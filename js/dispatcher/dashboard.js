// BusCommand ESM v9.5 — Operativni centar (editable)
import { formatDateTime, getVisibleDrivers, showToast, escapeHtml, todayDateStr } from "../core/utils.js";
import { getDriverDutySummary, getShiftForDriverDate } from "../core/shift-plan.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { t } from "../ui/i18n.js";
import { renderDashboardGroupsGrid } from "./group-hub.js";
import { msgText } from "../core/message-text.js";
import { isDispArchived } from "./message-archive.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import {
    isActiveReport,
    reportKind,
    scopedDispatcherReports,
    sortReportsForOperations
} from "./report-model.js";
import { persistShift } from "./shifts.js";
import { ApiClient } from "../core/api-client.js";
import { saveState } from "../core/state.js";

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
        .map((row) => ({
            kind: row.status === "failed" ? "delivery_failed"
                : row.status === "pending" ? "pending_send"
                    : "awaiting_confirm",
            severity: row.status === "failed" ? "critical" : "warning",
            driverId: row.driverId,
            targetDate: row.targetDate,
            label: row.label || "next_shift",
            attempts: Number(row.attempts || 0),
            lastError: row.lastError || null,
            status: row.status
        }))
        .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

function pendingConfirmationRows() {
    return confirmationAttentionRows();
}

function confirmationAttentionTitle(row) {
    if (row.kind === "delivery_failed") {
        return t("status_confirmation_delivery_failed") || "Slanje potvrde nije uspelo";
    }
    if (row.kind === "pending_send") {
        return t("status_confirmation_pending_send") || "Čeka slanje zahteva";
    }
    return t("status_pending_confirmation") || "Čeka potvrdu";
}

function shiftConfirmStatus(drv, dateStr) {
    const uid = driverUid(drv);
    if (!uid) return "unknown";
    if (hasConfirmedShift(uid, dateStr)) return "confirmed";
    const pending = pendingConfirmationRows().some(
        (row) => row.driverId === uid && row.targetDate === dateStr
    );
    if (pending) return "pending";
    return "pending";
}

async function refreshStaffShiftConfirmations(force = false) {
    if (IS_DEMO_MODE) return false;
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
    const needsAttention = openReportsCount > 0
        || pendingConfirms.length > 0
        || failedDeliveries > 0
        || _confirmFetchFailed;
    health.classList.toggle("is-attention", needsAttention);
    health.classList.toggle("is-loading", _confirmFetchInFlight);
    health.setAttribute("aria-busy", _confirmFetchInFlight ? "true" : "false");

    const titleEl = health.querySelector("strong");
    const hintEl = health.querySelector("span:not(.dot)");
    if (!titleEl || !hintEl) return;

    if (_confirmFetchFailed) {
        titleEl.textContent = t("ops_plan_stale") || "Podaci potvrda nisu ažurni";
        hintEl.textContent = t("ops_plan_stale_hint") || "Provera potvrda smena nije uspela — prikaz može biti zastareo.";
        return;
    }
    if (needsAttention) {
        titleEl.textContent = t("ops_plan_attention") || "Plan zahteva pažnju";
        const parts = [];
        if (openReportsCount > 0) parts.push(`${openReportsCount} ${t("ops_plan_attention_reports") || "prijava"}`);
        if (pendingConfirms.length > 0) parts.push(`${pendingConfirms.length} ${t("ops_plan_attention_confirms") || "potvrda"}`);
        if (failedDeliveries > 0) parts.push(`${failedDeliveries} ${t("ops_plan_attention_failed") || "neuspelo slanje"}`);
        hintEl.textContent = parts.join(" · ") || (t("ops_plan_attention_hint") || "Otvorite kolonu „Čeka akciju“.");
        return;
    }
    titleEl.textContent = t("ops_plan_healthy") || "Plan je zdrav";
    hintEl.textContent = t("ops_plan_healthy_hint") || "Sve je u skladu sa planom";
}

function visibleOperationalReports() {
    return sortReportsForOperations(scopedDispatcherReports({
        reports: window.state.reports,
        drivers: window.state.drivers,
        dispatchers: window.state.dispatchers,
        currentUser: window.currentUser,
        activeGroupId: window.state.activeGroupFilter || "",
        demo: IS_DEMO_MODE
    })).filter(isActiveReport);
}

function dashboardReportWhen(report) {
    if (report.date || report.time) return formatDateTime(report.date, report.time);
    const value = report.createdAt;
    const date = typeof value?.toDate === "function" ? value.toDate()
        : Number.isFinite(value?.seconds) ? new Date(value.seconds * 1000)
            : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
        ? new Intl.DateTimeFormat(window.state.language || "en", { dateStyle: "short", timeStyle: "short" }).format(date)
        : "—";
}

function dashboardReportType(report) {
    const kind = reportKind(report);
    if (kind.kind === "coverage") return t("report_coverage_title") || "Nepokrivena smena";
    if (kind.kind === "breakdown") return `${t("report_breakdown_title")}: ${t(kind.detail) || kind.detail}`;
    return /^\d+$/.test(kind.detail) ? `${t("report_delay_title")}: ${kind.detail} min` : t("report_delay_title");
}

function countUnreadMessages() {
    return (window.state.messages || []).filter(m => !m.read && !isDispArchived(m)).length;
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

function driverByName(driverName) {
    return (window.state.drivers || []).find(d => d.name === driverName) || null;
}

function shiftTypeLabel(value) {
    const opt = SHIFT_TYPE_OPTIONS.find(item => item.value === value);
    return opt ? (t(opt.labelKey) || opt.fallback) : value;
}

function busSelectHtml(driverName, selectedBus, selectIdSuffix = "") {
    const options = (window.state.buses || []).map(b => {
        const num = String(b.number ?? "");
        return `<option value="${escapeHtml(num)}" ${num === String(selectedBus) ? "selected" : ""}>Bus ${escapeHtml(num)}</option>`;
    }).join("");
    const emptySelected = !selectedBus || selectedBus === "—" ? "selected" : "";
    return `<select class="ops-edit-select" ${changeAttr("updateDriverBusInline", [driverName], "args-value")} aria-label="${escapeHtml(t("table_bus") || "Bus")}" id="ops-bus-${escapeHtml(selectIdSuffix || driverName)}">
        <option value="" ${emptySelected}>—</option>
        ${options}
    </select>`;
}

function shiftSelectHtml(driverName, currentType, selectIdSuffix = "") {
    const options = SHIFT_TYPE_OPTIONS.map(st =>
        `<option value="${st.value}" ${currentType === st.value ? "selected" : ""}>${escapeHtml(shiftTypeLabel(st.value))}</option>`
    ).join("");
    return `<select class="ops-edit-select" ${changeAttr("updateDriverShiftInline", [driverName], "args-value")} aria-label="${escapeHtml(t("table_shift_route") || "Smena")}" id="ops-shift-${escapeHtml(selectIdSuffix || driverName)}">
        ${options}
    </select>`;
}

function renderDispatcherDashboard() {
    renderDashboardGroupsGrid();
    void refreshStaffShiftConfirmations().then((updated) => {
        if (updated || _confirmNeedsPaint) {
            _confirmNeedsPaint = false;
            renderDispatcherDashboard();
        }
    });

    const allDrivers = getVisibleDrivers();
    const activeDriversCount = allDrivers.filter(d => d.active).length;
    const activeBusesList = allDrivers.filter(d => d.active && d.bus).map(d => d.bus);
    const activeBusesCount = [...new Set(activeBusesList)].length;
    const operationalReports = visibleOperationalReports();
    const openReportsCount = operationalReports.length;
    const unreadCount = countUnreadMessages();
    const pendingConfirms = confirmationAttentionRows();
    const failedDeliveries = pendingConfirms.filter((row) => row.kind === "delivery_failed").length;

    const elActiveDrivers = document.getElementById("stat-active-drivers-count");
    const elActiveBuses = document.getElementById("stat-active-buses-count");
    const elOpenProblems = document.getElementById("stat-open-problems-count");
    const elUnread = document.getElementById("stat-unread-messages-count");

    if (elActiveDrivers) elActiveDrivers.innerText = activeDriversCount;
    if (elActiveBuses) elActiveBuses.innerText = activeBusesCount;
    if (elOpenProblems) elOpenProblems.innerText = openReportsCount + pendingConfirms.length;
    if (elUnread) elUnread.innerText = unreadCount;
    updateMessagesNavBadge(unreadCount);

    updateOpsPlanHealth({ openReportsCount, pendingConfirms, failedDeliveries });

    const alertsContainer = document.getElementById("dispatcher-live-alerts");
    if (alertsContainer) {
        alertsContainer.innerHTML = "";
        const filteredReports = operationalReports;
        const driversById = new Map(allDrivers.map((drv) => [driverUid(drv), drv]));

        if (_confirmFetchInFlight && !_confirmFetchAt && filteredReports.length === 0 && pendingConfirms.length === 0) {
            alertsContainer.innerHTML = `<div class="ops-empty ops-loading" aria-busy="true">${escapeHtml(t("loading") || "Učitavanje…")}</div>`;
        } else if (_confirmFetchFailed && filteredReports.length === 0 && pendingConfirms.length === 0) {
            alertsContainer.innerHTML = `<div class="ops-empty is-error" role="status">${escapeHtml(t("ops_confirmations_load_failed") || "Potvrde smena nisu mogle biti učitane.")}</div>`;
        } else if (filteredReports.length === 0 && pendingConfirms.length === 0) {
            alertsContainer.innerHTML = `<div class="ops-empty">${t("js_no_alerts") || "Nema aktivnih prijava"}</div>`;
        } else {
            pendingConfirms.slice(0, 5).forEach((row) => {
                const drv = driversById.get(row.driverId);
                const div = document.createElement("article");
                const isFailed = row.kind === "delivery_failed";
                div.className = `ops-action-card alert-item ${isFailed ? "alert-breakdown is-critical" : "alert-delay is-warning"}`;
                const label = row.label && row.label !== "next_shift"
                    ? (t(`confirm_label_${row.label}`) || row.label)
                    : (t("confirm_label_next_shift") || "Sledeća smena");
                const errorHint = isFailed && row.lastError
                    ? ` · ${escapeHtml(String(row.lastError).slice(0, 80))}`
                    : "";
                const attemptsHint = Number(row.attempts || 0) > 0
                    ? ` · ${escapeHtml(t("confirmation_attempts") || "Pokušaji")}: ${Number(row.attempts)}`
                    : "";
                div.innerHTML = `
                    <div class="ops-action-rail" aria-hidden="true"></div>
                    <div class="alert-item-content ops-action-body">
                        <div class="alert-item-title">
                            <span>${escapeHtml(confirmationAttentionTitle(row))}</span>
                            <span class="alert-item-time">${escapeHtml(row.targetDate || "")}</span>
                        </div>
                        <span class="alert-item-desc">${escapeHtml(label)}${attemptsHint}${errorHint}</span>
                        <span class="alert-item-meta">${escapeHtml(t("driver") || "Vozač")}: <strong>${escapeHtml(drv?.name || row.driverId || "—")}</strong></span>
                    </div>
                `;
                alertsContainer.appendChild(div);
            });
            filteredReports.slice(0, 5).forEach(rep => {
                const div = document.createElement("article");
                const isBreakdown = reportKind(rep).kind === "breakdown";
                div.className = `ops-action-card alert-item ${isBreakdown ? "alert-breakdown is-critical" : "alert-delay is-warning"}`;
                const displayReason = [t(rep.reason) || rep.reason || "", rep.description || ""].filter(Boolean).join(" · ");

                div.innerHTML = `
                    <div class="ops-action-rail" aria-hidden="true"></div>
                    <div class="alert-item-content ops-action-body">
                        <div class="alert-item-title">
                            <span>${escapeHtml(dashboardReportType(rep))}</span>
                            <span class="alert-item-time">${escapeHtml(dashboardReportWhen(rep))}</span>
                        </div>
                        <span class="alert-item-desc">${escapeHtml(displayReason)}</span>
                        <span class="alert-item-meta">${escapeHtml(t("driver") || "Vozač")}: <strong>${escapeHtml(rep.driver || "—")}</strong> · ${escapeHtml(t("vehicle") || "Vozilo")}: <strong>${escapeHtml(rep.bus || "—")}</strong></span>
                        <button type="button" class="btn-table-action alert-item-resolve" ${actionAttr("resolveReport", [rep.id])}><i data-lucide="check-check"></i> ${escapeHtml(t("btn_resolve") || "Reši")}</button>
                    </div>
                `;
                alertsContainer.appendChild(div);
            });
        }
    }

    renderMessagesPreview();

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
                        : (t("status_pending_confirmation") || "Čeka potvrdu"));
                const rowClass = uncovered ? "is-uncovered" : (confirmStatus === "confirmed" ? "is-ok" : "is-pending");
                const actionBtn = incident
                    ? `<button type="button" class="btn-primary ops-row-action" ${actionAttr("openDailyPlanForGroup", [drv.groupId || drv.lineId || ""])}>${escapeHtml(t("ops_btn_resolve") || "Reši")}</button>`
                    : uncovered
                    ? `<button type="button" class="btn-primary ops-row-action" ${actionAttr("opsAssignDriver", [drv.name, "morning"])}>${escapeHtml(t("ops_btn_resolve") || "Reši")}</button>`
                    : `<button type="button" class="btn-danger-ghost ops-row-action" ${actionAttr("openOperationalIncident", [drv.name])} aria-label="${escapeHtml(t("ops_incident_open") || "Prijavi problem")}"><i data-lucide="user-x"></i> ${escapeHtml(t("ops_incident_open") || "Problem")}</button>`;
                return `<tr class="${rowClass}">
                    <td><strong>${escapeHtml(drv.name || "")}</strong></td>
                    <td>${busSelectHtml(drv.name, busNum, `day-${drv.name}`)}</td>
                    <td>${shiftSelectHtml(drv.name, shiftType, `day-${drv.name}`)}</td>
                    <td><span class="ops-status-pill">${escapeHtml(statusLabel)}</span></td>
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
                        : (t("status_pending_confirmation") || "Čeka potvrdu")))
                : (t("ops_driver_off") || "Van dužnosti");
            const statusClass = !drv.active
                ? "is-off"
                : (uncovered ? "is-available" : (confirmStatus === "confirmed" ? "is-on-duty" : "is-pending"));

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
                        ${busSelectHtml(drv.name, busNum, `crew-${drv.name}`)}
                        ${shiftSelectHtml(drv.name, shift?.type || "", `crew-${drv.name}`)}
                    </div>
                    <div class="ops-crew-actions">
                        <button type="button" class="btn-primary ops-assign-btn" ${actionAttr("opsAssignDriver", [drv.name, uncovered ? "morning" : (shift?.type || "morning")])}>
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

async function updateDriverBusInline(driverName, newBus) {
    const driver = driverByName(driverName);
    if (!driver) return;
    const today = todayDateStr();
    const existing = getShiftForDriverDate(driverName, today);
    const type = existing?.type && existing.type !== "clear" ? existing.type : "morning";
    const saved = await persistShift(
        driver,
        today,
        type,
        existing?.name || "",
        existing?.start || null,
        existing?.end || null,
        newBus
    );
    if (!saved) return;
    showToast(t("ops_bus_assigned", { bus: newBus || "—", driver: driverName }) || `Bus ${newBus} → ${driverName}`, "success");
    renderDispatcherDashboard();
}

async function updateDriverShiftInline(driverName, newShiftType) {
    const driver = driverByName(driverName);
    if (!driver) return;
    const today = todayDateStr();
    const type = newShiftType || "clear";
    if (["clear", "off", "vacation", "sick"].includes(type)) {
        openOperationalIncident(driverName);
        renderDispatcherDashboard();
        return;
    }
    const saved = await persistShift(driver, today, type, "", null, null, driver.bus || "");
    if (!saved) return;
    showToast(
        type === "clear" || type === "off"
            ? (t("ops_shift_cleared", { driver: driverName }) || `Smena uklonjena: ${driverName}`)
            : (t("ops_shift_assigned", { driver: driverName, type: shiftTypeLabel(type) }) || `Smena: ${driverName}`),
        "success"
    );
    renderDispatcherDashboard();
}

function activeCoverageIncident(driver, date) {
    const id = driverUid(driver);
    return visibleOperationalReports().find(report =>
        reportKind(report).kind === "coverage"
        && report.driverId === id
        && report.date === date
    ) || null;
}

function ensureIncidentModal() {
    let modal = document.getElementById("ops-incident-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "ops-incident-modal";
    modal.className = "bc-overlay-modal hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <form id="ops-incident-form" class="ops-incident-dialog">
            <div class="ops-incident-heading">
                <span class="ops-incident-icon"><i data-lucide="user-x"></i></span>
                <div>
                    <h2>${escapeHtml(t("ops_incident_title") || "Vozač ne može da nastavi smenu")}</h2>
                    <p id="ops-incident-driver"></p>
                </div>
            </div>
            <label for="ops-incident-reason">${escapeHtml(t("ops_incident_reason") || "Šta se dogodilo?")}</label>
            <input id="ops-incident-reason" name="reason" maxlength="200" minlength="2" required
                placeholder="${escapeHtml(t("ops_incident_reason_placeholder") || "Kratak razlog, npr. vozač kasni")}" />
            <label for="ops-incident-description">${escapeHtml(t("ops_incident_details") || "Napomena (opciono)")}</label>
            <textarea id="ops-incident-description" name="description" maxlength="1000" rows="3"></textarea>
            <div class="ops-incident-warning">${escapeHtml(t("ops_incident_effect") || "Smena će biti označena kao nepokrivena dok disponent ne dodeli zamenu.")}</div>
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

function openOperationalIncident(driverName) {
    const driver = driverByName(driverName);
    if (!driver) return;
    const today = todayDateStr();
    const duplicate = visibleOperationalReports().some(report =>
        reportKind(report).kind === "coverage"
        && report.driverId === driverUid(driver)
        && report.date === today
    );
    if (duplicate) {
        showToast(t("ops_incident_already_open") || "Za ovog vozača već postoji otvoren incident.", "warning");
        return;
    }
    const modal = ensureIncidentModal();
    modal.dataset.driverName = driverName;
    modal.querySelector("#ops-incident-driver").textContent = driverName;
    modal.querySelector("form").reset();
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#ops-incident-reason")?.focus(), 0);
}

function closeOperationalIncident() {
    const modal = document.getElementById("ops-incident-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    delete modal.dataset.driverName;
}

async function submitOperationalIncident(event) {
    event.preventDefault();
    const modal = document.getElementById("ops-incident-modal");
    const driver = driverByName(modal?.dataset.driverName);
    const reason = String(modal?.querySelector("#ops-incident-reason")?.value || "").trim();
    const description = String(modal?.querySelector("#ops-incident-description")?.value || "").trim();
    if (!driver || reason.length < 2) return;
    const submit = modal.querySelector("button[type='submit']");
    submit.disabled = true;
    const today = todayDateStr();
    const shift = getShiftForDriverDate(driver.name, today);
    let result = { success: true, report: {
        id: `incident-${Date.now()}`, type: "coverage:disruption", status: "active",
        severity: "sev_critical", date: today, driverId: driverUid(driver),
        driver: driver.name, groupId: driver.groupId || driver.lineId || "",
        reason, description, bus: shift?.bus || driver.bus || "", createdAt: new Date().toISOString()
    }};
    try {
        if (!IS_DEMO_MODE) {
            result = await ApiClient.createStaffOperationalIncident({
                driverId: driverUid(driver), date: today, reason, description,
                bus: shift?.bus || driver.bus || "", shiftType: shift?.type || "",
                shiftName: shift?.name || ""
            });
        }
        if (!result?.success) {
            showToast(result?.error || t("ops_incident_save_failed") || "Incident nije sačuvan.", "error");
            return;
        }
        window.state.reports = Array.isArray(window.state.reports) ? window.state.reports : [];
        window.state.reports.push(result.report);
        if (IS_DEMO_MODE) saveState();
        closeOperationalIncident();
        showToast(t("ops_incident_created") || "Incident je evidentiran. Potrebna je zamena.", "success");
        renderDispatcherDashboard();
    } finally {
        submit.disabled = false;
    }
}

/** Reši / Dodeli — dodeli tip smene (default morning) i osveži ops centar. */
async function opsAssignDriver(driverName, shiftType = "morning") {
    const driver = driverByName(driverName);
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

export {
    renderDispatcherDashboard,
    countUnreadMessages,
    updateMessagesNavBadge,
    updateDriverBusInline,
    updateDriverShiftInline,
    opsAssignDriver,
    openOperationalIncident,
    closeOperationalIncident
};

// BusCommand ESM v9.5 — Operativni centar (editable)
import { formatDateTime, getVisibleDrivers, showToast, escapeHtml, todayDateStr } from "../core/utils.js";
import { getDriverDutySummary, getShiftForDriverDate, setShiftForDriverDate } from "../core/shift-plan.js";
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
import { busHasGroup } from "../data/bus-group-membership.js";

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

function confirmationAttentionTitle(row) {
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

function problemStatusLabel(status) {
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

function dashboardReportType(report) {
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
                const isExpired = row.kind === "expired";
                div.className = `ops-action-card alert-item ${isFailed ? "alert-breakdown is-critical" : "alert-delay is-warning"}`;
                const label = row.label && row.label !== "next_shift"
                    ? (t(`confirm_label_${row.label}`) || row.label)
                    : (t("confirm_label_next_shift") || "Sledeća smena");
                const errorHint = isFailed && row.lastError
                    ? ` · ${escapeHtml(String(row.lastError).slice(0, 80))}`
                    : (isExpired ? ` · ${escapeHtml(t("status_confirmation_expired") || "Isteklo")}` : "");
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
                const kind = reportKind(rep);
                const isBreakdown = kind.kind === "breakdown";
                const isCoverage = kind.kind === "coverage";
                div.className = `ops-action-card alert-item ${isBreakdown || isCoverage ? "alert-breakdown is-critical" : "alert-delay is-warning"}`;
                const displayReason = [t(rep.reason) || rep.reason || "", rep.description || ""].filter(Boolean).join(" · ");
                const resolveAction = isCoverage ? "openCoverageResolver" : "openReportResolution";
                const statusChip = `<span class="ops-lifecycle-chip" data-status="${escapeHtml(String(rep.status || "open"))}">${escapeHtml(problemStatusLabel(rep.status))}</span>`;
                const entityHint = rep.affectedEntity === "vehicle"
                    ? `${escapeHtml(t("vehicle") || "Vozilo")}: <strong>${escapeHtml(rep.bus || "—")}</strong>`
                    : `${escapeHtml(t("driver") || "Vozač")}: <strong>${escapeHtml(rep.driver || "—")}</strong> · ${escapeHtml(t("vehicle") || "Vozilo")}: <strong>${escapeHtml(rep.bus || "—")}</strong>`;
                const ackBtn = isCoverage && ["open", "active"].includes(String(rep.status || "open"))
                    ? `<button type="button" class="btn-secondary alert-item-ack" ${actionAttr("transitionOperationalIncident", [rep.id, "acknowledged"])}>${escapeHtml(t("problem_btn_ack") || "Potvrdi")}</button>`
                    : "";

                div.innerHTML = `
                    <div class="ops-action-rail" aria-hidden="true"></div>
                    <div class="alert-item-content ops-action-body">
                        <div class="alert-item-title">
                            <span>${escapeHtml(dashboardReportType(rep))} ${statusChip}</span>
                            <span class="alert-item-time">${escapeHtml(dashboardReportWhen(rep))}</span>
                        </div>
                        <span class="alert-item-desc">${escapeHtml(displayReason)}</span>
                        <span class="alert-item-meta">${entityHint}</span>
                        <div class="alert-item-actions">
                            ${ackBtn}
                            <button type="button" class="btn-table-action alert-item-resolve urgent-action" ${actionAttr(resolveAction, [rep.id])}><i data-lucide="wrench"></i> ${escapeHtml(t("ops_btn_resolve"))}</button>
                        </div>
                    </div>
                `;
                alertsContainer.appendChild(div);
            });
        }
    }

    renderMessagesPreview();
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
                const busOutBtn = !uncovered && busNum
                    ? `<button type="button" class="btn-danger-ghost ops-row-action" ${actionAttr("openVehicleOperationalIncident", [busNum, drv.name])} aria-label="${escapeHtml(t("ops_bus_out") || "Vozilo van operacije")}"><i data-lucide="bus"></i></button>`
                    : "";
                const actionBtn = incident
                    ? `<button type="button" class="ops-row-action urgent-action" ${actionAttr("openCoverageResolver", [incident.id])}><i data-lucide="wrench"></i> ${escapeHtml(t("ops_btn_resolve"))}</button>`
                    : uncovered
                    ? `<button type="button" class="ops-row-action urgent-action" ${actionAttr("opsAssignDriver", [drv.name, "morning"])}><i data-lucide="user-plus"></i> ${escapeHtml(t("ops_btn_resolve"))}</button>`
                    : `<span class="ops-row-actions">${busOutBtn}<button type="button" class="btn-danger-ghost ops-row-action" ${actionAttr("openOperationalIncident", [drv.name])} aria-label="${escapeHtml(t("ops_incident_open") || "Prijavi problem")}"><i data-lucide="user-x"></i> ${escapeHtml(t("ops_incident_open") || "Problem")}</button></span>`;
                return `<tr class="${rowClass}">
                    <td><strong>${escapeHtml(drv.name || "")}</strong></td>
                    <td>${busSelectHtml(drv.name, busNum, `day-${drv.name}`)}</td>
                    <td>${shiftSelectHtml(drv.name, shiftType, `day-${drv.name}`)}</td>
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


const AVAILABLE_REPLACEMENT_TYPES = new Set(["off", "clear", "bereitschaft", "standby"]);

function coverageDriverCandidates(report) {
    const groupId = String(report?.groupId || report?.lineId || "");
    return getVisibleDrivers().filter(driver => {
        if (driver.active === false || driverUid(driver) === report.driverId) return false;
        if (String(driver.groupId || driver.lineId || "") !== groupId) return false;
        const duty = getShiftForDriverDate(driver.name, report.date);
        return !duty || AVAILABLE_REPLACEMENT_TYPES.has(String(duty.type || "").toLowerCase());
    });
}

function coverageBusCandidates(report) {
    const groupId = String(report?.groupId || report?.lineId || "");
    const used = new Set();
    getVisibleDrivers().forEach(driver => {
        if (driverUid(driver) === report.driverId) return;
        const duty = getShiftForDriverDate(driver.name, report.date);
        if (duty && !AVAILABLE_REPLACEMENT_TYPES.has(String(duty.type || "").toLowerCase()) && duty.bus) {
            used.add(String(duty.bus));
        }
    });
    return (window.state.buses || []).filter(bus => {
        const number = String(bus.number || "");
        return bus.active !== false
            && busHasGroup(bus, groupId)
            && (!used.has(number) || number === String(report.bus || ""));
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
    const report = (window.state.reports || []).find(item =>
        item.id === modal?.dataset.reportId && isActiveReport(item)
    );
    const replacementDriverId = String(modal?.querySelector("#ops-coverage-driver")?.value || "");
    const replacementBus = String(modal?.querySelector("#ops-coverage-bus")?.value || "");
    const replacement = getVisibleDrivers().find(driver => driverUid(driver) === replacementDriverId);
    const original = getVisibleDrivers().find(driver => driverUid(driver) === report?.driverId);
    const status = modal?.querySelector("#ops-coverage-resolver-status");
    if (!report || !replacement || !original || !replacementBus) {
        if (status) status.textContent = t("ops_coverage_selection_required");
        return;
    }
    const originalShift = getShiftForDriverDate(original.name, report.date);
    const replacementShift = getShiftForDriverDate(replacement.name, report.date);
    const submit = modal.querySelector("button[type='submit']");
    modal.dataset.pending = "true";
    submit.disabled = true;
    if (status) status.textContent = t("report_resolving");
    try {
        let result;
        if (IS_DEMO_MODE) {
            result = {
                success: true,
                report: {
                    id: report.id,
                    status: "resolved",
                    resolution: {
                        type: "replacement",
                        summary: `${replacement.name} / ${replacementBus}`,
                        replacementDriverId,
                        replacementBus
                    }
                },
                shift: {
                    type: report.shiftType || originalShift?.type || "morning",
                    name: report.shiftName || originalShift?.name || "",
                    routeCode: originalShift?.routeCode || report.shiftName || "",
                    start: originalShift?.start || null,
                    end: originalShift?.end || null,
                    bus: replacementBus,
                    revision: Number(replacementShift?.revision || 0) + 1
                }
            };
        } else {
            result = await ApiClient.resolveStaffOperationalIncident(report.id, {
                replacementDriverId,
                replacementBus,
                expectedOriginalRevision: Number(originalShift?.revision || 0),
                expectedReplacementRevision: Number(replacementShift?.revision || 0)
            });
        }
        if (!result?.success) {
            const message = result?.error || t("ops_resolver_failed");
            if (status) status.textContent = message;
            showToast(message, "error");
            return;
        }
        setShiftForDriverDate(original.name, report.date, { type: "clear" });
        const assigned = result.shift || {};
        setShiftForDriverDate(replacement.name, report.date, {
            type: assigned.type || report.shiftType || originalShift?.type || "morning",
            name: assigned.name || report.shiftName || originalShift?.name || "",
            bus: assigned.bus || replacementBus,
            routeCode: assigned.routeCode || originalShift?.routeCode || "",
            start: assigned.start || originalShift?.start || null,
            end: assigned.end || originalShift?.end || null,
            revision: Number.isInteger(assigned.revision) ? assigned.revision : Number(replacementShift?.revision || 0) + 1
        });
        Object.assign(report, result.report || {}, {
            status: "resolved",
            resolvedAt: result.report?.resolvedAt || new Date().toISOString(),
            resolvedBy: result.report?.resolvedBy || window.currentUser?.uid || window.currentUser?.id
        });
        if (IS_DEMO_MODE) saveState();
        delete modal.dataset.pending;
        closeCoverageResolver();
        showToast(t("ops_resolver_success", { driver: replacement.name, bus: replacementBus }), "success");
        window.dispatchEvent(new CustomEvent("buscommand:plan-updated", { detail: { date: report.date } }));
        renderDispatcherDashboard();
    } catch (error) {
        const message = error?.message || t("ops_resolver_failed");
        if (status) status.textContent = message;
        showToast(message, "error");
    } finally {
        delete modal.dataset.pending;
        submit.disabled = false;
    }
}

function ensureIncidentModal() {
    let modal = document.getElementById("ops-incident-modal");
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

async function transitionOperationalIncident(reportId, toStatus) {
    const report = (window.state.reports || []).find((row) => row.id === reportId);
    if (!report) return;
    const expectedRevision = Number.isInteger(report.revision) ? report.revision : 0;
    try {
        let result = { success: true, report: { status: toStatus, revision: expectedRevision + 1 } };
        if (!IS_DEMO_MODE) {
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
        if (IS_DEMO_MODE) {
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
    modal.querySelector("form").reset();
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => modal.querySelector("#ops-incident-reason")?.focus(), 0);
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
    if (!IS_DEMO_MODE) {
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

function openOperationalIncident(driverName, preferredReplacementDriverId = "") {
    const driver = driverByName(driverName);
    if (!driver) return;
    const today = todayDateStr();
    const duplicate = visibleOperationalReports().find(report =>
        reportKind(report).kind === "coverage"
        && report.driverId === driverUid(driver)
        && report.date === today
    );
    if (duplicate) {
        openCoverageResolver(duplicate.id, preferredReplacementDriverId);
        return;
    }
    const modal = ensureIncidentModal();
    modal.dataset.affectedEntity = "driver";
    delete modal.dataset.busNumber;
    modal.dataset.driverName = driverName;
    modal.dataset.preferredReplacementDriverId = String(preferredReplacementDriverId || "");
    const title = modal.querySelector("h2");
    if (title) title.textContent = t("ops_incident_title") || "Vozač ne može da nastavi smenu";
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
    delete modal.dataset.preferredReplacementDriverId;
    delete modal.dataset.affectedEntity;
    delete modal.dataset.busNumber;
}

async function submitOperationalIncident(event) {
    event.preventDefault();
    const modal = document.getElementById("ops-incident-modal");
    const affectedEntity = modal?.dataset.affectedEntity === "vehicle" ? "vehicle" : "driver";
    const driver = driverByName(modal?.dataset.driverName);
    const busNumber = String(modal?.dataset.busNumber || "").trim();
    const reason = String(modal?.querySelector("#ops-incident-reason")?.value || "").trim();
    const description = String(modal?.querySelector("#ops-incident-description")?.value || "").trim();
    if (reason.length < 2) return;
    if (affectedEntity === "driver" && !driver) return;
    if (affectedEntity === "vehicle" && !busNumber) return;
    const submit = modal.querySelector("button[type='submit']");
    submit.disabled = true;
    const today = todayDateStr();
    const shift = driver ? getShiftForDriverDate(driver.name, today) : null;
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
            groupId: driver?.groupId || driver?.lineId || "",
            reason,
            description,
            bus,
            createdAt: new Date().toISOString()
        }
    };
    try {
        if (!IS_DEMO_MODE) {
            result = await ApiClient.createStaffOperationalIncident({
                affectedEntity,
                driverId: driver ? driverUid(driver) : undefined,
                date: today,
                reason,
                description,
                bus,
                shiftType: shift?.type || "",
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
        const preferredReplacementDriverId = String(modal.dataset.preferredReplacementDriverId || "");
        closeOperationalIncident();
        showToast(t("ops_incident_created"), "success");
        renderDispatcherDashboard();
        if (result.report?.id) openCoverageResolver(result.report.id, preferredReplacementDriverId);
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
    openVehicleOperationalIncident,
    closeOperationalIncident,
    openCoverageResolver,
    closeCoverageResolver,
    transitionOperationalIncident
};

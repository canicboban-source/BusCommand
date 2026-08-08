// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { switchSection } from "../layout/navigation.js";
import { formatDate } from "../maps/helpers.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import {
    enqueueOfflineWrite,
    isProbablyOfflineError,
    newIdempotencyKey
} from "./offline-queue.js";
import { renderNetworkStatus } from "./network-status.js";
import { sanitizeLostItemPhotoFile } from "./lost-item-photo.js";

const pendingForms = new Set();

function currentDriverIdentity() {
    if (!window.currentUser || window.currentUser.role !== "driver") return null;
    return {
        driverId: window.currentUser.id || window.currentUser.uid || "",
        driver: window.currentUser.name || "",
        bus: window.currentUser.bus || "",
        groupId: window.currentUser.groupId || window.currentUser.lineId || ""
    };
}

async function persistReport(formId, payload, localReport) {
    if (pendingForms.has(formId)) return false;
    pendingForms.add(formId);
    try {
        if (!USE_LOCAL_STATE) {
            const idempotencyKey = payload.idempotencyKey || newIdempotencyKey();
            const body = {
                ...payload,
                idempotencyKey,
                clientCreatedAt: payload.clientCreatedAt || new Date().toISOString()
            };
            localReport.idempotencyKey = idempotencyKey;
            try {
                const result = await ApiClient.createDriverReport(body);
                if (!result.success) {
                    if (isProbablyOfflineError(result)) {
                        const queued = enqueueOfflineWrite({
                            kind: "report",
                            payload: body,
                            localRecord: localReport
                        });
                        if (queued.ok) {
                            localReport.status = "queued";
                            localReport.syncStatus = "queued";
                            if (!Array.isArray(window.state.reports)) window.state.reports = [];
                            window.state.reports.unshift(localReport);
                            renderNetworkStatus();
                            return "queued";
                        }
                    }
                    showToast(result.error || t("driver_report_failed"), "error");
                    return false;
                }
                Object.assign(localReport, result.report || {}, { syncStatus: "sent" });
            } catch {
                const queued = enqueueOfflineWrite({
                    kind: "report",
                    payload: body,
                    localRecord: localReport
                });
                if (queued.ok) {
                    localReport.status = "queued";
                    localReport.syncStatus = "queued";
                    if (!Array.isArray(window.state.reports)) window.state.reports = [];
                    window.state.reports.unshift(localReport);
                    renderNetworkStatus();
                    return "queued";
                }
                showToast(t("driver_report_failed"), "error");
                return false;
            }
        }
        if (!Array.isArray(window.state.reports)) window.state.reports = [];
        window.state.reports.unshift(localReport);
        if (USE_LOCAL_STATE) saveState();
        return true;
    } finally {
        pendingForms.delete(formId);
    }
}

async function submitDelayReport(event) {
    event.preventDefault();
    const identity = currentDriverIdentity();
    if (!identity) return;
    const minutes = Number(document.getElementById("delay-time")?.value);
    const reasonCode = document.getElementById("delay-reason")?.value || "";
    const description = String(document.getElementById("delay-desc")?.value || "").trim();
    if (![5, 10, 15, 20, 30].includes(minutes) || !/^reason_[a-z]+$/.test(reasonCode)
        || description.length > 1000) {
        showToast(t("driver_report_invalid"), "error");
        return;
    }
    const now = new Date();
    const report = {
        id: `rep-${Date.now()}`,
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        ...identity,
        type: `delay:${minutes}`,
        reason: t(reasonCode),
        description,
        severity: minutes >= 20 ? "sev_medium" : "sev_low",
        status: "active"
    };
    const saved = await persistReport("delay-report-form", {
        type: report.type, reason: report.reason, description,
        severity: report.severity, bus: identity.bus
    }, report);
    if (!saved) return;
    document.getElementById("delay-report-form")?.reset();
    showToast(saved === "queued" ? t("driver_report_queued") : t("js_alert_delay_sent"),
        saved === "queued" ? "info" : "success");
    switchSection("driver-dashboard");
}

async function submitBreakdownReport(event) {
    event.preventDefault();
    const identity = currentDriverIdentity();
    if (!identity) return;
    const breakdownType = document.getElementById("breakdown-type")?.value || "";
    const severity = document.getElementById("breakdown-severity")?.value || "";
    const description = String(document.getElementById("breakdown-desc")?.value || "").trim();
    const validTypes = ["bd_engine", "bd_brakes", "bd_tyre", "bd_doors", "bd_ac", "bd_other"];
    const validSeverities = ["sev_low", "sev_medium", "sev_critical"];
    if (!validTypes.includes(breakdownType) || !validSeverities.includes(severity)
        || description.length < 2 || description.length > 1000) {
        showToast(t("driver_report_invalid"), "error");
        return;
    }
    const now = new Date();
    const report = {
        id: `rep-${Date.now()}`,
        time: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
        ...identity,
        type: `breakdown:${breakdownType}`,
        reason: t(breakdownType),
        description,
        severity,
        status: "active"
    };
    const saved = await persistReport("breakdown-report-form", {
        type: report.type, reason: report.reason, description,
        severity, bus: identity.bus
    }, report);
    if (!saved) return;
    document.getElementById("breakdown-report-form")?.reset();
    showToast(saved === "queued" ? t("driver_report_queued") : t("js_alert_breakdown_sent"),
        saved === "queued" ? "info" : "success");
    switchSection("driver-dashboard");
}

async function submitLostItem(event) {
    event.preventDefault();
    const identity = currentDriverIdentity();
    if (!identity || pendingForms.has("lost-item-form")) return;
    const type = document.getElementById("lost-item-type")?.value || "";
    const location = String(document.getElementById("lost-item-location")?.value || "").trim();
    const description = String(document.getElementById("lost-item-desc")?.value || "").trim();
    const status = document.getElementById("lost-item-status")?.value || "in_depot";
    const photoInput = document.getElementById("lost-item-photo");
    const validTypes = ["lost_tech", "lost_wallet", "lost_keys", "lost_bag", "lost_clothes", "lost_other"];
    const validStatuses = ["in_depot", "stays_on_bus"];
    if (!validTypes.includes(type) || !validStatuses.includes(status)
        || location.length < 2 || location.length > 200
        || description.length < 2 || description.length > 1000) {
        showToast(t("driver_lost_item_invalid") || t("driver_report_invalid"), "error");
        return;
    }
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    let photo = null;
    if (photoInput?.files?.[0]) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            showToast(t("driver_critical_needs_network"), "error");
            return;
        }
        try {
            photo = await sanitizeLostItemPhotoFile(photoInput.files[0]);
        } catch {
            showToast(t("lost_photo_invalid"), "error");
            return;
        }
    }
    const item = {
        id: `lost-${Date.now()}`,
        date,
        time,
        foundAt: now.toISOString(),
        ...identity,
        type, location, description,
        desc: description,
        status,
        photo: photo ? { contentType: photo.contentType, dataUrl: `data:${photo.contentType};base64,${photo.dataBase64}` } : null
    };
    pendingForms.add("lost-item-form");
    try {
        if (!USE_LOCAL_STATE) {
            const idempotencyKey = newIdempotencyKey();
            const body = {
                type, location, description, bus: identity.bus,
                status, date, time,
                foundAt: now.toISOString(),
                photo,
                idempotencyKey,
                clientCreatedAt: now.toISOString()
            };
            item.idempotencyKey = idempotencyKey;
            try {
                const result = await ApiClient.createDriverLostItem(body);
                if (!result.success) {
                    if (!photo && isProbablyOfflineError(result)) {
                        const queued = enqueueOfflineWrite({
                            kind: "lost_item",
                            payload: { ...body, photo: null },
                            localRecord: item
                        });
                        if (queued.ok) {
                            item.syncStatus = "queued";
                            item.status = "queued";
                            if (!Array.isArray(window.state.lostItems)) window.state.lostItems = [];
                            window.state.lostItems.unshift(item);
                            document.getElementById("lost-item-form")?.reset();
                            showToast(t("driver_report_queued"), "info");
                            renderNetworkStatus();
                            switchSection("driver-dashboard");
                            return;
                        }
                    }
                    showToast(result.error || t("driver_lost_item_failed"), "error");
                    return;
                }
                Object.assign(item, result.item || {}, { syncStatus: "sent" });
            } catch {
                if (photo) {
                    showToast(t("driver_critical_needs_network"), "error");
                    return;
                }
                const queued = enqueueOfflineWrite({
                    kind: "lost_item",
                    payload: { ...body, photo: null },
                    localRecord: item
                });
                if (queued.ok) {
                    item.syncStatus = "queued";
                    item.status = "queued";
                    if (!Array.isArray(window.state.lostItems)) window.state.lostItems = [];
                    window.state.lostItems.unshift(item);
                    document.getElementById("lost-item-form")?.reset();
                    showToast(t("driver_report_queued"), "info");
                    renderNetworkStatus();
                    switchSection("driver-dashboard");
                    return;
                }
                showToast(t("driver_lost_item_failed"), "error");
                return;
            }
        }
        if (!Array.isArray(window.state.lostItems)) window.state.lostItems = [];
        window.state.lostItems.unshift(item);
        if (USE_LOCAL_STATE) saveState();
        document.getElementById("lost-item-form")?.reset();
        showToast(t("js_alert_lost_sent"), "success");
        switchSection("driver-dashboard");
    } finally {
        pendingForms.delete("lost-item-form");
    }
}

function vacationDays(start, end) {
    return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000) + 1;
}

function submitVacationRequest(event) {
    event.preventDefault();
    const identity = currentDriverIdentity();
    if (!identity || pendingForms.has("vacation-form")) return;
    const startVal = document.getElementById("vacation-start")?.value || "";
    const endVal = document.getElementById("vacation-end")?.value || "";
    const type = document.getElementById("vacation-type")?.value || "";
    const reason = String(document.getElementById("vacation-reason")?.value || "").trim();
    const days = vacationDays(startVal, endVal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startVal) || !/^\d{4}-\d{2}-\d{2}$/.test(endVal)
        || !["lt_vacation", "lt_paid", "lt_days"].includes(type)
        || !Number.isInteger(days) || days < 1 || days > 366 || reason.length > 1000) {
        showToast(t("js_alert_date_err"), "error");
        return;
    }
    const request = {
        id: `vac-${Date.now()}`,
        ...identity,
        type, start: startVal, end: endVal, days,
        reason,
        status: "pending"
    };
    showConfirm(t("confirm_vacation_request"), async function() {
        if (pendingForms.has("vacation-form")) return;
        pendingForms.add("vacation-form");
        try {
            if (!USE_LOCAL_STATE) {
                if (typeof navigator !== "undefined" && navigator.onLine === false) {
                    showToast(t("driver_critical_needs_network"), "error");
                    return;
                }
                const result = await ApiClient.createDriverVacation({ type, start: startVal, end: endVal, reason });
                if (!result.success) {
                    showToast(result.error || t("driver_vacation_failed"), "error");
                    return;
                }
                Object.assign(request, result.vacation || {});
            } else {
                const overlap = (window.state.vacations || []).some(vacation =>
                    (vacation.driverId ? vacation.driverId === identity.driverId : vacation.driver === identity.driver)
                    && ["pending", "approved", "Na čekanju", "Odobreno"].includes(vacation.status)
                    && startVal <= vacation.end && endVal >= vacation.start
                );
                if (overlap) {
                    showToast(t("driver_vacation_overlap"), "error");
                    return;
                }
            }
            if (!Array.isArray(window.state.vacations)) window.state.vacations = [];
            window.state.vacations.unshift(request);
            if (USE_LOCAL_STATE) saveState();
            document.getElementById("vacation-form")?.reset();
            showToast(t("js_alert_vacation_sent"), "success");
            renderDriverVacationHistory();
        } finally {
            pendingForms.delete("vacation-form");
        }
    }, { danger: false, title: t("nav_vacation"), confirmText: t("btn_yes") });
}

function renderDriverVacationHistory() {
    const tbody = document.getElementById("driver-vacation-history");
    if (!tbody) return;
    const today = new Date().toISOString().slice(0, 10);
    const startInput = document.getElementById("vacation-start");
    const endInput = document.getElementById("vacation-end");
    if (startInput) startInput.min = today;
    if (endInput) endInput.min = startInput?.value || today;
    tbody.replaceChildren();
    const requests = (window.state.vacations || []).filter(v =>
        v.driverId ? v.driverId === (window.currentUser.id || window.currentUser.uid) : v.driver === window.currentUser.name
    );
    if (requests.length === 0) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 4;
        cell.style.textAlign = "center";
        cell.style.color = "var(--text-muted)";
        cell.textContent = t("js_no_history");
        return;
    }
    requests.forEach(request => {
        const row = tbody.insertRow();
        const typeCell = row.insertCell();
        const typeStrong = document.createElement("strong");
        typeStrong.textContent = t(request.type);
        typeCell.appendChild(typeStrong);
        row.insertCell().textContent = `${formatDate(request.start)} - ${formatDate(request.end)}`;
        row.insertCell().textContent = `${request.days} ${t("table_days").toLowerCase()}`;
        const statusCell = row.insertCell();
        const badge = document.createElement("span");
        const status = request.status === "Na čekanju" ? "pending"
            : request.status === "Odobreno" ? "approved"
                : request.status === "Odbijeno" ? "rejected" : request.status;
        badge.className = `badge ${["pending", "approved", "rejected"].includes(status) ? status : "pending"}`;
        badge.textContent = t(`js_status_${["pending", "approved", "rejected"].includes(status) ? status : "pending"}`);
        statusCell.appendChild(badge);
    });
}

export { submitDelayReport, submitBreakdownReport, submitLostItem, submitVacationRequest, renderDriverVacationHistory };

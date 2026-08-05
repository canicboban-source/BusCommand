// BusCommand ESM v9.5 — driver dashboard (PWA home)
import { saveState } from "../core/state.js";
import { syncUserSession } from "../auth/login-session.js";
import { showToast } from "../core/utils.js";
import { getCurrentShiftForDriver } from "../core/shift-plan.js";
import { renderDriverMessages } from "./messages-inbox.js";
import { checkSOSStatus, resolveSOS } from "../maps/sos-siren.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { driverWorkPolicy } from "./work-session.js";
import { attachFocusTrap, detachFocusTrap } from "../ui/focus-trap.js";

let sosSubmissionPending = false;

function localeForLang(lang) {
    const localeMap = {
        en: "en-GB", de: "de-AT", sr: "sr-Latn-RS",
        hr: "hr-HR", fr: "fr-FR", it: "it-IT",
        pl: "pl-PL", cs: "cs-CZ"
    };
    return localeMap[lang] || "en-GB";
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? "—";
}

function shiftTypeLabel(type) {
    if (type === "morning") return t("shift_morning");
    if (type === "afternoon") return t("shift_afternoon");
    if (type === "night") return t("shift_night") || type;
    if (type === "off" || type === "vacation") return t("shift_off");
    return type || "—";
}

function renderDriverDashboard() {
    if (typeof loadDriverScheduleForToday === "function") loadDriverScheduleForToday();

    const today = new Date();
    const currentYearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const todayShift = getCurrentShiftForDriver(window.currentUser.name, currentYearMonth, today.getDate());

    const shiftName = String(todayShift?.name || todayShift?.routeCode || "");
    if (todayShift && todayShift.type !== "off" && todayShift.type !== "vacation") {
        // Never invent a bus — use the assigned shift bus only.
        const assignedBus = String(todayShift.bus || "").trim();
        if (assignedBus) window.currentUser.bus = assignedBus;

        const lineCode = shiftName.match(/^(\d{3})/);
        if (lineCode) {
            const foundRoute = window.state.routes?.find((r) => r.number === lineCode[1]);
            if (foundRoute) window.currentUser.routeId = foundRoute.id;
        }
        setText("driver-shift-type", shiftTypeLabel(todayShift.type));
    } else {
        setText("driver-shift-type", t("shift_off"));
    }

    const routes = Array.isArray(window.state.routes) ? window.state.routes : [];
    const route = routes.find((r) => r.id === window.currentUser.routeId) || routes[0] || null;
    const group = (window.state.groups || []).find((g) => g.id === (window.currentUser.groupId || route?.groupId));

    const start = todayShift?.start || todayShift?.startTime || route?.nextDeparture || "—";
    const end = todayShift?.end || todayShift?.endTime || "—";
    const bus = window.currentUser.bus || "—";
    const headlineParts = [
        group?.name || route?.number || route?.name,
        todayShift?.shortName || todayShift?.name || shiftTypeLabel(todayShift?.type)
    ].filter(Boolean);

    setText("driver-route-num", route?.number || "—");
    setText("driver-route-name", route?.name || t("no_data"));
    setText("driver-bus-num", bus);
    setText("driver-profile-bus", bus);
    setText("driver-profile-name", window.currentUser.name || "—");
    setText("driver-shift-headline", headlineParts.join(" · ") || "—");
    setText("driver-shift-window", start !== "—" || end !== "—" ? `${start} – ${end}` : "—");
    setText("driver-shift-start", start);
    setText("driver-shift-end", end);
    setText("driver-next-departure", start);

    const avatarFallback = document.getElementById("driver-dashboard-avatar-placeholder");
    if (avatarFallback && !avatarFallback.classList.contains("hidden")) {
        const initial = String(window.currentUser.name || "V").trim().charAt(0).toUpperCase() || "V";
        avatarFallback.textContent = initial;
    }

    const reports = Array.isArray(window.state.reports) ? window.state.reports : [];
    const activeDelay = reports.find((r) =>
        r.driver === window.currentUser.name
        && (r.status === "Aktivno" || r.status === "active")
        && (String(r.type || "").startsWith("delay:") || String(r.type || "").includes("Kašnjenje"))
    );
    const delayStatusLabel = document.getElementById("driver-delay-status");
    if (delayStatusLabel) {
        if (activeDelay) {
            const mins = activeDelay.type.startsWith("delay:")
                ? activeDelay.type.replace("delay:", "")
                : (activeDelay.type.match(/\d+/) ? activeDelay.type.match(/\d+/)[0] : "15");
            delayStatusLabel.textContent = t("status_delay_fmt", { min: mins });
            delayStatusLabel.className = "status-delay hidden";
        } else {
            delayStatusLabel.textContent = t("status_no_delay");
            delayStatusLabel.className = "status-ok hidden";
        }
    }

    const lang = window.state.language || "en";
    const locale = localeForLang(lang);
    setText(
        "current-date-badge",
        today.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })
    );

    updateDriverPlanConfirmStatus(todayShift);

    // Check-in enabled within 30 minutes before shift start (demo/local clock)
    const checkinBtn = document.getElementById("driver-checkin-btn");
    if (checkinBtn) {
        const enabled = isCheckInWindowOpen(start);
        checkinBtn.disabled = !enabled;
    }

    renderStopsTimeline(route?.stops);
    renderDriverMessages();
    checkSOSStatus();
    bindSosHoldControl();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function updateDriverPlanConfirmStatus(todayShift) {
    const el = document.getElementById("driver-plan-confirm-status");
    if (!el) return;
    const label = el.querySelector("span:not(.dot)") || el.lastElementChild;
    const offDay = !todayShift || todayShift.type === "off" || todayShift.type === "vacation";
    if (offDay) {
        el.className = "driver-pwa-confirm muted";
        if (label) label.textContent = t("driver_plan_off_day") || "Nema smene danas";
        return;
    }

    const targets = driverWorkPolicy()?.confirmationTargets || [];
    const pending = targets.filter((row) => !row.confirmed);
    if (!IS_DEMO_MODE && pending.length > 0) {
        el.className = "driver-pwa-confirm warn";
        if (label) {
            label.textContent = pending.length === 1
                ? (t("driver_plan_pending_one") || "Čeka se potvrda naredne smene")
                : (t("driver_plan_pending_many") || "Čeka se potvrda narednih smena");
        }
        return;
    }

    el.className = "driver-pwa-confirm ok";
    if (label) label.textContent = t("driver_plan_confirmed") || "Plan potvrđen";
}

function isCheckInWindowOpen(startHhMm) {
    if (!startHhMm || !/^\d{1,2}:\d{2}$/.test(String(startHhMm))) return false;
    const [h, m] = String(startHhMm).split(":").map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    const now = new Date();
    const diffMin = (start.getTime() - now.getTime()) / 60000;
    return diffMin <= 30 && diffMin >= -120;
}

function driverCheckIn() {
    if (!window.currentUser || window.currentUser.role !== "driver") return false;
    const btn = document.getElementById("driver-checkin-btn");
    if (btn?.disabled) {
        showToast(t("driver_checkin_hint") || "Prijava još nije dostupna.", "info");
        return false;
    }
    window.currentUser.onDuty = true;
    syncUserSession(window.currentUser);
    const status = document.getElementById("driver-duty-status");
    if (status) status.textContent = t("driver_status_on_duty") || "Na dužnosti";
    showToast(t("driver_checkin_ok") || "Prijava uspešna.", "success");
    return true;
}

function renderStopsTimeline(stops = []) {
    const container = document.getElementById("stops-timeline-container");
    if (!container) return;
    container.replaceChildren();

    if (!Array.isArray(stops) || stops.length === 0) {
        const empty = document.createElement("div");
        empty.className = "driver-pwa-empty";
        empty.textContent = t("driver_stops_empty") || "Nema stanica za prikaz.";
        container.appendChild(empty);
        return;
    }

    stops.forEach((stop, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "stop-item";

        if (index < window.currentUser.currentStopIndex) button.classList.add("passed");
        else if (index === window.currentUser.currentStopIndex) button.classList.add("next");

        button.addEventListener("click", () => checkInAtStop(index));

        let stopStatusText = t("stop_planned");
        if (index < window.currentUser.currentStopIndex) stopStatusText = t("stop_passed");
        else if (index === window.currentUser.currentStopIndex) stopStatusText = t("stop_next");

        button.setAttribute("aria-label", `${String(stop)} — ${stopStatusText}`);
        const marker = document.createElement("span");
        marker.className = "stop-marker";
        const info = document.createElement("span");
        info.className = "stop-info";
        const name = document.createElement("span");
        name.className = "stop-name";
        name.textContent = String(stop);
        const time = document.createElement("span");
        time.className = "stop-time";
        time.textContent = stopStatusText;
        info.append(name, time);
        button.append(marker, info);
        container.appendChild(button);
    });
}

function checkInAtStop(index) {
    const routes = Array.isArray(window.state.routes) ? window.state.routes : [];
    const route = routes.find((r) => r.id === window.currentUser.routeId) || routes[0];
    if (!route || !Array.isArray(route.stops) || route.stops.length === 0) return;

    if (index === window.currentUser.currentStopIndex) {
        window.currentUser.currentStopIndex++;
        if (window.currentUser.currentStopIndex >= route.stops.length) {
            showToast(t("js_alert_route_done"), "success");
            window.currentUser.currentStopIndex = 0;
        }
        syncUserSession(window.currentUser);
        renderDriverDashboard();
        if (typeof lucide !== "undefined") lucide.createIcons();
    }
}

function triggerSOSAlert() {
    const modal = document.getElementById("sos-trigger-modal");
    if (!modal) return;
    const titleEl = modal.querySelector("[data-i18n='sos_trigger_title']");
    const bodyEl = modal.querySelector("[data-i18n='js_confirm_sos']");
    const btnEl = modal.querySelector("[data-i18n='sos_trigger_btn']");
    if (titleEl) titleEl.textContent = t("sos_trigger_title") || "SOS ALARM";
    if (bodyEl) bodyEl.textContent = t("js_confirm_sos");
    if (btnEl) btnEl.textContent = t("sos_trigger_btn") || "SEND SOS";
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "false");
    if (typeof lucide !== "undefined") lucide.createIcons();
    attachFocusTrap(modal);
}

const SOS_HOLD_MS = 700;
let sosHoldTimer = null;
let sosHoldBound = false;

function clearSosHold(btn) {
    if (sosHoldTimer) {
        clearTimeout(sosHoldTimer);
        sosHoldTimer = null;
    }
    btn?.classList.remove("is-holding");
    const progress = btn?.querySelector(".mob-nav-sos-progress");
    if (progress) progress.style.width = "0%";
}

function bindSosHoldControl() {
    if (sosHoldBound) return;
    const btn = document.getElementById("mobnav-sos");
    if (!btn || btn.getAttribute("data-sos-hold") !== "true") return;
    sosHoldBound = true;

    const startHold = (event) => {
        if (event.type === "mousedown" && event.button !== 0) return;
        event.preventDefault();
        clearSosHold(btn);
        btn.classList.add("is-holding");
        const progress = btn.querySelector(".mob-nav-sos-progress");
        const started = Date.now();
        const tick = () => {
            const ratio = Math.min(1, (Date.now() - started) / SOS_HOLD_MS);
            if (progress) progress.style.width = `${Math.round(ratio * 100)}%`;
            if (ratio >= 1) {
                clearSosHold(btn);
                triggerSOSAlert();
                return;
            }
            sosHoldTimer = setTimeout(tick, 40);
        };
        tick();
    };

    const endHold = () => clearSosHold(btn);
    btn.addEventListener("pointerdown", startHold);
    btn.addEventListener("pointerup", endHold);
    btn.addEventListener("pointerleave", endHold);
    btn.addEventListener("pointercancel", endHold);
    btn.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            triggerSOSAlert();
        }
    });
}

function openDriverMessagesNav() {
    if (typeof window.switchSection === "function") {
        window.switchSection("driver-dashboard");
    }
    requestAnimationFrame(() => {
        document.querySelector(".driver-pwa-dispatch-msg")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("mobnav-dashboard")?.classList.add("active");
        document.getElementById("mobnav-messages")?.classList.add("active");
        ["mobnav-calendar", "mobnav-reports", "mobnav-sos"].forEach((id) => {
            document.getElementById(id)?.classList.remove("active");
        });
    });
}

function closeSosTriggerModal() {
    const modal = document.getElementById("sos-trigger-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    detachFocusTrap(modal);
}

async function confirmSOSTrigger() {
    if (sosSubmissionPending || !window.currentUser || window.currentUser.role !== "driver") return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
        showToast(t("driver_critical_needs_network"), "error");
        return;
    }
    sosSubmissionPending = true;
    try {
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.createDriverSos(window.currentUser.bus || "");
            if (!result.success) {
                showToast(result.error || t("driver_sos_failed"), "error");
                return;
            }
        }
        closeSosTriggerModal();
        window.state.sosActive = true;
        window.state.sosDriver = window.currentUser.name;
        window.state.sosBus = window.currentUser.bus;
        if (IS_DEMO_MODE) saveState();
        checkSOSStatus();
        showToast(t("js_alert_sos_sent") || "SOS alarm sent!", "error");
    } finally {
        sosSubmissionPending = false;
    }
}

export {
    renderDriverDashboard,
    renderStopsTimeline,
    checkInAtStop,
    driverCheckIn,
    triggerSOSAlert,
    closeSosTriggerModal,
    confirmSOSTrigger,
    checkSOSStatus,
    resolveSOS,
    bindSosHoldControl,
    openDriverMessagesNav
};

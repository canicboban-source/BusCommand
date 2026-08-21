// BusCommand ESM v9.5
import { t } from "../ui/i18n.js";
import { driverBelongsToLine } from "../data/group-membership.js";
import { isMobileDevice, isMobileUserAgent } from "./mobile-device.js";
import { timezoneForCountry } from "../admin/company-admin-settings-model.js";

// ── UTILITY: escapeHtml ──────────────────────────────────
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── UTILITY: refreshIcons ────────────────────────────────
// Lucide is a CDN global that may be absent (offline, blocked, tests). Every
// innerHTML rewrite that emits data-lucide has to re-scan, so keep the guard
// in one place instead of repeating it at each call site.
function refreshIcons() {
    if (typeof lucide !== "undefined") lucide.createIcons();
}

// ── DATA ISOLATION HELPERS ───────────────────────────────
// Vraća vozače vidljive trenutnom korisniku po ulozi
function getDriverById(driverId) {
    if (!driverId) return null;
    return (window.state.drivers || []).find(d =>
        d.id === driverId || d.uid === driverId || d.driverId === driverId
    ) || null;
}

function getVisibleDrivers() {
    const all = window.state.drivers || [];
    if (!window.currentUser) return all;
    if (window.currentUser.role === 'superadmin') return all;
    if (window.currentUser.role === 'company-admin') {
        const cId = window.currentUser.companyId;
        return cId ? all.filter(d => d.companyId === cId || !d.companyId) : all;
    }
    if (window.currentUser.role === 'dispatcher') {
        const myGroups = (() => {
            const disp = (window.state.dispatchers || []).find(d =>
                d.id === window.currentUser.id || d.uid === window.currentUser.uid
            );
            const fromDoc = Array.isArray(disp?.groups) ? disp.groups : [];
            const fromClaims = Array.isArray(window.currentUser.groups) ? window.currentUser.groups : [];
            const fromActive = [window.currentUser.activeGroupId].filter(Boolean);
            return [...new Set([...fromDoc, ...fromClaims, ...fromActive].map(String).filter(Boolean))];
        })();

        return myGroups.length
            ? all.filter(d => myGroups.some(gId => driverBelongsToLine(d, gId)))
            : [];
    }
    return all;
}

// Vraća grupe vidljive trenutnom korisniku
function getVisibleGroups() {
    const all = window.state.groups || [];
    if (!window.currentUser) return all;
    if (window.currentUser.role === 'superadmin') return all;
    if (window.currentUser.role === 'company-admin') {
        const cId = window.currentUser.companyId;
        return cId ? all.filter(g => g.companyId === cId || !g.companyId) : all;
    }
    if (window.currentUser.role === 'dispatcher') {
        const disp = (window.state.dispatchers || []).find(d =>
            d.id === window.currentUser.id || d.uid === window.currentUser.uid
        );
        const fromDoc = Array.isArray(disp?.groups) ? disp.groups : [];
        const fromClaims = Array.isArray(window.currentUser.groups) ? window.currentUser.groups : [];
        const fromActive = [window.currentUser.activeGroupId].filter(Boolean);
        const myGroups = [...new Set([...fromDoc, ...fromClaims, ...fromActive].map(String).filter(Boolean))];
        return myGroups.length ? all.filter(g => myGroups.includes(String(g.id))) : [];
    }
    return all;
}

// --- REČNIK PREVODA (MULTILANGUAGE i18n DICTIONARY) ---
// window.TRANSLATIONS je definisan u translations.js (učitava se pre app.js)
// ============================================================
// TOAST NOTIFICATION SISTEM
// ============================================================
function showToast(message, type = "success", duration = 4000) {
    const container = document.getElementById("toast-container");
    if (!container) { console.warn(message); return null; }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-body">
            <div class="toast-msg">${message}</div>
        </div>
        <div class="toast-progress" style="animation-duration:${duration}ms"></div>
    `;

    const dismiss = () => {
        toast.classList.add("hiding");
        // Sigurnosni timeout koji garantuje uklanjanje čak i ako nema CSS animacije
        setTimeout(() => {
            toast.remove();
        }, 300);
    };

    toast.addEventListener("click", dismiss);
    container.appendChild(toast);
    setTimeout(dismiss, duration);
    // Safe DOM handle for callers that must replace only their own toast (never wipe the tray).
    return toast;
}

/** Toast a failed API envelope, falling back to the generic error string. */
function toastApiError(result) {
    showToast(result?.error || t("error_generic"), "error");
}

// --- INITIAL STATE ---

// ============================================================
// HELPER — prikaz datuma/vremena za poruke i izveštaje
// ============================================================
function formatDateTime(dateStr, timeStr) {
    if (!dateStr) return timeStr || ""; // stari zapisi bez datuma

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;

    if (dateStr === todayStr)     return `${t("label_today")} ${timeStr}`;
    if (dateStr === yesterdayStr) return `${t("label_yesterday")} ${timeStr}`;

    // Stariji: prikaži dan.mesec.
    const parts = dateStr.split("-");
    if (parts.length === 3) return `${parts[2]}.${parts[1]}. ${timeStr}`;
    return `${dateStr} ${timeStr}`;
}

// Vraca danasnji datum kao YYYY-MM-DD string
function todayDateStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}

/**
 * Authoritative operational timezone for date/radar math (P1-A). Never the
 * browser's local timezone. Reuses the SAME source already authoritative
 * for the confirmation scheduler and daily plan: the tenant's IANA zone,
 * derived from the company profile's country
 * (see js/admin/company-admin-settings-model.js timezoneForCountry — no
 * new config field is introduced here).
 */
function operationalTimezone() {
    const explicit = window.state?.profile?.timezone;
    if (explicit && typeof explicit === "string") return explicit;
    const country = window.state?.profile?.country;
    const tz = country ? timezoneForCountry(country) : "";
    return tz || "UTC";
}

/**
 * Today's calendar date (YYYY-MM-DD) in the authoritative operational
 * timezone, using Intl (correct across DST/month/year boundaries) rather
 * than the browser's local Date getters.
 */
function operationalTodayDateStr(timezone = operationalTimezone()) {
    try {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
        }).format(new Date());
    } catch {
        return todayDateStr();
    }
}

/**
 * Adds/subtracts whole CALENDAR days (not 24h periods) to a YYYY-MM-DD
 * string using UTC-anchored date math, so DST transitions in the
 * operational timezone never shift the resulting calendar date by a day.
 */
function addCalendarDays(dateStr, days) {
    const parts = String(dateStr || "").split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    d.setUTCDate(d.getUTCDate() + days);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Operational date N calendar days from "today" in the tenant's timezone. */
function operationalDateStr(offsetDays = 0) {
    const base = operationalTodayDateStr();
    return offsetDays ? addCalendarDays(base, offsetDays) : base;
}

// Vraca plan rada na osnovu ID-ja (kljuca)
function getScheduleByKey(key) {
    if (!window.state || !window.state.schedules) return null;
    return window.state.schedules.find(s => s.id === key) || null;
}

export {
    isMobileUserAgent,
    isMobileDevice,
    escapeHtml,
    refreshIcons,
    getDriverById,
    getVisibleDrivers,
    getVisibleGroups,
    showToast,
    toastApiError,
    formatDateTime,
    todayDateStr,
    operationalTimezone,
    operationalTodayDateStr,
    operationalDateStr,
    addCalendarDays,
    getScheduleByKey
};

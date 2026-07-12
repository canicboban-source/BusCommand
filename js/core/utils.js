// BusCommand ESM v9.5
import { t } from "../ui/i18n.js";
import { driverBelongsToLine } from "../data/group-membership.js";

function isMobileDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const mobileRe = /android|iphone|ipad|ipod|blackberry|windows phone|opera mini|mobile/i;
    return mobileRe.test(ua) || window.innerWidth < 768;
}

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

// ── DATA ISOLATION HELPERS ───────────────────────────────
// Vraća vozače vidljive trenutnom korisniku po ulozi
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
            const disp = (window.state.dispatchers || []).find(d => d.id === window.currentUser.id);
            return disp ? (disp.groups || []) : [window.currentUser.activeGroupId].filter(Boolean);
        })();

        return myGroups.length
            ? all.filter(d => myGroups.some(gId => driverBelongsToLine(d, gId)))
            : all;
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
        const disp = (window.state.dispatchers || []).find(d => d.id === window.currentUser.id);
        const myGroups = disp ? (disp.groups || []) : [window.currentUser.activeGroupId].filter(Boolean);
        return myGroups.length ? all.filter(g => myGroups.includes(g.id)) : all;
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
    if (!container) { console.warn(message); return; }

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

// Vraca plan rada na osnovu ID-ja (kljuca)
function getScheduleByKey(key) {
    if (!window.state || !window.state.schedules) return null;
    return window.state.schedules.find(s => s.id === key) || null;
}

export {
    isMobileDevice,
    escapeHtml,
    getVisibleDrivers,
    getVisibleGroups,
    showToast,
    formatDateTime,
    todayDateStr,
    getScheduleByKey
};

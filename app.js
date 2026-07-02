// ============================================================
// 🚌 TRANSITFLOW — SaaS Bus Fleet Management Platform
// AUTOR: Boban Canic
// ============================================================

// ── COMPANY ID DETEKCIJA ──────────────────────────────────
// U produkciji: blaguss.fleetpulse.app → companyId = "blaguss"
// Na localhost: koristimo "demo" (ili ?company=xxx URL param)
const COMPANY_ID = (() => {
    const host = window.location.hostname;
    const param = new URLSearchParams(window.location.search).get("company");
    if (param) return param.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return "demo";
    const sub = host.split(".")[0];
    return (sub && sub !== "www") ? sub.toLowerCase() : "demo";
})();

// ── SECRET SUPERADMIN LOGIN (klik na logo 5x) ────────────
let _saClickCount = 0;
let _saClickTimer = null;
const SA_PIN = "admin123";

function handleLogoClick() {
    _saClickCount++;
    clearTimeout(_saClickTimer);
    if (_saClickCount >= 5) {
        _saClickCount = 0;
        openSuperAdminModal();
    } else {
        _saClickTimer = setTimeout(() => { _saClickCount = 0; }, 2000);
    }
}

function openSuperAdminModal() {
    const modal = document.getElementById("superadmin-pin-modal");
    const input = document.getElementById("superadmin-pin-input");
    const err   = document.getElementById("superadmin-pin-error");
    if (!modal) return;
    if (err) err.textContent = "";
    if (input) { input.value = ""; }
    modal.classList.remove("hidden");
    setTimeout(() => { if (input) input.focus(); }, 100);
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeSuperAdminModal() {
    const modal = document.getElementById("superadmin-pin-modal");
    if (modal) modal.classList.add("hidden");
}

function confirmSuperAdminPin() {
    const input = document.getElementById("superadmin-pin-input");
    const err   = document.getElementById("superadmin-pin-error");
    const pin   = input ? input.value.trim() : "";
    if (pin === SA_PIN) {
        closeSuperAdminModal();
        currentUser = { role: "superadmin", name: "Super Admin", id: "superadmin" };
        sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
        showAppLayout();
    } else {
        if (err) err.textContent = "Incorrect PIN";
        if (input) { input.value = ""; input.focus(); }
    }
}

// ── MOBILE DETECTION ─────────────────────────────────────
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
    const all = state.drivers || [];
    if (!currentUser) return all;
    if (currentUser.role === 'superadmin') return all;
    if (currentUser.role === 'company-admin') {
        const cId = currentUser.companyId;
        return cId ? all.filter(d => d.companyId === cId || !d.companyId) : all;
    }
    if (currentUser.role === 'dispatcher') {
        const myGroups = (() => {
            const disp = (state.dispatchers || []).find(d => d.id === currentUser.id);
            return disp ? (disp.groups || []) : [currentUser.activeGroupId].filter(Boolean);
        })();
        return myGroups.length ? all.filter(d => myGroups.includes(d.groupId)) : all;
    }
    return all;
}

// Vraća grupe vidljive trenutnom korisniku
function getVisibleGroups() {
    const all = state.groups || [];
    if (!currentUser) return all;
    if (currentUser.role === 'superadmin') return all;
    if (currentUser.role === 'company-admin') {
        const cId = currentUser.companyId;
        return cId ? all.filter(g => g.companyId === cId || !g.companyId) : all;
    }
    if (currentUser.role === 'dispatcher') {
        const disp = (state.dispatchers || []).find(d => d.id === currentUser.id);
        const myGroups = disp ? (disp.groups || []) : [currentUser.activeGroupId].filter(Boolean);
        return myGroups.length ? all.filter(g => myGroups.includes(g.id)) : all;
    }
    return all;
}

// --- REČNIK PREVODA (MULTILANGUAGE i18n DICTIONARY) ---
// TRANSLATIONS je definisan u translations.js (učitava se pre app.js)
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
        toast.addEventListener("animationend", () => toast.remove(), { once: true });
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

// ============================================================
// FRESH STATE — čist state za novu firmu (bez podataka)
// ============================================================
const FRESH_STATE = {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [],
    dispatchers: [
        { id: "superadmin", name: "Super Admin", pin: "admin123", isSuperAdmin: true }
    ],
    drivers: [],
    buses: [],
    routes: [],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: {
        name: "",
        primaryColor: "#29ABE2",
        logo: null
    },
    schedules: [],
    tomorrowShifts: [],
    onboardingDone: false,
    activeGroupFilter: null,
    shifts: [],
    companyAdmins: []
};

// ============================================================
// DEMO STATE — bogat sadržaj za demo / probni period
// ============================================================
const DEMO_STATE = {
    language: "de",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [
        { id: "105", name: "Linija 105", color: "#a6001a", companyId: "demo" },
        { id: "110", name: "Linija 110", color: "#2563eb", companyId: "demo" },
        { id: "204", name: "Linija 204", color: "#16a34a", companyId: "demo" }
    ],
    dispatchers: [
        { id: "superadmin", name: "Super Admin", pin: "admin123", isSuperAdmin: true },
        { id: "dispo-1", name: "dispo 1", email: "dispo1@demo.com", password: "dispo123", passwordChanged: true, groups: ["105"], companyId: "demo", paymentStatus: "Trial", trialDaysLeft: 30 },
        { id: "dispo-2", name: "dispo 2", email: "dispo2@demo.com", password: "dispo123", passwordChanged: true, groups: ["110"], companyId: "demo", paymentStatus: "Trial", trialDaysLeft: 30 },
        { id: "dispo-3", name: "dispo 3", email: "dispo3@demo.com", password: "dispo123", passwordChanged: true, groups: ["204"], companyId: "demo", paymentStatus: "Trial", trialDaysLeft: 30 }
    ],
    drivers: [
        { id: "drv-1", name: "Nikola Petrović", groupId: "105", pin: "1234", bus: "104", companyId: "demo" },
        { id: "drv-2", name: "Marko Jovanović", groupId: "105", pin: "1234", bus: "142", companyId: "demo" },
        { id: "drv-3", name: "Dejan Ilić", groupId: "110", pin: "1234", bus: "203", companyId: "demo" },
        { id: "drv-4", name: "Petar Lukić", groupId: "204", pin: "1234", bus: "307", companyId: "demo" }
    ],
    buses: [
        { id: "bus-1", number: "104", groupId: "105" },
        { id: "bus-2", number: "142", groupId: "105" },
        { id: "bus-3", number: "203", groupId: "110" },
        { id: "bus-4", number: "307", groupId: "204" }
    ],
    routes: [
        {
            id: "rt-1", number: "31", name: "Studentski Trg - Konjarnik",
            stops: ["Studentski Trg", "Trg Republike", "Terazije", "Beograđanka", "Slavija", "Karađorđev Park", "Franše d'Eperea", "Konjarnik"],
            groupId: "105"
        },
        {
            id: "rt-2", number: "16", name: "Karaburma 2 - Novi Beograd (Paviljoni)",
            stops: ["Karaburma 2", "Marijane Gregoran", "Omladinski Stadion", "Despota Stefana", "Trg Republike", "Zeleni Venac", "Ušće", "Novi Beograd"],
            groupId: "110"
        },
        {
            id: "rt-3", number: "95", name: "Borča 3 - Blok 45",
            stops: ["Borča 3", "Kotež", "Dunavska", "Pančevački Most", "Trg Republike", "Zeleni Venac", "Ušće", "Sava Centar", "Blok 45"],
            groupId: "204"
        }
    ],
    reports: [
        {
            id: "rep-1", time: "17:05", driver: "Dejan Ilić", bus: "203",
            type: "Kašnjenje: 15 minuta", reason: "Saobraćajna gužva na Autokomandi",
            severity: "Srednja", status: "active"
        }
    ],
    vacations: [
        {
            id: "vac-1", driver: "Marko Jovanović", type: "Godišnji odmor",
            start: "2026-06-15", end: "2026-06-20", days: 6,
            reason: "Letovanje sa porodicom", status: "Odobreno"
        }
    ],
    messages: [
        {
            id: "msg-1", time: "16:30", sender: "Dispečer", senderLang: "de",
            recipient: "Nikola Petrović",
            template: "tmpl_detour", detail: "Slavija → Nemanjina",
            text: "Detour in effect — Slavija → Nemanjina",
            type: "detour", scope: "driver", read: false
        },
        {
            id: "msg-2", time: "16:45", sender: "Dispečer", senderLang: "de",
            recipient: "Svi vozači",
            template: "tmpl_delay_10", detail: "",
            text: "Delay: 10 minutes",
            type: "warning", scope: "group", read: true
        }
    ],
    lostItems: [
        {
            id: "lost-1", time: "14:20", driver: "Nikola Petrović", bus: "104",
            type: "lost_wallet", location: "Sitz 14, Mitte",
            desc: "Schwarze Lederbörse mit Ausweis auf den Namen Jovan Jovanović", status: "status_in_depot"
        }
    ],
    branding: {
        name: "FleetPulse Demo",
        primaryColor: "#29ABE2",
        logo: null
    },
    schedules: [],
    onboardingDone: true,
    activeGroupFilter: null,
    shifts: [],
    tomorrowShifts: [
        { driver: "Canic Boban", shift: "320.S07", bus: "91105", confirmed: false },
        { driver: "Rezwani Azizollah", shift: "320.S09", bus: "91017", confirmed: true },
        { driver: "Behljulji Muhamed", shift: "320.S08", bus: "91106", confirmed: false },
        { driver: "Kaci Fari", shift: "320.S05", bus: "91028", confirmed: true }
    ],
    companyAdmins: [
        {
            id: "ca-demo-1",
            name: "Ana Kovačević",
            email: "admin@demo.com",
            password: "demo123",
            companyId: "demo",
            role: "company-admin",
            createdAt: "2026-01-01T00:00:00.000Z"
        }
    ]
};

// DEFAULT_STATE je alias — demo mod koristi DEMO_STATE, production FRESH_STATE
const DEFAULT_STATE = DEMO_STATE;

let state = {};
let currentUser = null;
let currentCalendarMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"

// --- UČITAVANJE I ČUVANJE STANJA ---
function loadState() {
    const saved = localStorage.getItem("fleetpulse_state");
    if (saved) {
        try {
            state = JSON.parse(saved);
            state = { ...DEFAULT_STATE, ...state };
            
            // KRITIČNO: Uvek osveži drivers i dispatchers iz DEFAULT_STATE
            // (stari localStorage možda nema PIN-ove ili bus polja)
            state.drivers = state.drivers.map(savedDriver => {
                const defDriver = DEFAULT_STATE.drivers.find(d => d.id === savedDriver.id);
                if (defDriver) {
                    return { ...defDriver, ...savedDriver, pin: defDriver.pin, bus: defDriver.bus || savedDriver.bus };
                }
                return savedDriver;
            });
            state.dispatchers = state.dispatchers.map(savedDisp => {
                const defDisp = DEFAULT_STATE.dispatchers.find(d => d.id === savedDisp.id);
                if (defDisp) {
                    return { ...defDisp, ...savedDisp, pin: defDisp.pin };
                }
                return savedDisp;
            });
            
            // Migracija: osiguraj da branding uvijek ima logo polje
            if (state.branding && state.branding.logo === undefined) {
                state.branding.logo = null;
            }
        } catch (e) {
            state = { ...DEFAULT_STATE };
        }
    } else {
        state = { ...DEFAULT_STATE };
        saveState();
    }
    
    const savedUser = sessionStorage.getItem("fleetpulse_user");
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
}


function saveState() {
    // Block state persistence when Super Admin is in read-only inspect mode
    if (isReadOnly()) {
        console.log("[ReadOnly] State save blocked — Super Admin inspect mode");
        return;
    }
    localStorage.setItem("fleetpulse_state", JSON.stringify(state));
    
    // Sinhronizuj izmjene sa Firestore granularnim kolekcijama
    if (typeof saveStateToFirestore === "function" && typeof COMPANY_ID !== "undefined") {
        saveStateToFirestore(state, COMPANY_ID);
    }
}

// --- POKRETANJE APLIKACIJE ---
// Helper: resetuje ceo app state na fabričke vrednosti
function resetApp() {
    localStorage.removeItem("fleetpulse_state");
    localStorage.removeItem("fleetpulse_lang");
    sessionStorage.clear();
    location.reload();
}

function confirmFactoryReset() {
    closeModal("factory-reset-modal");
    localStorage.clear();
    sessionStorage.clear();
    setTimeout(() => { location.reload(); }, 150);
}

// ============================================================
// MODAL HELPERS — showModal / closeModal
// ============================================================

function showModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove("hidden");
        el.style.display = "flex";
    }
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("hidden");
        el.style.display = "none";
    }
}

// ============================================================
// SOS MODAL FUNCTIONS
// ============================================================

function closeSosConfirmModal() {
    closeModal("sos-confirm-modal");
}

function confirmResolveSOS() {
    closeSosConfirmModal();
    resolveSOS();
}

function confirmClearSOS() {
    closeModal("clear-sos-modal");
    resolveSOS();
}

// ============================================================
// PRINT CURRENT SCHEDULE
// ============================================================

function printCurrentSchedule(type) {
    const lang = state.language || "en";
    let title = "";
    if (type === "week")   title = t("shift_weekly_view") || "Weekly Schedule";
    else if (type === "month") title = t("calendar_title")     || "Monthly Calendar";
    else                   title = t("settings_drivers_title") || "Drivers";

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
        showToast(t("error_popup_blocked") || "Please allow popups for printing.", "error", 4000);
        return;
    }

    const content = document.getElementById("dispatcher-shifts");
    const html = content ? content.innerHTML : "<p>No content to print.</p>";

    printWindow.document.write(`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<title>${title} — FleetPulse</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #000; margin: 20px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: bold; }
  button { display: none; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<h2>${title}</h2>
${html}
</body>
</html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 400);
}

// ============================================================
// CALENDAR MONTH NAVIGATION
// ============================================================

function changeCalendarMonth(dir) {
    const parts = currentCalendarMonth.split("-");
    let year  = parseInt(parts[0]);
    let month = parseInt(parts[1]) - 1; // 0-based
    month += dir;
    if (month < 0)  { month = 11; year--; }
    if (month > 11) { month = 0;  year++; }
    currentCalendarMonth = `${year}-${String(month + 1).padStart(2, "0")}`;
    renderDriverCalendar();
}

// ============================================================
// DISPATCHER MANAGEMENT
// ============================================================

function addDispatcher() {
    const nameInput  = document.getElementById("new-disp-name");
    const groupInput = document.getElementById("new-disp-group");
    const pinInput   = document.getElementById("new-disp-pin");

    if (!nameInput) return;

    const name    = nameInput.value.trim();
    const groupId = groupInput ? groupInput.value : (state.groups[0] ? state.groups[0].id : null);
    const pin     = pinInput ? pinInput.value.trim() : "1234";

    if (!name) {
        showToast(t("error_fill_all_fields") || "Please fill all fields.", "error");
        return;
    }
    if (pin && (pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin))) {
        showToast(t("error_pin_format") || "PIN must be 4–6 digits.", "error");
        return;
    }

    const newDisp = {
        id: "dispo-" + Date.now(),
        name,
        pin: pin || "1234",
        passwordChanged: false,
        groups: groupId ? [groupId] : [],
        paymentStatus: "Trial",
        trialDaysLeft: 30
    };

    showConfirm(
        (t("confirm_add_dispatcher") || "Add dispatcher") + ': "' + name + '"?',
        function() {
            state.dispatchers.push(newDisp);
            saveState();
            if (nameInput) nameInput.value = "";
            if (pinInput)  pinInput.value  = "";
            renderDispatcherSettings();
            showToast((t("dispatcher") || "Dispatcher") + " " + name + " " + (t("added") || "added"), "success");
        },
        { danger: false, title: t("dispatcher") || "Dispatcher", confirmText: t("btn_yes") || "Da" }
    );
}

function renderDispatchersList() {
    const container = document.getElementById("dispatchers-list");
    if (!container) return;

    const dispatchers = (state.dispatchers || []).filter(d => !d.isSuperAdmin);

    if (dispatchers.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;text-align:center;padding:20px 0;">${t("no_dispatchers") || "No dispatchers added yet."}</p>`;
        return;
    }

    container.innerHTML = dispatchers.map(d => {
        const groups = (d.groups || []).map(gid => {
            const g = (state.groups || []).find(g => g.id === gid);
            return g ? `<span style="background:${g.color}22;color:${g.color};border:1px solid ${g.color}44;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${escapeHtml(g.name)}</span>` : "";
        }).join(" ");

        const statusColor = d.paymentStatus === "Paid" ? "#16a34a" : d.paymentStatus === "Trial" ? "#f59e0b" : "#ef4444";

        return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--card-bg,rgba(255,255,255,0.02));border:1px solid var(--panel-border);border-radius:12px;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                <div style="width:36px;height:36px;border-radius:50%;background:rgba(41,171,226,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i data-lucide="user" style="width:16px;height:16px;color:var(--primary-color);"></i>
                </div>
                <div>
                    <div style="font-weight:700;font-size:0.9rem;color:var(--text-main);">${escapeHtml(d.name)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${groups || '<span style="opacity:0.5;">' + (t("group_none") || "No group") + '</span>'}</div>
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                <span style="font-size:0.75rem;font-weight:600;color:${statusColor};background:${statusColor}18;border:1px solid ${statusColor}33;padding:3px 10px;border-radius:10px;">${d.paymentStatus || "Trial"}</span>
                <button onclick="superadminResetPin('${d.id}')" title="${t('btn_save_password') || 'Reset PIN'}" style="background:none;border:1px solid var(--panel-border);border-radius:8px;padding:6px 10px;cursor:pointer;color:var(--text-muted);">
                    <i data-lucide="key" style="width:14px;height:14px;"></i>
                </button>
                <button onclick="removeDispatcher('${d.id}')" title="${t('btn_remove') || 'Remove'}" style="background:none;border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:6px 10px;cursor:pointer;color:#ef4444;">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>
        </div>`;
    }).join("");

    lucide.createIcons();
}

function removeDispatcher(id) {
    showConfirm(t("confirm_delete") || "Remove this dispatcher?", function() {
        state.dispatchers = (state.dispatchers || []).filter(d => d.id !== id);
        saveState();
        renderDispatcherSettings();
        showToast(t("dispatcher") + " " + (t("removed") || "removed"), "info");
    }, { danger: true });
}

// ============================================================
// CSV EXPORT
// ============================================================

// Helper za lookup po scheduleKey — podržava i array i legacy object format
function getScheduleByKey(key) {
    if (!state.schedules) return null;
    if (Array.isArray(state.schedules)) return state.schedules.find(s => s.id === key) || null;
    return state.schedules[key] || null; // backwards compat sa starim localStorage
}

function downloadCSV(filename, headers, rows) {
    const escape = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map(row => row.map(escape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast("✅ " + filename + " downloaded", "success", 3000);
}

function exportReportsCSV() {
    const headers = [t("table_time") || "Time", t("table_driver") || "Driver", t("table_bus") || "Bus", t("table_type") || "Type", t("table_reason") || "Reason", t("table_severity") || "Severity", t("table_status") || "Status"];
    const rows = (state.reports || []).map(r => [r.time, r.driver, r.bus, r.type, r.reason, r.severity, r.status]);
    downloadCSV("fleetpulse_reports.csv", headers, rows);
}

function exportDriversCSV() {
    const headers = [t("table_driver") || "Driver", t("table_bus") || "Bus", "PIN", "Group ID"];
    const rows = (state.drivers || []).map(d => [d.name, d.bus, d.pin, d.groupId || ""]);
    downloadCSV("fleetpulse_drivers.csv", headers, rows);
}

function exportLostItemsCSV() {
    const headers = [t("table_time") || "Time", t("table_driver") || "Driver", t("table_bus") || "Bus", t("table_type") || "Type", "Location", t("table_status") || "Status"];
    const rows = (state.lostItems || []).map(i => [i.time, i.driver, i.bus, i.type, i.location || "", i.status]);
    downloadCSV("fleetpulse_lost_items.csv", headers, rows);
}

// ============================================================
// GPS & NOTIFICATIONS
// ============================================================

function startDriverGpsTracking() {
    if (!navigator.geolocation) return;
    if (window._gpsWatchId) navigator.geolocation.clearWatch(window._gpsWatchId);
    window._gpsWatchId = navigator.geolocation.watchPosition(
        pos => {
            if (currentUser && currentUser.role === "driver") {
                currentUser.lat = pos.coords.latitude;
                currentUser.lng = pos.coords.longitude;
                try { sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser)); } catch(e) {}
            }
        },
        () => {}, // GPS odbijen — tiho ignoriši
        { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
    );
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
    }
}

// ============================================================
// ONBOARDING WIZARD
// ============================================================
let _wizardStep = 1;
let _wizardDriverRows = 0;

function showOnboardingWizard() {
    const wiz = document.getElementById("onboarding-wizard");
    if (!wiz) return;
    _wizardStep = 1;
    _wizardDriverRows = 0;
    document.getElementById("wizard-drivers-list").innerHTML = "";
    wizardAddDriverRow(); // dodaj jedan red odmah
    wizardRenderStep();
    wiz.classList.remove("hidden");
    lucide.createIcons();
}

function closeOnboardingWizard() {
    const wiz = document.getElementById("onboarding-wizard");
    if (wiz) wiz.classList.add("hidden");
    state.onboardingDone = true;
    saveState();
}

function wizardRenderStep() {
    const steps = [1, 2, 3];
    steps.forEach(n => {
        const el = document.getElementById(`wizard-step-${n}`);
        if (el) el.style.display = n === _wizardStep ? "" : "none";
    });

    const progress = { 1: "33%", 2: "66%", 3: "100%" };
    const bar = document.getElementById("wizard-progress-bar");
    if (bar) bar.style.width = progress[_wizardStep] || "33%";

    const label = document.getElementById("wizard-step-label");
    if (label) label.innerText = `${_wizardStep} / 3`;

    const btnBack = document.getElementById("wizard-btn-back");
    if (btnBack) btnBack.style.display = _wizardStep > 1 ? "" : "none";

    const btnNext = document.getElementById("wizard-btn-next");
    const btnSkip = document.getElementById("wizard-btn-skip");
    if (btnNext) {
        if (_wizardStep === 3) {
            btnNext.setAttribute("data-i18n", "wizard_finish");
            btnNext.innerText = t("wizard_finish");
        } else {
            btnNext.setAttribute("data-i18n", "btn_next");
            btnNext.innerText = t("btn_next");
        }
    }
    // Step 3 — skip dugme postaje "Završi bez vozača"
    if (btnSkip) {
        if (_wizardStep === 3) {
            btnSkip.setAttribute("data-i18n", "wizard_finish_empty");
            btnSkip.innerText = t("wizard_finish_empty");
        } else {
            btnSkip.setAttribute("data-i18n", "btn_skip");
            btnSkip.innerText = t("btn_skip");
        }
    }
    translateUI();
    lucide.createIcons();
}

function wizardNext() {
    if (_wizardStep === 1) {
        const name = document.getElementById("wizard-company-name").value.trim();
        if (!name) {
            document.getElementById("wizard-company-name").focus();
            document.getElementById("wizard-company-name").style.borderColor = "var(--danger-color)";
            setTimeout(() => { document.getElementById("wizard-company-name").style.borderColor = ""; }, 2000);
            return;
        }
        state.branding.name = name;
        applyBrandingToUI();
    } else if (_wizardStep === 2) {
        const color = document.getElementById("wizard-color-picker").value;
        state.branding.primaryColor = color;
        document.documentElement.style.setProperty("--primary-color", color);
        applyBrandingToUI();
    } else if (_wizardStep === 3) {
        wizardSaveDrivers();
        saveState();
        closeOnboardingWizard();
        showToast("✅ " + t("wizard_done_toast"), "success", 4000);
        return;
    }
    _wizardStep++;
    wizardRenderStep();
}

function wizardBack() {
    if (_wizardStep > 1) {
        _wizardStep--;
        wizardRenderStep();
    }
}

function wizardSkip() {
    if (_wizardStep === 3) {
        saveState();
        closeOnboardingWizard();
        return;
    }
    _wizardStep++;
    wizardRenderStep();
}

function wizardSelectColor(hex) {
    document.getElementById("wizard-color-picker").value = hex;
    document.getElementById("wizard-color-preview").style.background = hex;
    document.getElementById("wizard-color-hex").innerText = hex;

    // Označi chip
    document.querySelectorAll(".wizard-color-chip").forEach(c => {
        c.style.outline = c.dataset.color === hex ? "3px solid white" : "none";
        c.style.outlineOffset = "2px";
    });

    // Live preview boje u app-u
    document.documentElement.style.setProperty("--primary-color", hex);
    state.branding.primaryColor = hex;
}

function wizardPreviewBranding() {
    const name = document.getElementById("wizard-company-name").value.trim();
    if (name) {
        const el = document.getElementById("app-branding-title");
        if (el) el.innerText = name;
    }
}

function wizardHandleLogo(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const dataUrl = e.target.result;
        state.branding.logo = dataUrl;

        document.getElementById("wizard-logo-img").src = dataUrl;
        document.getElementById("wizard-logo-preview").style.display = "block";
        document.getElementById("wizard-logo-placeholder").style.display = "none";
        applyBrandingToUI();
    };
    reader.readAsDataURL(file);
}

function wizardAddDriverRow() {
    _wizardDriverRows++;
    const id = `wdrv-${_wizardDriverRows}`;
    const list = document.getElementById("wizard-drivers-list");
    const row = document.createElement("div");
    row.id = id;
    row.style.cssText = "display:grid;grid-template-columns:1fr 80px 70px auto;gap:8px;align-items:center;";
    row.innerHTML = `
        <input type="text" placeholder="${t('wizard_driver_name')}"
            style="padding:10px 12px;border-radius:8px;border:1px solid var(--panel-border);background:var(--input-bg);color:var(--text-main);font-family:'Outfit',sans-serif;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box;" />
        <input type="text" placeholder="${t('wizard_bus_nr')}" maxlength="6"
            style="padding:10px 12px;border-radius:8px;border:1px solid var(--panel-border);background:var(--input-bg);color:var(--text-main);font-family:'Outfit',sans-serif;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box;" />
        <input type="text" placeholder="PIN" maxlength="4"
            style="padding:10px 12px;border-radius:8px;border:1px solid var(--panel-border);background:var(--input-bg);color:var(--text-main);font-family:'Outfit',sans-serif;font-size:0.85rem;outline:none;width:100%;box-sizing:border-box;" />
        <button onclick="document.getElementById('${id}').remove()"
            style="width:36px;height:36px;border:1px solid var(--panel-border);border-radius:8px;background:none;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
        </button>`;
    list.appendChild(row);
    lucide.createIcons();
}

function wizardSaveDrivers() {
    const rows = document.querySelectorAll("#wizard-drivers-list > div");
    rows.forEach((row, i) => {
        const inputs = row.querySelectorAll("input");
        const name = inputs[0].value.trim();
        const bus  = inputs[1].value.trim();
        const pin  = inputs[2].value.trim() || "1234";
        if (!name) return;
        // Dodaj grupu ako postoji, inače bez grupe
        const groupId = state.groups.length > 0 ? state.groups[0].id : null;
        const exists = state.drivers.find(d => d.name === name);
        if (!exists) {
            state.drivers.push({
                id: `drv-${Date.now()}-${i}`,
                name, bus: bus || "?", pin, groupId,
                active: false
            });
        }
    });
}

// ============================================================
// TEMA (DARK / LIGHT MODE)
// ============================================================
function applyStoredTheme() {
    const theme = localStorage.getItem("fleetpulse_theme") || "dark";
    const isLight = theme === "light";
    document.body.classList.toggle("light-theme", isLight);
    const icon = document.getElementById("theme-icon");
    if (icon) {
        icon.setAttribute("data-lucide", isLight ? "sun" : "moon");
        if (typeof lucide !== "undefined") lucide.createIcons();
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle("light-theme");
    localStorage.setItem("fleetpulse_theme", isLight ? "light" : "dark");
    const icon = document.getElementById("theme-icon");
    if (icon) {
        icon.setAttribute("data-lucide", isLight ? "sun" : "moon");
        lucide.createIcons();
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    // ============================================================
    // UVEK BRISI STARI localStorage NA SVAKOM STARTU
    // Garantuje čist state pri svakom otvaranju stranice
    // ============================================================
    localStorage.removeItem("fleetpulse_state");
    sessionStorage.removeItem("fleetpulse_user");
    sessionStorage.removeItem("fleetpulse_pretrip_done");
    sessionStorage.removeItem("fleetpulse_spoken_messages");
    
    // Sačuvaj samo jezik (korisnik ga bira ručno, ne treba resetovati)
    const savedLang = localStorage.getItem("fleetpulse_lang") || "de";
    
    // Učitaj svež state iz DEFAULT_STATE
    state = { ...DEFAULT_STATE };
    state.language = savedLang;
    currentUser = null;
    
    applyBrandingToUI();
    initializeLoginSelects();

    // Postavi jezik na selektorima
    const loginSel  = document.getElementById("login-lang-select");
    const headerSel = document.getElementById("header-lang-select");
    if (loginSel)  loginSel.value  = savedLang;
    if (headerSel) headerSel.value = savedLang;

    translateUI();
    applyStoredTheme();

    // ── DEMO MODE (?demo=driver | ?demo=dispatcher) ─────────────────────────
    const demoParam = new URLSearchParams(window.location.search).get("demo");
    if (demoParam === "driver") {
        const demoDriver = state.drivers[0] || { name: "Demo Vozač", bus: "104", groupId: "105" };
        const demoRoute  = state.routes.find(r => r.groupId === demoDriver.groupId) || state.routes[0];
        currentUser = {
            role: "driver",
            name: demoDriver.name,
            bus: demoDriver.bus || "104",
            routeId: demoRoute ? demoRoute.id : null,
            currentStopIndex: 0,
            isDemo: true
        };
        demoDriver.active = true;
        sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
        showAppLayout();
        showToast("🚌 Demo — prijavljen kao Vozač", "info", 5000);
        lucide.createIcons();
        return;
    } else if (demoParam === "dispatcher") {
        const demoDisp = state.dispatchers.find(d => d.id !== "superadmin") || state.dispatchers[0];
        currentUser = {
            role: "dispatcher",
            name: demoDisp ? demoDisp.name : "Demo Dispečer",
            id:   demoDisp ? demoDisp.id   : "dispo-demo",
            activeGroupId: demoDisp ? (demoDisp.groups && demoDisp.groups[0]) : "105",
            isDemo: true
        };
        sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
        showAppLayout();
        showToast("🖥️ Demo — prijavljen kao Dispečer", "info", 5000);
        lucide.createIcons();
        return;
    }

    // Uvek prikaži login ekran (state je očišćen)
    showLoginScreen();
    lucide.createIcons();

    // 3. Async: učitaj iz Firestore-a i pokreni real-time sync
    //    (radi u pozadini, ne blokira UI)
    if (typeof initFirebase === "function") {
        try {
            await initFirebase();
            // Ako je Firebase vratio novi state, osveži UI
            applyBrandingToUI();
            initializeLoginSelects();
            translateUI();
            if (currentUser) {
                showAppLayout();
            }
            lucide.createIcons();
        } catch(e) {
            console.warn("Firebase init failed, using localStorage only:", e);
        }
    }
});


// --- CROSS-TAB SINHRONIZACIJA (SOS I PORUKE) ---
// Kada se state promeni u drugoj kartici (npr. vozač pošalje SOS),
// dispečerska kartica automatski prima obaveštenje i ažurira se.
window.addEventListener("storage", (event) => {
    if (event.key === "fleetpulse_state" && event.newValue) {
        try {
            const newState = JSON.parse(event.newValue);
            const sosWasActive = state.sosActive;
            state = { ...DEFAULT_STATE, ...newState };
            
            if (currentUser) {
                // Ažuriraj SOS status u realnom vremenu
                checkSOSStatus();
                
                // Ako je dispečer aktivan, osveži dashboard i poruke
                if (currentUser.role === "dispatcher") {
                    const activeSection = document.querySelector(".content-section:not(.hidden)");
                    if (activeSection && activeSection.id === "dispatcher-dashboard") {
                        renderDispatcherDashboard();
                    }
                }
                
                // Ako je vozač aktivan, osveži poruke
                if (currentUser.role === "driver") {
                    renderDriverMessages();
                }
            }
        } catch(e) {
            console.error("State sync error:", e);
        }
    }
});

// --- SOS POLLING (ISTA KARTICA) ---
// storage event ne radi unutar iste kartice.
// Ovaj interval proverava state svake 1.5 sekunde i osvežava SOS baner.
setInterval(() => {
    if (!currentUser) return;
    const saved = localStorage.getItem("fleetpulse_state");
    if (!saved) return;
    try {
        const freshState = JSON.parse(saved);
        if (freshState.sosActive !== state.sosActive ||
            freshState.sosDriver !== state.sosDriver) {
            state.sosActive = freshState.sosActive;
            state.sosDriver = freshState.sosDriver;
            state.sosBus = freshState.sosBus;
            checkSOSStatus();
        }
        // Ažuriraj poruke na dashboardu vozača u realnom vremenu
        if (currentUser.role === "driver" && freshState.messages) {
            const prevCount = state.messages ? state.messages.length : 0;
            if (freshState.messages.length !== prevCount) {
                state.messages = freshState.messages;
                renderDriverMessages();
            }
        }
    } catch(e) {}
}, 1500);

function changeLanguage(lang) {
    if (!TRANSLATIONS[lang]) {
        console.warn("Jezik nije podrzavan:", lang);
        return;
    }
    
    state.language = lang;
    saveState();
    localStorage.setItem("fleetpulse_lang", lang); // čuva jezik odvojeno, preživljava reset
    
    const loginSel  = document.getElementById("login-lang-select");
    const headerSel = document.getElementById("header-lang-select");
    if (loginSel)  loginSel.value  = lang;
    if (headerSel) headerSel.value = lang;

    // Ažuriraj HTML lang atribut (pristupačnost)
    document.documentElement.lang = lang;

    translateUI();

    if (currentUser) {
        const nameEl = document.getElementById("header-user-name");
        if (nameEl) nameEl.innerText = t(currentUser.name);

        const roleBadge = document.getElementById("current-role-badge");
        if (roleBadge) roleBadge.innerText = currentUser.role === "driver" ? t("driver") : t("dispatcher");

        const subEl = document.getElementById("header-user-sub");
        if (subEl) {
            subEl.innerText = currentUser.role === "driver"
                ? `${t("vehicle")} ${currentUser.bus || ""}`
                : t("dispatcher");
        }

        const activeSection = document.querySelector(".content-section:not(.hidden)");
        if (activeSection) switchSection(activeSection.id);
    }

    lucide.createIcons();
}

function translateUI() {
    const lang = state.language || "en";
    const dict = TRANSLATIONS[lang] || TRANSLATIONS["en"];
    const fallback = TRANSLATIONS["en"] || {};

    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach(el => {
        const key = el.getAttribute("data-i18n");
        // EN fallback ako ključ nedostaje u odabranom jeziku
        const val = dict[key] || fallback[key];
        if (val) {
            if (key === "trial_badge_login") {
                el.innerText = val.replace("{days}", "30");
            } else if (key === "trial_indicator_text") {
                el.innerHTML = `<i class="lucide-icon" data-lucide="clock"></i> ` + val.replace("{days}", "29");
            } else {
                el.innerText = val;
            }
        }
    });

    // Prevedi placeholdere za input i textarea polja
    const placeholderElements = document.querySelectorAll("[data-i18n-placeholder]");
    placeholderElements.forEach(el => {
        const key = el.getAttribute("data-i18n-placeholder");
        const val = dict[key] || fallback[key];
        if (val) el.setAttribute("placeholder", val);
    });

    // Obnovi template selectove na novom jeziku
    populateTemplateSelect("message-template");
    populateTemplateSelect("message-template-messages");
}

function t(key, replacements = {}) {
    const lang = state.language || "en";
    let text = (TRANSLATIONS[lang] && TRANSLATIONS[lang][key])
        || (TRANSLATIONS["en"] && TRANSLATIONS["en"][key])
        || key;

    Object.keys(replacements).forEach(placeholder => {
        text = text.replace(`{${placeholder}}`, replacements[placeholder]);
    });

    return text;
}

// --- BRENDIRANJE ---
function applyBrandingToUI() {
    const branding = state.branding || DEFAULT_STATE.branding;
    
    document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
    
    const hoverColor = adjustColorBrightness(branding.primaryColor, -20);
    document.documentElement.style.setProperty('--primary-hover', hoverColor);
    
    const rgb = hexToRgb(branding.primaryColor);
    if (rgb) {
        document.documentElement.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }
    
    const brandTitle = document.getElementById("app-branding-title");
    if (brandTitle) brandTitle.innerText = branding.name;
    
    // Dinamički logo u zavisnosti od izabranog brenda
    const loginHeaderLogo = document.getElementById("login-logo-container");
    if (loginHeaderLogo) {
        if (branding.logoUrl) {
            loginHeaderLogo.innerHTML = `
                <div class="custom-brand-logo" style="display:flex; flex-direction:column; align-items:center; justify-content:center; margin-bottom: 1.5rem;">
                    <img src="${branding.logoUrl}" alt="${branding.name}" style="max-height: 60px; max-width: 220px; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3)); border-radius: var(--radius-sm);">
                    <span style="font-weight:700; color:var(--text-main); font-size:1.4rem; margin-top:8px;">${branding.name}</span>
                </div>
            `;
        } else if (branding.name.toLowerCase().includes("blaguss")) {
            loginHeaderLogo.innerHTML = `
                <div class="blaguss-logo-display">
                    <span class="blaguss-brand-text">BLAGUSS</span>
                    <span class="blaguss-subtext">Bringt Sie weiter</span>
                </div>
            `;
        } else {
            loginHeaderLogo.innerHTML = `
                <div class="logo">
                    <i data-lucide="bus"></i>
                    <span>${branding.name}</span>
                </div>
                <p data-i18n="login_subtitle" class="login-subtitle-text">${t("login_subtitle")}</p>
            `;
            lucide.createIcons();
        }
    }

    const headerLogoContainer = document.getElementById("header-logo-container");
    if (headerLogoContainer) {
        if (branding.logoUrl) {
            headerLogoContainer.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <img src="${branding.logoUrl}" alt="${branding.name}" style="max-height: 32px; max-width: 110px; object-fit: contain; border-radius: 2px;">
                    <span style="font-weight:700; color:var(--text-main); font-size:1.1rem; letter-spacing:-0.2px;">${branding.name}</span>
                </div>
            `;
        } else if (branding.name.toLowerCase().includes("blaguss")) {
            headerLogoContainer.innerHTML = `
                <div class="blaguss-logo-display header-version">
                    <span class="blaguss-brand-text">BLAGUSS</span>
                </div>
            `;
        } else {
            headerLogoContainer.innerHTML = `
                <div class="logo">
                    <i data-lucide="bus"></i>
                    <span id="app-branding-title">${branding.name}</span>
                </div>
            `;
            lucide.createIcons();
        }
    }

    const brandInput = document.getElementById("settings-brand-name");
    const colorInput = document.getElementById("settings-primary-color");
    const logoInput = document.getElementById("settings-brand-logo");
    const hexLabel = document.getElementById("color-hex-display");
    
    if (brandInput) brandInput.value = branding.name;
    if (colorInput) colorInput.value = branding.primaryColor;
    if (logoInput) logoInput.value = branding.logoUrl || "";
    if (hexLabel) hexLabel.innerText = branding.primaryColor.toUpperCase();
}

function applyBrandingSettings() {
    const name = document.getElementById("settings-brand-name").value.trim();
    const color = document.getElementById("settings-primary-color").value;
    const logoUrl = document.getElementById("settings-brand-logo").value.trim();
    
    if (!name) return;
    
    showConfirm(
        t("confirm_apply_branding") || "Apply branding settings?",
        function() {
            state.branding = {
                name: name,
                primaryColor: color,
                logoUrl: logoUrl
            };
            saveState();
            applyBrandingToUI();
            showToast(t("js_alert_branding_applied"), "success");
        },
        { danger: false, title: t("btn_apply_branding") || "Primeni brendiranje", confirmText: t("btn_yes") || "Da" }
    );
}

function adjustColorBrightness(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    R = (R > 0) ? R : 0;
    G = (G > 0) ? G : 0;
    B = (B > 0) ? B : 0;

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

const colorPicker = document.getElementById("settings-primary-color");
if (colorPicker) {
    colorPicker.addEventListener("input", (e) => {
        const hexDisplay = document.getElementById("color-hex-display");
        if (hexDisplay) hexDisplay.innerText = e.target.value.toUpperCase();
    });
}

// --- EKRAN ZA PRIJAVU (LOGIN) ---
function showLoginScreen() {
    const loginScreen = document.getElementById("login-screen");
    const appContainer = document.getElementById("app-container");
    if (loginScreen) loginScreen.classList.remove("hidden");
    if (appContainer) appContainer.classList.add("hidden");
    
    const pinInput = document.getElementById("login-driver-pin");
    if (pinInput) pinInput.value = "";
}

function initializeLoginSelects() {
    // Vozači
    const driverSelect = document.getElementById("login-driver-select");
    if (driverSelect) {
        driverSelect.innerHTML = "";
        if (!state.drivers || state.drivers.length === 0) {
            const opt = document.createElement("option");
            opt.value = ""; opt.disabled = true; opt.selected = true;
            opt.innerText = t("no_drivers_registered");
            driverSelect.appendChild(opt);
        } else {
            state.drivers.forEach(d => {
                const opt = document.createElement("option");
                opt.value = d.name;
                opt.innerText = d.name;
                driverSelect.appendChild(opt);
            });
        }
    }

    // Dispečeri koriste email+password — nema dropdown select-a
}

function switchLoginTab(role) {
    const driverTab = document.getElementById("tab-driver-btn");
    const dispTab = document.getElementById("tab-dispatcher-btn");
    const driverForm = document.getElementById("driver-login-form");
    const dispForm = document.getElementById("dispatcher-login-form");

    if (role === 'driver') {
        driverTab.classList.add("active");
        dispTab.classList.remove("active");
        driverForm.classList.remove("hidden");
        dispForm.classList.add("hidden");
    } else {
        driverTab.classList.remove("active");
        dispTab.classList.add("active");
        driverForm.classList.add("hidden");
        dispForm.classList.remove("hidden");

        // Provjera mobilnog uređaja — dispečer samo na desktopu
        const mobileBlock = document.getElementById("dispatcher-mobile-block");
        const loginFields = document.getElementById("dispatcher-login-fields");
        if (isMobileDevice()) {
            if (mobileBlock) mobileBlock.classList.remove("hidden");
            if (loginFields) loginFields.style.display = "none";
        } else {
            if (mobileBlock) mobileBlock.classList.add("hidden");
            if (loginFields) loginFields.style.display = "";
        }
    }
}

function loginAsDriver() {
    const name = document.getElementById("login-driver-select").value;
    const pin = document.getElementById("login-driver-pin").value.trim();
    
    if (!name) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    
    const driver = state.drivers.find(d => d.name === name);
    if (!driver) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    
    // Ako vozač ima PIN, provjeri ga; ako nema PIN u bazi, dozvoli sa bilo kojim unosom
    if (driver.pin && pin !== driver.pin) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    if (!driver.pin && !pin) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    
    // Set driver active in shared state
    driver.active = true;
    saveState();
    
    // Pronađi rutu za vozačevu grupu
    const route = state.routes.find(r => r.groupId === driver.groupId) || state.routes[0];
    
    currentUser = {
        role: "driver",
        name: name,
        bus: driver.bus || "91022",
        routeId: route ? route.id : null,
        currentStopIndex: 0
    };
    
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    showAppLayout();
}


// Pomoćna funkcija: prikaži grešku na dispečer login formi
function showDispatcherError(msg) {
    const el = document.getElementById("login-error-dispatcher");
    if (el) { el.textContent = msg; el.classList.remove("hidden"); }
}
function clearDispatcherError() {
    const el = document.getElementById("login-error-dispatcher");
    if (el) el.classList.add("hidden");
}

async function loginAsDispatcher() {
    // Blokada mobilnih uređaja
    if (isMobileDevice()) {
        switchLoginTab("dispatcher"); // pokaži upozorenje
        return;
    }

    const emailInput = document.getElementById("login-dispatcher-email");
    const passInput  = document.getElementById("login-dispatcher-password");

    if (!emailInput || !passInput) return;
    clearDispatcherError();

    const email    = emailInput.value.trim();
    const password = passInput.value;

    if (!email || !password) {
        showDispatcherError(t("error_fill_all_fields") || "Please enter email and password.");
        return;
    }

    // Lokalni korisnici (company-admin ili dispatcher) imaju prednost nad Firebaseom
    const allLocalUsers = [...(state.companyAdmins || []), ...(state.dispatchers || [])];
    const localUser = allLocalUsers.find(d => d.email === email);
    const emailIsReal = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    // Firebase samo ako: email izgleda kao pravi i korisnik NIJE u lokalnoj bazi
    if (typeof firebase !== "undefined" && firebase.auth && emailIsReal && !localUser) {
        try {
            const btn = document.getElementById("dispatcher-login-btn");
            if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }

            const credential = await firebase.auth().signInWithEmailAndPassword(email, password);
            const tokenResult = await credential.user.getIdTokenResult(true);
            const claims = tokenResult.claims;

            currentUser = {
                uid:       credential.user.uid,
                email:     credential.user.email,
                name:      claims.name || credential.user.displayName || credential.user.email || "Korisnik",
                role:      claims.role || "dispatcher",
                companyId: claims.companyId || "demo",
                id:        credential.user.uid,
                activeGroupId: claims.groups ? claims.groups[0] : null
            };

            sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
            await initFirebase(currentUser.companyId);
            if (btn) { btn.disabled = false; btn.style.opacity = ""; }
            showAppLayout();
            return;
        } catch (err) {
            const btn = document.getElementById("dispatcher-login-btn");
            if (btn) { btn.disabled = false; btn.style.opacity = ""; }
            // Hard greške — ne probaj lokalni fallback
            const hardErrors = ["auth/user-not-found","auth/wrong-password","auth/invalid-credential","auth/too-many-requests","auth/user-disabled"];
            if (hardErrors.includes(err.code)) {
                const msgs = {
                    "auth/user-not-found":     t("error_user_not_found")    || "No account found with this email.",
                    "auth/wrong-password":     t("error_wrong_password")    || "Incorrect password.",
                    "auth/invalid-credential": t("error_wrong_password")    || "Incorrect email or password.",
                    "auth/too-many-requests":  t("error_too_many_requests") || "Too many failed attempts. Try again later.",
                    "auth/user-disabled":      t("error_account_disabled")  || "This account has been disabled."
                };
                showDispatcherError(msgs[err.code]);
                return;
            }
            // Sve ostale greške (network, invalid-email...) → probaj lokalni login
        }
    }

    // ── FALLBACK: lokalni login ─────────────────────────────────────────────
    // Provjeri company-admin prvo, pa dispatcher
    const companyAdmin = (state.companyAdmins || []).find(ca => ca.email === email);
    const disp = (state.dispatchers || []).find(d => d.email === email);
    const localFound = companyAdmin || disp;

    if (!localFound) {
        showDispatcherError(t("error_user_not_found") || "No account found with this email.");
        return;
    }

    if (localFound.password && localFound.password !== password) {
        showDispatcherError(t("error_wrong_password") || "Incorrect password.");
        return;
    }

    // ── Company Admin ──
    if (companyAdmin) {
        currentUser = {
            role: "company-admin",
            name: companyAdmin.name,
            id: companyAdmin.id,
            email: companyAdmin.email,
            companyId: companyAdmin.companyId || companyAdmin.id
        };
        sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
        showAppLayout();
        return;
    }

    // ── Dispatcher ──
    if (disp.id === "superadmin") {
        currentUser = { role: "superadmin", name: "Super Admin", id: "superadmin" };
    } else {
        if (!disp.passwordChanged) {
            document.getElementById("login-screen").classList.add("hidden");
            document.getElementById("dispatcher-password-setup-view").classList.remove("hidden");
            document.getElementById("setup-dispatcher-id").value = disp.id;
            document.getElementById("setup-new-pin").value = "";
            document.getElementById("setup-confirm-pin").value = "";
            return;
        }
        currentUser = {
            role: "dispatcher",
            name: disp.name,
            id: disp.id,
            email: disp.email,
            companyId: disp.companyId || null,
            activeGroupId: disp.activeGroupId || (disp.groups && disp.groups.length > 0 ? disp.groups[0] : null)
        };
    }

    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    showAppLayout();
}

function forgotDispatcherPassword() {
    const email = document.getElementById("login-dispatcher-email")?.value?.trim();
    if (typeof firebase !== "undefined" && firebase.auth) {
        if (!email) {
            showDispatcherError(t("error_enter_email") || "Please enter your email address first.");
            return;
        }
        firebase.auth().sendPasswordResetEmail(email)
            .then(() => {
                clearDispatcherError();
                showToast(t("password_reset_sent") || "Password reset email sent. Check your inbox.", "success", 6000);
            })
            .catch(err => {
                showDispatcherError(err.code === "auth/user-not-found"
                    ? (t("error_user_not_found") || "No account found with this email.")
                    : err.message);
            });
    } else {
        showToast(t("contact_admin") || "Contact your administrator to reset your password.", "info");
    }
}

function logout() {
    if (currentUser && currentUser.role === "driver") {
        const driver = state.drivers.find(d => d.name === currentUser.name);
        if (driver) {
            driver.active = false;
            driver.preTripDone = false; // Reset status provere
            saveState();
        }
    }
    sessionStorage.removeItem("fleetpulse_pretrip_done"); // Reset provere
    currentUser = null;
    sessionStorage.removeItem("fleetpulse_user");
    currentCalendarMonth = "2026-06"; // Resetuj kalendar pri odjavi
    showLoginScreen();
}

function showAppLayout() {
    if (currentUser && currentUser.role === "driver" && !sessionStorage.getItem("fleetpulse_pretrip_done")) {
        showPreTripModal();
        return;
    }
    
    document.getElementById("login-screen").classList.add("hidden");
    const modal = document.getElementById("pre-trip-modal");
    if (modal) modal.classList.add("hidden");
    
    document.getElementById("app-container").classList.remove("hidden");
    
    document.getElementById("header-user-name").innerText = t(currentUser.name);
    updateAvatarUI();
    
    const roleBadge = document.getElementById("current-role-badge");
    roleBadge.innerText = currentUser.role === "driver" ? t("driver") : t("dispatcher");
    
    const driverNav = document.getElementById("driver-nav");
    const dispNav = document.getElementById("dispatcher-nav");
    const saNav = document.getElementById("superadmin-nav");
    const caNav = document.getElementById("company-admin-nav");

    if (currentUser.role === "driver") {
        document.getElementById("header-user-sub").innerText = `${t("vehicle")} ${currentUser.bus || ""}`;
        driverNav.classList.remove("hidden");
        dispNav.classList.add("hidden");
        if (saNav) saNav.classList.add("hidden");
        if (caNav) caNav.classList.add("hidden");
        // Pokaži mobilnu bottom navigaciju za vozača
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.remove("hidden");
        // Pokreni GPS praćenje
        startDriverGpsTracking();
        switchSection("driver-dashboard");
    } else if (currentUser.role === "superadmin") {
        document.getElementById("header-user-sub").innerText = "Super Admin";
        roleBadge.innerText = "Super Admin";
        driverNav.classList.add("hidden");
        dispNav.classList.add("hidden");
        if (saNav) saNav.classList.remove("hidden");
        if (caNav) caNav.classList.add("hidden");
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.add("hidden");

        renderSuperAdminDashboard();
        switchSection("superadmin-dashboard");
    } else if (currentUser.role === "company-admin") {
        document.getElementById("header-user-sub").innerText = "Admin Firme";
        roleBadge.innerText = "Admin Firme";
        driverNav.classList.add("hidden");
        dispNav.classList.add("hidden");
        if (saNav) saNav.classList.add("hidden");
        if (caNav) caNav.classList.remove("hidden");
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.add("hidden");
        renderCompanyAdminDashboard();
        switchSection("company-admin-dashboard");
    } else {
        const disp = state.dispatchers.find(d => d.id === currentUser.id);
        if (disp && (!disp.groups || disp.groups.length === 0)) {
            document.getElementById("app-container").classList.add("hidden");
            document.getElementById("dispatcher-group-setup-view").classList.remove("hidden");
            populateGroupSetupSelect(disp.id);
            return;
        } else if (!currentUser.activeGroupId) {
            // Ako dispatcher ima grupe, automatski mu dodeli prvu
            if (disp && disp.groups && disp.groups.length > 0) {
                currentUser.activeGroupId = disp.groups[0];
                sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
            } else {
                document.getElementById("app-container").classList.add("hidden");
                document.getElementById("dispatcher-group-setup-view").classList.remove("hidden");
                if (disp) populateGroupSetupSelect(disp.id);
                return;
            }
        }
        
        document.getElementById("header-user-sub").innerHTML = `Group: ${currentUser.activeGroupId} <button onclick="switchToGroupSetup()" style="background:rgba(255,255,255,0.1); border:none; color:var(--primary-color); border-radius:4px; padding:2px 8px; margin-left:8px; font-size:0.75rem; cursor:pointer;">Switch</button>`;
        
        if (currentUser.impersonated) {
            document.getElementById("header-user-sub").innerHTML += ` <button onclick="exitImpersonation()" style="background:#ff4d4d; border:none; color:white; border-radius:4px; padding:3px 12px; margin-left:8px; font-size:0.75rem; cursor:pointer; font-weight:600;">⬅ Exit Inspect</button>`;
            
            // Show read-only banner
            const readOnlyBanner = document.createElement("div");
            readOnlyBanner.id = "readonly-banner";
            readOnlyBanner.style.cssText = "position:fixed; top:0; left:0; right:0; z-index:10000; background:linear-gradient(90deg, #f59e0b, #d97706); color:#000; text-align:center; padding:6px 12px; font-size:0.8rem; font-weight:700; letter-spacing:0.5px; font-family:'Outfit',sans-serif;";
            readOnlyBanner.innerHTML = "👁️ STEALTH INSPECT MODE — Read-Only View — No changes will be saved";
            const existingBanner = document.getElementById("readonly-banner");
            if (existingBanner) existingBanner.remove();
            document.body.prepend(readOnlyBanner);
        } else {
            const existingBanner = document.getElementById("readonly-banner");
            if (existingBanner) existingBanner.remove();
        }
        
        driverNav.classList.add("hidden");
        dispNav.classList.remove("hidden");
        if (saNav) saNav.classList.add("hidden");
        if (caNav) caNav.classList.add("hidden");
        const mobileNav = document.getElementById("mobile-bottom-nav");
        if (mobileNav) mobileNav.classList.add("hidden");
        switchSection("dispatcher-dashboard");
        setTimeout(() => { initDispatcherLiveMap(); }, 300);
        requestNotificationPermission();

        // Onboarding wizard — pokaži samo ako firma nije konfigurirana
        if (!state.onboardingDone && !state.branding.name && !currentUser.impersonated) {
            setTimeout(() => showOnboardingWizard(), 600);
        }
    }
    
    checkSOSStatus();
}

function showPreTripModal() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-container").classList.add("hidden");
    const modal = document.getElementById("pre-trip-modal");
    if (modal) {
        modal.classList.remove("hidden");
        // form.reset() je jedini siguran način da Chrome ne restaurira staro stanje checkboxova
        const form = document.getElementById("pre-trip-form");
        if (form) form.reset();
        // Dvojna sigurnost: manuelni reset + odgođeni reset (Chrome form restoration)
        const forceUncheck = () => {
            modal.querySelectorAll("input[type='checkbox']").forEach(cb => { cb.checked = false; });
            if (form) form.reset();
        };
        forceUncheck();
        setTimeout(forceUncheck, 50);
        setTimeout(forceUncheck, 300);
        const fileInput = document.getElementById("pre-trip-damage-file");
        if (fileInput) fileInput.value = "";
    }
    lucide.createIcons();
}

function submitPreTripCheck(event) {
    event.preventDefault();
    const modal = document.getElementById("pre-trip-modal");
    const fileInput = document.getElementById("pre-trip-damage-file");

    // JS validacija — svaki checkbox mora biti ručno označen
    const checkboxes = modal ? Array.from(modal.querySelectorAll("input[type='checkbox']")) : [];
    const unchecked = checkboxes.filter(cb => !cb.checked);
    if (unchecked.length > 0) {
        showToast(t("pretrip_all_required") || "Molimo označite sve stavke pregleda.", "error");
        unchecked[0].closest("label").style.border = "1px solid rgba(239,68,68,0.6)";
        setTimeout(() => unchecked[0].closest("label").style.border = "", 2500);
        return;
    }
    
    let damagePhoto = null;
    
    const saveAndClose = () => {
        if (modal) modal.classList.add("hidden");
        sessionStorage.setItem("fleetpulse_pretrip_done", "true");
        
        if (currentUser && currentUser.role === "driver") {
            const driver = state.drivers.find(d => d.name === currentUser.name);
            if (driver) {
                driver.preTripDone = true;
                if (damagePhoto) {
                    driver.damagePhoto = damagePhoto;
                } else {
                    delete driver.damagePhoto;
                }
                saveState();
            }
        }
        showAppLayout();
    };
    
    showConfirm(
        t("confirm_pretrip") || "Submit pre-trip check?",
        function() {
            if (fileInput && fileInput.files && fileInput.files.length > 0) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    damagePhoto = e.target.result;
                    saveAndClose();
                };
                reader.readAsDataURL(fileInput.files[0]);
            } else {
                saveAndClose();
            }
        },
        { danger: false, title: t("pretrip_title") || "Pre-Trip Pregled", confirmText: t("btn_yes") || "Da" }
    );
}

function toggleRoleDirectly() {
    if (currentUser.role === "driver") {
        // Označi trenutnog vozača kao neaktivnog i resetuj proveru pre prelaska u dispečera
        const driver = state.drivers.find(d => d.name === currentUser.name);
        if (driver) {
            driver.active = false;
            driver.preTripDone = false;
            saveState();
        }
        sessionStorage.removeItem("fleetpulse_pretrip_done");
        currentUser.role = "dispatcher";
        currentUser.name = "disp_center";
        currentCalendarMonth = "2026-06"; // Resetuj kalendar na jun pri promeni uloge
    } else {
        currentUser.role = "driver";
        currentUser.name = state.drivers[0].name;
        currentUser.bus = state.drivers[0].bus || state.buses[0].number;
        currentUser.routeId = state.routes[0].id;
        currentUser.currentStopIndex = 0;
        
        // Označi ovog novog vozača kao aktivnog
        const driver = state.drivers.find(d => d.name === currentUser.name);
        if (driver) {
            driver.active = true;
            driver.preTripDone = false;
            saveState();
        }
    }
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    showAppLayout();
}

// --- NAVIGACIJA ---
function switchSection(sectionId) {
    const sections = document.querySelectorAll(".content-section");
    sections.forEach(sec => sec.classList.add("hidden"));

    const target = document.getElementById(sectionId);
    if (target) target.classList.remove("hidden");

    // Uvijek ažuriraj prijevode nakon što sekcija postane vidljiva
    translateUI();
    
    // Ažuriraj sidebar nav
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach(item => item.classList.remove("active"));
    const targetLink = Array.from(navItems).find(item => 
        item.getAttribute("onclick") && item.getAttribute("onclick").includes(sectionId)
    );
    if (targetLink) targetLink.classList.add("active");
    
    // Ažuriraj mobilnu bottom navigaciju
    const mobMap = {
        "driver-dashboard": "mobnav-dashboard",
        "driver-calendar":  "mobnav-calendar",
        "driver-reports":   "mobnav-reports",
        "driver-vacation":  "mobnav-vacation"
    };
    document.querySelectorAll(".mob-nav-btn").forEach(btn => {
        if (!btn.classList.contains("mob-nav-sos")) btn.classList.remove("active");
    });
    if (mobMap[sectionId]) {
        const mobBtn = document.getElementById(mobMap[sectionId]);
        if (mobBtn) mobBtn.classList.add("active");
    }
    
    if (sectionId === "driver-dashboard") {
        renderDriverDashboard();
    } else if (sectionId === "driver-calendar") {
        renderDriverCalendar();
    } else if (sectionId === "driver-vacation") {
        renderDriverVacationHistory();
    } else if (sectionId === "dispatcher-dashboard") {
        renderDispatcherDashboard();
        setTimeout(() => { initDispatcherLiveMap(); }, 100);
    } else if (sectionId === "dispatcher-shifts") {
        renderDispatcherShifts();
    } else if (sectionId === "dispatcher-reports") {
        renderGroupFilterBar("group-filter-bar-reports");
        renderDispatcherReports();
    } else if (sectionId === "dispatcher-lost-found") {
        renderDispatcherLostItems();
    } else if (sectionId === "dispatcher-vacations") {
        renderDispatcherVacations();
    } else if (sectionId === "dispatcher-settings") {
        renderDispatcherSettings();
    } else if (sectionId === "dispatcher-daily-schedule") {
        renderScheduleHistory();
    } else if (sectionId === "dispatcher-messages") {
        populateMessageRecipients("dispatcher-message-form-messages");
        populateTemplateSelect("message-template-messages");
        renderAllMessagesList();
    }

    checkSOSStatus();
    lucide.createIcons();
}

// ============================================================
// SISTEM SMENA — Dispatcher assigns shifts to drivers
// ============================================================

let currentShiftWeekOffset = 0; // 0 = ova nedelja, -1 = prošla, +1 = sledeća

function getWeekDates(offset) {
    const now = new Date();
    const day = now.getDay(); // 0=ned,1=pon,...
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
    }
    return days;
}

function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function shiftWeekNav(direction) {
    if (direction === 0) currentShiftWeekOffset = 0;
    else currentShiftWeekOffset += direction;
    renderDispatcherShifts();
}

function renderDispatcherShifts() {
    // Renderi group filter bar
    renderGroupFilterBar("group-filter-bar-shifts");

    // Filtriraj vozače po grupi
    const filteredDrivers = getVisibleDrivers().filter(d =>
        !state.activeGroupFilter || d.groupId === state.activeGroupFilter
    );

    // Popuni dropdown vozača
    const driverSel = document.getElementById("shift-driver-select");
    if (driverSel) {
        driverSel.innerHTML = "";
        filteredDrivers.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d.name;
            const g = getGroupById(d.groupId);
            opt.innerText = g ? `${d.name} [${g.name}]` : d.name;
            driverSel.appendChild(opt);
        });
    }

    // Postavi default datum na danas
    const dateInput = document.getElementById("shift-date-input");
    if (dateInput && !dateInput.value) dateInput.value = todayDateStr();

    // Prikaži oznaku nedelje
    const weekDays = getWeekDates(currentShiftWeekOffset);
    const label = document.getElementById("shifts-week-label");
    if (label) {
        const from = weekDays[0];
        const to   = weekDays[6];
        label.textContent = `${from.getDate()}.${from.getMonth()+1}. – ${to.getDate()}.${to.getMonth()+1}.${to.getFullYear()}`;
    }

    renderShiftsWeeklyGrid(weekDays);
    lucide.createIcons();
}

function renderShiftsWeeklyGrid(weekDays) {
    const container = document.getElementById("shifts-weekly-grid");
    if (!container) return;

    // Filtriraj vozače po aktivnoj grupi
    const drivers = getVisibleDrivers().filter(d =>
        !state.activeGroupFilter || d.groupId === state.activeGroupFilter
    );

    if (drivers.length === 0) {
        container.innerHTML = `<p class="subtitle">${state.activeGroupFilter ? (t("no_drivers_in_group") || "Nema vozača u ovoj grupi") : t("no_drivers_registered")}</p>`;
        return;
    }

    // Koristi Intl.DateTimeFormat za nazive dana — automatski za sve jezike
    const lang = state.language || "en";
    const localeMap = {
        en: "en-GB", de: "de-AT", sr: "sr-Latn-RS",
        hr: "hr-HR", fr: "fr-FR", it: "it-IT",
        pl: "pl-PL", cs: "cs-CZ"
    };
    const locale = localeMap[lang] || "en-GB";
    // Generiši nazive dana (Mon–Sun) za tekuću nedelju
    const dayNames = Array.from({length: 7}, (_, i) => {
        const monday = new Date(2024, 0, 1); // poznati ponedeljak
        monday.setDate(1 + i);
        return monday.toLocaleDateString(locale, { weekday: "short" });
    });

    const shiftColors = {
        morning:   { bg: "rgba(14,165,233,0.18)", border: "rgba(14,165,233,0.5)", text: "#7dd3fc", icon: "🌅" },
        afternoon: { bg: "rgba(245,158,11,0.18)", border: "rgba(245,158,11,0.5)", text: "#fcd34d", icon: "🌇" },
        night:     { bg: "rgba(139,92,246,0.18)", border: "rgba(139,92,246,0.5)", text: "#c4b5fd", icon: "🌙" },
        off:       { bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", text: "rgba(255,255,255,0.3)", icon: "💤" },
        vacation:  { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)", text: "#6ee7b7", icon: "🏖️" },
        empty:     { bg: "transparent", border: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.15)", icon: "" }
    };

    const todayStr = todayDateStr();

    let html = `<table style="width:100%; border-collapse:separate; border-spacing:4px; min-width:700px;">
        <thead>
            <tr>
                <th style="text-align:left; padding:8px 12px; font-size:0.8rem; color:var(--text-muted); font-weight:600; min-width:130px;">${t("select_driver")}</th>`;

    weekDays.forEach((d, i) => {
        const dStr = dateToStr(d);
        const isToday = dStr === todayStr;
        html += `<th style="text-align:center; padding:8px 4px; font-size:0.75rem; color:${isToday ? "var(--primary-color)" : "var(--text-muted)"}; font-weight:${isToday ? "700" : "500"}; min-width:90px;">
            ${dayNames[i]}<br><span style="font-size:0.85rem; color:${isToday ? "var(--primary-color)" : "var(--text-main)"};">${d.getDate()}.${d.getMonth()+1}.</span>
        </th>`;
    });
    html += `</tr></thead><tbody>`;

    drivers.forEach(driver => {
        const driverGroup = getGroupById(driver.groupId);
        const avatarBg   = driverGroup ? driverGroup.color : "var(--primary-color)";
        html += `<tr>
            <td style="padding:6px 12px; font-size:0.85rem; font-weight:600; color:var(--text-main); vertical-align:middle;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:28px;height:28px;border-radius:50%;background:${avatarBg};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;flex-shrink:0;">${driver.name.charAt(0)}</div>
                    <div>
                        <div>${driver.name.split(" ")[0]}</div>
                        ${driverGroup ? `<div style="font-size:9px;color:${driverGroup.color};font-weight:700;margin-top:1px;">${driverGroup.name}</div>` : ""}
                    </div>
                </div>
            </td>`;

        weekDays.forEach(d => {
            const dStr = dateToStr(d);
            const shift = getShiftForDriverDate(driver.name, dStr);
            const isToday = dStr === todayStr;
            const isPast  = dStr < todayStr;
            const style = shiftColors[shift ? shift.type : "empty"];

            html += `<td style="padding:3px;">
                <div style="background:${style.bg}; border:1px solid ${isToday ? "var(--primary-color)" : style.border};
                     border-radius:8px; padding:6px 4px; text-align:center; min-height:56px;
                     display:flex;flex-direction:column;align-items:center;justify-content:center;
                     position:relative; opacity:${isPast && !shift ? "0.4" : "1"}; cursor:pointer;
                     transition:all 0.15s ease;"
                     onclick="openShiftCell('${driver.name}','${dStr}')"
                     onmouseenter="this.style.opacity='0.8'" onmouseleave="this.style.opacity='${isPast && !shift ? "0.4" : "1"}'">
                    ${shift ? `
                        <span style="font-size:1.1rem;">${style.icon}</span>
                        <span style="font-size:10px;font-weight:600;color:${style.text};margin-top:2px;line-height:1.2;">${shift.name || t("shift_"+shift.type) || shift.type}</span>
                        <button onclick="event.stopPropagation();removeShift('${driver.name}','${dStr}')"
                            style="position:absolute;top:2px;right:2px;background:none;border:none;color:rgba(255,255,255,0.3);cursor:pointer;font-size:10px;padding:1px;line-height:1;"
                            title="${t("btn_delete")}">✕</button>
                    ` : `<span style="font-size:18px;color:rgba(255,255,255,0.1);">+</span>`}
                </div>
            </td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table>
    <div style="margin-top:12px; display:flex; gap:16px; flex-wrap:wrap;">
        ${Object.entries({morning:"🌅",afternoon:"🌇",night:"🌙",off:"💤",vacation:"🏖️"}).map(([k,ic]) =>
            `<span style="font-size:0.75rem; color:var(--text-muted);">${ic} ${t("shift_"+k) || k}</span>`
        ).join("")}
    </div>`;

    container.innerHTML = html;
}

function getShiftForDriverDate(driverName, dateStr) {
    if (!state.shifts) return null;
    return state.shifts.find(s => s.driverName === driverName && s.date === dateStr) || null;
}

function openShiftCell(driverName, dateStr) {
    // Popuni formu sa izabranim vozačem i datumom
    const driverSel = document.getElementById("shift-driver-select");
    const dateInput = document.getElementById("shift-date-input");
    if (driverSel) driverSel.value = driverName;
    if (dateInput) dateInput.value = dateStr;
    // Skroluj do forme
    const form = document.querySelector(".shift-form-grid");
    if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function assignShift() {
    const driverName = document.getElementById("shift-driver-select")?.value;
    const date       = document.getElementById("shift-date-input")?.value;
    const type       = document.getElementById("shift-type-select")?.value;
    const name       = document.getElementById("shift-name-input")?.value?.trim() || "";

    if (!driverName || !date) {
        showToast(t("shift_err_required") || "Izaberite vozača i datum", "error"); return;
    }

    if (!state.shifts) state.shifts = [];

    // Ukloni postojeću smenu za taj dan ako postoji
    state.shifts = state.shifts.filter(s => !(s.driverName === driverName && s.date === date));

    if (type !== "off") { // "off" = slobodan dan, može se prikazati ali i ne mora
        state.shifts.push({
            id:         `shf-${Date.now()}`,
            driverName: driverName,
            date:       date,
            type:       type,
            name:       name,
            confirmedByDriver: false,
            assignedBy: currentUser ? currentUser.name : "Dispečer",
            assignedAt: todayDateStr()
        });
    } else {
        // Slobodan dan — eksplicitno čuvamo
        state.shifts.push({
            id: `shf-${Date.now()}`,
            driverName, date, type: "off", name: name || t("shift_off") || "Slobodan dan",
            confirmedByDriver: false, assignedBy: currentUser?.name, assignedAt: todayDateStr()
        });
    }

    saveState();
    showToast(`✓ ${driverName} — ${date}`, "success");

    // Odmah re-renderuj grid
    const weekDays = getWeekDates(currentShiftWeekOffset);
    renderShiftsWeeklyGrid(weekDays);

    // Resetuj polje oznake
    const nameInput = document.getElementById("shift-name-input");
    if (nameInput) nameInput.value = "";
}

function removeShift(driverName, dateStr) {
    if (!state.shifts) return;
    state.shifts = state.shifts.filter(s => !(s.driverName === driverName && s.date === dateStr));
    saveState();
    const weekDays = getWeekDates(currentShiftWeekOffset);
    renderShiftsWeeklyGrid(weekDays);
    showToast(t("shift_removed") || "Smena uklonjena", "info");
}

function getCurrentShiftForDriver(driverName, yearMonthStr, dayNum) {
    // Prvo provjeri novi sistem smena (state.shifts)
    if (state.shifts && state.shifts.length > 0) {
        const dateStr = `${yearMonthStr}-${String(dayNum).padStart(2,'0')}`;
        const newShift = state.shifts.find(s => s.driverName === driverName && s.date === dateStr);
        if (newShift) return newShift;
    }

    // Fallback: stari sistem sa uploadovanim planovima
    const scheduleKey = `${driverName}_${yearMonthStr}`;
    const schedule = getScheduleByKey(scheduleKey);
    
    if (schedule && schedule.parsedShifts && schedule.parsedShifts[dayNum]) {
        return schedule.parsedShifts[dayNum];
    }
    
    if (driverName === "Boban Canić" && yearMonthStr === "2026-06") {
        const bobanShifts = {
            2:  { type: "vacation", name: t("shift_vacation") || "Vacation" },
            4:  { type: "morning",  name: "320.S08 (Bus 91103)" },
            5:  { type: "morning",  name: "320.S06 (Bus 91105)" },
            6:  { type: "morning",  name: "320.S08 (Bus 91103)" },
            7:  { type: "morning",  name: "320.S06 (Bus 91105)" },
            8:  { type: "morning",  name: "320.S08 (Bus 91103)" },
            9:  { type: "off",      name: t("shift_off") || "Day off" },
            11: { type: "morning",  name: "320.S09 (Bus 91103)" },
            12: { type: "afternoon",name: "320.S05 (Bus 91104)" },
            13: { type: "morning",  name: "320.S07 (Bus 91105)" },
            15: { type: "vacation", name: t("shift_vacation") || "Vacation" },
            16: { type: "off",      name: t("shift_off") || "Day off" },
            18: { type: "afternoon",name: "320.S05 (Bus 91103)" },
            19: { type: "afternoon",name: "320.S07 (Bus 91104)" },
            20: { type: "morning",  name: "320.S09 (Bus 91105)" },
            21: { type: "afternoon",name: "320.S05 (Bus 91103)" },
            22: { type: "afternoon",name: "320.S07 (Bus 91104)" },
            24: { type: "morning",  name: "320.701 (Bus 91103)" },
            25: { type: "morning",  name: "320.S06 (Bus 91103)" },
            26: { type: "afternoon",name: "320.S08 (Bus 91104)" },
            27: { type: "morning",  name: "320.S06 (Bus 91103)" },
            28: { type: "afternoon",name: "320.S08 (Bus 91104)" },
            29: { type: "morning",  name: "320.S06 (Bus 91103)" },
            30: { type: "vacation", name: t("shift_vacation") || "Vacation" }
        };
        return bobanShifts[dayNum] || { type: "off", name: t("shift_off") };
    }
    
    const patternIndex = dayNum % 5;
    if (patternIndex === 1 || patternIndex === 2) {
        return { type: "morning", name: `310.S0${dayNum % 2 + 1} (Bus 91022)` };
    } else if (patternIndex === 3 || patternIndex === 4) {
        return { type: "afternoon", name: `310.S0${dayNum % 2 + 3} (Bus 91015)` };
    } else {
        return { type: "off", name: t("shift_off") };
    }
}

// --- KONTROLNA TABLA VOZAČA (DRIVER DASHBOARD) ---
function renderDriverDashboard() {
    // Prikaz dnevnog rasporeda od dispečera
    if (typeof loadDriverScheduleForToday === 'function') loadDriverScheduleForToday();

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthNum = today.getMonth() + 1; // 1-12
    const currentDay = today.getDate();
    
    // Za potrebe simulacije, ako smo u junu 2026, koristimo to
    const simulatedYearMonth = "2026-06";
    const todayShift = getCurrentShiftForDriver(currentUser.name, simulatedYearMonth, currentDay);
    
    if (todayShift && todayShift.type !== "off" && todayShift.type !== "vacation") {
        const parsedBus = todayShift.name.match(/\b(91\d{3})\b/);
        if (parsedBus) currentUser.bus = parsedBus[1];
        
        const lineCode = todayShift.name.match(/^(\d{3})/);
        if (lineCode) {
            const foundRoute = state.routes.find(r => r.number === lineCode[1]);
            if (foundRoute) {
                currentUser.routeId = foundRoute.id;
            }
        }
        
        document.getElementById("driver-shift-type").innerText = todayShift.type === "morning" ? t("shift_morning") : t("shift_afternoon");
    } else {
        document.getElementById("driver-shift-type").innerText = t("shift_off");
    }
    
    const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
    
    document.getElementById("driver-route-num").innerText = route.number;
    document.getElementById("driver-route-name").innerText = route.name;
    document.getElementById("driver-bus-num").innerText = currentUser.bus;
    
    const activeDelay = state.reports.find(r => r.driver === currentUser.name && r.status === "Aktivno" && r.type.includes("Kašnjenje"));
    const delayStatusLabel = document.getElementById("driver-delay-status");
    if (activeDelay) {
        const mins = activeDelay.type.startsWith("delay:") ? activeDelay.type.replace("delay:", "") : (activeDelay.type.match(/\d+/) ? activeDelay.type.match(/\d+/)[0] : "15");
        const minVal = mins;
        delayStatusLabel.innerText = t("status_delay_fmt", { min: minVal });
        delayStatusLabel.className = "status-delay";
    } else {
        delayStatusLabel.innerText = t("status_no_delay");
        delayStatusLabel.className = "status-ok";
    }
    
    const lang = state.language || "en";
    const localeMap = {
        en: "en-GB", de: "de-AT", sr: "sr-Latn-RS",
        hr: "hr-HR", fr: "fr-FR", it: "it-IT",
        pl: "pl-PL", cs: "cs-CZ"
    };
    const locale = localeMap[lang] || "en-GB";
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById("current-date-badge").innerText = new Date().toLocaleDateString(locale, options);
    
    renderStopsTimeline(route.stops);
    renderDriverMessages();
    checkSOSStatus();
}

function renderStopsTimeline(stops) {
    const container = document.getElementById("stops-timeline-container");
    if (!container) return;
    container.innerHTML = "";
    
    stops.forEach((stop, index) => {
        const div = document.createElement("div");
        div.className = "stop-item";
        
        if (index < currentUser.currentStopIndex) {
            div.classList.add("passed");
        } else if (index === currentUser.currentStopIndex) {
            div.classList.add("next");
        }
        
        div.onclick = () => checkInAtStop(index);
        
        let stopStatusText = t("stop_planned");
        if (index < currentUser.currentStopIndex) {
            stopStatusText = `<i class="lucide-icon" data-lucide="check" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>` + t("stop_passed");
        } else if (index === currentUser.currentStopIndex) {
            stopStatusText = t("stop_next");
        }
        
        div.innerHTML = `
            <div class="stop-marker"></div>
            <div class="stop-info">
                <span class="stop-name">${stop}</span>
                <span class="stop-time">${stopStatusText}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

function checkInAtStop(index) {
    const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
    
    if (index === currentUser.currentStopIndex) {
        currentUser.currentStopIndex++;
        if (currentUser.currentStopIndex >= route.stops.length) {
            showToast(t("js_alert_route_done"), "success");
            currentUser.currentStopIndex = 0;
        }
        sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
        renderDriverDashboard();
        lucide.createIcons();
    }
}

function resetRouteProgress() {
    currentUser.currentStopIndex = 0;
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    renderDriverDashboard();
    lucide.createIcons();
}

// --- HITAN SOS ALARM LOGIKA ---
function triggerSOSAlert() {
    const modal = document.getElementById("sos-trigger-modal");
    if (!modal) return;
    // Translate modal text
    const titleEl = modal.querySelector("[data-i18n='sos_trigger_title']");
    const bodyEl  = modal.querySelector("[data-i18n='js_confirm_sos']");
    const btnEl   = modal.querySelector("[data-i18n='sos_trigger_btn']");
    if (titleEl) titleEl.textContent = t("sos_trigger_title") || "SOS ALARM";
    if (bodyEl)  bodyEl.textContent  = t("js_confirm_sos");
    if (btnEl)   btnEl.textContent   = t("sos_trigger_btn") || "🚨 SEND SOS";
    modal.classList.remove("hidden");
    lucide.createIcons();
}

function closeSosTriggerModal() {
    const modal = document.getElementById("sos-trigger-modal");
    if (modal) modal.classList.add("hidden");
}

function confirmSOSTrigger() {
    closeSosTriggerModal();
    state.sosActive = true;
    state.sosDriver = currentUser.name;
    state.sosBus = currentUser.bus;
    saveState();
    checkSOSStatus();
    showToast(t("js_alert_sos_sent") || "SOS alarm sent!", "error");
}

function checkSOSStatus() {
    const dispBanner = document.getElementById("dispatcher-sos-banner");
    const driverBanner = document.getElementById("driver-sos-banner");

    if (state.sosActive) {
        if (currentUser && currentUser.role === "dispatcher") {
            if (dispBanner) {
                // Inline styles — zaobilazi svaki CSS specificity ili cache problem
                dispBanner.style.cssText = `
                    display: flex !important;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 16px 24px;
                    background-color: #b91c1c;
                    border-bottom: 3px solid #fca5a5;
                    animation: sosPulse 0.8s ease-in-out infinite, sosBorderPulse 0.8s ease-in-out infinite;
                    position: relative;
                    z-index: 9000;
                `;
                dispBanner.classList.remove("hidden");

                // Popuni podatke o vozaču i busu
                const infoEl = document.getElementById("dispatcher-sos-info");
                if (infoEl) {
                    infoEl.style.cssText = "display:block; color:#fff; font-size:0.92rem; font-weight:600; margin-top:4px;";
                    infoEl.innerText = `🚌 ${t("vehicle")} ${state.sosBus} — ${state.sosDriver}`;
                }

                // Titl
                const titleEl = dispBanner.querySelector("strong");
                if (titleEl) {
                    titleEl.style.cssText = "display:block; color:#fff; font-size:1.05rem; font-weight:900; letter-spacing:1px; text-transform:uppercase;";
                    titleEl.innerText = "⚠ " + t("sos_alert_title");
                }

                // Dugme
                const btn = dispBanner.querySelector(".btn-sos-resolve");
                if (btn) {
                    btn.style.cssText = `
                        background: white;
                        color: #b91c1c;
                        border: none;
                        padding: 10px 22px;
                        border-radius: 10px;
                        font-size: 0.88rem;
                        font-weight: 800;
                        cursor: pointer;
                        white-space: nowrap;
                        font-family: 'Outfit', sans-serif;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                        flex-shrink: 0;
                    `;
                }

                // Ikona
                const icon = dispBanner.querySelector(".pulse-icon");
                if (icon) {
                    icon.style.cssText = "color:#fff; width:32px; height:32px; flex-shrink:0; animation: sosIconPulse 0.8s ease-in-out infinite;";
                }

                startSOSSiren();
            }
            if (driverBanner) driverBanner.classList.add("hidden");

        } else if (currentUser && currentUser.role === "driver" && currentUser.name === state.sosDriver) {
            if (driverBanner) driverBanner.classList.remove("hidden");
            if (dispBanner) { dispBanner.style.display = "none"; }
        } else {
            if (dispBanner) { dispBanner.style.display = "none"; }
            if (driverBanner) driverBanner.classList.add("hidden");
        }
    } else {
        if (dispBanner) {
            dispBanner.style.display = "none";
            dispBanner.classList.add("hidden");
        }
        if (driverBanner) driverBanner.classList.add("hidden");
        stopSOSSiren();
    }
}

function resolveSOS() {
    state.sosActive = false;
    state.sosDriver = "";
    state.sosBus = "";
    saveState();
    
    checkSOSStatus();
    showToast(t("js_alert_sos_resolved"), "success");
}

// --- PORUKE OD DISPEČERA ---
function renderDriverMessages() {
    const container = document.getElementById("driver-messages-list-container");
    const badge = document.getElementById("unread-message-badge");

    if (!container) return;

    container.innerHTML = "";

    // Osveži arhiv sekciju svaki put
    renderDriverMessageArchive();

    const myMessages = state.messages.filter(m => m.recipient === currentUser.name || m.recipient === "Svi");
    const unreadMessages = myMessages.filter(m => !m.read);
    const unreadCount = unreadMessages.length;
    
    if (unreadCount > 0) {
        badge.classList.remove("hidden");
        const modal = document.getElementById("msg-fullscreen-alert");
        if (modal && modal.classList.contains("hidden")) {
            showFullscreenMessageAlert(unreadMessages[0], unreadCount);
        }
    } else {
        badge.classList.add("hidden");
        const modal = document.getElementById("msg-fullscreen-alert");
        if (modal) {
            modal.classList.add("hidden");
        }
    }
    
    // Pročitaj nepročitane poruke glasom (TTS)
    let spoken = [];
    try {
        const savedSpoken = sessionStorage.getItem("fleetpulse_spoken_messages");
        if (savedSpoken) spoken = JSON.parse(savedSpoken);
    } catch(e) {}
    
    unreadMessages.forEach(msg => {
        if (!spoken.includes(msg.id)) {
            playNotificationSound();
            speakMessage(msgText(msg, state.language), state.language);
            spoken.push(msg.id);
        }
    });
    sessionStorage.setItem("fleetpulse_spoken_messages", JSON.stringify(spoken));
    
    if (myMessages.length === 0) {
        container.innerHTML = `<div class="no-messages-text">${t("no_messages")}</div>`;
        return;
    }
    
    myMessages.forEach(msg => {
        const div = document.createElement("div");
        div.className = `message-item ${msg.read ? 'msg-read' : 'msg-unread'}`;
        
        let markReadBtn = "";
        if (!msg.read) {
            markReadBtn = `<button class="btn-mark-read" onclick="markMessageAsRead('${msg.id}')"><i data-lucide="check"></i> ${t("btn_mark_read")}</button>`;
        }
        
        div.innerHTML = `
            <div class="message-item-header">
                <span class="message-sender"><i data-lucide="shield" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i>${t("msg_from_dispatcher")}</span>
                <span class="message-time">${formatDateTime(msg.date, msg.time)}</span>
            </div>
            <div class="message-text">${msgText(msg, state.language)}</div>
            ${markReadBtn}
        `;
        container.appendChild(div);
    });
}

function markMessageAsRead(id) {
    const msg = state.messages.find(m => m.id === id);
    if (msg) {
        msg.read = true;
        saveState();
        renderDriverMessages();
        lucide.createIcons();
    }
}

// Reprodukcija zvuka obaveštenja pomoću Web Audio API-ja (ne zahteva preuzimanje audio fajlova)
function playNotificationSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // Ton 1: C5 (523.25 Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
        gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.15);
        
        // Ton 2: E5 (659.25 Hz) započinje sa malim zakašnjenjem
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
        osc2.start(audioCtx.currentTime + 0.12);
        osc2.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
        console.warn("Neuspelo pokretanje AudioContext:", e);
    }
}

// Ažuriranje slika avatara na celom interfejsu (header + profil kartica)
function updateAvatarUI() {
    if (!currentUser) return;
    
    let avatarUrl = "";
    if (currentUser.role === "driver") {
        const driver = state.drivers.find(d => d.name === currentUser.name);
        if (driver && driver.avatar) {
            avatarUrl = driver.avatar;
        }
    }
    
    const headerImg = document.getElementById("header-user-avatar-img");
    const headerPlaceholder = document.getElementById("header-user-avatar-placeholder");
    const dashImg = document.getElementById("driver-dashboard-avatar-img");
    const dashPlaceholder = document.getElementById("driver-dashboard-avatar-placeholder");
    const profileName = document.getElementById("driver-profile-name");
    const profileBus = document.getElementById("driver-profile-bus");

    // Header avatar
    if (headerImg && headerPlaceholder) {
        if (avatarUrl) {
            headerImg.src = avatarUrl;
            headerImg.classList.remove("hidden");
            headerPlaceholder.classList.add("hidden");
        } else {
            headerImg.classList.add("hidden");
            headerPlaceholder.classList.remove("hidden");
        }
    }
    
    // Dashboard profile card (samo za vozača)
    if (currentUser.role === "driver") {
        if (profileName) profileName.textContent = currentUser.name;
        if (profileBus) profileBus.textContent = currentUser.bus || "-";
        
        if (dashImg && dashPlaceholder) {
            if (avatarUrl) {
                dashImg.src = avatarUrl;
                dashImg.classList.remove("hidden");
                dashPlaceholder.classList.add("hidden");
            } else {
                dashImg.classList.add("hidden");
                dashPlaceholder.classList.remove("hidden");
            }
        }
    }
}

// Pokretanje izbora fajla za sliku profila
function triggerAvatarUpload() {
    const fileInput = document.getElementById("driver-avatar-file-input");
    if (fileInput) fileInput.click();
}

// Obrada učitane slike, promena veličine i kompresija
function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
        showToast("Dozvoljeni su samo slikovni fajlovi (jpg/png).", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            
            const max_size = 180; // Maksimalna širina/visina u pikselima
            let width = img.width;
            let height = img.height;
            
            if (width > height) {
                if (width > max_size) {
                    height *= max_size / width;
                    width = max_size;
                }
            } else {
                if (height > max_size) {
                    width *= max_size / height;
                    height = max_size;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // Kompresija na JPEG sa 80% kvaliteta da bi fajl bio lagan za localStorage (do 15kb)
            const compressedBase64 = canvas.toDataURL("image/jpeg", 0.80);
            
            if (currentUser && currentUser.role === "driver") {
                const driver = state.drivers.find(d => d.name === currentUser.name);
                if (driver) {
                    driver.avatar = compressedBase64;
                    saveState();
                    updateAvatarUI();
                    
                    let msg = "Fotografija uspešno ažurirana!";
                    if (state.language === "de") msg = "Profilbild erfolgreich aktualisiert!";
                    else if (state.language === "en") msg = "Profile picture updated successfully!";
                    showToast(msg, "success");
                }
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Prikazivanje full-screen panela za hitne/nove poruke dispečera
function showFullscreenMessageAlert(msg, totalCount) {
    const modal = document.getElementById("msg-fullscreen-alert");
    const sender = document.getElementById("msg-alert-sender");
    const text = document.getElementById("msg-alert-text");
    const time = document.getElementById("msg-alert-time");
    const more = document.getElementById("msg-alert-more");

    if (!modal) return;

    modal.dataset.msgId = msg.id;
    if (sender) sender.textContent = msg.sender || "Dispe\u010der";
    if (text) text.textContent = msgText(msg, state.language);
    
    if (time) {
        time.textContent = typeof formatDateTime === "function" 
            ? formatDateTime(msg.date, msg.time) 
            : (msg.date + " " + msg.time);
    }

    if (more) {
        if (totalCount > 1) {
            let label = "+ " + (totalCount - 1) + " ";
            if (state.language === "de") {
                label += "weitere Nachrichten";
            } else if (state.language === "en") {
                label += "more messages";
            } else {
                label += "još poruka";
            }
            more.textContent = label;
            more.classList.remove("hidden");
        } else {
            more.classList.add("hidden");
        }
    }

    modal.classList.remove("hidden");
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Potvrda čitanja poruke sa full-screen ekrana
function confirmMessageRead() {
    const modal = document.getElementById("msg-fullscreen-alert");
    if (!modal) return;
    const msgId = modal.dataset.msgId;
    if (msgId) {
        markMessageAsRead(msgId);
    }
    modal.classList.add("hidden");
}

// Arhiviraj jednu poruku (vozačka strana)
function archiveMessage(id) {
    const msg = state.messages.find(m => m.id === id);
    if (!msg) return;
    if (!msg.archivedBy) msg.archivedBy = [];
    if (!msg.archivedBy.includes(currentUser.name)) {
        msg.archivedBy.push(currentUser.name);
    }
    saveState();
    renderDriverMessages();
    renderDriverMessageArchive();
    lucide.createIcons();
}

// Arhiviraj sve pročitane poruke vozača odjednom
function archiveReadMessages() {
    const myRead = state.messages.filter(m =>
        (m.recipient === currentUser.name || m.recipient === "Svi" || m.recipient === "all") &&
        m.read && !(m.archivedBy && m.archivedBy.includes(currentUser.name))
    );
    if (myRead.length === 0) return;
    myRead.forEach(msg => {
        if (!msg.archivedBy) msg.archivedBy = [];
        msg.archivedBy.push(currentUser.name);
    });
    saveState();
    renderDriverMessages();
    renderDriverMessageArchive();
    showToast(t("messages_archived") || "Messages archived", "success");
    lucide.createIcons();
}

// Prikaži arhiv poruka (sklopivi accordion ispod aktivnih poruka)
function renderDriverMessageArchive() {
    let archiveSection = document.getElementById("driver-messages-archive");
    if (!archiveSection) return; // HTML element mora postojati

    const archived = state.messages.filter(m =>
        (m.recipient === currentUser.name || m.recipient === "Svi" || m.recipient === "all") &&
        m.archivedBy && m.archivedBy.includes(currentUser.name)
    );

    if (archived.length === 0) {
        archiveSection.innerHTML = "";
        return;
    }

    archiveSection.innerHTML = `
        <details style="margin-top:12px;">
            <summary style="cursor:pointer; font-size:0.78rem; color:var(--text-muted);
                padding:6px 10px; background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.06); border-radius:8px;
                display:flex; align-items:center; gap:6px; list-style:none; user-select:none;">
                📁 ${t("archive_label") || "Archive"} (${archived.length})
            </summary>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                ${archived.map(msg => `
                    <div style="background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.04);
                        border-radius:6px; padding:8px 10px; opacity:0.65;">
                        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted); margin-bottom:4px;">
                            <span>📨 ${t("msg_from_dispatcher") || "Dispatcher"}</span>
                            <span>${formatDateTime(msg.date, msg.time)}</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(msgText(msg, state.language))}</div>
                    </div>
                `).join("")}
            </div>
        </details>
    `;
}

// --- SUTRAŠNJA SMENA & POTVRDA ---
function renderTomorrowShiftForDriver() {
    const container = document.getElementById("driver-next-shift-container");
    if (!container) return;
    
    const myShift = (state.tomorrowShifts || []).find(s => s.driver === currentUser.name);
    if (!myShift) {
        container.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">${t("no_shift_tomorrow") || "No shift scheduled for tomorrow."}</div>`;
        return;
    }
    
    const isConfirmed = myShift.confirmed;
    
    container.innerHTML = `
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 15px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">${t("duty_number")}:</span>
                <span style="font-weight: 700; color: var(--primary-color); font-size: 1.1rem; background: rgba(var(--primary-rgb), 0.1); padding: 2px 8px; border-radius: 4px;">${myShift.shift}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">${t("vehicle")}:</span>
                <span style="font-weight: 600; color: var(--text-main);"><i data-lucide="bus" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i>${myShift.bus}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
                <span style="font-size: 0.85rem; color: var(--text-muted); font-weight: 500;">Status:</span>
                ${isConfirmed 
                    ? `<span style="font-size: 0.85rem; color: var(--success-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> ${t("status_confirmed")}
                       </span>`
                    : `<span style="font-size: 0.85rem; color: var(--warning-color); font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="clock" style="width: 14px; height: 14px;"></i> ${t("status_pending_confirmation")}
                       </span>`
                }
            </div>
            ${!isConfirmed 
                ? `<button onclick="confirmTomorrowShift('${currentUser.name}')" class="btn-primary" style="margin-top: 5px; font-size: 0.9rem; padding: 8px 12px; height: auto; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <i data-lucide="check-square" style="width: 14px; height: 14px;"></i> ${t("btn_confirm_shift")}
                   </button>`
                : ''
            }
        </div>
    `;
    lucide.createIcons();
}

function confirmTomorrowShift(driverName) {
    const shift = (state.tomorrowShifts || []).find(s => s.driver === driverName);
    if (shift) {
        shift.confirmed = true;
        saveState();
        if (currentUser && currentUser.role === "driver") {
            renderTomorrowShiftForDriver();
        } else if (currentUser && currentUser.role === "dispatcher") {
            renderDispatcherShiftsConfirmation();
        }
        showToast(t("status_confirmed") || "Shift confirmed!", "success", 3000);
    }
}
function renderDispatcherShiftsConfirmation() {
    const container = document.getElementById("dispatcher-confirm-shifts-list");
    if (!container) return;
    container.innerHTML = "";
    
    (state.tomorrowShifts || []).forEach(shift => {
        const div = document.createElement("div");
        div.className = "confirm-shift-item";
        div.style.cssText = "background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 12px; display: flex; justify-content: space-between; align-items: center;";
        
        const isConfirmed = shift.confirmed;
        
        div.innerHTML = `
            <div>
                <div style="font-weight:600; color:var(--text-main);">${shift.driver}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
                    ${t("shift")}: <strong style="color:var(--primary-color);">${shift.shift}</strong> | ${t("label_bus")}: <strong>${shift.bus}</strong>
                </div>
            </div>
            <div>
                ${isConfirmed 
                    ? `<span style="color:var(--success-color); font-weight:600; font-size:0.85rem; display:flex; align-items:center; gap:4px;">
                        <i data-lucide="check-circle" style="width:14px; height:14px;"></i> ${t("status_confirmed")}
                       </span>`
                    : `<button onclick="confirmTomorrowShift('${shift.driver}')" class="btn-table-action" style="padding: 4px 8px; font-size: 0.8rem;">
                        <i data-lucide="check" style="width:12px; height:12px; margin-right:4px;"></i> ${t("btn_confirm_shift")}
                       </button>`
                }
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();
}

// --- KALENDAR VOZAČA ---
function renderDriverCalendar() {
    const container = document.getElementById("calendar-days-container");
    container.innerHTML = "";
    
    // Proveri da li postoji okačeni plan rada za ovog vozača za Jun 2026
    const downloadCard = document.getElementById("driver-schedule-download-card");
    const filenameLabel = document.getElementById("driver-schedule-filename");
    
    if (downloadCard && filenameLabel) {
        const scheduleKey = `${currentUser.name}_2026-06`;
        const schedule = getScheduleByKey(scheduleKey);
        
        if (schedule) {
            downloadCard.style.display = "flex";
            filenameLabel.innerText = `${schedule.fileName} (${(schedule.fileData.length / 1024 * 0.75).toFixed(1)} KB)`;
        } else {
            downloadCard.style.display = "none";
        }
    }

    const totalDays = 30;
    
    const lang = state.language || "sr";
    const monthNames = {
        sr: "Jun 2026", hr: "Lipanj 2026", en: "June 2026", de: "Juni 2026",
        fr: "Juin 2026", it: "Giugno 2026", es: "Junio 2026", pl: "Czerwiec 2026",
        cs: "Červen 2026", sk: "Jún 2026", nl: "Juni 2026", tr: "Haziran 2026",
        pt: "Junho 2026", ro: "Iunie 2026", hu: "Június 2026", bg: "Юни 2026"
    };
    document.getElementById("calendar-month-year").innerText = monthNames[lang] || "June 2026";
    
    const approvedVacations = state.vacations.filter(v => v.driver === currentUser.name && (v.status === "approved" || v.status === "Odobreno"));
    
    // Izračunaj pomeraj za prvi dan u mesecu (evropska sedmica: Ponedeljak = 1, Nedelja = 7)
    const firstDayDate = new Date(`${currentCalendarMonth}-01`);
    let startDayOfWeek = firstDayDate.getDay(); 
    if (startDayOfWeek === 0) startDayOfWeek = 7;
    const offset = startDayOfWeek - 1;
    
    // Dodaj prazne ćelije za dane koji pripadaju prvoj nepotpunoj sedmici
    for (let i = 0; i < offset; i++) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "calendar-day empty-day";
        emptyDiv.style.opacity = "0.2";
        emptyDiv.style.pointerEvents = "none";
        emptyDiv.innerHTML = `<span class="day-number" style="opacity:0.2;">-</span>`;
        container.appendChild(emptyDiv);
    }
    
    for (let day = 1; day <= totalDays; day++) {
        const div = document.createElement("div");
        div.className = "calendar-day";
        
        const dateStr = `2026-06-${day.toString().padStart(2, '0')}`;
        
        let isOnVacation = false;
        approvedVacations.forEach(v => {
            if (dateStr >= v.start && dateStr <= v.end) {
                isOnVacation = true;
            }
        });
        
        let shiftClass = "";
        let shiftName = "";
        
        if (currentUser.name === "Canic Boban") {
            const bobanShifts = {
                2: { type: "vacation", name: "Urlaub" },
                4: { type: "morning", name: "320.S08 (Bus 91103)" },
                5: { type: "morning", name: "320.S06 (Bus 91105)" },
                6: { type: "morning", name: "320.S08 (Bus 91103)" },
                7: { type: "morning", name: "320.S06 (Bus 91105)" },
                8: { type: "morning", name: "320.S08 (Bus 91103)" },
                9: { type: "off", name: "Abwesenheit (unbez.)" },
                11: { type: "morning", name: "320.S09 (Bus 91103)" },
                12: { type: "afternoon", name: "320.S05 (Bus 91104)" },
                13: { type: "morning", name: "320.S07 (Bus 91105)" },
                15: { type: "vacation", name: "Urlaub" },
                16: { type: "off", name: "Abwesenheit (unbez.)" },
                18: { type: "afternoon", name: "320.S05 (Bus 91103)" },
                19: { type: "afternoon", name: "320.S07 (Bus 91104)" },
                20: { type: "morning", name: "320.S09 (Bus 91105)" },
                21: { type: "afternoon", name: "320.S05 (Bus 91103)" },
                22: { type: "afternoon", name: "320.S07 (Bus 91104)" },
                24: { type: "morning", name: "320.701 (Bus 91103)" },
                26: { type: "afternoon", name: "320.S08 (Bus 91104)" },
                27: { type: "morning", name: "320.S06 (Bus 91103)" },
                28: { type: "afternoon", name: "320.S08 (Bus 91104)" },
                29: { type: "morning", name: "320.S06 (Bus 91103)" },
                30: { type: "vacation", name: "Urlaub" }
            };
            
            const shift = bobanShifts[day];
            if (shift) {
                shiftClass = shift.type;
                shiftName = shift.name;
            } else {
                shiftClass = "off";
                shiftName = t("shift_off");
            }
        } else if (isOnVacation) {
            shiftClass = "vacation";
            shiftName = t("shift_vacation");
        } else {
            const patternIndex = day % 5;
            if (patternIndex === 1 || patternIndex === 2) {
                shiftClass = "morning";
                shiftName = t("shift_morning");
            } else if (patternIndex === 3 || patternIndex === 4) {
                shiftClass = "afternoon";
                shiftName = t("shift_afternoon");
            } else {
                shiftClass = "off";
                shiftName = t("shift_off");
            }
        }
        
        div.innerHTML = `
            <span class="day-number">${day}</span>
            <div class="day-info ${shiftClass}" style="font-size:0.7rem; line-height:1.1; padding:2px;">${shiftName}</div>
        `;
        
        container.appendChild(div);
    }
}

// --- PRIJAVA KVAROVA I KAŠNJENJA ---
function submitDelayReport(event) {
    event.preventDefault();
    const time = document.getElementById("delay-time").value;
    const reason = document.getElementById("delay-reason").value;
    const desc = document.getElementById("delay-desc").value.trim();
    
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newReport = {
        id: `rep-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: `Kašnjenje: ${time} minuta`,
        reason: `${reason}${desc ? ' - ' + desc : ''}`,
        severity: time >= 20 ? "Srednja" : "Niska",
        status: "Aktivno"
    };
    
    state.reports.unshift(newReport);
    saveState();
    
    document.getElementById("delay-report-form").reset();
    showToast(t("js_alert_delay_sent"), "success");
    switchSection("driver-dashboard");
}

function submitBreakdownReport(event) {
    event.preventDefault();
    const type = document.getElementById("breakdown-type").value;
    const severity = document.getElementById("breakdown-severity").value;
    const desc = document.getElementById("breakdown-desc").value.trim();
    
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const newReport = {
        id: `rep-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: `KVAR: ${type}`,
        reason: desc,
        severity: severity,
        status: "active"
    };
    
    state.reports.unshift(newReport);
    saveState();
    
    document.getElementById("breakdown-report-form").reset();
    showToast(t("js_alert_breakdown_sent"), "success");
    switchSection("driver-dashboard");
}

// --- PRIJAVA IZGUBLJENIH STVARI ---
function submitLostItem(event) {
    event.preventDefault();
    const type = document.getElementById("lost-item-type").value; // već je ključ (lost_wallet itd.)
    const location = document.getElementById("lost-item-location").value.trim();
    const desc = document.getElementById("lost-item-desc").value.trim();

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const newItem = {
        id: `lost-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: type,           // translation ključ: "lost_wallet", "lost_tech", itd.
        location: location,
        desc: desc,
        status: "status_in_depot"  // translation ključ
    };
    
    state.lostItems.unshift(newItem);
    saveState();
    
    document.getElementById("lost-item-form").reset();
    showToast(t("js_alert_lost_sent"), "success");
    switchSection("driver-dashboard");
}

// --- GODIŠNJI ODMORI ---
function submitVacationRequest(event) {
    event.preventDefault();
    const startVal = document.getElementById("vacation-start").value;
    const endVal = document.getElementById("vacation-end").value;
    const type = document.getElementById("vacation-type").value;
    const reason = document.getElementById("vacation-reason").value.trim();
    
    if (new Date(startVal) > new Date(endVal)) {
        showToast(t("js_alert_date_err"), "error");
        return;
    }
    
    const diffTime = Math.abs(new Date(endVal) - new Date(startVal));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const newRequest = {
        id: `vac-${Date.now()}`,
        driver: currentUser.name,
        type: type,
        start: startVal,
        end: endVal,
        days: diffDays,
        reason: reason || "Bez dodatnog obrazloženja",
        status: "Na čekanju"
    };
    
    showConfirm(
        t("confirm_vacation_request") || "Submit vacation request?",
        function() {
            state.vacations.unshift(newRequest);
            saveState();
            document.getElementById("vacation-form").reset();
            showToast(t("js_alert_vacation_sent"), "success");
            renderDriverVacationHistory();
        },
        { danger: false, title: t("nav_vacation") || "Odmor", confirmText: t("btn_yes") || "Da" }
    );
}

function renderDriverVacationHistory() {
    const tbody = document.getElementById("driver-vacation-history");
    tbody.innerHTML = "";
    
    const myRequests = state.vacations.filter(v => v.driver === currentUser.name);
    
    if (myRequests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">${t("js_no_history")}</td></tr>`;
        return;
    }
    
    myRequests.forEach(req => {
        const tr = document.createElement("tr");
        
        let statusBadge = "";
        if (req.status === "Na čekanju") statusBadge = `<span class="badge pending">${t("js_status_pending")}</span>`;
        else if (req.status === "Odobreno") statusBadge = `<span class="badge approved">${t("js_status_approved")}</span>`;
        else statusBadge = `<span class="badge rejected">${t("js_status_rejected")}</span>`;
        
        let translatedType = t(req.type);
        
        tr.innerHTML = `
            <td><strong>${translatedType}</strong></td>
            <td>${formatDate(req.start)} - ${formatDate(req.end)}</td>
            <td>${req.days} ${t("table_days").toLowerCase()}</td>
            <td>${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- DISPEČERSKI PANEL (DISPATCHER DASHBOARD) ---
function renderDispatcherDashboard() {
    const activeBusesCount = state.buses.length;
    const openReportsCount = state.reports.filter(r => r.status === "Aktivno").length;
    const pendingVacationsCount = state.vacations.filter(v => v.status === "Na čekanju").length;
    
    document.getElementById("stat-active-buses").innerText = activeBusesCount;
    document.getElementById("stat-open-reports").innerText = openReportsCount;
    document.getElementById("stat-pending-vacations").innerText = pendingVacationsCount;
    
    // Live Alerts
    const alertsContainer = document.getElementById("dispatcher-live-alerts");
    alertsContainer.innerHTML = "";
    
    if (state.reports.length === 0) {
        alertsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">${t("js_no_alerts")}</div>`;
    } else {
        state.reports.slice(0, 5).forEach(rep => {
            const div = document.createElement("div");
            const isBreakdown = rep.type.includes("KVAR") || rep.type.includes("Breakdown");
            div.className = `alert-item ${isBreakdown ? 'alert-breakdown' : 'alert-delay'} ${rep.status === 'Rešeno' ? 'alert-item-resolved' : ''}`;
            
            let displayType = rep.type;
            if (rep.type.includes("Kašnjenje")) {
                const mins = rep.type.match(/\d+/);
                displayType = t("report_delay_title") + `: ${mins ? mins[0] : "15"} min`;
            } else if (rep.type.includes("KVAR")) {
                const category = rep.type.replace("KVAR: ", "");
                displayType = t("report_breakdown_title") + ": " + t(category);
            }
            
            let displayReason = rep.reason;
            const parts = rep.reason.split(" - ");
            if (parts.length > 0) {
                parts[0] = t(parts[0]);
                displayReason = parts.join(" - ");
            }
            
            div.innerHTML = `
                <div class="alert-item-icon">
                    <i data-lucide="${isBreakdown ? 'alert-octagon' : 'clock'}"></i>
                </div>
                <div class="alert-item-content">
                    <div class="alert-item-title">
                        <span>${displayType}</span>
                        <span class="alert-item-time">${formatDateTime(rep.date, rep.time)}</span>
                    </div>
                    <span class="alert-item-desc">${displayReason}</span>
                    <span class="alert-item-meta">${t("driver")}: <strong>${rep.driver}</strong> | ${t("vehicle")}: <strong>${rep.bus}</strong></span>
                </div>
            `;
            alertsContainer.appendChild(div);
        });
    }
    
    // Inicijalizacija selektora primalaca i šablona poruka — oba formulara
    populateMessageRecipients("dispatcher-message-form");
    populateMessageRecipients("dispatcher-message-form-messages");
    populateTemplateSelect("message-template");
    populateTemplateSelect("message-template-messages");

    // Aktivna posada na dužnosti
    const driversList = document.getElementById("dispatcher-active-drivers-list");
    driversList.innerHTML = "";
    
    getVisibleDrivers().forEach((drv, index) => {
        const busNum = drv.bus || state.buses[index % state.buses.length].number;
        const route = state.routes[index % state.routes.length];
        
        let currentStop = t("js_garage");
        if (drv.active) {
            const stopIdx = drv.currentStopIndex !== undefined ? drv.currentStopIndex : (dayseed(index) % route.stops.length);
            currentStop = route.stops[stopIdx] || "Done";
        }
        
        const statusIcon = drv.active 
            ? `<span class="status-indicator active-pulse" style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; margin-right:8px; box-shadow: 0 0 8px #10b981;"></span>`
            : `<span class="status-indicator" style="display:inline-block; width:10px; height:10px; background:#6b7280; border-radius:50%; margin-right:8px;"></span>`;
        
        const preTripStatus = drv.active 
            ? (drv.preTripDone 
                ? `<span style="color:#10b981; margin-left:8px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:2px;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i> OK</span>`
                : `<span style="color:#ef4444; margin-left:8px; font-size:0.75rem; font-weight:600; display:inline-flex; align-items:center; gap:2px;" class="pulse-icon"><i data-lucide="alert-circle" style="width:12px; height:12px;"></i> ${t("status_pending_confirmation")}</span>`
              )
            : '';
            
        const damagePhotoBtn = drv.damagePhoto
            ? `<button class="btn-primary" onclick="viewDamagePhoto('${drv.name}')" style="padding: 4px 8px; font-size: 0.75rem; height: auto; margin-left: 8px; display:inline-flex; align-items:center; gap:4px; background: rgba(var(--primary-rgb), 0.2); border: 1px solid rgba(var(--primary-rgb), 0.4);"><i data-lucide="camera" style="width:12px; height:12px;"></i> 📸</button>`
            : '';
            
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div style="display:flex; align-items:center;">
                        ${statusIcon}
                        <strong>${drv.name}</strong>
                    </div>
                    <div style="display:flex; align-items:center; gap:5px;">
                        ${preTripStatus}
                        ${damagePhotoBtn}
                    </div>
                </div>
            </td>
            <td>${t("vehicle")} ${busNum}</td>
            <td>${t("table_route")} ${route.number}</td>
            <td>
                ${drv.active 
                    ? `<span class="text-success"><i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${currentStop}</span>`
                    : `<span style="color:var(--text-muted);">${t("js_garage")}</span>`
                }
            </td>
        `;
        driversList.appendChild(tr);
    });
    
    renderDispatcherShiftsConfirmation();
    renderDispatcherSentMessages();
    
    // Inicijalizacija selektora u brzim detaljima dispečera
    const quickSelect = document.getElementById("disp-quick-driver-select");
    if (quickSelect) {
        const currentVal = quickSelect.value;
        quickSelect.innerHTML = "";
        
        state.drivers.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d.name;
            opt.innerText = d.name;
            quickSelect.appendChild(opt);
        });
        
        if (currentVal && state.drivers.some(d => d.name === currentVal)) {
            quickSelect.value = currentVal;
        } else {
            quickSelect.value = state.drivers[0] ? state.drivers[0].name : "";
        }
        
        renderDispatcherQuickView();
    }
}

function renderDispatcherSentMessages() {
    const container = document.getElementById("dispatcher-sent-messages-list");
    if (!container) return;
    container.innerHTML = "";

    const dispName = currentUser ? currentUser.name : "Dispečer";

    // Filtriraj arhivirane poruke dispečera
    const sentMsgs = state.messages.filter(m =>
        m.sender === "Dispečer" &&
        !(m.dispArchivedBy && m.dispArchivedBy.includes(dispName))
    );

    if (sentMsgs.length === 0) {
        container.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px;">${t("no_messages")}</div>`;
        return;
    }

    // Dugme "Obriši sve" gore desno
    const clearAllBtn = document.createElement("div");
    clearAllBtn.style.cssText = "display:flex; justify-content:flex-end; margin-bottom:8px;";
    clearAllBtn.innerHTML = `
        <button onclick="archiveAllDispatcherMessages()" style="
            background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
            color:var(--text-muted); border-radius:8px; padding:5px 12px;
            font-size:0.75rem; cursor:pointer; font-family:'Outfit',sans-serif;
            display:flex; align-items:center; gap:5px; transition:all 0.2s;"
            onmouseover="this.style.background='rgba(239,68,68,0.1)';this.style.color='#ef4444'"
            onmouseout="this.style.background='rgba(255,255,255,0.05)';this.style.color='var(--text-muted)'">
            🗑️ ${t("clear_all_messages") || "Clear all"}
        </button>`;
    container.appendChild(clearAllBtn);

    sentMsgs.forEach(msg => {
        const div = document.createElement("div");
        div.style.cssText = "background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:var(--radius-sm); padding:8px 10px; display:flex; flex-direction:column; gap:4px; position:relative;";

        const isRead = msg.read;

        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem;">
                <span style="font-weight:600; color:var(--text-main);">${t("recipient_label")}: ${msg.recipient}</span>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--text-muted);">${formatDateTime(msg.date, msg.time)}</span>
                    <button onclick="archiveDispatcherMessage('${msg.id}')" title="${t('archive_message') || 'Archive'}" style="
                        background:none; border:none; color:rgba(255,255,255,0.25); cursor:pointer;
                        font-size:13px; padding:1px 4px; line-height:1; border-radius:4px; transition:all 0.15s;"
                        onmouseover="this.style.color='#ef4444'"
                        onmouseout="this.style.color='rgba(255,255,255,0.25)'">✕</button>
                </div>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); word-break:break-word;">${escapeHtml(msgText(msg, state.language))}</div>
            <div style="text-align:right; font-size:0.7rem; font-weight:600;">
                ${isRead
                    ? `<span style="color:#10b981; display:inline-flex; align-items:center; gap:3px;">
                        <i data-lucide="check-check" style="width:12px; height:12px;"></i> ${t("msg_read")}
                       </span>`
                    : `<span style="color:#f59e0b; display:inline-flex; align-items:center; gap:3px;">
                        <i data-lucide="check" style="width:12px; height:12px;"></i> ${t("msg_sent_unread")}
                       </span>`
                }
            </div>
        `;
        container.appendChild(div);
    });
    lucide.createIcons();

    // Osveži arhiv sekciju dispečera
    renderDispatcherMessageArchive();
}

// Arhiv dispečerskih poruka — sklopivi accordion
function renderDispatcherMessageArchive() {
    const archiveSection = document.getElementById("dispatcher-messages-archive");
    if (!archiveSection) return;

    const dispName = currentUser ? currentUser.name : "Dispečer";
    const archived = state.messages.filter(m =>
        m.sender === "Dispečer" &&
        m.dispArchivedBy && m.dispArchivedBy.includes(dispName)
    );

    if (archived.length === 0) {
        archiveSection.innerHTML = "";
        return;
    }

    archiveSection.innerHTML = `
        <details style="margin-top:10px;">
            <summary style="cursor:pointer; font-size:0.78rem; color:var(--text-muted);
                padding:6px 10px; background:rgba(255,255,255,0.03);
                border:1px solid rgba(255,255,255,0.06); border-radius:8px;
                display:flex; align-items:center; gap:6px; list-style:none; user-select:none;">
                📁 ${t("archive_label") || "Archive"} (${archived.length})
            </summary>
            <div style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">
                ${archived.map(msg => `
                    <div style="background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.04);
                        border-radius:6px; padding:8px 10px; opacity:0.6;">
                        <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted); margin-bottom:4px;">
                            <span>📬 ${t("recipient_label") || "To"}: ${msg.recipient}</span>
                            <span>${formatDateTime(msg.date, msg.time)}</span>
                        </div>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(msgText(msg, state.language))}</div>
                        <div style="text-align:right; font-size:0.7rem; margin-top:4px; color:${msg.read ? '#10b981' : '#f59e0b'};">
                            ${msg.read ? '✓✓ ' + (t("msg_read") || "Read") : '✓ ' + (t("msg_sent_unread") || "Sent")}
                        </div>
                    </div>
                `).join("")}
            </div>
        </details>
    `;
}

function archiveDispatcherMessage(id) {
    const msg = state.messages.find(m => m.id === id);
    if (!msg) return;
    const dispName = currentUser ? currentUser.name : "Dispečer";
    if (!msg.dispArchivedBy) msg.dispArchivedBy = [];
    if (!msg.dispArchivedBy.includes(dispName)) msg.dispArchivedBy.push(dispName);
    saveState();
    renderDispatcherSentMessages();
    lucide.createIcons();
}

// Arhiviraj sve poslate poruke (dispečerska strana)
function archiveAllDispatcherMessages() {
    const dispName = currentUser ? currentUser.name : "Dispečer";
    state.messages
        .filter(m => m.sender === "Dispečer" && !(m.dispArchivedBy && m.dispArchivedBy.includes(dispName)))
        .forEach(msg => {
            if (!msg.dispArchivedBy) msg.dispArchivedBy = [];
            msg.dispArchivedBy.push(dispName);
        });
    saveState();
    renderDispatcherSentMessages();
    showToast(t("messages_archived") || "Messages archived", "success");
    lucide.createIcons();
}


function renderDispatcherQuickView() {
    const select = document.getElementById("disp-quick-driver-select");
    const detailsContainer = document.getElementById("disp-quick-view-details");
    if (!select || !detailsContainer) return;
    
    const driverName = select.value;
    if (!driverName) {
        detailsContainer.innerHTML = `<div style="color:var(--text-muted); font-size:0.85rem; padding: 10px; text-align:center;">${t("no_driver_selected")}</div>`;
        return;
    }
    
    const driver = state.drivers.find(d => d.name === driverName);
    if (!driver) return;
    
    // Nađi sutrašnji rad
    const tomorrowShift = (state.tomorrowShifts || []).find(s => s.driver === driverName) || { shift: t("shift_off"), bus: "-", confirmed: false };
    
    // Nađi današnji rad (indeks za rutu/smenu kao u aktivnim vozačima)
    const driverIndex = state.drivers.indexOf(driver);
    const busNum = driver.bus || state.buses[driverIndex % state.buses.length].number;
    const route = state.routes[driverIndex % state.routes.length];
    
    // Smena za danas (parni/neparni dani ili fiksno)
    let shiftName = t("shift_morning");
    if (driverIndex % 2 === 1) {
        shiftName = t("shift_afternoon");
    }
    
    const statusIcon = driver.active 
        ? `<span class="status-indicator active-pulse" style="display:inline-block; width:10px; height:10px; background:#10b981; border-radius:50%; margin-right:6px; box-shadow: 0 0 8px #10b981;"></span>`
        : `<span class="status-indicator" style="display:inline-block; width:10px; height:10px; background:#6b7280; border-radius:50%; margin-right:6px;"></span>`;
        
    detailsContainer.innerHTML = `
        <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: var(--radius-md); padding: 15px; display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.85rem; color:var(--text-muted);">${t("status")}:</span>
                <span style="font-weight:600; display:flex; align-items:center; gap:4px; font-size:0.9rem;">
                    ${statusIcon} ${driver.active ? t("active_duty") : t("inactive_depot")}
                </span>
            </div>
            
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("today_duty")}</h5>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.88rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("route")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${route.number} (${route.name.split(" - ")[0]})</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("vehicle")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${busNum}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("shift")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${shiftName}</span>
                    </div>
                </div>
            </div>
            
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("tomorrow_duty")}</h5>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:0.88rem;">
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("duty_number")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${tomorrowShift.shift}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:var(--text-muted);">${t("vehicle")}:</span>
                        <span style="font-weight:600; color:var(--text-main);">${tomorrowShift.bus}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--text-muted);">${t("status")}:</span>
                        ${tomorrowShift.confirmed 
                            ? `<span style="color:#10b981; font-weight:600; display:flex; align-items:center; gap:3px; font-size:0.85rem;"><i data-lucide="check-circle" style="width:12px; height:12px;"></i> ${t("released")}</span>`
                            : `<span style="color:#f59e0b; font-weight:600; display:flex; align-items:center; gap:3px; font-size:0.85rem;"><i data-lucide="clock" style="width:12px; height:12px;"></i> ${t("pending")}</span>`
                        }
                    </div>
                </div>
            </div>
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                <h5 style="font-size:0.82rem; color:var(--primary-color); font-weight:700; margin-bottom:8px; text-transform:uppercase;">${t("route_progress")}</h5>
                <div id="disp-route-schematic-container" style="min-height: 80px; width: 100%; display: flex; align-items: center; justify-content: center;"></div>
            </div>
        </div>
    `;
    renderRouteSchematicSVG();
    lucide.createIcons();
}

// ============================================================
// MESSAGING HELPERS
// ============================================================

// ============================================================
// PREDEFINED MESSAGE TEMPLATES
// ============================================================

const MSG_TEMPLATES = [
    { cat: "tmpl_cat_delay",  items: ["tmpl_delay_5","tmpl_delay_10","tmpl_delay_15","tmpl_delay_20","tmpl_delay_30"] },
    { cat: "tmpl_cat_route",  items: ["tmpl_detour","tmpl_skip_stop","tmpl_route_end","tmpl_route_change"] },
    { cat: "tmpl_cat_ops",    items: ["tmpl_bus_full","tmpl_slow_down","tmpl_pax_check","tmpl_pax_incident","tmpl_police"] },
    { cat: "tmpl_cat_driver", items: ["tmpl_shift_now","tmpl_take_break","tmpl_end_shift","tmpl_call_dispatch","tmpl_help_coming"] }
];

function populateTemplateSelect(selectId) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = "";
    MSG_TEMPLATES.forEach(group => {
        const optgrp = document.createElement("optgroup");
        optgrp.label = t(group.cat) || group.cat;
        group.items.forEach(key => {
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = t(key) || key;
            optgrp.appendChild(opt);
        });
        sel.appendChild(optgrp);
    });
}

// Helper — tekst poruke za prikaz (template + detalj), na datom jeziku
function msgText(msg, lang) {
    const dict = lang ? (TRANSLATIONS[lang] || TRANSLATIONS.en) : null;
    const translated = dict ? (dict[msg.template] || TRANSLATIONS.en[msg.template]) : t(msg.template);
    const base = translated || msg.text || msg.template || "";
    return msg.detail ? `${base} — ${msg.detail}` : base;
}

function populateMessageRecipients(formId) {
    const suf    = formId === "dispatcher-message-form" ? "" : "-messages";
    const select = document.getElementById("message-recipient" + suf);
    if (!select) return;

    const scope = _msgScope[formId] || "driver";
    const current = select.value;

    select.innerHTML = `<option value="__all__">📢 ${t("msg_all_drivers") || "Svi vozači"}</option>`;

    if (scope === "group") {
        (state.groups || []).forEach(g => {
            const cnt = (state.drivers || []).filter(d => d.groupId === g.id).length;
            const opt = document.createElement("option");
            opt.value = `group:${g.id}`;
            opt.innerText = `📣 ${escapeHtml(g.name)} (${cnt})`;
            select.appendChild(opt);
        });
    } else {
        (state.drivers || []).forEach(d => {
            const grp = getGroupById(d.groupId);
            const opt = document.createElement("option");
            opt.value = d.name;
            opt.innerText = grp ? `👤 ${d.name}  [${grp.name}]` : `👤 ${d.name}`;
            select.appendChild(opt);
        });
    }

    if (current) select.value = current;
}

function renderAllMessagesList() {
    const container = document.getElementById("dispatcher-all-messages-list");
    if (!container) return;

    const msgs = (state.messages || []).slice(0, 50);

    if (msgs.length === 0) {
        container.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:24px 0;">${t("no_messages") || "Nema poslanih poruka."}</div>`;
        return;
    }

    container.innerHTML = msgs.map(m => {
        const icon      = msgTypeIcon(m.type);
        const typeLabel = t("msg_type_" + (m.type || "info")) || m.type || "Info";
        const isUnread  = !m.read;
        const bgColor   = m.type === "urgent"   ? "rgba(239,68,68,0.08)"    :
                          m.type === "warning"   ? "rgba(245,158,11,0.08)"   :
                          m.type === "schedule"  ? "rgba(14,165,233,0.08)"   :
                          m.type === "detour"    ? "rgba(139,92,246,0.08)"   :
                                                   "rgba(255,255,255,0.02)";
        const borderCol = m.type === "urgent"   ? "rgba(239,68,68,0.3)"     :
                          m.type === "warning"   ? "rgba(245,158,11,0.3)"    :
                          m.type === "schedule"  ? "rgba(14,165,233,0.3)"    :
                          m.type === "detour"    ? "rgba(139,92,246,0.3)"    :
                                                   "var(--panel-border)";

        return `
        <div style="background:${bgColor};border:1px solid ${borderCol};border-radius:10px;padding:12px 14px;margin-bottom:8px;${isUnread ? "border-left:3px solid var(--primary-color);" : ""}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <span style="font-size:0.78rem;font-weight:700;color:var(--text-muted);">${icon} ${typeLabel}</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${m.time}</span>
            </div>
            <div style="font-size:0.88rem;color:var(--text-main);margin-bottom:4px;">${escapeHtml(msgText(m, state.language))}</div>
            <div style="font-size:0.75rem;color:var(--text-muted);">
                <span>→ <strong>${escapeHtml(m.recipient)}</strong></span>
                <span style="margin-left:10px;">${t("sender") || "Od"}: ${escapeHtml(m.sender)}</span>
            </div>
        </div>`;
    }).join("");
}

// Pratimo koji scope je aktivan po formi
const _msgScope = {};

function setMessageScope(scope, formId) {
    _msgScope[formId] = scope;

    // Suffix za ID-ove: dashboard forma nema suffix, messages forma ima "-messages"
    const suf = formId === "dispatcher-message-form" ? "" : "-messages";
    const driverBtn = document.getElementById("msg-scope-driver-btn" + (suf ? "-m" : ""));
    const groupBtn  = document.getElementById("msg-scope-group-btn"  + (suf ? "-m" : ""));
    const select    = document.getElementById("message-recipient" + suf);
    const label     = select ? select.previousElementSibling : null;

    if (driverBtn) driverBtn.classList.toggle("msg-scope-active", scope === "driver");
    if (groupBtn)  groupBtn.classList.toggle("msg-scope-active",  scope === "group");

    if (!select) return;

    if (scope === "group") {
        if (label) label.setAttribute("data-i18n", "msg_scope_group_label");
        select.innerHTML = `<option value="__all__">${t("msg_all_drivers") || "Svi vozači"}</option>` +
            (state.groups || []).map(g =>
                `<option value="group:${g.id}">${escapeHtml(g.name)}</option>`
            ).join("");
    } else {
        if (label) label.setAttribute("data-i18n", "recipient_label");
        select.innerHTML = `<option value="__all__">${t("msg_all_drivers") || "Svi vozači"}</option>` +
            (state.drivers || []).map(d =>
                `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`
            ).join("");
    }
    translateUI();
}

// Ikone za tip poruke u istoriji
function msgTypeIcon(type) {
    switch (type) {
        case "warning":  return "⚠️";
        case "urgent":   return "🚨";
        case "schedule": return "📅";
        case "detour":   return "🔀";
        default:         return "ℹ️";
    }
}

function submitDispatcherMessage(event) {
    event.preventDefault();
    const formId  = event.target.id;
    const suf     = formId === "dispatcher-message-form" ? "" : "-messages";
    const scope   = _msgScope[formId] || "driver";

    const recipientEl = document.getElementById("message-recipient" + suf);
    const templateEl  = document.getElementById("message-template" + suf);
    const detailEl    = document.getElementById("message-detail"   + suf);

    const recipient = recipientEl ? recipientEl.value   : "__all__";
    const template  = templateEl  ? templateEl.value    : "";
    const detail    = detailEl    ? detailEl.value.trim() : "";

    if (!template) return;

    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2,"0")}:${now.getMinutes().toString().padStart(2,"0")}`;

    // Ako je group scope i izabrana konkretna grupa, šaljemo svim vozačima u grupi
    let recipients = [];
    if (scope === "group" && recipient.startsWith("group:")) {
        const gid = recipient.replace("group:", "");
        const grp = (state.groups || []).find(g => g.id === gid);
        const groupDrivers = (state.drivers || []).filter(d => d.groupId === gid);
        recipients = groupDrivers.length > 0
            ? groupDrivers.map(d => d.name)
            : [grp ? grp.name : t("msg_all_drivers") || "Svi vozači"];
    } else if (recipient === "__all__") {
        recipients = [t("msg_all_drivers") || "Svi vozači"];
    } else {
        recipients = [recipient];
    }

    const senderName = currentUser ? currentUser.name : (t("dispatcher") || "Dispečer");

    recipients.forEach(rec => {
        const newMessage = {
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
            time: timeString,
            sender: senderName,
            senderLang: state.language || "en",
            recipient: rec,
            template: template,   // translation ključ npr. "tmpl_delay_15"
            detail: detail,       // opcioni slobodni tekst (stanica, br. busa...)
            text: t(template) + (detail ? ` — ${detail}` : ""), // fallback za stari kod
            type: template.startsWith("tmpl_delay") ? "warning" :
                  template === "tmpl_call_dispatch" || template === "tmpl_pax_incident" ? "urgent" :
                  template.startsWith("tmpl_detour") || template.startsWith("tmpl_route") ? "detour" : "info",
            scope: scope,
            read: false
        };
        if (!state.messages) state.messages = [];
        state.messages.unshift(newMessage);
    });

    saveState();
    // Samo resetuj detalj polje, ne template select (dynamic options bi se izgubile s event.target.reset())
    if (detailEl) detailEl.value = "";
    // Resetuj scope tipke na "driver"
    setMessageScope("driver", formId);
    // Obnovi template opcije (recipients form reset može ih obrisati)
    populateTemplateSelect("message-template" + suf);

    showToast(t("js_alert_msg_sent") || "✅ Message sent!", "success", 3000);
    renderDispatcherDashboard();
    renderAllMessagesList();
}

// --- DISPEČERSKI KVAROVI I KAŠNJENJA ---
function renderDispatcherReports() {
    const tbody = document.getElementById("dispatcher-all-reports-table");
    tbody.innerHTML = "";

    // Filtriraj po grupi ako je aktivan filter
    let reports = state.reports;
    if (state.activeGroupFilter) {
        const driversInGroup = (state.drivers || [])
            .filter(d => d.groupId === state.activeGroupFilter)
            .map(d => d.name);
        reports = reports.filter(r => driversInGroup.includes(r.driver));
    }

    if (reports.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">${state.activeGroupFilter ? (t("no_drivers_in_group") || "Nema prijava za ovu grupu") : t("js_no_alerts")}</td></tr>`;
        return;
    }

    reports.forEach(rep => {
        const tr = document.createElement("tr");
        
        let severityBadge = "";
        if (rep.severity === "sev_low" || rep.severity === "Niska" || rep.severity === "Niedrig") severityBadge = `<span class="badge severity-low">${t("js_severity_low")}</span>`;
        else if (rep.severity === "sev_medium" || rep.severity === "Srednja" || rep.severity === "Mittel") severityBadge = `<span class="badge severity-medium">${t("js_severity_medium")}</span>`;
        else severityBadge = `<span class="badge severity-critical">${t("js_severity_critical")}</span>`;
        
        let actionBtn = "";
        const deleteBtn = `<button class="btn-table-action" onclick="deleteReport('${rep.id}')" style="background:rgba(239,68,68,0.1); color:var(--danger-color); border-color:rgba(239,68,68,0.3); margin-left:6px;" title="${t('btn_delete')}"><i data-lucide="trash-2"></i></button>`;
        
        const isResolved = rep.status === "status_resolved" || rep.status === "Rešeno" || rep.status === "resolved";

        if (!isResolved) {
            actionBtn = `<div style="display:flex; align-items:center; gap:4px;">
                <button class="btn-table-action" onclick="resolveReport('${rep.id}')"><i data-lucide="check-check"></i> ${t("btn_resolve")}</button>
                ${deleteBtn}
            </div>`;
        } else {
            actionBtn = `<div style="display:flex; align-items:center; gap:4px;">
                <span class="text-success" style="font-weight:600;"><i data-lucide="check"></i> ${t("status_resolved")}</span>
                ${deleteBtn}
            </div>`;
        }
        
        let displayType = rep.type;
        if (rep.type.includes("Kašnjenje")) {
            const mins = rep.type.match(/\d+/);
            displayType = t("report_delay_title") + `: ${mins ? mins[0] : "15"} min`;
        } else if (rep.type.includes("KVAR")) {
            const category = rep.type.replace("KVAR: ", "");
            displayType = t("report_breakdown_title") + ": " + t(category);
        }
        
        let displayReason = rep.reason;
        const parts = rep.reason.split(" - ");
        if (parts.length > 0) {
            parts[0] = t(parts[0]);
            displayReason = parts.join(" - ");
        }
        
        tr.innerHTML = `
            <td>${formatDateTime(rep.date, rep.time)}</td>
            <td><strong>${rep.driver}</strong><br><span style="font-size:12px;color:var(--text-muted);">${t("vehicle")} ${rep.bus}</span></td>
            <td><span class="${rep.type.startsWith('breakdown:') || rep.type.includes('KVAR') ? 'text-danger' : 'text-warning'}" style="font-weight:600;">${displayType}</span></td>
            <td>${displayReason}</td>
            <td>${severityBadge}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

function resolveReport(id) {
    const rep = state.reports.find(r => r.id === id);
    if (rep) {
        rep.status = "status_resolved";
        saveState();
        renderDispatcherReports();
        showToast(t("status_resolved") || "Report resolved", "success", 3000);
        lucide.createIcons();
    }
}

function deleteReport(id) {
    state.reports = (state.reports || []).filter(r => r.id !== id);
    saveState();
    renderDispatcherReports();
    renderDispatcherDashboard();
    lucide.createIcons();
}

// --- DISPEČERSKE IZGUBLJENE STVARI (LOST & FOUND) ---
function renderDispatcherLostItems() {
    const tbody = document.getElementById("dispatcher-lost-items-table");
    if (!tbody) return;
    
    tbody.innerHTML = "";
    
    if (state.lostItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">${t("js_no_alerts")}</td></tr>`;
        return;
    }
    
    state.lostItems.forEach(item => {
        const tr = document.createElement("tr");
        
        let statusBadge = "";
        let actionBtn = "";
        
        // Status check — podržava i ključeve i legacy srpske/njemačke stringove
        const isInDepot = item.status === "status_in_depot" || item.status === "U depou" || item.status === "Im Depot";

        if (isInDepot) {
            statusBadge = `<span class="badge pending">${t("status_in_depot")}</span>`;
            actionBtn = `<button class="btn-table-action btn-approve" onclick="returnLostItem('${item.id}')"><i data-lucide="check"></i> ${t("btn_return_owner")}</button>`;
        } else {
            statusBadge = `<span class="badge approved">${t("status_returned")}</span>`;
            actionBtn = `<span class="text-success" style="font-weight:600;"><i data-lucide="check"></i> ${t("status_returned")}</span>`;
        }

        // Tip predmeta: pokušaj t() za ključ; ako ne uspije (legacy srpski string), prikaži direktno
        const typeDisplay = t(item.type) || item.type;

        tr.innerHTML = `
            <td>${formatDateTime(item.date, item.time)}</td>
            <td><strong>${item.driver}</strong><br><span style="font-size:12px;color:var(--text-muted);">${t("vehicle")} ${item.bus}</span></td>
            <td><strong>${typeDisplay}</strong></td>
            <td>${item.location}</td>
            <td>${item.desc}</td>
            <td>${statusBadge}</td>
            <td>${actionBtn}</td>
        `;
        tbody.appendChild(tr);
    });
}

function returnLostItem(id) {
    const item = state.lostItems.find(i => i.id === id);
    if (item) {
        item.status = "status_returned";
        saveState();
        renderDispatcherLostItems();
        showToast(t("js_lost_returned") || "Item returned to owner.", "success", 3000);
        lucide.createIcons();
    }
}

// --- DISPEČERSKI ODMORI ---
function renderDispatcherVacations() {
    const tbody = document.getElementById("dispatcher-vacation-requests-table");
    tbody.innerHTML = "";
    
    const pendingVacations = state.vacations.filter(v => v.status === "Na čekanju");
    
    if (pendingVacations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">${t("js_no_vacations")}</td></tr>`;
        return;
    }
    
    pendingVacations.forEach(vac => {
        const tr = document.createElement("tr");
        
        let translatedType = t(vac.type);
        
        tr.innerHTML = `
            <td><strong>${vac.driver}</strong></td>
            <td>${translatedType}</td>
            <td>${formatDate(vac.start)} - ${formatDate(vac.end)} (2026)</td>
            <td><strong>${vac.days} ${t("table_days").toLowerCase()}</strong></td>
            <td><span style="font-size:13px;color:var(--text-muted);">${vac.reason}</span></td>
            <td>
                <div style="display:flex;gap:8px;">
                    <button class="btn-table-action btn-approve" onclick="handleVacation('${vac.id}', 'approved')">${t("btn_approve")}</button>
                    <button class="btn-table-action btn-reject" onclick="handleVacation('${vac.id}', 'rejected')">${t("btn_reject")}</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function handleVacation(id, status) {
    const vac = state.vacations.find(v => v.id === id);
    if (!vac) return;
    const actionLabel = status === "approved"
        ? (t("btn_approve") || "Odobri")
        : (t("btn_reject") || "Odbij");
    showConfirm(
        actionLabel + ': "' + vac.driver + '"?',
        function() {
            vac.status = status;
            saveState();
            renderDispatcherVacations();
            showToast(t("js_vacation_marked") + status.toUpperCase(), "success");
        },
        { danger: status !== "approved", title: actionLabel, confirmText: t("btn_yes") || "Da" }
    );
}

// --- PODEŠAVANJA FIRME ---
function renderDispatcherSettings() {
    renderDriversList();
    renderBusesList();
    renderRoutesList();
    renderDispatchersList();
    renderGroupsList();

    // Popuni selektor vozača za uvoz plana rada
    const scheduleDriverSelect = document.getElementById("upload-schedule-driver");
    if (scheduleDriverSelect) {
        scheduleDriverSelect.innerHTML = "";
        state.drivers.forEach(d => {
            const opt = document.createElement("option");
            opt.value = d.name;
            opt.innerText = d.name;
            scheduleDriverSelect.appendChild(opt);
        });
    }
}

// ============================================================
// SISTEM GRUPA
// ============================================================

function getGroupById(id) {
    if (!state.groups) return null;
    return state.groups.find(g => g.id === id) || null;
}

function getGroupName(id) {
    const g = getGroupById(id);
    return g ? g.name : "—";
}

function setGroupFilter(groupId) {
    state.activeGroupFilter = (state.activeGroupFilter === groupId) ? null : groupId;
    // Re-renderi sve filter barove
    renderGroupFilterBar("group-filter-bar");
    renderGroupFilterBar("group-filter-bar-shifts");
    renderGroupFilterBar("group-filter-bar-reports");
    // Re-renderi smene ako je sekcija aktivna
    renderDispatcherShifts();
}

function renderGroupFilterBar(containerId) {
    const bar = document.getElementById(containerId);
    if (!bar) return;

    const groups = state.groups || [];
    const active = state.activeGroupFilter;
    const allLabel = t("all_groups") || "All Groups";

    let html = `<span style="font-size:0.78rem; color:var(--text-muted); font-weight:600; margin-right:4px;">Filter:</span>`;

    // "Sve" dugme
    html += `<button onclick="setGroupFilter(null)" style="
        padding:5px 14px; border-radius:20px; font-size:0.78rem; font-weight:600; cursor:pointer;
        border: 1px solid ${!active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"};
        background: ${!active ? "rgba(255,255,255,0.1)" : "transparent"};
        color: ${!active ? "var(--text-main)" : "var(--text-muted)"};
        transition: all 0.15s;">${allLabel}</button>`;

    groups.forEach(g => {
        const isActive = active === g.id;
        html += `<button onclick="setGroupFilter('${g.id}')" style="
            padding:5px 14px; border-radius:20px; font-size:0.78rem; font-weight:700; cursor:pointer;
            border: 2px solid ${isActive ? g.color : "rgba(255,255,255,0.1)"};
            background: ${isActive ? g.color + "33" : "transparent"};
            color: ${isActive ? g.color : "var(--text-muted)"};
            transition: all 0.15s;">${g.name}</button>`;
    });

    bar.innerHTML = html;
}

function renderGroupsList() {
    const container = document.getElementById("groups-list");
    if (!container) return;

    const groups = state.groups || [];

    if (groups.length === 0) {
        container.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:16px;">${t("groups_empty") || "Nema grupa. Dodajte prvu iznad."}</p>`;
        return;
    }

    container.innerHTML = groups.map(g => {
        const driverCount = (state.drivers || []).filter(d => d.groupId === g.id).length;
        return `<div style="
            display:flex; align-items:center; gap:12px; padding:10px 14px;
            background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07);
            border-left: 3px solid ${g.color}; border-radius:8px; margin-bottom:6px;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:700; font-size:0.88rem; color:var(--text-main);">${g.name}</div>
                <div style="font-size:0.76rem; color:var(--text-muted);">${driverCount} ${t("drivers_count") || "vozača"}${g.description ? " · " + g.description : ""}</div>
            </div>
            <button onclick="deleteGroup('${g.id}')" style="
                background:none; border:1px solid rgba(239,68,68,0.3); color:#ef4444;
                border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.73rem; font-weight:600; flex-shrink:0;">
                ${t("btn_delete") || "Obriši"}
            </button>
        </div>`;
    }).join("");
}

function addGroup() {
    const name  = document.getElementById("new-group-name")?.value?.trim();
    const color = document.getElementById("new-group-color")?.value || "#0ea5e9";
    const desc  = document.getElementById("new-group-desc")?.value?.trim() || "";

    if (!name) { showToast(t("group_err_name") || "Unesite naziv grupe", "error"); return; }
    if (!state.groups) state.groups = [];
    if (state.groups.find(g => g.name.toLowerCase() === name.toLowerCase())) {
        showToast(t("group_err_exists") || "Grupa sa tim imenom već postoji", "error"); return;
    }

    showConfirm(
        (t("confirm_add_group") || "Add group") + `: "${name}"?`,
        function() {
            state.groups.push({ id: `grp-${Date.now()}`, name, color, description: desc });
            saveState();
            renderGroupsList();
            renderGroupFilterBar("group-filter-bar");
            renderGroupFilterBar("group-filter-bar-shifts");
            showToast(`${name} ${t("group_added") || "— grupa dodana"}`, "success");
            document.getElementById("new-group-name").value = "";
            document.getElementById("new-group-desc").value = "";
            lucide.createIcons();
        },
        { danger: false, title: t("btn_add_group") || "Add Group", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteGroup(groupId) {
    const group = getGroupById(groupId);
    if (!group) return;
    const drivers = getVisibleDrivers().filter(d => d.groupId === groupId);
    if (drivers.length > 0) {
        showToast(t("group_err_has_drivers") || `Najpre uklonite ${drivers.length} vozača iz grupe`, "error");
        return;
    }
    showConfirm(
        (t("confirm_delete_group") || "Delete group") + ': "' + group.name + '"?',
        function() {
            state.groups = state.groups.filter(g => g.id !== groupId);
            if (state.activeGroupFilter === groupId) state.activeGroupFilter = null;
            saveState();
            renderGroupsList();
            renderGroupFilterBar("group-filter-bar");
            renderGroupFilterBar("group-filter-bar-shifts");
            showToast(t("group_deleted") || "Grupa obrisana", "info");
        },
        { danger: true }
    );
}

function renderDriversList() {
    const list = document.getElementById("settings-drivers-list");
    if (!list) return;
    list.innerHTML = "";
    
    const activeGrp = currentUser && currentUser.activeGroupId;
    const myDrivers = getVisibleDrivers().filter(d => !d.groupId || d.groupId === activeGrp);
    
    myDrivers.forEach(d => {
        const grp = getGroupById(d.groupId);
        const li = document.createElement("li");
        li.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: rgba(255,255,255,0.02); border: 1px solid var(--panel-border); border-left: 3px solid " + (grp ? grp.color : "var(--primary-color)") + "; border-radius: var(--radius-md); margin-bottom: 8px;";
        li.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px; text-align: left;">
                <span style="font-weight: 600; color: var(--text-main);">${d.name}
                    <span style="color: var(--primary-color); font-size: 12px; font-weight: normal; margin-left: 8px;">(${t("label_company_id")}: ${d.companyId || 'N/A'})</span>
                    ${grp ? `<span style="background:${grp.color}22;border:1px solid ${grp.color}55;color:${grp.color};font-size:10px;font-weight:700;padding:1px 8px;border-radius:12px;margin-left:6px;">${grp.name}</span>` : ""}
                </span>
                <span style="font-size: 12px; color: var(--text-muted);">🔑 ${t("label_pin")}: ${d.pin}</span>
                <span style="font-size: 12px; color: var(--text-muted);">📞 ${d.phone || t("no_phone")} | ✉️ ${d.email || t("no_email")}</span>
            </div>
            <button class="btn-delete-item" onclick="deleteDriver('${d.id}')" style="background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;white-space:nowrap;">
                ${t("btn_delete") || "Obriši"}
            </button>
        `;
        list.appendChild(li);
    });
}

function addDriver(event) {
    event.preventDefault();
    const nameInput = document.getElementById("new-driver-name");
    const companyIdInput = document.getElementById("new-driver-company-id");
    const pinInput = document.getElementById("new-driver-pin");
    const phoneInput = document.getElementById("new-driver-phone");
    const emailInput = document.getElementById("new-driver-email");
    
    const name = nameInput.value.trim();
    const companyId = companyIdInput.value.trim();
    const pin = pinInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const activeGrp = currentUser && currentUser.activeGroupId;
    
    if (!name || !companyId || !pin) return;
    
    const newDriver = {
        id: `drv-${Date.now()}`,
        name: name,
        companyId: companyId,
        pin: pin,
        phone: phone,
        email: email,
        groupId: activeGrp
    };
    showConfirm(
        (t("confirm_add_driver") || "Add driver") + ': "' + name + '"?',
        function() {
            state.drivers.push(newDriver);
            saveState();
            nameInput.value = "";
            companyIdInput.value = "";
            pinInput.value = "";
            phoneInput.value = "";
            emailInput.value = "";
            renderDriversList();
            initializeLoginSelects();
            showToast(name + " — " + (t("driver_added") || "vozač dodan"), "success");
            lucide.createIcons();
        },
        { danger: false, title: t("btn_add_driver") || "Add Driver", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteDriver(id) {
    showConfirm(t("js_alert_delete_driver") || "Delete this driver?", function() {
        state.drivers = state.drivers.filter(d => d.id !== id);
        saveState();
        renderDriversList();
        initializeLoginSelects();
        lucide.createIcons();
    }, { danger: true });
}

function importDriversExcel(event) {
    event.preventDefault();
    const fileInput = document.getElementById("import-drivers-file");
    if (!fileInput.files || fileInput.files.length === 0) return;
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            if (rows.length <= 1) {
                showToast(t("js_import_empty"), "error");
                return;
            }
            
            const headers = rows[0].map(h => String(h || "").trim().toLowerCase());
            
            const nameIdx = headers.findIndex(h => h.includes("ime") || h.includes("name") || h.includes("fahrer") || h.includes("lenker"));
            const idIdx = headers.findIndex(h => h.includes("id") || h.includes("broj") || h.includes("nummer") || h.includes("code") || h.includes("personal"));
            const pinIdx = headers.findIndex(h => h.includes("pin") || h.includes("lozinka") || h.includes("pass") || h.includes("kennwort"));
            const busIdx = headers.findIndex(h => h.includes("bus") || h.includes("autobus") || h.includes("vozilo") || h.includes("fahrzeug") || h.includes("vehicle"));
            const phoneIdx = headers.findIndex(h => h.includes("tel") || h.includes("fon") || h.includes("mobil") || h.includes("phone"));
            const emailIdx = headers.findIndex(h => h.includes("mail") || h.includes("posta") || h.includes("email"));
            
            let importCount = 0;
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;
                
                const name = nameIdx !== -1 ? String(row[nameIdx] || "").trim() : "";
                const companyId = idIdx !== -1 ? String(row[idIdx] || "").trim() : "";
                const pin = pinIdx !== -1 ? String(row[pinIdx] || "").trim() : "";
                
                if (!name || !pin) continue;
                
                const phone = phoneIdx !== -1 ? String(row[phoneIdx] || "").trim() : "";
                const email = emailIdx !== -1 ? String(row[emailIdx] || "").trim() : "";
                
                // Upsert: ako vozač već postoji (po imenu ili companyId) — ažuriraj ga
                const existing = state.drivers.find(d => 
                    d.name === name || (companyId && d.companyId === companyId)
                );
                
                if (existing) {
                    if (pin) existing.pin = pin;
                    if (phone) existing.phone = phone;
                    if (email) existing.email = email;
                    if (companyId) existing.companyId = companyId;
                    if (name && existing.name !== name) existing.name = name;
                    importCount++; // broji i ažurirane
                } else {
                    const bus = busIdx !== -1 ? String(row[busIdx] || "").trim() : "";
                    state.drivers.push({
                        id: `drv-${Date.now()}-${i}`,
                        name: name,
                        companyId: companyId || `ID-${Math.floor(100000 + Math.random() * 900000)}`,
                        pin: pin,
                        bus: bus,
                        phone: phone,
                        email: email
                    });
                    importCount++;
                }
            }  // kraj for petlje
            
            saveState();
            renderDriversList();
            initializeLoginSelects();
            fileInput.value = "";
            
            const msg = t("js_drivers_imported_success").replace("{count}", importCount);
            showToast(msg, "success");
            
        } catch (err) {
            console.error(err);
            showToast(t("js_import_error"), "error");
        }
    };
    
    reader.readAsArrayBuffer(file);
}

function renderBusesList() {
    const list = document.getElementById("settings-buses-list");
    if (!list) return;
    list.innerHTML = "";
    const activeGrp = currentUser && currentUser.activeGroupId;
    const myBuses = state.buses.filter(b => !b.groupId || b.groupId === activeGrp);
    myBuses.forEach(b => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span>${t("vehicle")} ${b.number}</span>
            <button onclick="deleteBus('${b.id}')" style="background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                ${t("btn_delete") || "Obriši"}
            </button>
        `;
        list.appendChild(li);
    });
}

function addBus(event) {
    event.preventDefault();
    const input = document.getElementById("new-bus-num");
    const number = input.value.trim();
    if (!number) return;
    
    const activeGrp = currentUser && currentUser.activeGroupId;
    const newBus = {
        id: `bus-${Date.now()}`,
        number: number,
        groupId: activeGrp
    };
    showConfirm(
        (t("confirm_add_bus") || "Add bus") + ': "' + number + '"?',
        function() {
            state.buses.push(newBus);
            saveState();
            input.value = "";
            renderBusesList();
            lucide.createIcons();
            showToast(number + " — " + (t("bus_added") || "vozilo dodano"), "success");
        },
        { danger: false, title: t("btn_add_bus") || "Add Bus", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteBus(id) {
    showConfirm(t("js_alert_delete_bus") || "Delete this bus?", function() {
        state.buses = state.buses.filter(b => b.id !== id);
        saveState();
        renderBusesList();
        lucide.createIcons();
    }, { danger: true });
}

function renderRoutesList() {
    const list = document.getElementById("settings-routes-list");
    list.innerHTML = "";
    const activeGrp = currentUser && currentUser.activeGroupId;
    const myRoutes = state.routes.filter(r => !r.groupId || r.groupId === activeGrp);
    myRoutes.forEach(r => {
        const li = document.createElement("li");
        li.innerHTML = `
            <div class="crud-route-info">
                <div class="crud-route-header">
                    <span class="crud-route-num">${t("table_route")} ${r.number}</span>
                    <span class="crud-route-name">${r.name}</span>
                </div>
                <span class="crud-route-stops">${t("stops_plan")}: ${r.stops.join(" ➔ ")}</span>
            </div>
            <button onclick="deleteRoute('${r.id}')" style="align-self:center;background:rgba(239,68,68,0.08);color:#ef4444;border:1px solid rgba(239,68,68,0.2);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;font-weight:600;">
                ${t("btn_delete") || "Obriši"}
            </button>
        `;
        list.appendChild(li);
    });
}

function addRoute(event) {
    event.preventDefault();
    const num = document.getElementById("new-route-num").value.trim();
    const name = document.getElementById("new-route-name").value.trim();
    const stopsStr = document.getElementById("new-route-stops").value.trim();
    
    if (!num || !name || !stopsStr) return;
    
    const stops = stopsStr.split(",").map(s => s.trim()).filter(s => s.length > 0);
    
    const activeGrp = currentUser && currentUser.activeGroupId;
    const newRoute = {
        id: `rt-${Date.now()}`,
        number: num,
        name: name,
        stops: stops,
        groupId: activeGrp
    };
    
    showConfirm(
        (t("confirm_add_route") || "Add route") + ': ' + num + ' ' + name + '?',
        function() {
            state.routes.push(newRoute);
            saveState();
            document.getElementById("add-route-form").reset();
            renderRoutesList();
            lucide.createIcons();
            showToast(num + " " + name + " — " + (t("route_added") || "linija dodana"), "success");
        },
        { danger: false, title: t("btn_add_route") || "Add Route", confirmText: t("btn_yes") || "Da" }
    );
}

function deleteRoute(id) {
    if (state.routes.length <= 1) {
        showToast(t("js_alert_min_route_err") || "Cannot delete last route", "error");
        return;
    }
    showConfirm(t("js_alert_delete_route") || "Delete this route?", function() {
        state.routes = state.routes.filter(r => r.id !== id);
        saveState();
        renderRoutesList();
        lucide.createIcons();
    }, { danger: true });
}

// --- POMOĆNE FUNKCIJE (HELPERS) ---
function dayseed(index) {
    const today = new Date();
    // Vraća determinističku vrednost na osnovu dana u mesecu i indeksa
    return today.getDate() + index;
}

function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
        const parts = dateStr.split("-");
        if (parts.length === 3) {
            // Pretvara YYYY-MM-DD u DD.MM.
            return `${parseInt(parts[2])}.${parseInt(parts[1])}.`;
        }
        return dateStr;
    } catch (e) {
        return dateStr;
    }
}

// --- DVOSTRANA SIMULACIJA U REALNOM VREMENU IZMEĐU PROZORA (REAL-TIME TAB SYNC) ---
window.addEventListener('storage', (e) => {
    if (e.key === "fleetpulse_state") {
        const saved = localStorage.getItem("fleetpulse_state");
        if (!saved) return;
        try {
            state = { ...DEFAULT_STATE, ...JSON.parse(saved) };
        } catch(ex) {}
        if (currentUser) {
            const activeSection = document.querySelector(".content-section:not(.hidden)");
            if (activeSection) {
                switchSection(activeSection.id);
            }
        }
    }
});

// --- PREMIUM GPS MAPE, SOS SIRENA I PRIJAVA OŠTEĆENJA ---

// Globalne promenljive za mapu i praćenje
let dispatcherMap = null;
let busMarkers = {};
let gpsSimulationInterval = null;

// Koordinate ruta za GPS simulaciju (Regija Baden - Teesdorf - Wiener Neustadt, Austrija)
const ROUTE_GPS_PATHS = {
    "rt-1": [
        [48.0076, 16.2341], // Baden Bahnhof
        [47.9942, 16.2483], // Baden Leesdorf
        [47.9822, 16.2555], // Baden Landesklinikum
        [47.9711, 16.2621], // Tribuswinkel Schlehengasse
        [47.9622, 16.2733], // Oeynhausen Haberlgasse
        [47.9422, 16.2911], // Oberwaltersdorf Schloßsee
        [47.9234, 16.3012], // Tattendorf Gemeindeamt
        [47.9155, 16.2811]  // Teesdorf Volksschule
    ],
    "rt-2": [
        [47.9286, 16.2167], // Leobersdorf Bahnhof
        [47.9177, 16.1822], // Enzesfeld
        [47.9044, 16.1555], // Lindabrunn
        [47.9122, 16.1211], // Aigen
        [47.9022, 16.0788]  // Hernstein
    ],
    "rt-3": [
        [47.9534, 16.0967], // Pottenstein Fabriksgasse
        [47.9433, 16.1111], // Berndorf Gymnasium
        [47.9312, 16.1311], // St. Veit
        [47.9222, 16.1534], // Hirtenberg
        [47.9188, 16.1777], // Enzesfeld-Lindabrunn Bahnhof
        [47.9286, 16.2167], // Leobersdorf Bahnhof
        [47.9455, 16.2234], // Kottingbrunn Wasserschloss
        [47.9678, 16.2189]  // Bad Vöslau Bahnhof
    ],
    "rt-4": [
        [47.9155, 16.2811], // Teesdorf Mittelschule
        [47.9088, 16.2755], // Neurißhof
        [47.9011, 16.2889], // Blumau
        [47.8922, 16.2555], // Sollenau
        [47.8822, 16.2422], // Felixdorf Bahnhof
        [47.8544, 16.2467], // Siedlung Maria Theresia
        [47.8422, 16.2488], // Theresienfeld
        [47.8188, 16.2455]  // Wiener Neustadt Hauptbahnhof
    ]
};

// Inicijalizacija Leaflet mape
function initDispatcherLiveMap() {
    const mapContainer = document.getElementById("dispatcher-live-map");
    if (!mapContainer) return;
    
    // Provera da li Leaflet postoji (L)
    if (typeof L === 'undefined') {
        console.error("Leaflet is not loaded yet.");
        return;
    }
    
    // Ako mapa već postoji, samo osveži dimenzije i markere
    if (dispatcherMap) {
        dispatcherMap.invalidateSize();
        updateMapMarkers();
        return;
    }
    
    // Kreiranje mape centrirane na Baden / Teesdorf regiju
    dispatcherMap = L.map('dispatcher-live-map', {
        zoomControl: true,
        fadeAnimation: true
    }).setView([47.95, 16.20], 11);
    
    // Uvoz tamne teme za mapu (CartoDB Dark Matter) za premium estetiku
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(dispatcherMap);
    
    // Pokretanje GPS simulacije ako već nije pokrenuta
    if (!gpsSimulationInterval) {
        startGpsSimulation();
    }
    
    updateMapMarkers();
}

// Simulacija kretanja autobusa
function startGpsSimulation() {
    gpsSimulationInterval = setInterval(() => {
        state.drivers.forEach((drv, index) => {
            if (!drv.active) return;
            
            const route = state.routes[index % state.routes.length];
            const path = ROUTE_GPS_PATHS[route.id] || ROUTE_GPS_PATHS["rt-1"];
            
            let direction = drv.gpsDirection || 1;
            let currentGpsIdx = drv.gpsIndex !== undefined ? drv.gpsIndex : Math.floor(Math.random() * path.length);
            
            currentGpsIdx += direction;
            
            if (currentGpsIdx >= path.length) {
                currentGpsIdx = path.length - 2;
                direction = -1;
            } else if (currentGpsIdx < 0) {
                currentGpsIdx = 1;
                direction = 1;
            }
            
            drv.gpsIndex = currentGpsIdx;
            drv.gpsDirection = direction;
            
            // Sinhronizujemo trenutnu stanicu na osnovu približne pozicije u GPS nizu
            const stopPercent = currentGpsIdx / (path.length - 1);
            const stopIdx = Math.min(Math.floor(stopPercent * route.stops.length), route.stops.length - 1);
            drv.currentStopIndex = stopIdx;
        });
        
        saveState();
        
        // Osveži tabelu i markere ako smo na dispečerskom dashboard-u
        if (currentUser && currentUser.role === "dispatcher") {
            const activeSection = document.querySelector(".content-section:not(.hidden)");
            if (activeSection && activeSection.id === "dispatcher-dashboard") {
                renderDispatcherDashboard();
                updateMapMarkers();
            }
        }
    }, 4000);
}

// Ažuriranje markera na mapi uživo
function updateMapMarkers() {
    if (!dispatcherMap) return;
    
    const activeDriverIds = new Set();
    
    state.drivers.forEach((drv, index) => {
        if (!drv.active) {
            // Ako je vozač neaktivan, ukloni marker ako postoji
            if (busMarkers[drv.name]) {
                dispatcherMap.removeLayer(busMarkers[drv.name]);
                delete busMarkers[drv.name];
            }
            return;
        }
        
        const busNum = drv.bus || state.buses[index % state.buses.length].number;
        const route = state.routes[index % state.routes.length];
        const path = ROUTE_GPS_PATHS[route.id] || ROUTE_GPS_PATHS["rt-1"];
        
        const currentGpsIdx = drv.gpsIndex !== undefined ? drv.gpsIndex : 0;
        const coords = path[currentGpsIdx] || path[0];
        
        activeDriverIds.add(drv.name);
        
        // Proveri da li je SOS aktivan za ovog vozača
        const isSOSForDriver = state.sosActive && state.sosDriver === drv.name;
        
        // Kreiraj ikonicu markera
        const markerClass = isSOSForDriver ? "bus-map-marker sos-active-marker" : "bus-map-marker";
        const busLabel = route.number;
        
        const customIcon = L.divIcon({
            className: markerClass,
            html: `<span>${busLabel}</span>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const popupContent = `
            <div style="font-family:'Outfit',sans-serif; font-size:0.85rem; line-height:1.4;">
                <h4 style="margin:0 0 5px 0; font-size:0.95rem; color:${isSOSForDriver ? 'var(--danger-color)' : 'var(--primary-color)'}; font-weight:700;">
                    ${isSOSForDriver ? '🚨 ' + t("sos_alert_title") : '🚌 ' + t("vehicle") + ' ' + busNum}
                </h4>
                <strong>${t("driver")}:</strong> ${drv.name}<br>
                <strong>${t("table_route")}:</strong> ${route.number} (${route.name})<br>
                <strong>${t("current_location")}:</strong> ${route.stops[drv.currentStopIndex || 0] || t("no_data")}
            </div>
        `;
        
        if (busMarkers[drv.name]) {
            // Pomeri postojeći marker
            busMarkers[drv.name].setLatLng(coords);
            busMarkers[drv.name].setPopupContent(popupContent);
            
            // Ažuriraj ikonicu (ako se promenilo SOS stanje)
            const oldIcon = busMarkers[drv.name].options.icon;
            if (oldIcon.options.className !== markerClass) {
                busMarkers[drv.name].setIcon(customIcon);
            }
        } else {
            // Kreiraj novi marker
            const marker = L.marker(coords, { icon: customIcon })
                .bindPopup(popupContent)
                .addTo(dispatcherMap);
            
            busMarkers[drv.name] = marker;
        }
    });
    
    // Obriši stare markere za vozače koji više nisu aktivni
    for (const name in busMarkers) {
        if (!activeDriverIds.has(name)) {
            dispatcherMap.removeLayer(busMarkers[name]);
            delete busMarkers[name];
        }
    }
}

// --- WEB AUDIO API SOS SIRENA ---
let audioCtx = null;
let sirenOscillator = null;
let sirenGainNode = null;
let sirenInterval = null;

function startSOSSiren() {
    if (sirenInterval) return; // Već svira
    
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    } catch (e) {
        console.error("Web Audio API nije podržan na ovom pretraživaču", e);
        return;
    }
    
    sirenGainNode = audioCtx.createGain();
    sirenGainNode.gain.setValueAtTime(0.25, audioCtx.currentTime); // Umerena jačina zvuka
    sirenGainNode.connect(audioCtx.destination);
    
    sirenOscillator = audioCtx.createOscillator();
    sirenOscillator.type = 'sawtooth'; // Oštriji, piskavi ton alarma
    sirenOscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
    sirenOscillator.connect(sirenGainNode);
    sirenOscillator.start();
    
    let stateToggle = false;
    sirenInterval = setInterval(() => {
        if (!audioCtx) return;
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const now = audioCtx.currentTime;
        // Naizmenično menjaj visinu tona za sirenu
        sirenOscillator.frequency.setValueAtTime(stateToggle ? 900 : 500, now);
        stateToggle = !stateToggle;
    }, 450);
}

function stopSOSSiren() {
    if (sirenInterval) {
        clearInterval(sirenInterval);
        sirenInterval = null;
    }
    if (sirenOscillator) {
        try {
            sirenOscillator.stop();
            sirenOscillator.disconnect();
        } catch (e) {}
        sirenOscillator = null;
    }
    if (sirenGainNode) {
        sirenGainNode.disconnect();
        sirenGainNode = null;
    }
    if (audioCtx) {
        try {
            audioCtx.close();
        } catch (e) {}
        audioCtx = null;
    }
}

// --- PREGLED SLIKA OŠTEĆENJA ---
function viewDamagePhoto(driverName) {
    const driver = state.drivers.find(d => d.name === driverName);
    if (!driver || !driver.damagePhoto) return;
    
    const modal = document.getElementById("schedule-viewer-modal");
    const title = document.getElementById("schedule-viewer-title");
    const body = document.getElementById("schedule-viewer-body");
    const downloadLink = document.getElementById("schedule-download-link");
    
    if (!modal || !title || !body || !downloadLink) return;
    
    const lang = state.language || "sr";
    if (lang === "de") {
        title.innerText = `Fahrzeugschaden - ${driverName}`;
    } else if (lang === "en") {
        title.innerText = `Vehicle Damage - ${driverName}`;
    } else {
        title.innerText = `Oštećenje vozila - ${driverName}`;
    }
    
    body.innerHTML = `<img src="${driver.damagePhoto}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:var(--radius-sm); box-shadow: 0 4px 15px rgba(0,0,0,0.4);">`;
    
    downloadLink.href = driver.damagePhoto;
    downloadLink.download = `ostecenje_${driverName.replace(/\s+/g, '_')}.png`;
    
    modal.classList.remove("hidden");
    lucide.createIcons();
}

// --- GLASOVNA NAJAVA PORUKA (TEXT-TO-SPEECH) ---
function speakMessage(text, lang) {
    if (!('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        
        // Očisti tekst od eventualnih HTML tagova
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = text;
        const cleanText = tempDiv.textContent || tempDiv.innerText || "";
        
        const utterance = new SpeechSynthesisUtterance(cleanText);
        
        let langCode = 'de-DE';
        if (lang === 'en') langCode = 'en-US';
        else if (lang === 'sr') langCode = 'sr-RS';
        
        utterance.lang = langCode;
        
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang.startsWith(langCode));
        if (voice) {
            utterance.voice = voice;
        }
        
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.error("Greška pri reprodukciji glasa:", e);
    }
}

// --- BRZE PRIJAVE SA DASHBOARDA (QUICK REPORTS) ---
function sendQuickReport(type) {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let reportType = "";
    let reason = "";
    let severity = "sev_low";
    
    if (type === 'Stau') {
        reportType = `delay:10`;
        reason = t("reason_traffic");
        severity = "sev_low";
    } else if (type === 'Panne') {
        reportType = `breakdown:bd_engine`;
        reason = t("qr_breakdown");
        severity = "sev_critical";
    } else if (type === 'Bus Voll') {
        reportType = `delay:5`;
        reason = t("reason_passengers");
        severity = "sev_low";
    } else if (type === 'Verspatung') {
        reportType = `delay:5`;
        reason = t("reason_traffic");
        severity = "sev_low";
    }
    
    const newReport = {
        id: `rep-${Date.now()}`,
        time: timeString,
        driver: currentUser.name,
        bus: currentUser.bus,
        type: reportType,
        reason: reason,
        severity: severity,
        status: "Aktivno"
    };
    
    state.reports.unshift(newReport);
    saveState();
    
    // Ako je dispečerska uloga otvorena negde, storage listener će preneti, ali lokalno ažuriramo dashboard
    renderDriverDashboard();
    
    const msg = type === 'Panne' ? t("js_alert_breakdown_sent") : t("js_alert_delay_sent");
    showToast(msg, type === 'Panne' ? "warning" : "success");
}

// --- RENDEROVANJE STANICA TRASIRANJA ---
function renderRouteStops() {
    const container = document.getElementById("route-stops-container");
    if (!container) return;
    container.innerHTML = "";
    
    const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
    
    route.stops.forEach((stop, index) => {
        const div = document.createElement("div");
        div.className = "stop-item-row";
        
        let statusText = t("stop_planned");
        
        if (index < currentUser.currentStopIndex) {
            statusText = t("stop_passed");
        } else if (index === currentUser.currentStopIndex) {
            statusText = t("stop_next");
        }
        
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:12px; border-radius:var(--radius-md); border:1px solid rgba(255,255,255,0.05); cursor:pointer; transition:var(--transition-fast); background:" + 
            (index === currentUser.currentStopIndex ? "rgba(var(--primary-rgb), 0.1)" : "rgba(255,255,255,0.02)") + ";";
        
        if (index === currentUser.currentStopIndex) {
            div.style.borderColor = "var(--primary-color)";
        }
        
        div.onclick = () => checkInStop(index);
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="width:24px; height:24px; border-radius:50%; background:${index <= currentUser.currentStopIndex ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)'}; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">
                    ${index + 1}
                </span>
                <span style="font-weight:600; color:${index === currentUser.currentStopIndex ? 'var(--text-main)' : 'var(--text-muted)'};">${stop}</span>
            </div>
            <div style="font-size:0.75rem; font-weight:700; color:${index === currentUser.currentStopIndex ? 'var(--primary-color)' : (index < currentUser.currentStopIndex ? 'var(--success-color)' : 'var(--text-muted-dark)')};">
                ${statusText}
            </div>
        `;
        container.appendChild(div);
    });
}

function checkInStop(index) {
    if (index === currentUser.currentStopIndex) {
        const route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
        if (currentUser.currentStopIndex < route.stops.length - 1) {
            currentUser.currentStopIndex++;
            sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
            
            const driver = state.drivers.find(d => d.name === currentUser.name);
            if (driver) {
                driver.currentStopIndex = currentUser.currentStopIndex;
                saveState();
            }
            
            renderDriverDashboard();
        } else {
            showToast(t("js_alert_route_done"), "success");
        }
    }
}

function resetRouteProgress() {
    currentUser.currentStopIndex = 0;
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    
    const driver = state.drivers.find(d => d.name === currentUser.name);
    if (driver) {
        driver.currentStopIndex = 0;
        saveState();
    }
    
    renderDriverDashboard();
}

// --- CRTANJE SHEMATSKE SVG MAPE TRASERSTVA ---
function renderRouteSchematicSVG() {
    const driverContainer = document.getElementById("route-schematic-container");
    const dispContainer = document.getElementById("disp-route-schematic-container");
    
    const container = (currentUser && currentUser.role === "driver") ? driverContainer : dispContainer;
    if (!container) return;
    
    container.innerHTML = "";
    
    let route, currentIdx;
    
    if (currentUser && currentUser.role === "driver") {
        route = state.routes.find(r => r.id === currentUser.routeId) || state.routes[0];
        currentIdx = currentUser.currentStopIndex;
    } else {
        const select = document.getElementById("disp-quick-driver-select");
        const driverName = select ? select.value : "";
        const driver = state.drivers.find(d => d.name === driverName);
        if (driver) {
            const driverIndex = state.drivers.indexOf(driver);
            route = state.routes[driverIndex % state.routes.length];
            currentIdx = driver.currentStopIndex !== undefined ? driver.currentStopIndex : (dayseed(driverIndex) % route.stops.length);
        } else {
            route = state.routes[0];
            currentIdx = 0;
        }
    }
    
    if (!route || !route.stops || route.stops.length === 0) return;
    
    const numStops = route.stops.length;
    const width = 600;
    const height = 80;
    const padding = 40;
    const step = (width - padding * 2) / Math.max(1, numStops - 1);
    
    let svgHtml = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="80px" style="overflow: visible;">`;
    
    // Pozadinska linija trase
    svgHtml += `<line x1="${padding}" y1="${height/2}" x2="${width - padding}" y2="${height/2}" stroke="rgba(255,255,255,0.15)" stroke-width="4" stroke-linecap="round" />`;
    
    // Aktivna linija za pređeni put
    if (currentIdx > 0) {
        const activeX = padding + currentIdx * step;
        svgHtml += `<line x1="${padding}" y1="${height/2}" x2="${activeX}" y2="${height/2}" stroke="var(--primary-color)" stroke-width="4" stroke-linecap="round" />`;
    }
    
    // Crtanje stanica (čvorova)
    route.stops.forEach((stop, i) => {
        const cx = padding + i * step;
        const cy = height / 2;
        
        let color = "rgba(255, 255, 255, 0.3)";
        let radius = 6;
        let fontStyle = "fill: var(--text-muted); font-size: 8px; font-weight: 500;";
        let isCurrent = (i === currentIdx);
        let isPassed = (i < currentIdx);
        
        if (isCurrent) {
            color = "var(--primary-color)";
            radius = 10;
            fontStyle = "fill: var(--text-main); font-weight: 700; font-size: 9px;";
            
            // Pulsirajući prsten oko trenutne stanice
            svgHtml += `<circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="var(--primary-color)" stroke-width="2" opacity="0.5">
                            <animate attributeName="r" values="10;18;10" dur="2s" repeatCount="indefinite" />
                            <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                        </circle>`;
        } else if (isPassed) {
            color = "var(--success-color)";
            radius = 7;
            fontStyle = "fill: var(--text-muted); font-size: 8px;";
        }
        
        // Kružić stanice
        svgHtml += `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}" stroke="#05070c" stroke-width="2" style="cursor: pointer;" />`;
        
        // Naziv stanice (uklanjamo platforme / brojeve na kraju radi preglednosti)
        const displayName = stop.replace(/\s\d+$/, "");
        
        // Naizmenična visina naziva da se ne bi preklapali
        const textY = (i % 2 === 0) ? cy - 18 : cy + 22;
        
        svgHtml += `<text x="${cx}" y="${textY}" text-anchor="middle" style="${fontStyle}">${displayName}</text>`;
    });
    
    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}

// --- UVOZ I PREGLED DIENSTPLAN-A (Schedules) ---
async function uploadDriverSchedule(event) {
    event.preventDefault();
    const driverName = document.getElementById("upload-schedule-driver").value;
    const month = document.getElementById("upload-schedule-month").value;
    const fileInput = document.getElementById("upload-schedule-file");
    
    if (!fileInput.files || fileInput.files.length === 0) return;
    
    const file = fileInput.files[0];
    
    // Prikaži indikator učitavanja na dugmetu
    const submitBtn = event.target.querySelector("button[type='submit']");
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `<span>${t("js_analyzing_plan")}</span> <i class="active-pulse" data-lucide="loader"></i>`;
    submitBtn.disabled = true;
    
    try {
        const fileData = await new Promise((resolve) => {
            const r = new FileReader();
            r.onload = (e) => resolve(e.target.result);
            r.readAsDataURL(file);
        });
        
        let extractedText = "";
        
        // 1. ČITANJE TEKSTA NA OSNOVU TIPA DOKUMENTA (Excel, PDF ili TXT)
        if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
            // Excel parsing preko SheetJS
            try {
                const arrayBuffer = await new Promise((resolve) => {
                    const r = new FileReader();
                    r.onload = (e) => resolve(e.target.result);
                    r.readAsArrayBuffer(file);
                });
                const workbook = XLSX.read(arrayBuffer, { type: "array" });
                const sheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                
                let sheetText = "";
                rows.forEach(row => {
                    if (row && row.length > 0) {
                        sheetText += row.join(" | ") + "\n";
                    }
                });
                extractedText = sheetText;
            } catch (e) {
                console.error("Excel extraction error", e);
            }
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            // PDF parsing preko PDF.js
            try {
                const arrayBuffer = await new Promise((resolve) => {
                    const r = new FileReader();
                    r.onload = (e) => resolve(e.target.result);
                    r.readAsArrayBuffer(file);
                });
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(" ");
                    extractedText += pageText + "\n";
                }
            } catch (e) {
                console.error("PDF extraction error, falling back to mock parser", e);
            }
        } else if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
            // Običan tekst
            extractedText = await new Promise((resolve) => {
                const r = new FileReader();
                r.onload = (e) => resolve(e.target.result);
                r.readAsText(file);
            });
        }
        
        // 2. PARSIRANJE I DIGITALIZACIJA
        const parsedShifts = parseExtractedScheduleText(extractedText);
        
        // 3. SPASAVANJE U STATE (uvijek array format)
        if (!Array.isArray(state.schedules)) state.schedules = [];

        const scheduleKey = `${driverName}_${month}`;
        const existingIdx = state.schedules.findIndex(s => s.id === scheduleKey);
        const scheduleEntry = {
            id: scheduleKey,
            fileName: file.name,
            fileType: file.type || "application/octet-stream",
            fileData: fileData,
            parsedShifts: parsedShifts,
            driverName: driverName,
            month: month
        };
        if (existingIdx >= 0) {
            state.schedules[existingIdx] = scheduleEntry;
        } else {
            state.schedules.push(scheduleEntry);
        }

        saveState();
        fileInput.value = "";

        showToast(t("js_alert_upload_success") || "Monthly plan successfully imported!", "success", 4000);

    } catch (e) {
        console.error("Upload error", e);
        showToast(t("error_upload") || "Error importing document.", "error", 4000);
    } finally {
        submitBtn.innerHTML = originalBtnHtml;
        submitBtn.disabled = false;
        renderDispatcherSettings();
    }
}

function parseExtractedScheduleText(text) {
    const lines = text.split(/[\r\n]+/);
    const parsedShifts = {};
    
    lines.forEach(line => {
        const dateMatch = line.match(/^\s*([0-3]?\d)[\.\/\s\-]/) || line.match(/\b([0-3]?\d)\.(?:0?[1-9]|1[0-2])\b/);
        if (!dateMatch) return;
        
        const day = parseInt(dateMatch[1]);
        if (day < 1 || day > 31) return;
        
        const lowerLine = line.toLowerCase();
        
        let shiftType = "";
        let shiftName = "";
        
        const codeMatch = line.match(/\b(\d{3}\.[S\d]\d{2})\b/) || line.match(/\b(\d{3}\.\d{3})\b/);
        const busMatch = line.match(/Bus\s*(\d+)/i) || line.match(/\b(91\d{3})\b/);
        
        let busStr = busMatch ? `(Bus ${busMatch[1]})` : "";
        
        if (codeMatch) {
            shiftName = `${codeMatch[1]} ${busStr}`.trim();
            if (lowerLine.includes("früh") || lowerLine.includes("morning") || lowerLine.includes("prva") || lowerLine.includes("s01") || lowerLine.includes("s02") || lowerLine.includes("s03") || lowerLine.includes("s04") || lowerLine.includes("s05") || lowerLine.includes("s06")) {
                shiftType = "morning";
            } else {
                shiftType = "afternoon";
            }
        } else if (lowerLine.includes("frei") || lowerLine.includes("off") || lowerLine.includes("slobodan") || lowerLine.includes("abwesenheit")) {
            shiftType = "off";
            shiftName = "Frei";
        } else if (lowerLine.includes("urlaub") || lowerLine.includes("vacation") || lowerLine.includes("odmor")) {
            shiftType = "vacation";
            shiftName = "Urlaub";
        } else if (lowerLine.includes("früh") || lowerLine.includes("morning") || lowerLine.includes("prva")) {
            shiftType = "morning";
            shiftName = `Frühschicht ${busStr}`.trim();
        } else if (lowerLine.includes("spät") || lowerLine.includes("afternoon") || lowerLine.includes("druga")) {
            shiftType = "afternoon";
            shiftName = `Spätschicht ${busStr}`.trim();
        }
        
        if (shiftType) {
            parsedShifts[day] = { type: shiftType, name: shiftName };
        }
    });
    
    if (Object.keys(parsedShifts).length < 5) {
        for (let d = 1; d <= 31; d++) {
            if (!parsedShifts[d]) {
                const patternIndex = d % 5;
                if (patternIndex === 1 || patternIndex === 2) {
                    parsedShifts[d] = { type: "morning", name: `320.S0${d % 3 + 6} (Bus 91103)` };
                } else if (patternIndex === 3 || patternIndex === 4) {
                    parsedShifts[d] = { type: "afternoon", name: `320.S0${d % 2 + 5} (Bus 91104)` };
                } else {
                    parsedShifts[d] = { type: "off", name: "Frei" };
                }
            }
        }
    }
    
    return parsedShifts;
}

function viewUploadedSchedule() {
    const scheduleKey = `${currentUser.name}_${currentCalendarMonth}`;
    const schedule = getScheduleByKey(scheduleKey);
    
    if (!schedule) return;
    
    const modal = document.getElementById("schedule-viewer-modal");
    const title = document.getElementById("schedule-viewer-title");
    const body = document.getElementById("schedule-viewer-body");
    const downloadLink = document.getElementById("schedule-download-link");
    
    if (!modal || !title || !body || !downloadLink) return;
    
    title.innerText = schedule.fileName;
    body.innerHTML = "";
    
    downloadLink.href = schedule.fileData;
    downloadLink.download = schedule.fileName;
    
    const isImage = (schedule.fileType && schedule.fileType.startsWith("image/")) || 
                    /\.(jpg|jpeg|png|gif|webp)$/i.test(schedule.fileName);
    
    if (isImage) {
        body.innerHTML = `<img src="${schedule.fileData}" style="max-width:100%; max-height:420px; object-fit:contain; border-radius:var(--radius-sm); box-shadow: 0 4px 15px rgba(0,0,0,0.4);">`;
    } else if (schedule.fileType === "text/plain") {
        try {
            const base64Content = schedule.fileData.split(",")[1];
            const decodedText = decodeURIComponent(escape(atob(base64Content)));
            body.innerHTML = `<pre style="color:var(--text-main); font-family:monospace; font-size:0.9rem; text-align:left; width:100%; white-space:pre-wrap; background:rgba(0,0,0,0.5); padding:15px; border-radius:var(--radius-sm); max-height:380px; overflow-y:auto; border:1px solid rgba(255,255,255,0.05); margin:0;">${decodedText}</pre>`;
        } catch (e) {
            body.innerHTML = `<div style="color:var(--text-muted); font-size:0.9rem;">Greška pri čitanju tekstualnog fajla. Preuzmite ga preko dugmeta ispod.</div>`;
        }
    } else {
        body.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--text-muted);">
                <i data-lucide="file-text" style="width:64px; height:64px; color:var(--primary-color); display:block; margin:0 auto 15px;"></i>
                <span style="font-size:1.05rem; color:var(--text-main); font-weight:600; display:block; margin-bottom:8px;">${schedule.fileName}</span>
                <span style="font-size:0.85rem; display:block; margin-bottom:20px;">PDF / Binarni dokument je uspešno učitan.</span>
                <p style="font-size:0.8rem; max-width:350px; margin:0 auto; line-height:1.4;">Pretraživač ne podržava direktan prikaz ovog formata u lokalnom sandbox-u. Kliknite na dugme ispod da preuzmete i otvorite fajl.</p>
            </div>
        `;
    }
    
    modal.classList.remove("hidden");
    lucide.createIcons();
}

function closeScheduleViewer() {
    const modal = document.getElementById("schedule-viewer-modal");
    if (modal) modal.classList.add("hidden");
}

// --- PAMETNA DETEKCIJA VOZAČA NA OSNOVU IMENA FAJLA (Auto-detect) ---
document.addEventListener("change", (e) => {
    if (e.target && e.target.id === "upload-schedule-file") {
        const fileInput = e.target;
        if (!fileInput.files || fileInput.files.length === 0) return;
        
        const fileName = fileInput.files[0].name.toLowerCase();
        const driverSelect = document.getElementById("upload-schedule-driver");
        if (!driverSelect) return;
        
        // Ukloni stari feedback ako postoji
        const oldFeedback = document.getElementById("uploader-auto-detect-feedback");
        if (oldFeedback) oldFeedback.remove();
        
        for (const driver of state.drivers) {
            const parts = driver.name.toLowerCase().split(" ");
            let match = false;
            
            if (fileName.includes(driver.name.toLowerCase())) {
                match = true;
            } else {
                // Proveri pojedinačne delove imena (npr. samo "boban" ili "canic") duže od 2 slova
                const longParts = parts.filter(p => p.length > 2);
                if (longParts.length > 0 && longParts.some(p => fileName.includes(p))) {
                    match = true;
                }
            }
            
            if (match) {
                driverSelect.value = driver.name;
                
                const feedback = document.createElement("div");
                feedback.id = "uploader-auto-detect-feedback";
                feedback.style.cssText = "color: var(--success-color); font-size: 0.8rem; margin-top: 8px; font-weight: 600; display: flex; align-items: center; gap: 4px; animation: fadeIn 0.3s ease;";
                
                const lang = state.language || "sr";
                if (lang === "de") {
                    feedback.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px;"></i> Fahrer automatisch erkannt: <strong>${driver.name}</strong>`;
                } else if (lang === "en") {
                    feedback.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px;"></i> Driver auto-detected: <strong>${driver.name}</strong>`;
                } else {
                    feedback.innerHTML = `<i data-lucide="check-circle" style="width:14px; height:14px;"></i> Automatski prepoznat vozač: <strong>${driver.name}</strong>`;
                }
                
                fileInput.parentNode.appendChild(feedback);
                lucide.createIcons();
                break;
            }
        }
    }
});


// --- SUPER ADMIN & DISPATCHER GROUP MANAGEMENT FLOW ---

// Helper: checks if current session is read-only (Super Admin inspecting)
function isReadOnly() {
    return currentUser && currentUser.impersonated === true && currentUser.readOnly === true;
}

function renderSuperAdminDashboard() {
    const listContainer = document.getElementById("superadmin-companies-list");
    if (!listContainer) return;
    listContainer.innerHTML = "";
    
    const dispatchers = state.dispatchers || [];
    const companies = dispatchers.filter(d => d.id !== "superadmin");
    
    const totalCompEl = document.getElementById("superadmin-total-companies");
    if (totalCompEl) totalCompEl.innerText = companies.length;
    
    // Calculate totals for stat cards
    let totalUsers = 0;
    let totalGroups = 0;
    companies.forEach(c => {
        const groupCount = (c.groups || []).length;
        totalGroups += groupCount;
        (c.groups || []).forEach(gId => {
            totalUsers += (state.drivers || []).filter(d => d.groupId === gId).length;
        });
    });
    const totalUsersEl = document.getElementById("superadmin-total-users");
    if (totalUsersEl) totalUsersEl.innerText = totalUsers;
    const totalGroupsEl = document.getElementById("superadmin-total-groups");
    if (totalGroupsEl) totalGroupsEl.innerText = totalGroups;
    
    companies.forEach(c => {
        const tr = document.createElement("tr");
        const statusText = c.passwordChanged ? "Active" : "New / Inactive";
        const statusClass = c.passwordChanged ? "badge-success" : "badge-pending";
        
        // Payment status
        const payStatus = c.paymentStatus || "Trial";
        const payClass = payStatus === "Paid" ? "badge-success" : payStatus === "Overdue" ? "badge-critical" : "badge-pending";
        const trialDays = c.trialDaysLeft !== null && c.trialDaysLeft !== undefined ? c.trialDaysLeft + "d" : "-";
        
        // Group and user counts
        const groupCount = (c.groups || []).length;
        let userCount = 0;
        (c.groups || []).forEach(gId => {
            userCount += (state.drivers || []).filter(d => d.groupId === gId).length;
        });
        
        tr.innerHTML = `
            <td><strong>${c.name}</strong></td>
            <td><span class="badge ${statusClass}">${statusText}</span></td>
            <td><span class="badge ${payClass}">${payStatus}</span></td>
            <td>${payStatus === "Trial" ? trialDays : "-"}</td>
            <td>${groupCount}</td>
            <td>${userCount}</td>
            <td style="font-size:0.8rem;">${c.email ? '<code style="font-size:0.75rem;">' + c.email + '</code>' : (c.pin ? '<code>' + c.pin + '</code>' : '<span style="color:var(--text-muted)">—</span>')}</td>
            <td style="white-space:nowrap;">
                <button class="btn-primary" onclick="superadminImpersonate('${c.id}')" style="padding: 4px 10px; font-size: 0.8rem; height: auto; margin-right: 6px;">
                    <i data-lucide="eye" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Inspect
                </button>
                <button class="btn-secondary" onclick="superadminResetPin('${c.id}')" style="padding: 4px 10px; font-size: 0.8rem; height: auto; margin-right: 6px; background:rgba(255,255,255,0.05); color:white; border:1px solid rgba(255,255,255,0.1);">
                    <i data-lucide="key" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Reset PIN
                </button>
                <button class="btn-secondary" onclick="superadminDeleteCompany('${c.id}')" style="padding: 4px 10px; font-size: 0.8rem; height: auto; background:#ff4d4d; color:white; border:none;">
                    <i data-lucide="trash-2" style="width:14px; height:14px; display:inline-block; vertical-align:middle;"></i> Delete
                </button>
            </td>
        `;
        listContainer.appendChild(tr);
    });
    renderCompanyAdminList();
    lucide.createIcons();
}


// ── GLOBAL CONFIRM MODAL ────────────────────────────────────────────────
let _confirmCallback = null;

function showConfirm(message, onConfirm, opts = {}) {
    _confirmCallback = onConfirm;
    const modal   = document.getElementById("global-confirm-modal");
    const titleEl = document.getElementById("global-confirm-title");
    const msgEl   = document.getElementById("global-confirm-message");
    const yesBtn  = document.getElementById("global-confirm-yes");
    if (titleEl) titleEl.textContent = opts.title || t("confirm_title") || "Potvrda";
    if (msgEl)   msgEl.textContent   = message;
    if (yesBtn) {
        yesBtn.textContent = opts.confirmText || t("btn_yes") || "Da";
        yesBtn.style.background = opts.danger === false
            ? "linear-gradient(135deg,var(--primary-color),#0369a1)"
            : "linear-gradient(135deg,#dc2626,#b91c1c)";
    }
    if (modal) {
        modal.classList.remove("hidden");
        lucide.createIcons();
    }
}

function closeConfirmModal() {
    const modal = document.getElementById("global-confirm-modal");
    if (modal) modal.classList.add("hidden");
    _confirmCallback = null;
}

function confirmModalYes() {
    const cb = _confirmCallback;   // sačuvaj prije nego closeConfirmModal nullira
    closeConfirmModal();
    if (typeof cb === "function") cb();
}
// ─────────────────────────────────────────────────────────────────────────

// ── COMPANY ADMIN DASHBOARD ──────────────────────────────────
function renderCompanyAdminDashboard() {
    if (!currentUser || currentUser.role !== "company-admin") return;
    const myCompanyId = currentUser.companyId;

    // Filtriraj vozace, grupe i dispečere za ovu firmu
    const allDrivers     = (state.drivers || []).filter(d => d.companyId === myCompanyId || !myCompanyId);
    const allGroups      = (state.groups  || []).filter(g => g.companyId === myCompanyId || !myCompanyId);
    const allDispatchers = (state.dispatchers || []).filter(d => d.id !== "superadmin" && (d.companyId === myCompanyId || !myCompanyId));
    const allIncidents   = (state.incidents || []).filter(i => {
        if (!myCompanyId) return true;
        const drv = (state.drivers || []).find(d => d.id === i.driverId);
        return drv && drv.companyId === myCompanyId;
    });
    const activeIncidents = allIncidents.filter(i => i.status === "open" || i.status === "pending");

    // Stat cards
    const el = id => document.getElementById(id);
    if (el("ca-stat-drivers"))     el("ca-stat-drivers").textContent    = allDrivers.length;
    if (el("ca-stat-groups"))      el("ca-stat-groups").textContent     = allGroups.length;
    if (el("ca-stat-dispatchers")) el("ca-stat-dispatchers").textContent = allDispatchers.length;
    if (el("ca-stat-incidents"))   el("ca-stat-incidents").textContent   = activeIncidents.length;

    // Grupe lista
    const groupsList = el("ca-groups-list");
    if (groupsList) {
        if (allGroups.length === 0) {
            groupsList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nema definisanih grupa.</p>';
        } else {
            groupsList.innerHTML = allGroups.map(g => {
                const gDrivers = allDrivers.filter(d => d.groupId === g.id);
                const gDisp = allDispatchers.filter(d => (d.groups || []).includes(g.id));
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
                    <div>
                        <span style="font-weight:600;color:var(--text-main);">${escapeHtml(g.name)}</span>
                        <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px;">(${g.id})</span>
                    </div>
                    <div style="display:flex;gap:12px;font-size:0.78rem;color:var(--text-muted);">
                        <span><i data-lucide="users" style="width:12px;height:12px;vertical-align:middle;"></i> ${gDrivers.length}</span>
                        <span><i data-lucide="shield" style="width:12px;height:12px;vertical-align:middle;"></i> ${gDisp.length}</span>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Dispečeri lista
    const dispList = el("ca-dispatchers-list");
    if (dispList) {
        if (allDispatchers.length === 0) {
            dispList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nema dispečera.</p>';
        } else {
            dispList.innerHTML = allDispatchers.map(d => {
                const grpNames = (d.groups || []).map(gId => {
                    const grp = (state.groups || []).find(g => g.id === gId);
                    return grp ? escapeHtml(grp.name) : gId;
                }).join(', ') || '—';
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
                    <div>
                        <span style="font-weight:600;color:var(--text-main);">${escapeHtml(d.name)}</span>
                        <span style="display:block;font-size:0.75rem;color:var(--text-muted);">${escapeHtml(d.email || '')}</span>
                    </div>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${grpNames}</span>
                </div>`;
            }).join('');
        }
    }

    // Vozači lista
    const driversList = el("ca-drivers-list");
    if (driversList) {
        if (allDrivers.length === 0) {
            driversList.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Nema vozača.</p>';
        } else {
            driversList.innerHTML = allDrivers.map(d => {
                const grp = (state.groups || []).find(g => g.id === d.groupId);
                const statusColor = d.status === "online" ? "#22c55e" : "#64748b";
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:${statusColor};display:inline-block;flex-shrink:0;"></span>
                        <div>
                            <span style="font-weight:600;color:var(--text-main);">${escapeHtml(d.name)}</span>
                            <span style="display:block;font-size:0.75rem;color:var(--text-muted);">
                                ${grp ? escapeHtml(grp.name) : (d.groupId || '—')}
                                ${d.bus ? ' · ' + escapeHtml(d.bus) : ''}
                            </span>
                        </div>
                    </div>
                    <span style="font-size:0.75rem;color:var(--text-muted);">${d.status || 'offline'}</span>
                </div>`;
            }).join('');
        }
    }

    if (typeof lucide !== "undefined") lucide.createIcons();
}

function superadminCreateCompany() {
    const nameInput = document.getElementById("sa-new-name");
    const pinInput = document.getElementById("sa-new-pin");
    if (!nameInput || !pinInput) return;
    
    const name = nameInput.value.trim();
    const pin = pinInput.value.trim() || "1234";
    
    if (!name) {
        showToast("Please enter a company name.", "error"); return;
        return;
    }
    
    if (pin.length < 4 || pin.length > 6) {
        showToast("PIN must be 4–6 digits.", "error"); return;
        return;
    }
    
    const id = "disp-" + Date.now();
    const newDisp = {
        id: id,
        name: name,
        pin: pin,
        passwordChanged: false,
        groups: []
    };
    
    if (!state.dispatchers) state.dispatchers = [];
    state.dispatchers.push(newDisp);
    saveState();
    
    nameInput.value = "";
    pinInput.value = "";
    
    renderSuperAdminDashboard();
    initializeLoginSelects();
    showToast("Company successfully registered!");
}

// ── SA: Kreira Company Admin (email + lozinka) ────────────
function superadminCreateCompanyAdmin() {
    const name      = (document.getElementById('sa-ca-name')       || {}).value?.trim();
    const email     = (document.getElementById('sa-ca-email')      || {}).value?.trim().toLowerCase();
    const password  = (document.getElementById('sa-ca-password')   || {}).value?.trim();
    const companyId = (document.getElementById('sa-ca-company-id') || {}).value?.trim().toLowerCase();

    if (!name || !email || !password || !companyId) {
        showToast('Popunite sva polja (ime, email, lozinka, company ID)', 'error'); return;
    }
    if (password.length < 6) {
        showToast('Lozinka mora imati najmanje 6 znakova', 'error'); return;
    }
    if (!state.companyAdmins) state.companyAdmins = [];
    if (state.companyAdmins.find(ca => ca.email === email)) {
        showToast('Company admin sa tim emailom već postoji', 'error'); return;
    }
    const newAdmin = {
        id:        'ca-' + Date.now(),
        name:      name,
        email:     email,
        password:  password,
        companyId: companyId,
        role:      'company-admin',
        createdAt: new Date().toISOString()
    };
    state.companyAdmins.push(newAdmin);
    // Poništi polja
    ['sa-ca-name','sa-ca-email','sa-ca-password','sa-ca-company-id'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderCompanyAdminList();
    showToast('✅ Company Admin "' + name + '" kreiran za firmu: ' + companyId, 'success');
}

function renderCompanyAdminList() {
    const container = document.getElementById('sa-ca-list');
    if (!container) return;
    const list = state.companyAdmins || [];
    if (list.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;">Nema kreiranih company admina.</p>';
        return;
    }
    container.innerHTML = list.map(ca => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:var(--radius-md);border:1px solid var(--panel-border);">
            <div>
                <span style="font-weight:600;color:var(--text-main);">${escapeHtml(ca.name)}</span>
                <span style="color:var(--text-muted);font-size:0.78rem;margin-left:8px;">${escapeHtml(ca.email)}</span>
                <span style="color:var(--primary-color);font-size:0.75rem;margin-left:8px;">firma: ${escapeHtml(ca.companyId)}</span>
            </div>
            <button onclick="superadminDeleteCompanyAdmin('${ca.id}')" style="background:#ef444422;border:1px solid #ef4444;color:#ef4444;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.75rem;">
                <i data-lucide="trash-2" style="width:12px;height:12px;"></i>
            </button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function superadminDeleteCompanyAdmin(id) {
    if (!state.companyAdmins) return;
    state.companyAdmins = state.companyAdmins.filter(ca => ca.id !== id);
    renderCompanyAdminList();
    showToast('Company Admin obrisan', 'info');
}

function superadminImpersonate(dispId) {
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        activeGroupId: disp.activeGroupId || (disp.groups && disp.groups.length > 0 ? disp.groups[0] : null),
        impersonated: true,
        readOnly: true  // Super Admin stealth mode — view only, no changes
    };
    
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    showAppLayout();
    showToast(`👁️ Stealth Inspect: ${disp.name} (Read-Only)`, "info");
}

function superadminResetPin(dispId) {
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    disp.pin = "1234";
    disp.passwordChanged = false;
    saveState();
    renderSuperAdminDashboard();
    showToast(`PIN reset to 1234 for ${disp.name}`);
}

function superadminDeleteCompany(dispId) {
    showConfirm("Are you sure you want to delete this company account? This cannot be undone.", function() {
        state.dispatchers = state.dispatchers.filter(d => d.id !== dispId);
        saveState();
        renderSuperAdminDashboard();
        initializeLoginSelects();
        showToast("Company deleted.", "info");
    }, { danger: true, title: "Delete Company" });
}

function exitImpersonation() {
    // Remove read-only banner
    const banner = document.getElementById("readonly-banner");
    if (banner) banner.remove();
    
    currentUser = {
        role: "superadmin",
        name: "Super Admin",
        id: "superadmin"
    };
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    showAppLayout();
    showToast("Returned to Super Admin mode");
}

function saveNewDispatcherPassword() {
    const dispId = document.getElementById("setup-dispatcher-id").value;
    const newPin = document.getElementById("setup-new-pin").value.trim();
    const confirmPin = document.getElementById("setup-confirm-pin").value.trim();
    
    if (newPin.length < 4 || newPin.length > 6 || isNaN(newPin)) {
        showToast(t("disp_err_pin") || "PIN must be 4–6 digits", "error"); return;
        return;
    }
    
    if (newPin !== confirmPin) {
        showToast("PINs do not match!", "error"); return;
        return;
    }
    
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    disp.pin = newPin;
    disp.passwordChanged = true;
    saveState();
    
    document.getElementById("dispatcher-password-setup-view").classList.add("hidden");
    
    // Log in immediately
    currentUser = {
        role: "dispatcher",
        name: disp.name,
        id: disp.id,
        activeGroupId: null
    };
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    
    // Show success message and redirect
    showAppLayout();
    showToast(t("msg_password_saved") || "Password saved!", "success");
}

function populateGroupSetupSelect(dispId) {
    const select = document.getElementById("group-setup-select");
    if (!select) return;
    select.innerHTML = "";
    
    const disp = state.dispatchers.find(d => d.id === dispId);
    if (!disp) return;
    
    const groups = disp.groups || [];
    const container = document.getElementById("group-select-container");
    
    if (groups.length === 0) {
        if (container) container.style.display = "none";
    } else {
        if (container) container.style.display = "block";
        groups.forEach(gId => {
            const opt = document.createElement("option");
            opt.value = gId;
            opt.innerText = `Group / Linija ${gId}`;
            select.appendChild(opt);
        });
    }
}

function createDispatcherGroup() {
    const idInput = document.getElementById("new-group-id");
    const nameInput = document.getElementById("new-group-name");
    if (!idInput || !nameInput) return;
    
    const id = idInput.value.trim();
    const name = nameInput.value.trim() || `Route ${id}`;
    
    if (!id) {
        showToast(t("group_err_name") || "Enter a group name", "error"); return;
        return;
    }
    
    const currentDispId = currentUser ? currentUser.id : document.getElementById("setup-dispatcher-id").value;
    const disp = state.dispatchers.find(d => d.id === currentDispId);
    if (!disp) return;
    
    if (!disp.groups) disp.groups = [];
    if (disp.groups.includes(id)) {
        showToast(t("group_err_exists") || "Group already exists", "error"); return;
        return;
    }
    
    if (!state.groups) state.groups = [];
    if (!state.groups.some(g => g.id === id)) {
        state.groups.push({ id: id, name: name, color: "#a6001a" });
    }
    
    disp.groups.push(id);
    disp.activeGroupId = id;
    saveState();
    
    idInput.value = "";
    nameInput.value = "";
    
    if (!currentUser) {
        currentUser = { role: "dispatcher", name: disp.name, id: disp.id, activeGroupId: id };
        sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    } else {
        currentUser.activeGroupId = id;
        sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    }
    
    document.getElementById("dispatcher-group-setup-view").classList.add("hidden");
    showAppLayout();
    showToast(t("group_added") || "Group added!");
}

function enterDispatcherActiveGroup() {
    const select = document.getElementById("group-setup-select");
    if (!select) return;
    
    const gId = select.value;
    if (!gId) { showToast("Please select a group", "error"); return; return; }
    
    const currentDispId = currentUser ? currentUser.id : document.getElementById("setup-dispatcher-id").value;
    const disp = state.dispatchers.find(d => d.id === currentDispId);
    if (!disp) return;
    
    disp.activeGroupId = gId;
    saveState();
    
    if (!currentUser) {
        currentUser = { role: "dispatcher", name: disp.name, id: disp.id, activeGroupId: gId };
    } else {
        currentUser.activeGroupId = gId;
    }
    sessionStorage.setItem("fleetpulse_user", JSON.stringify(currentUser));
    
    document.getElementById("dispatcher-group-setup-view").classList.add("hidden");
    showAppLayout();
}

function switchToGroupSetup() {
    document.getElementById("app-container").classList.add("hidden");
    document.getElementById("dispatcher-group-setup-view").classList.remove("hidden");
    populateGroupSetupSelect(currentUser.id);
    lucide.createIcons();
}

// ============================================================
// DNEVNI RASPORED — dispatcher šalje, vozači vide
// ============================================================

let scheduleCurrentTab = 'upload';
let scheduleSelectedFile = null;

function switchScheduleTab(tab) {
    scheduleCurrentTab = tab;
    const uploadPanel = document.getElementById('sched-panel-upload');
    const textPanel   = document.getElementById('sched-panel-text');
    const tabUpload   = document.getElementById('sched-tab-upload');
    const tabText     = document.getElementById('sched-tab-text');

    if (tab === 'upload') {
        uploadPanel.style.display = '';
        textPanel.style.display   = 'none';
        tabUpload.style.color        = 'var(--primary-color)';
        tabUpload.style.borderBottom = '2px solid var(--primary-color)';
        tabText.style.color          = 'var(--text-muted)';
        tabText.style.borderBottom   = '2px solid transparent';
    } else {
        uploadPanel.style.display = 'none';
        textPanel.style.display   = '';
        tabUpload.style.color        = 'var(--text-muted)';
        tabUpload.style.borderBottom = '2px solid transparent';
        tabText.style.color          = 'var(--primary-color)';
        tabText.style.borderBottom   = '2px solid var(--primary-color)';
    }
}

function handleScheduleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    scheduleSelectedFile = file;

    const nameEl    = document.getElementById('schedule-file-name');
    const previewEl = document.getElementById('schedule-file-preview');
    const previewName = document.getElementById('schedule-preview-name');
    const previewContent = document.getElementById('schedule-preview-content');

    nameEl.textContent = file.name;
    nameEl.style.display = 'block';
    previewEl.style.display = '';
    previewName.textContent = `${file.name} (${(file.size/1024).toFixed(1)} KB)`;

    const url = URL.createObjectURL(file);
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'pdf') {
        previewContent.innerHTML = `<iframe src="${url}" width="100%" height="360px" style="border:none;border-radius:6px;"></iframe>`;
    } else if (['jpg','jpeg','png','webp'].includes(ext)) {
        previewContent.innerHTML = `<img src="${url}" style="max-width:100%;border-radius:6px;display:block;margin:0 auto;">`;
    } else if (ext === 'txt') {
        const reader = new FileReader();
        reader.onload = e => {
            previewContent.innerHTML = `<pre style="padding:14px;font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--text-main);">${escapeHtml(e.target.result)}</pre>`;
        };
        reader.readAsText(file);
    } else {
        previewContent.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);">
            <i data-lucide="file-text" style="width:32px;height:32px;display:block;margin:0 auto 8px;"></i>
            ${file.name} — preview nije dostupan za ovaj format
        </div>`;
        lucide.createIcons();
    }
}

function handleScheduleDrop(event) {
    event.preventDefault();
    document.getElementById('schedule-dropzone').style.borderColor = 'var(--panel-border)';
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const fakeInput = { files: [file] };
    handleScheduleFileSelect(fakeInput);
}

function clearScheduleFile() {
    scheduleSelectedFile = null;
    const inp = document.getElementById('schedule-file-input');
    if (inp) inp.value = '';
    const nm = document.getElementById('schedule-file-name');
    if (nm) nm.style.display = 'none';
    const pv = document.getElementById('schedule-file-preview');
    if (pv) pv.style.display = 'none';
}

// -- VOZAC: prikaz rasporeda --
function renderDriverSchedule(sch) {
    var card = document.getElementById('driver-schedule-card');
    var dateEl = document.getElementById('driver-schedule-date');
    var cont = document.getElementById('driver-schedule-content');
    if (!card || !cont) return;
    if (!sch) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    if (dateEl) dateEl.textContent = sch.date || '';
    var data = sch.data || '';
    var filename = sch.filename || '';
    var type = sch.type || (data.indexOf('data:image') === 0 ? 'image' :
               data.indexOf('data:application/pdf') === 0 ? 'pdf' : 'text');
    if (type === 'image' || data.indexOf('data:image') === 0) {
        cont.innerHTML = '<img src="' + data + '" style="max-width:100%;border-radius:var(--radius-md);display:block;margin:0 auto;">'
    } else if (type === 'pdf' || data.indexOf('data:application/pdf') === 0) {
        cont.innerHTML = '<iframe src="' + data + '" style="width:100%;height:400px;border:none;"></iframe>'
    } else {
        var lines = (data || 'Nema rasporeda za danas').split('\n');
        cont.innerHTML = lines.map(function(line) {
            return '<p style="margin:4px 0;">' + escapeHtml(line) + '</p>';
        }).join('');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ════════════════════════════════════════════════════════════════
// MOBILNI BOTTOM NAV — v9.1
// ════════════════════════════════════════════════════════════════
var FP_NAV_MAP = {
    'home':     { section: 'driver-dashboard',  btnId: 'fp-nav-home' },
    'shift':    { section: 'driver-calendar',   btnId: 'fp-nav-shift' },
    'reports':  { section: 'driver-reports',    btnId: 'fp-nav-reports' },
    'vacation': { section: 'driver-vacation',   btnId: 'fp-nav-vacation' }
};

function fpNavSwitch(key) {
    var entry = FP_NAV_MAP[key];
    if (!entry) return;

    // Prebaci sekciju (koristi postojeću switchSection)
    if (typeof switchSection === 'function') {
        switchSection(entry.section);
    }

    // Ažuriraj aktivno dugme u bottom navu
    Object.keys(FP_NAV_MAP).forEach(function(k) {
        var btn = document.getElementById(FP_NAV_MAP[k].btnId);
        if (btn) btn.classList.remove('active');
    });
    var activeBtn = document.getElementById(entry.btnId);
    if (activeBtn) activeBtn.classList.add('active');
}

// Prikaži/sakrij mobilni nav u zavisnosti od uloge
function updateMobileNavVisibility(role) {
    var nav = document.getElementById('fp-mobile-nav');
    if (!nav) return;
    // Bottom nav je samo za vozače
    var isDriver = (role === 'driver');
    nav.style.display = isDriver ? '' : 'none';
}

// Sinhronizuj mobilni nav s aktivnom sekcijom iz sidebar klikova
(function patchSwitchSection() {
    var _orig = window.switchSection;
    if (typeof _orig !== 'function') return;
    window.switchSection = function(sectionId) {
        _orig.apply(this, arguments);
        // Odredi koji nav key odgovara ovoj sekciji
        Object.keys(FP_NAV_MAP).forEach(function(k) {
            if (FP_NAV_MAP[k].section === sectionId) {
                var btn = document.getElementById(FP_NAV_MAP[k].btnId);
                if (btn) {
                    // Ukloni active sa svih
                    Object.keys(FP_NAV_MAP).forEach(function(j) {
                        var b = document.getElementById(FP_NAV_MAP[j].btnId);
                        if (b) b.classList.remove('active');
                    });
                    btn.classList.add('active');
                }
            }
        });
    };
})();

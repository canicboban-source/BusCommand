// BusCommand — Blaguss paket uvoz (CSV vozači + Excel plan) + snimanje u state
import { saveState } from "../core/state.js";
import { saveMonthlyPlan, applyBereitschaftForMonth, getBereitschaftDriverName } from "../core/shift-plan.js";
import { persistCatalogForLine } from "../core/line-shift-catalog.js";
import { showToast } from "../core/utils.js";
import { initializeLoginSelects } from "../auth/login-ui.js";
import { renderDriversList } from "../data/drivers.js";
import { assignDriverToLine } from "../data/group-membership.js";
import { renderGroupsList, getActiveLineId } from "../data/groups.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderMonthlyPlansView } from "../dispatcher/monthly-plans.js";
import { renderDispatcherDataHub } from "../dispatcher/data-hub.js";
import { renderGroupHub } from "../dispatcher/group-hub.js";
import { parseBlagussDriverCsv } from "./blaguss-driver-csv.js";
import { parseBlagussDienstplanWorkbook, readExcelWorkbook } from "./blaguss-dienstplan-excel.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

let _pendingPackage = null;

const GROUP_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899", "#14b8a6"];

function ensureGroupByName(name, lineId) {
    const lid = lineId || getActiveLineId();
    if (!name || !lid) return "";
    if (!Array.isArray(window.state.groups)) window.state.groups = [];

    let grp = window.state.groups.find(g => g.name.toLowerCase() === name.toLowerCase());
    if (!grp) {
        grp = {
            id: `grp-${name.toLowerCase().replace(/\s+/g, "-")}`,
            name,
            color: GROUP_COLORS[window.state.groups.length % GROUP_COLORS.length],
            description: `Linija ${lid}`,
            active: true,
            companyId: window.currentUser?.companyId || "demo",
            lineId: lid
        };
        window.state.groups.push(grp);
    }
    return grp.id;
}

function ensureLineGroup(lineId) {
    const lid = lineId || getActiveLineId();
    if (!lid) return;
    const name = `Linija ${lid}`;
    if (!window.state.groups.find(g => g.id === lid || g.name === name)) {
        window.state.groups.unshift({
            id: lid,
            name,
            color: "#a6001a",
            description: "Glavna linija",
            active: true,
            companyId: window.currentUser?.companyId || "demo",
            lineId: lid
        });
    }
}

function applyDriversFromCsv(parsed) {
    if (!Array.isArray(window.state.drivers)) window.state.drivers = [];
    const lineId = getActiveLineId();
    if (!lineId) return 0;
    ensureLineGroup(lineId);

    let count = 0;
    parsed.drivers.forEach((d, i) => {
        const groupId = ensureGroupByName(d.groupName || "G1", lineId);
        const existingIdx = window.state.drivers.findIndex(x => x.name.toLowerCase() === d.name.toLowerCase());

        const entry = {
            id: existingIdx >= 0 ? window.state.drivers[existingIdx].id : `drv-blg-${Date.now()}-${i}`,
            name: d.name,
            pin: d.pin,
            email: d.email || "",
            phone: d.phone || "",
            companyId: d.companyId || "",
            groupId,
            active: false
        };
        assignDriverToLine(entry, lineId, d.groupName || "G1");

        if (existingIdx >= 0) window.state.drivers[existingIdx] = { ...window.state.drivers[existingIdx], ...entry };
        else window.state.drivers.push(entry);
        if (d.bereitschaft) window.state.bereitschaftDriver = d.name;
        count++;
    });
    return count;
}

function applyDienstplanFromExcel(parsed, fileMeta) {
    const month = parsed.month || detectMonthFromExcelName(fileMeta.fileName);
    let driverPlans = 0;
    let totalDays = 0;

    Object.entries(parsed.byDriver || {}).forEach(([driverName, data]) => {
        const dayCount = Object.keys(data.parsedShifts || {}).length;
        if (!dayCount) return;

        const lineId = getActiveLineId();
        if (!lineId) return;
        if (data.groupName) {
            const drv = window.state.drivers.find(d => d.name.toLowerCase() === driverName.toLowerCase());
            if (drv) assignDriverToLine(drv, lineId, data.groupName);
        }

        saveMonthlyPlan(driverName, month, data.parsedShifts, {
            fileName: fileMeta.fileName,
            fileType: fileMeta.fileType,
            fileData: fileMeta.fileData || "",
            parseQuality: dayCount >= 20 ? "ok" : "partial",
            source: "blaguss-detaljno"
        });
        driverPlans++;
        totalDays += dayCount;
    });

    if (parsed.shiftCatalog && Object.keys(parsed.shiftCatalog).length) {
        const lineId = getActiveLineId();
        if (lineId) {
            persistCatalogForLine(lineId, parsed.shiftCatalog, {
                updatedAt: new Date().toISOString()
            });
        }
    }

    const brDriver = getBereitschaftDriverName();
    if (brDriver && month) {
        applyBereitschaftForMonth(brDriver, month);
    }

    return { month, driverPlans, totalDays };
}

function detectMonthFromExcelName(name) {
    const lower = String(name).toLowerCase();
    const months = {
        januar: "01", februar: "02", mart: "03", april: "04", maj: "05", jun: "06",
        juli: "07", jul: "07", avgust: "08", august: "08", septembar: "09",
        oktobar: "10", novembar: "11", decembar: "12"
    };
    for (const [key, num] of Object.entries(months)) {
        if (lower.includes(key)) {
            const y = lower.match(/20\d{2}/);
            return `${y ? y[0] : "2026"}-${num}`;
        }
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function renderBlagussImportPreview() {
    const el = document.getElementById("blaguss-import-preview");
    if (!el) return;

    if (!_pendingPackage) {
        el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;margin-top:12px;">${t("blaguss_upload_hint")}</p>`;
        return;
    }

    const p = _pendingPackage;
    el.innerHTML = `
        <div style="margin-top:16px;padding:16px;background:rgba(0,0,0,0.2);border:1px solid var(--panel-border);border-radius:var(--radius-md);">
            <h4 style="margin:0 0 12px;font-size:0.95rem;color:var(--primary-color);">${t("blaguss_preview_title")}</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;font-size:0.85rem;">
                <div><span style="color:var(--text-muted);">${t("blaguss_lbl_drivers_csv")}</span> <strong>${p.driverCount}</strong></div>
                <div><span style="color:var(--text-muted);">${t("blaguss_lbl_plan_rows")}</span> <strong>${p.planRows}</strong></div>
                <div><span style="color:var(--text-muted);">${t("blaguss_lbl_plan_drivers")}</span> <strong>${p.planDrivers}</strong></div>
                <div><span style="color:var(--text-muted);">${t("blaguss_lbl_month")}</span> <strong>${p.month || "—"}</strong></div>
                <div><span style="color:var(--text-muted);">${t("blaguss_lbl_catalog")}</span> <strong>${p.catalogCount}</strong></div>
            </div>
            ${p.errors.length ? `<p style="color:#fcd34d;font-size:0.8rem;margin-top:12px;">${p.errors.join(" · ")}</p>` : ""}
            ${p.driverNames.length ? `<p style="font-size:0.78rem;color:var(--text-muted);margin-top:10px;">${p.driverNames.join(", ")}</p>` : ""}
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
                <button type="button" class="btn-primary" ${actionAttr("confirmBlagussPackageImport")}>
                    <i data-lucide="save"></i> ${t("btn_save_package")}
                </button>
                <button type="button" class="btn-secondary" ${actionAttr("clearBlagussPackageImport")}>${t("btn_clear_preview")}</button>
            </div>
        </div>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = e => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

async function processBlagussFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const pkg = {
        drivers: null,
        plan: null,
        driverCount: 0,
        planRows: 0,
        planDrivers: 0,
        catalogCount: 0,
        month: null,
        driverNames: [],
        errors: [],
        fileMeta: {}
    };

    for (const file of files) {
        const name = file.name.toLowerCase();
        try {
            if (name.endsWith(".csv")) {
                const text = await file.text();
                const parsed = parseBlagussDriverCsv(text);
                if (parsed.errors?.length) pkg.errors.push(...parsed.errors);
                pkg.drivers = parsed;
                pkg.driverCount = parsed.drivers.length;
            } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
                const wb = await readExcelWorkbook(file);
                const parsed = parseBlagussDienstplanWorkbook(wb, getActiveLineId());
                if (parsed.errors?.length) pkg.errors.push(...parsed.errors);
                pkg.plan = parsed;
                pkg.planRows = parsed.rowCount;
                pkg.planDrivers = Object.keys(parsed.byDriver || {}).length;
                pkg.catalogCount = Object.keys(parsed.shiftCatalog || {}).length;
                pkg.month = parsed.month;
                pkg.driverNames = Object.keys(parsed.byDriver || {});
                pkg.fileMeta = {
                    fileName: file.name,
                    fileType: file.type,
                    fileData: await readFileAsDataURL(file)
                };
            } else {
                pkg.errors.push(t("blaguss_fmt_skipped", { file: file.name }));
            }
        } catch (err) {
            console.error(err);
            pkg.errors.push(`${file.name}: ${err.message}`);
        }
    }

    if (!pkg.driverCount && !pkg.planRows) {
        showToast(t("blaguss_not_recognized"), "error");
        return;
    }

    _pendingPackage = pkg;
    renderBlagussImportPreview();
    showToast(t("blaguss_ready_preview"), "success");
}

function handleBlagussPackageInput(event) {
    processBlagussFiles(event.target.files);
    event.target.value = "";
}

function handleBlagussPackageDrop(event) {
    event.preventDefault();
    const zone = document.getElementById("blaguss-dropzone");
    if (zone) zone.style.borderColor = "var(--panel-border)";
    processBlagussFiles(event.dataTransfer.files);
}

function clearBlagussPackageImport() {
    _pendingPackage = null;
    renderBlagussImportPreview();
}

function confirmBlagussPackageImport() {
    if (!_pendingPackage) {
        showToast(t("blaguss_nothing_to_save"), "error");
        return;
    }

    const p = _pendingPackage;
    let msg = [];

    if (p.drivers?.drivers?.length) {
        const n = applyDriversFromCsv(p.drivers);
        msg.push(t("blaguss_saved_drivers", { count: n }));
        if (!window.state.bereitschaftDriver && window.state.drivers.length) {
            const petar = window.state.drivers.find(d => d.name === "Petar Popović");
            const br = petar || window.state.drivers[window.state.drivers.length - 1];
            br.bereitschaft = true;
            window.state.bereitschaftDriver = br.name;
        }
    }

    if (p.plan?.byDriver && Object.keys(p.plan.byDriver).length) {
        const r = applyDienstplanFromExcel(p.plan, p.fileMeta);
        msg.push(t("blaguss_saved_plan", { month: r.month, drivers: r.driverPlans, days: r.totalDays }));
        window.state.activeGroupFilter = getActiveLineId();
        const br = getBereitschaftDriverName();
        if (br && r.month) applyBereitschaftForMonth(br, r.month);
    }

    saveState();
    _pendingPackage = null;

    renderBlagussImportPreview();
    renderDriversList();
    renderGroupsList();
    renderMonthlyPlansView();
    renderDispatcherDashboard();
    renderDispatcherDataHub();
    if (window.state.activeGroupHubId) renderGroupHub();
    initializeLoginSelects();

    showToast(t("blaguss_import_done", { summary: msg.join(" + ") }), "success", 5000);
}

export {
    renderBlagussImportPreview,
    handleBlagussPackageInput,
    handleBlagussPackageDrop,
    clearBlagussPackageImport,
    confirmBlagussPackageImport,
    processBlagussFiles
};

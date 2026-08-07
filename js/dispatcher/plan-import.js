// BusCommand — automatski uvoz planova (Excel, PDF, CSV, TXT, slike) + pregled pre snimanja
import { saveState } from "../core/state.js";
import { getVisibleDrivers, showToast } from "../core/utils.js";
import { detectDriverFromFilename, detectMonthFromFilename, saveMonthlyPlan } from "../core/shift-plan.js";
import { extractTextFromScheduleFile, parseExtractedScheduleText } from "../maps/schedule-import-utils.js";
import { renderMonthlyPlansView } from "./monthly-plans.js";
import { renderDispatcherDataHub } from "./data-hub.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { persistImportedMonthlyPlan } from "../imports/monthly-plan-persist.js";
import { loadStateFromFirestore } from "../core/firebase-service.js";
import { getActiveLineId } from "../data/groups.js";
import { parseMonthlyPlanWorkbook, readExcelWorkbook, parseDienstplanSheet } from "../imports/monthly-plan-excel.js";
import { isMonthlyPlanCsv, parseMonthlyPlanCsv } from "../imports/monthly-plan-csv.js";
import { sheetToRows } from "../imports/import-parse-utils.js";

let _pendingImports = [];

function matchDriverByName(name, drivers) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return null;
    return (drivers || []).find((d) => String(d?.name || "").trim().toLowerCase() === needle)
        || (drivers || []).find((d) => {
            const dn = String(d?.name || "").trim().toLowerCase();
            return dn && (dn.includes(needle) || needle.includes(dn));
        })
        || null;
}

function detectDriverFromText(text, drivers) {
    const m = String(text || "").match(/dienstplan\s+f(?:ü|u)r\s*:\s*([^\n\r|]+)/i);
    if (!m) return null;
    return matchDriverByName(m[1].replace(/\s+/g, " ").trim(), drivers);
}

function detectMonthFromText(text) {
    const von = String(text || "").match(/von\s+(\d{2})\.(\d{2})\.(20\d{2})\s+bis/i);
    if (von) return `${von[3]}-${von[2]}`;
    const iso = String(text || "").match(/\b(20\d{2})-([01]\d)-[0-3]\d\b/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const eu = String(text || "").match(/\b([0-3]\d)\.([01]\d)\.(20\d{2})\b/);
    if (eu) return `${eu[3]}-${eu[2]}`;
    return null;
}

function qualityFromDayCount(dayCount) {
    if (dayCount >= 5) return "ok";
    if (dayCount > 0) return "partial";
    return "empty";
}

function pushPendingFromParsed({ file, fileData, driverName, month, parsedShifts, format, drivers }) {
    const dayCount = Object.keys(parsedShifts || {}).length;
    let driver = matchDriverByName(driverName, drivers)
        || detectDriverFromFilename(file.name, drivers);
    if (!driver && drivers.length === 1) driver = drivers[0];

    let resolvedMonth = month || detectMonthFromFilename(file.name);
    if (!resolvedMonth) {
        const now = new Date();
        resolvedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!driver) {
        showToast(t("plan_import_driver_unknown", { file: file.name }), "error");
        return 0;
    }
    if (dayCount === 0) {
        showToast(t("plan_import_read_error", { file: file.name }), "error");
        return 0;
    }

    _pendingImports.push({
        fileName: file.name,
        driverName: driver.name,
        month: resolvedMonth,
        parsedShifts,
        dayCount,
        parseQuality: qualityFromDayCount(dayCount),
        format: format || "loose-text",
        fileType: file.type || "application/octet-stream",
        fileData
    });
    return 1;
}

async function parseStructuredExcel(file, lineId) {
    const workbook = await readExcelWorkbook(file);
    let parsed = parseMonthlyPlanWorkbook(workbook, lineId);
    if (!parsed?.rowCount) {
        for (const sheetName of workbook.SheetNames || []) {
            const rows = sheetToRows(workbook.Sheets[sheetName]);
            const one = parseDienstplanSheet(rows, lineId);
            if (one?.rowCount) {
                parsed = {
                    format: "driver-dienstplan-excel",
                    month: one.month,
                    byDriver: one.byDriver,
                    rowCount: one.rowCount,
                    errors: []
                };
                break;
            }
        }
    }
    return parsed?.rowCount ? parsed : null;
}

async function parseBulkPlanFile(file, drivers) {
    const name = String(file.name || "").toLowerCase();
    const lineId = String(getActiveLineId?.() || window.state?.activeLineId || "").trim();
    const { text, fileData } = await extractTextFromScheduleFile(file);

    // 1) Structured Excel (Detaljno / Tag|Bus|Linie-Dienst)
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        try {
            const structured = await parseStructuredExcel(file, lineId);
            if (structured?.byDriver) {
                let added = 0;
                for (const [driverName, payload] of Object.entries(structured.byDriver)) {
                    added += pushPendingFromParsed({
                        file,
                        fileData,
                        driverName,
                        month: structured.month,
                        parsedShifts: payload.parsedShifts || {},
                        format: structured.format || "monthly-excel",
                        drivers
                    });
                }
                if (added > 0) return added;
            }
        } catch (err) {
            console.warn("Structured excel parse failed, falling back to text:", file.name, err);
        }
    }

    // 2) Long-form monthly CSV
    if (name.endsWith(".csv") && isMonthlyPlanCsv(text)) {
        const structured = parseMonthlyPlanCsv(text, lineId);
        let added = 0;
        for (const [driverName, payload] of Object.entries(structured.byDriver || {})) {
            added += pushPendingFromParsed({
                file,
                fileData,
                driverName,
                month: structured.month,
                parsedShifts: payload.parsedShifts || {},
                format: structured.format || "monthly-plan-csv",
                drivers
            });
        }
        if (added > 0) return added;
    }

    // 3) Loose text / PDF / OCR / pipe rows (Tag | Bus | Linie)
    const parseResult = parseExtractedScheduleText(text);
    const driverFromText = detectDriverFromText(text, drivers);
    const monthFromText = detectMonthFromText(text) || parseResult.month || null;
    return pushPendingFromParsed({
        file,
        fileData,
        driverName: driverFromText?.name || "",
        month: monthFromText,
        parsedShifts: parseResult.shifts,
        format: /\.(jpe?g|png|webp)$/i.test(name) ? "dienstplan-image" : "loose-text",
        drivers
    });
}

function renderPlanImportPreview() {
    const container = document.getElementById("plan-import-preview");
    if (!container) return;

    if (_pendingImports.length === 0) {
        container.hidden = false;
        container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">${t("plan_import_empty")}</p>`;
        return;
    }

    container.hidden = false;
    container.innerHTML = `
        <table class="app-table" style="margin-top:12px;">
            <thead>
                <tr>
                    <th>${t("plan_import_file")}</th>
                    <th>${t("plan_import_driver")}</th>
                    <th>${t("plan_import_month")}</th>
                    <th>${t("plan_import_days")}</th>
                    <th>${t("plan_import_status")}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${_pendingImports.map((item, idx) => `
                    <tr>
                        <td style="font-size:0.85rem;">${item.fileName}</td>
                        <td>
                            <select ${changeAttr("updatePendingImportDriver", [idx], "args-value")} style="width:100%;padding:6px;background:rgba(0,0,0,0.3);border:1px solid var(--panel-border);color:white;border-radius:6px;">
                                ${getVisibleDrivers().map(d => `<option value="${d.name}" ${d.name === item.driverName ? "selected" : ""}>${d.name}</option>`).join("")}
                            </select>
                        </td>
                        <td>
                            <input type="month" value="${item.month}" ${changeAttr("updatePendingImportMonth", [idx], "args-value")}
                                style="padding:6px;background:rgba(0,0,0,0.3);border:1px solid var(--panel-border);color:white;border-radius:6px;">
                        </td>
                        <td style="text-align:center;font-weight:700;">${item.dayCount}</td>
                        <td>
                            <span style="font-size:0.75rem;padding:3px 8px;border-radius:12px;font-weight:700;
                                background:${item.parseQuality === "ok" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)"};
                                color:${item.parseQuality === "ok" ? "#6ee7b7" : "#fcd34d"};">
                                ${item.parseQuality === "ok" ? t("plan_import_ok") : t("plan_import_review")}
                            </span>
                        </td>
                        <td>
                            <button type="button" ${actionAttr("removePendingImport", [idx])} style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;">
                                ${t("btn_remove")}
                            </button>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
            <button type="button" class="btn-primary" ${actionAttr("confirmBulkPlanImport")}>
                <i data-lucide="save"></i> ${t("plan_import_save_all")} (${_pendingImports.length})
            </button>
            <button type="button" class="btn-secondary" ${actionAttr("clearPendingPlanImports")}>${t("plan_import_clear")}</button>
        </div>
    `;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function handleBulkPlanFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const drivers = getVisibleDrivers();
    let added = 0;

    for (const file of files) {
        try {
            added += await parseBulkPlanFile(file, drivers);
        } catch (err) {
            console.error("Import error:", file.name, err);
            showToast(t("plan_import_read_error", { file: file.name }), "error");
        }
    }

    if (added > 0) {
        showToast(t("plan_import_ready_count", { n: added }), "success");
        renderPlanImportPreview();
    }
}

function handleBulkPlanFileInput(event) {
    handleBulkPlanFiles(event.target.files);
    event.target.value = "";
}

function handleBulkPlanDrop(event) {
    event.preventDefault();
    const zone = document.getElementById("plan-import-dropzone");
    if (zone) zone.style.borderColor = "var(--panel-border)";
    handleBulkPlanFiles(event.dataTransfer.files);
}

function updatePendingImportDriver(index, driverName) {
    if (_pendingImports[index]) _pendingImports[index].driverName = driverName;
}

function updatePendingImportMonth(index, month) {
    if (_pendingImports[index]) _pendingImports[index].month = month;
}

function removePendingImport(index) {
    _pendingImports.splice(index, 1);
    renderPlanImportPreview();
}

function clearPendingPlanImports() {
    _pendingImports = [];
    renderPlanImportPreview();
}

async function confirmBulkPlanImport() {
    if (!_pendingImports.length) {
        showToast(t("plan_nothing_to_save"), "error");
        return;
    }

    const byMonth = {};
    _pendingImports.forEach(item => {
        saveMonthlyPlan(item.driverName, item.month, item.parsedShifts, {
            fileName: item.fileName,
            fileType: item.fileType,
            fileData: item.fileData,
            parseQuality: item.parseQuality
        });
        if (!byMonth[item.month]) byMonth[item.month] = {};
        byMonth[item.month][item.driverName] = { parsedShifts: item.parsedShifts };
    });

    if (!IS_DEMO_MODE) {
        let serverOk = 0;
        let serverFail = 0;
        for (const [month, byDriver] of Object.entries(byMonth)) {
            const sync = await persistImportedMonthlyPlan(byDriver, month, {
                drivers: window.state.drivers || []
            });
            serverOk += sync.ok;
            serverFail += sync.fail + sync.skipped;
        }
        if (serverFail > 0 && serverOk === 0) {
            showToast(t("plan_server_save_failed") !== "plan_server_save_failed"
                ? t("plan_server_save_failed")
                : "Plan was not saved on the server.", "error", 7000);
            return;
        }
        if (window.currentUser?.companyId) {
            const refreshed = await loadStateFromFirestore(window.currentUser.companyId);
            if (refreshed?.schedules) window.state.schedules = refreshed.schedules;
            if (refreshed?.shifts) window.state.shifts = refreshed.shifts;
        }
    }

    saveState();
    const count = _pendingImports.length;
    _pendingImports = [];
    renderPlanImportPreview();
    renderMonthlyPlansView();
    renderDispatcherDataHub();
    showToast(t("plan_saved_count", { count }), "success", 4000);
}

export {
    renderPlanImportPreview,
    handleBulkPlanFileInput,
    handleBulkPlanDrop,
    updatePendingImportDriver,
    updatePendingImportMonth,
    removePendingImport,
    clearPendingPlanImports,
    confirmBulkPlanImport
};

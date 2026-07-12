// BusCommand — automatski uvoz planova (Excel, PDF, CSV, TXT) + pregled pre snimanja
import { saveState } from "../core/state.js";
import { getVisibleDrivers, showToast } from "../core/utils.js";
import { detectDriverFromFilename, detectMonthFromFilename, saveMonthlyPlan } from "../core/shift-plan.js";
import { extractTextFromScheduleFile, parseExtractedScheduleText } from "../maps/schedule-import-utils.js";
import { renderMonthlyPlansView } from "./monthly-plans.js";
import { renderDispatcherDataHub } from "./data-hub.js";
import { t } from "../ui/i18n.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";

let _pendingImports = [];

function renderPlanImportPreview() {
    const container = document.getElementById("plan-import-preview");
    if (!container) return;

    if (_pendingImports.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">${t("plan_import_empty") || "Otpremite jedan ili više fajlova — sistem automatski prepoznaje vozača i mesec."}</p>`;
        return;
    }

    container.innerHTML = `
        <table class="app-table" style="margin-top:12px;">
            <thead>
                <tr>
                    <th>Fajl</th>
                    <th>Vozač</th>
                    <th>Mesec</th>
                    <th>Dana parsirano</th>
                    <th>Status</th>
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
                                ${item.parseQuality === "ok" ? "OK" : "Proveri ručno"}
                            </span>
                        </td>
                        <td>
                            <button type="button" ${actionAttr("removePendingImport", [idx])} style="background:rgba(239,68,68,0.1);color:#ef4444;border:1px solid rgba(239,68,68,0.3);padding:4px 8px;border-radius:6px;cursor:pointer;font-size:0.75rem;">
                                Ukloni
                            </button>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
            <button type="button" class="btn-primary" ${actionAttr("confirmBulkPlanImport")}>
                <i data-lucide="save"></i> Snimi sve planove (${_pendingImports.length})
            </button>
            <button type="button" class="btn-secondary" ${actionAttr("clearPendingPlanImports")}>Obriši pregled</button>
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
            const { text, fileData } = await extractTextFromScheduleFile(file);
            const parseResult = parseExtractedScheduleText(text);
            const parsedShifts = parseResult.shifts;
            const dayCount = Object.keys(parsedShifts).length;

            let driver = detectDriverFromFilename(file.name, drivers);
            let month = detectMonthFromFilename(file.name);

            if (!driver && drivers.length === 1) driver = drivers[0];
            if (!month) {
                const now = new Date();
                month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            }
            if (!driver) {
                showToast(`Nije prepoznat vozač za: ${file.name}`, "error");
                continue;
            }

            _pendingImports.push({
                fileName: file.name,
                driverName: driver.name,
                month,
                parsedShifts,
                dayCount,
                parseQuality: parseResult.quality,
                fileType: file.type || "application/octet-stream",
                fileData
            });
            added++;
        } catch (err) {
            console.error("Import error:", file.name, err);
            showToast(`Greška pri čitanju: ${file.name}`, "error");
        }
    }

    if (added > 0) {
        showToast(`${added} fajl(a) spremno za pregled — proverite i snimite.`, "success");
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

function confirmBulkPlanImport() {
    if (!_pendingImports.length) {
        showToast(t("plan_nothing_to_save"), "error");
        return;
    }

    _pendingImports.forEach(item => {
        saveMonthlyPlan(item.driverName, item.month, item.parsedShifts, {
            fileName: item.fileName,
            fileType: item.fileType,
            fileData: item.fileData,
            parseQuality: item.parseQuality
        });
    });

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

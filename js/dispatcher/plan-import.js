// BusCommand — automatski uvoz planova (Excel, PDF, CSV, TXT, slike) + serverski preview/commit
import { resolveUiLanguage, saveState } from "../core/state.js";
import { escapeHtml, getVisibleDrivers, showToast } from "../core/utils.js";
import { detectDriverFromFilename, detectMonthFromFilename, getShiftForDriverDate } from "../core/shift-plan.js";
import { extractTextFromScheduleFile, parseExtractedScheduleText } from "../maps/schedule-import-utils.js";
import { t } from "../ui/i18n.js";
import { buildYearMonthSelectOptions, formatYearMonthDisplay } from "../ui/month-abbr.js";
import { actionAttr, changeAttr } from "../core/action-delegate.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { findDriverByName, normalizeType } from "../imports/monthly-plan-persist-utils.js";
import { loadStateFromFirestore } from "../core/firebase-service.js";
import { getActiveLineId } from "../data/groups.js";
import { driverBelongsToLine } from "../data/group-membership.js";
import { parseMonthlyPlanWorkbook, readExcelWorkbook, parseDienstplanSheet } from "../imports/monthly-plan-excel.js";
import { isMonthlyPlanCsv, parseMonthlyPlanCsv } from "../imports/monthly-plan-csv.js";
import { sheetToRows } from "../imports/import-parse-utils.js";
import ApiClient from "../core/api-client.js";

function usesLocalState() {
    if (typeof window !== "undefined" && typeof window.USE_LOCAL_STATE === "boolean") {
        return window.USE_LOCAL_STATE;
    }
    return USE_LOCAL_STATE;
}

/** Drivers eligible for the open group hub (Dispo assigned groups + hub filter). */
function driversForPlanImport() {
    const hubId = String(window.state?.activeGroupHubId || getActiveLineId?.() || "").trim();
    const visible = getVisibleDrivers();
    if (hubId) {
        const inHub = visible.filter((d) => driverBelongsToLine(d, hubId));
        if (inHub.length) return inHub;
        const seeded = (window.state?.drivers || []).filter((d) => driverBelongsToLine(d, hubId));
        if (seeded.length) return seeded;
    }
    return visible;
}

let _pendingImports = [];
/** @type {null | { phase: string, jobs: Array<object>, errors: Array<object>, busy: boolean }} */
let _serverImport = null;

function shortOpaqueDriverId(id) {
    const raw = String(id || "").replace(/-/g, "");
    return raw ? raw.slice(0, 8) : "";
}

function matchDriversByName(name, drivers) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return { matches: [], ambiguous: false };
    const exact = (drivers || []).filter((d) => String(d?.name || "").trim().toLowerCase() === needle);
    if (exact.length === 1) return { matches: exact, ambiguous: false };
    if (exact.length > 1) return { matches: exact, ambiguous: true };
    const partial = (drivers || []).filter((d) => {
        const dn = String(d?.name || "").trim().toLowerCase();
        return dn && (dn.includes(needle) || needle.includes(dn));
    });
    if (partial.length === 1) return { matches: partial, ambiguous: false };
    if (partial.length > 1) return { matches: partial, ambiguous: true };
    return { matches: [], ambiguous: false };
}

function matchDriverByName(name, drivers) {
    const result = matchDriversByName(name, drivers);
    if (result.ambiguous || result.matches.length !== 1) return null;
    return result.matches[0];
}

function revisionForDriverDate(driverId, driverName, dateStr) {
    const shifts = window.state?.shifts || [];
    const byId = shifts.find((s) => s.date === dateStr && s.driverId && s.driverId === driverId);
    if (byId) return Number.isInteger(byId.revision) ? byId.revision : 0;
    if (driverName) {
        const byName = getShiftForDriverDate(driverName, dateStr);
        if (byName && (!byName.driverId || byName.driverId === driverId)) {
            return Number.isInteger(byName.revision) ? byName.revision : 0;
        }
    }
    return 0;
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

function clearServerImport() {
    _serverImport = null;
}

function pushPendingFromParsed({ file, fileData, driverName, month, parsedShifts, format, drivers }) {
    const dayCount = Object.keys(parsedShifts || {}).length;
    const named = matchDriversByName(driverName, drivers);
    let driver = named.matches.length === 1 ? named.matches[0] : null;
    let ambiguous = named.ambiguous === true;
    if (!driver && !ambiguous) {
        const fromFile = detectDriverFromFilename(file.name, drivers);
        if (fromFile) {
            const fileMatch = matchDriversByName(fromFile.name, drivers);
            ambiguous = fileMatch.ambiguous;
            driver = fileMatch.matches.length === 1 ? fileMatch.matches[0] : null;
        }
    }
    if (!driver && !ambiguous && drivers.length === 1) driver = drivers[0];

    let resolvedMonth = month || detectMonthFromFilename(file.name);
    if (!resolvedMonth) {
        const now = new Date();
        resolvedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }
    if (!driver && !ambiguous) {
        showToast(t("plan_import_driver_unknown", { file: file.name }), "error");
        return 0;
    }
    if (dayCount === 0) {
        showToast(t("plan_import_read_error", { file: file.name }), "error");
        return 0;
    }

    clearServerImport();
    const displayName = driver?.name || String(driverName || "").trim() || t("plan_import_pick_driver") || "Select driver";
    _pendingImports.push({
        fileName: file.name,
        driverId: driver?.id || null,
        driverName: displayName,
        needsDriverPick: !driver || ambiguous,
        ambiguousName: ambiguous,
        month: resolvedMonth,
        parsedShifts,
        dayCount,
        parseQuality: qualityFromDayCount(dayCount),
        format: format || "loose-text",
        fileType: file.type || "application/octet-stream",
        fileData
    });
    if (ambiguous) {
        showToast(t("plan_import_driver_ambiguous") || "Multiple drivers share this name — select the correct one.", "error", 6000);
    }
    return 1;
}

function padDay(day) {
    return String(day).padStart(2, "0");
}

function resolveImportGroupId() {
    return String(
        window.state?.activeGroupHubId
        || window.currentUser?.activeGroupId
        || getActiveLineId?.()
        || window.state?.activeLineId
        || ""
    ).trim();
}

function buildServerRowsForMonth(month, items, drivers) {
    const rows = [];
    const clientErrors = [];
    for (const item of items) {
        const driverId = String(item.driverId || "").trim();
        if (!driverId) {
            clientErrors.push({
                code: item.ambiguousName || item.needsDriverPick ? "DRIVER_AMBIGUOUS" : "DRIVER_NOT_FOUND",
                driverName: item.driverName,
                month
            });
            continue;
        }
        const driver = (drivers || []).find((d) => d.id === driverId)
            || findDriverByName(drivers, item.driverName);
        if (!driver?.id || driver.id !== driverId) {
            clientErrors.push({ code: "DRIVER_NOT_FOUND", driverId, driverName: item.driverName, month });
            continue;
        }
        for (const [day, shift] of Object.entries(item.parsedShifts || {})) {
            const dayNum = Number.parseInt(day, 10);
            if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) continue;
            const date = `${month}-${padDay(dayNum)}`;
            const type = normalizeType(shift);
            const expectedRevision = revisionForDriverDate(driverId, driver.name, date);
            rows.push({
                driverId,
                date,
                type,
                name: String(shift?.name || shift?.routeCode || "").slice(0, 120),
                bus: String(shift?.bus || "").slice(0, 32),
                routeCode: String(shift?.routeCode || "").slice(0, 64),
                expectedRevision,
                ...(shift?.start ? { start: shift.start } : {}),
                ...(shift?.end ? { end: shift.end } : {})
            });
        }
    }
    return { rows, clientErrors };
}

function formatValidationErrors(details) {
    return (details || []).slice(0, 40).map((item) => {
        const code = escapeHtml(item.code || "ERROR");
        const where = [item.driverId, item.date, item.dutyCode || item.bus]
            .filter(Boolean)
            .map((part) => escapeHtml(part))
            .join(" · ");
        return where ? `${code}: ${where}` : code;
    });
}

function planImportUiLang() {
    return resolveUiLanguage();
}

function renderPendingMonthSelect(item, idx, disabled) {
    const lang = planImportUiLang();
    const monthLabel = t("plan_import_month") || "";
    const options = buildYearMonthSelectOptions(item.month, lang);
    const selectedLabel = formatYearMonthDisplay(item.month, lang);
    return `
        <select
            class="plan-import-month-select"
            data-testid="plan-import-month-select"
            aria-label="${escapeHtml(monthLabel)}"
            title="${escapeHtml(selectedLabel || monthLabel)}"
            ${changeAttr("updatePendingImportMonth", [idx], "args-value")}
            ${disabled ? "disabled" : ""}>
            ${options.map((opt) =>
                `<option value="${escapeHtml(opt.value)}" ${opt.value === item.month ? "selected" : ""}>${escapeHtml(opt.label)}</option>`
            ).join("")}
        </select>`;
}

function renderPlanImportPreview() {
    const container = document.getElementById("plan-import-preview");
    if (!container) return;

    if (_pendingImports.length === 0) {
        container.hidden = false;
        container.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:12px 0;">${t("plan_import_empty")}</p>`;
        return;
    }

    const busy = _serverImport?.busy === true;
    const previewed = _serverImport?.phase === "previewed" && Array.isArray(_serverImport.jobs) && _serverImport.jobs.length > 0;
    const commitUnknown = _serverImport?.phase === "commit_unknown" && Array.isArray(_serverImport.jobs) && _serverImport.jobs.length > 0;
    const commitInProgress = _serverImport?.phase === "commit_in_progress" && Array.isArray(_serverImport.jobs) && _serverImport.jobs.length > 0;
    const recoveryPhase = (_serverImport?.phase === "recovery_required" || _serverImport?.recoveryRequired === true)
        && Array.isArray(_serverImport.jobs) && _serverImport.jobs.length > 0;
    const committing = _serverImport?.phase === "committing" && Array.isArray(_serverImport.jobs) && _serverImport.jobs.length > 0;
    // Recovery must not offer Confirm/Retry. IN_PROGRESS / UNKNOWN keep retry.
    const showCommitAction = previewed || commitUnknown || commitInProgress || committing;
    const showServerPreview = showCommitAction || recoveryPhase;
    // Do not show validation "nothing was saved" for outcome phases that are not validation.
    const hideValidationPanel = commitInProgress || commitUnknown || recoveryPhase || committing;
    const errors = hideValidationPanel ? [] : (_serverImport?.errors || []);
    const summaryBits = (_serverImport?.jobs || []).map((job) => {
        const s = job.summary || {};
        return `${escapeHtml(job.month)}: ${Number(s.rows) || 0} ${escapeHtml(t("plan_import_rows") || "rows")}`;
    }).join(" · ");
    const phase = _serverImport?.phase || "parsed";
    const retainedImportId = (_serverImport?.jobs?.[0] && _serverImport.jobs[0].importId) || "";

    const rowDisabled = busy || showCommitAction || recoveryPhase;
    const driverAria = t("plan_import_driver") || "";
    container.hidden = false;
    container.innerHTML = `
        <table class="app-table plan-import-preview-table" style="margin-top:12px;" data-plan-import-phase="${escapeHtml(phase)}" data-testid="plan-import-phase">
            <thead>
                <tr>
                    <th class="plan-import-col-file">${t("plan_import_file")}</th>
                    <th class="plan-import-col-driver">${t("plan_import_driver")}</th>
                    <th class="plan-import-col-month">${t("plan_import_month")}</th>
                    <th class="plan-import-col-days">${t("plan_import_days")}</th>
                    <th class="plan-import-col-status">${t("plan_import_status")}</th>
                    <th class="plan-import-col-actions"></th>
                </tr>
            </thead>
            <tbody>
                ${_pendingImports.map((item, idx) => {
                    const driverOptions = driversForPlanImport().map((d) => {
                        const label = (item.ambiguousName || item.needsDriverPick)
                            ? `${d.name} · ${shortOpaqueDriverId(d.id)}`
                            : d.name;
                        return { id: d.id, label, name: d.name };
                    });
                    const selectedDriver = driverOptions.find((d) => d.id === item.driverId);
                    const driverDisplayName = selectedDriver?.name
                        || String(item.driverName || "").trim()
                        || (t("plan_import_pick_driver") || "Select driver");
                    return `
                    <tr data-testid="plan-import-pending-row" data-driver-id="${escapeHtml(item.driverId || "")}">
                        <td class="plan-import-col-file" data-label="${escapeHtml(t("plan_import_file") || "")}">
                            <span class="plan-import-file-name" data-testid="plan-import-file-name" title="${escapeHtml(item.fileName)}" aria-label="${escapeHtml(item.fileName)}">${escapeHtml(item.fileName)}</span>
                        </td>
                        <td class="plan-import-col-driver" data-label="${escapeHtml(driverAria)}">
                            <div class="plan-import-driver-cell">
                                <div class="plan-import-driver-name" data-testid="plan-import-driver-name" title="${escapeHtml(driverDisplayName)}">${escapeHtml(driverDisplayName)}</div>
                                <select class="plan-import-driver-select" data-testid="plan-import-driver-select" aria-label="${escapeHtml(driverAria)}" ${changeAttr("updatePendingImportDriver", [idx], "args-value")} ${rowDisabled ? "disabled" : ""}>
                                    ${item.needsDriverPick || !item.driverId ? `<option value="">${t("plan_import_pick_driver") || "Select driver"}</option>` : ""}
                                    ${driverOptions.map((d) =>
                                        `<option value="${escapeHtml(d.id)}" ${d.id === item.driverId ? "selected" : ""}>${escapeHtml(d.label)}</option>`
                                    ).join("")}
                                </select>
                                ${item.needsDriverPick || item.ambiguousName ? `<div data-testid="plan-import-driver-ambiguous" class="plan-import-driver-ambiguous">${t("plan_import_driver_ambiguous_hint") || "Same display name — pick the correct ID."}</div>` : ""}
                            </div>
                        </td>
                        <td class="plan-import-col-month" data-label="${escapeHtml(t("plan_import_month") || "")}">
                            ${renderPendingMonthSelect(item, idx, rowDisabled)}
                        </td>
                        <td class="plan-import-col-days" data-label="${escapeHtml(t("plan_import_days") || "")}" data-testid="plan-import-day-count">${Number(item.dayCount) || 0}</td>
                        <td class="plan-import-col-status" data-label="${escapeHtml(t("plan_import_status") || "")}">
                            <span class="plan-import-status-pill" data-testid="plan-import-status"
                                style="background:${item.parseQuality === "ok" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)"};
                                color:${item.parseQuality === "ok" ? "#6ee7b7" : "#fcd34d"};">
                                ${item.parseQuality === "ok" ? t("plan_import_ok") : t("plan_import_review")}
                            </span>
                        </td>
                        <td class="plan-import-col-actions">
                            <button type="button" class="plan-import-remove-btn" data-testid="plan-import-remove-btn" ${actionAttr("removePendingImport", [idx])} ${busy ? "disabled" : ""}>
                                ${t("btn_remove")}
                            </button>
                        </td>
                    </tr>`;
                }).join("")}
            </tbody>
        </table>
        ${showServerPreview ? `
            <div class="plan-import-server-preview" data-testid="plan-import-server-preview" style="margin-top:14px;padding:12px;border:1px solid var(--panel-border);border-radius:8px;">
                <div style="font-weight:700;margin-bottom:6px;">${t("plan_import_server_preview_title") || "Server preview"}</div>
                <div style="font-size:0.85rem;color:var(--text-muted);">${summaryBits}</div>
                <ul style="margin:10px 0 0;padding-left:18px;font-size:0.8rem;">
                    ${(_serverImport.jobs.flatMap((job) => job.rows || []).slice(0, 12).map((row) =>
                        `<li>${escapeHtml(row.date)} · ${escapeHtml(row.type)}${row.name ? ` · ${escapeHtml(row.name)}` : ""}${row.bus ? ` · ${escapeHtml(row.bus)}` : ""}</li>`
                    ).join(""))}
                </ul>
            </div>
        ` : ""}
        ${errors.length ? `
            <div class="plan-import-validation-errors" data-testid="plan-import-validation-errors" style="margin-top:12px;padding:12px;border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:#fca5a5;font-size:0.82rem;">
                <div style="font-weight:700;margin-bottom:6px;">${t("plan_import_validation_failed") || "Validation failed"}</div>
                <ul style="margin:0;padding-left:18px;">
                    ${formatValidationErrors(errors).map((line) => `<li>${line}</li>`).join("")}
                </ul>
            </div>
        ` : ""}
        ${recoveryPhase ? `
            <div class="plan-import-recovery-required" data-testid="plan-import-recovery-required" style="margin-top:12px;padding:12px;border:1px solid rgba(245,158,11,0.5);border-radius:8px;color:#fcd34d;font-size:0.85rem;">
                ${t("plan_import_recovery_required") || "Import recovery required — do not treat the plan as clean. Clear preview does not clear server lock or data."}
                ${retainedImportId ? `<div style="margin-top:6px;font-size:0.75rem;opacity:0.9;" data-testid="plan-import-retained-id">importId: ${escapeHtml(retainedImportId)}</div>` : ""}
            </div>
        ` : ""}
        ${_serverImport?.phase === "multi_month_blocked" ? `
            <div data-testid="plan-import-multi-month-block" style="margin-top:12px;padding:12px;border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:#fca5a5;font-size:0.85rem;">
                ${t("plan_import_multi_month_blocked") || "Import one calendar month at a time. Remove other months before server preview."}
            </div>
        ` : ""}
        ${_serverImport?.phase === "preview_transport_failed" ? `
            <div data-testid="plan-import-preview-transport-failed" style="margin-top:12px;padding:12px;border:1px solid rgba(245,158,11,0.5);border-radius:8px;color:#fcd34d;font-size:0.85rem;">
                ${t("plan_import_preview_transport_failed") || "Server preview could not be reached. Pending files are kept — retry preview."}
            </div>
        ` : ""}
        ${commitInProgress ? `
            <div data-testid="plan-import-commit-in-progress" style="margin-top:12px;padding:12px;border:1px solid rgba(59,130,246,0.45);border-radius:8px;color:#93c5fd;font-size:0.85rem;">
                ${t("plan_import_commit_in_progress") || "Import is still processing — try again shortly."}
                <div style="margin-top:6px;font-size:0.75rem;opacity:0.9;" data-testid="plan-import-retained-id">importId: ${escapeHtml(retainedImportId || "—")}</div>
            </div>
        ` : ""}
        ${commitUnknown ? `
            <div data-testid="plan-import-commit-unknown" style="margin-top:12px;padding:12px;border:1px solid rgba(245,158,11,0.5);border-radius:8px;color:#fcd34d;font-size:0.85rem;">
                ${t("plan_import_commit_unknown") || "Commit outcome is not confirmed (network interrupted). Same import is retained — retry the idempotent commit."}
                <div style="margin-top:6px;font-size:0.75rem;opacity:0.9;" data-testid="plan-import-retained-id">importId: ${escapeHtml(retainedImportId || "—")}</div>
            </div>
        ` : ""}
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
            ${recoveryPhase ? "" : (!showCommitAction ? `
                <button type="button" class="btn-primary" data-testid="plan-import-server-preview-btn" ${actionAttr("confirmBulkPlanImport")} ${busy ? "disabled" : ""}>
                    <i data-lucide="shield-check"></i> ${busy && phase === "previewing" ? (t("plan_import_previewing") || "Validating…") : (t("plan_import_server_preview") || "Server preview")}
                </button>
            ` : `
                <button type="button" class="btn-primary" data-testid="${(commitUnknown || commitInProgress) ? "plan-import-retry-commit-btn" : "plan-import-confirm-commit-btn"}" ${actionAttr("confirmBulkPlanImport")} ${busy ? "disabled" : ""}>
                    <i data-lucide="save"></i> ${committing
                        ? (t("plan_import_committing") || "Committing…")
                        : ((commitUnknown || commitInProgress)
                            ? (t("plan_import_retry_commit") || "Retry commit")
                            : (t("plan_import_confirm_commit") || "Confirm import"))}
                </button>
            `)}
            <button type="button" class="btn-secondary" data-testid="plan-import-clear-btn" ${actionAttr("clearPendingPlanImports")} ${busy ? "disabled" : ""}>${t("plan_import_clear")}</button>
        </div>
    `;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function handleBulkPlanFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const drivers = driversForPlanImport();
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
    const input = event?.target || null;
    const files = Array.from(input?.files || []);
    if (input) input.value = "";
    return handleBulkPlanFiles(files);
}

function handleBulkPlanDrop(event) {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    const zone = document.getElementById("plan-import-dropzone");
    if (zone) zone.style.borderColor = "var(--panel-border)";
    const files = Array.from(event?.dataTransfer?.files || []);
    return handleBulkPlanFiles(files);
}

function updatePendingImportDriver(index, driverId) {
    if (!_pendingImports[index]) return;
    const id = String(driverId || "").trim();
    const driver = driversForPlanImport().find((d) => d.id === id) || null;
    _pendingImports[index].driverId = driver?.id || null;
    _pendingImports[index].driverName = driver?.name || _pendingImports[index].driverName;
    _pendingImports[index].needsDriverPick = !driver;
    _pendingImports[index].ambiguousName = false;
    clearServerImport();
    renderPlanImportPreview();
}

function updatePendingImportMonth(index, month) {
    if (_pendingImports[index]) {
        _pendingImports[index].month = month;
        clearServerImport();
        renderPlanImportPreview();
    }
}

function removePendingImport(index) {
    _pendingImports.splice(index, 1);
    clearServerImport();
    renderPlanImportPreview();
}

function clearPendingPlanImports() {
    _pendingImports = [];
    clearServerImport();
    renderPlanImportPreview();
}

async function runServerPreview() {
    const groupId = resolveImportGroupId();
    if (!groupId) {
        showToast(t("hub_import_monthly_need_group") || "Open a group first.", "error");
        return;
    }
    const months = [...new Set(_pendingImports.map((item) => item.month).filter(Boolean))];
    if (months.length > 1) {
        _serverImport = {
            phase: "multi_month_blocked",
            jobs: [],
            errors: [{ code: "MULTI_MONTH_NOT_ALLOWED", months }],
            busy: false
        };
        renderPlanImportPreview();
        showToast(t("plan_import_multi_month_blocked") || "Import one calendar month at a time.", "error", 8000);
        return;
    }

    const drivers = window.state?.drivers || driversForPlanImport();
    const month = months[0];
    const items = _pendingImports.filter((item) => item.month === month);

    _serverImport = { phase: "previewing", jobs: [], errors: [], busy: true };
    renderPlanImportPreview();

    const { rows, clientErrors } = buildServerRowsForMonth(month, items, drivers);
    if (clientErrors.length || !rows.length) {
        _serverImport = {
            phase: "rejected",
            jobs: [],
            errors: clientErrors.length ? clientErrors : [{ code: "EMPTY_MONTH", month }],
            busy: false
        };
        renderPlanImportPreview();
        showToast(t("plan_import_validation_failed") || "Import validation failed.", "error", 7000);
        return;
    }

    const sourceName = items.map((i) => i.fileName).join(", ").slice(0, 255) || `import-${month}`;
    let result;
    try {
        result = await ApiClient.previewStaffMonthlyPlanImport({
            groupId,
            month,
            sourceName,
            reason: "Dispatcher monthly plan import",
            rows
        });
    } catch (err) {
        console.error("monthly import preview transport failed", err);
        _serverImport = {
            phase: "preview_transport_failed",
            jobs: [],
            errors: [{ code: "PREVIEW_TRANSPORT_FAILED" }],
            busy: false
        };
        renderPlanImportPreview();
        showToast(
            t("plan_import_preview_transport_failed") || "Server preview could not be reached. Pending files are kept — retry preview.",
            "error",
            8000
        );
        return;
    }

    if (!result?.success) {
        _serverImport = {
            phase: "rejected",
            jobs: [],
            errors: result?.details || [{ code: result?.code || "PLAN_IMPORT_PREVIEW_FAILED" }],
            busy: false,
            recoveryRequired: result?.recoveryRequired === true
        };
        renderPlanImportPreview();
        showToast(t("plan_import_validation_failed") || "Import validation failed.", "error", 7000);
        return;
    }

    _serverImport = {
        phase: "previewed",
        jobs: [{
            importId: result.importId,
            fingerprint: result.fingerprint,
            month,
            groupId,
            summary: result.preview?.summary || {},
            rows: result.preview?.rows || []
        }],
        errors: [],
        busy: false
    };
    renderPlanImportPreview();
    showToast(t("plan_import_server_preview_ready") || "Server preview ready — confirm to commit.", "success", 5000);
}

async function runServerCommit() {
    const jobs = _serverImport?.jobs || [];
    if (!jobs.length) {
        showToast(t("plan_nothing_to_save"), "error");
        return;
    }

    const retainedJobs = jobs.map((job) => ({ ...job }));
    _serverImport = { ..._serverImport, phase: "committing", jobs: retainedJobs, busy: true };
    renderPlanImportPreview();

    let sawIdempotent = false;
    try {
        for (const job of retainedJobs) {
            let result;
            try {
                result = await ApiClient.commitStaffMonthlyPlanImport(job.importId, job.fingerprint);
            } catch (transportErr) {
                console.error("monthly import commit transport unknown", transportErr);
                _serverImport = {
                    phase: "commit_unknown",
                    jobs: retainedJobs,
                    errors: [{ code: "COMMIT_OUTCOME_UNKNOWN" }],
                    busy: false
                };
                renderPlanImportPreview();
                showToast(
                    t("plan_import_commit_unknown") || "Commit outcome is not confirmed. Retry the same import.",
                    "error",
                    9000
                );
                return;
            }
            if (!result?.success) {
                const code = result?.code || "MONTHLY_IMPORT_COMMIT_FAILED";
                const recovery = result?.recoveryRequired === true
                    || code === "MONTHLY_IMPORT_COMPENSATION_FAILED"
                    || code === "MONTHLY_IMPORT_RECOVERY_REQUIRED";
                const inProgress = result?.retryable === true
                    || code === "MONTHLY_IMPORT_IN_PROGRESS"
                    || code === "MONTHLY_IMPORT_ATTEMPT_LOST";
                const compensated = result?.compensated === true;
                if (inProgress) {
                    _serverImport = {
                        phase: "commit_in_progress",
                        jobs: retainedJobs,
                        errors: [],
                        busy: false,
                        recoveryRequired: false
                    };
                    renderPlanImportPreview();
                    showToast(
                        t("plan_import_commit_in_progress")
                            || "Import is still processing — try again shortly.",
                        "error",
                        8000
                    );
                    return;
                }
                _serverImport = {
                    phase: recovery ? "recovery_required" : "rejected",
                    jobs: (recovery || !compensated) ? retainedJobs : [],
                    errors: recovery ? [] : (result?.details || [{ code }]),
                    busy: false,
                    recoveryRequired: recovery
                };
                renderPlanImportPreview();
                let toastMsg = t("plan_import_commit_failed_no_rollback")
                    || "Import was not committed.";
                if (recovery) {
                    toastMsg = t("plan_import_recovery_required")
                        || "Import recovery required — do not treat the plan as clean.";
                } else if (compensated) {
                    toastMsg = t("plan_import_commit_failed")
                        || "Import was not committed. Partial changes were rolled back.";
                }
                showToast(toastMsg, "error", 8000);
                return;
            }
            if (result.idempotent === true) sawIdempotent = true;
        }

        if (window.currentUser?.companyId) {
            const loader = typeof window.loadStateFromFirestore === "function"
                ? window.loadStateFromFirestore
                : loadStateFromFirestore;
            const refreshed = await loader(window.currentUser.companyId);
            if (refreshed?.schedules) window.state.schedules = refreshed.schedules;
            if (refreshed?.shifts) window.state.shifts = refreshed.shifts;
        }
        saveState();

        const count = _pendingImports.length;
        _pendingImports = [];
        clearServerImport();
        renderPlanImportPreview();
        // Break staff main ↔ plan-import cycle: refresh already-loaded modules dynamically.
        await Promise.all([
            import("./monthly-plans.js").then((m) => m.renderMonthlyPlansView()),
            import("./data-hub.js").then((m) => m.renderDispatcherDataHub())
        ]).catch(() => {});
        // Success toast exactly once (including idempotent retry after unknown).
        showToast(
            sawIdempotent
                ? (t("plan_import_idempotent_success") || t("plan_saved_count", { count }) || "Import already applied — plan reloaded.")
                : t("plan_saved_count", { count }),
            "success",
            4000
        );
    } catch (err) {
        console.error("monthly import commit failed", err);
        _serverImport = {
            phase: "commit_unknown",
            jobs: retainedJobs,
            errors: [{ code: "COMMIT_OUTCOME_UNKNOWN" }],
            busy: false
        };
        renderPlanImportPreview();
        showToast(
            t("plan_import_commit_unknown") || "Commit outcome is not confirmed. Retry the same import.",
            "error",
            9000
        );
    }
}

async function confirmBulkPlanImport() {
    if (!_pendingImports.length) {
        showToast(t("plan_nothing_to_save"), "error");
        return;
    }
    if (usesLocalState()) {
        showToast(
            t("plan_import_server_required") || "Monthly import requires a live server preview and commit. Local mode cannot fake success.",
            "error",
            8000
        );
        return;
    }
    if (_serverImport?.busy) return;

    if (_serverImport?.phase === "recovery_required" || _serverImport?.recoveryRequired === true) {
        // Recovery is fail-closed — Clear preview only; no confirm/retry mutation.
        return;
    }
    if (
        (
            _serverImport?.phase === "previewed"
            || _serverImport?.phase === "commit_unknown"
            || _serverImport?.phase === "commit_in_progress"
        )
        && _serverImport.jobs?.length
    ) {
        await runServerCommit();
        return;
    }
    await runServerPreview();
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

function __setPendingPlanImportsForTest(items) {
    if (typeof window === "undefined") return;
    if (!window.state?.e2eFixture && window.__ALLOW_PLAN_IMPORT_TEST_HOOK !== true) return;
    _pendingImports = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
    clearServerImport();
    renderPlanImportPreview();
}

if (typeof window !== "undefined") {
    window.__setPendingPlanImportsForTest = __setPendingPlanImportsForTest;
}

export {
    renderPlanImportPreview,
    handleBulkPlanFiles,
    handleBulkPlanFileInput,
    handleBulkPlanDrop,
    updatePendingImportDriver,
    updatePendingImportMonth,
    removePendingImport,
    clearPendingPlanImports,
    confirmBulkPlanImport
};

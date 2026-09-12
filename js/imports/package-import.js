// BusCommand — generic package import (CSV drivers + Excel monthly plan)
import { saveState } from "../core/state.js";
import { saveMonthlyPlan, applyBereitschaftForMonth, getBereitschaftDriverName } from "../core/shift-plan.js";
import { showToast } from "../core/utils.js";
import { initializeLoginSelects } from "../auth/login-ui.js";
import { renderDriversList } from "../data/drivers.js";
import { assignDriverToLine } from "../data/group-membership.js";
import { renderGroupsList, getActiveLineId } from "../data/groups.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderMonthlyPlansView } from "../dispatcher/monthly-plans.js";
import { renderDispatcherDataHub } from "../dispatcher/data-hub.js";
import { renderGroupHub } from "../dispatcher/group-hub.js";
import { parseMonthlyPlanWorkbook, readExcelWorkbook } from "./monthly-plan-excel.js";
import { isMonthlyPlanCsv, parseMonthlyPlanCsv } from "./monthly-plan-csv.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { loadStateFromFirestore } from "../core/firebase-service.js";
import { persistImportedMonthlyPlan } from "./monthly-plan-persist.js";

let _pendingPackage = null;

const GROUP_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#ec4899", "#14b8a6"];
const CREDENTIAL_PROFILE_KEYS = [
    "pin", "initialPin", "initial_pin", "company_code", "activation_code",
    "password", "passcode", "otp", "activationOtp", "companyCode"
];

function isCompanyAdminRole(role = window.currentUser?.role) {
    return role === "company-admin" || role === "company_admin";
}

async function loadDriverImportContract() {
    const mod = await import("./driver-import-contract.cjs");
    return mod.default || mod;
}

function mapDriverImportError(err) {
    const code = err?.code || "";
    if (code === "CREDENTIAL_COLUMNS_FORBIDDEN") return t("ca_drivers_error_credentials_column");
    if (code === "DUPLICATE_CANONICAL_COLUMN") {
        const match = /Duplikat kolone:\s*(\w+)/i.exec(err.message || "");
        return t("ca_drivers_error_duplicate", { field: match?.[1] || "column", row: "1" });
    }
    if (code === "DUPLICATE_EID") return t("ca_drivers_error_duplicate", { field: "eid", row: "" });
    if (code === "MISSING_COLUMNS") {
        const columns = String(err.message || "").replace(/^Nedostaju kolone:\s*/i, "").replace(/\.$/, "");
        return t("ca_drivers_error_columns", { columns });
    }
    if (
        code === "FORMULA_FORBIDDEN"
        || code === "MACRO_FORBIDDEN"
        || code === "HIDDEN_SHEET_FORBIDDEN"
        || code === "XLSX_INVALID"
        || code === "XLSX_UNAVAILABLE"
    ) {
        return t("ca_drivers_error_xlsx");
    }
    return t("error_generic");
}

function stripCredentialFields(record) {
    const next = { ...(record || {}) };
    for (const key of CREDENTIAL_PROFILE_KEYS) delete next[key];
    return next;
}

function localDriverRecordFromCanonical(driver, { id, groupId, companyId } = {}) {
    const firstName = String(driver?.first_name || "").trim();
    const lastName = String(driver?.last_name || "").trim();
    return stripCredentialFields({
        id,
        eid: String(driver?.eid || "").trim(),
        firstName,
        lastName,
        name: [firstName, lastName].filter(Boolean).join(" "),
        email: driver?.email || "",
        phone: driver?.phone || "",
        postalCode: driver?.postal_code || "",
        companyId: companyId || "",
        groupId,
        active: false,
        codeActivated: false
    });
}

function normalizePersonName(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function validatePlanBatch(plans, knownDriverNames = []) {
    const errors = [];
    const months = new Set();
    const assignments = new Set();
    const known = new Set(knownDriverNames.map(normalizePersonName).filter(Boolean));

    for (const item of plans || []) {
        const parsed = item?.parsed || item;
        if (!parsed?.month || !parsed?.rowCount) {
            errors.push("Plan nema ispravan mesec ili smene.");
            continue;
        }
        months.add(parsed.month);
        for (const [driverName, data] of Object.entries(parsed.byDriver || {})) {
            const normalizedName = normalizePersonName(driverName);
            if (!normalizedName) {
                errors.push("Plan sadrži smenu bez imena vozača.");
                continue;
            }
            if (known.size && !known.has(normalizedName)) {
                errors.push(`Vozač iz plana nije pronađen: ${driverName}.`);
            }
            for (const day of Object.keys(data?.parsedShifts || {})) {
                const key = `${parsed.month}|${normalizedName}|${day}`;
                if (assignments.has(key)) {
                    errors.push(`Dupla smena u paketu: ${driverName}, ${parsed.month}-${String(day).padStart(2, "0")}.`);
                }
                assignments.add(key);
            }
        }
    }
    if (months.size > 1) {
        errors.push(`Jedan paket može sadržati samo jedan mesec: ${[...months].sort().join(", ")}.`);
    }
    return [...new Set(errors)];
}

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
            description: `Line ${lid}`,
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
    const name = `Line ${lid}`;
    if (!window.state.groups.find(g => g.id === lid || g.name === name)) {
        window.state.groups.unshift({
            id: lid,
            name,
            color: "#3b82f6",
            description: "",
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
    const rows = Array.isArray(parsed?.drivers) ? parsed.drivers : [];
    rows.forEach((d, i) => {
        const groupName = d.group || d.groupName || "G1";
        const groupId = ensureGroupByName(groupName, lineId);
        const name = [d.first_name, d.last_name].filter(Boolean).join(" ").trim()
            || String(d.name || "").trim();
        const existingIdx = window.state.drivers.findIndex((x) => {
            if (d.eid && x.eid && String(x.eid).toLowerCase() === String(d.eid).toLowerCase()) return true;
            return name && String(x.name || "").toLowerCase() === name.toLowerCase();
        });
        const id = existingIdx >= 0 ? window.state.drivers[existingIdx].id : `drv-imp-${Date.now()}-${i}`;
        const entry = localDriverRecordFromCanonical(d, {
            id,
            groupId,
            companyId: window.currentUser?.companyId || ""
        });
        assignDriverToLine(entry, lineId, groupName);

        if (existingIdx >= 0) {
            window.state.drivers[existingIdx] = stripCredentialFields({
                ...window.state.drivers[existingIdx],
                ...entry
            });
        } else {
            window.state.drivers.push(entry);
        }
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
            source: "package-import"
        });
        driverPlans++;
        totalDays += dayCount;
    });

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
        oktobar: "10", novembar: "11", decembar: "12",
        january: "01", february: "02", march: "03", may: "05", june: "06",
        july: "07", september: "09", october: "10", november: "11", december: "12"
    };
    for (const [key, num] of Object.entries(months)) {
        if (lower.includes(key)) {
            const y = lower.match(/20\d{2}/);
            return `${y ? y[0] : new Date().getFullYear()}-${num}`;
        }
    }
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function renderPackageImportPreview() {
    const el = document.getElementById("package-import-preview");
    if (!el) return;

    if (!_pendingPackage) {
        el.innerHTML = `<p class="bc-text-muted bc-package-import-hint">${t("pkg_upload_hint")}</p>`;
        return;
    }

    const p = _pendingPackage;
    el.innerHTML = `
        <div style="margin-top:16px;padding:16px;background:rgba(0,0,0,0.2);border:1px solid var(--panel-border);border-radius:var(--radius-md);">
            <h4 style="margin:0 0 12px;font-size:0.95rem;color:var(--primary-color);">${t("pkg_preview_title")}</h4>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;font-size:0.85rem;">
                <div><span class="bc-text-muted">${t("pkg_lbl_drivers_csv")}</span> <strong>${p.driverCount}</strong></div>
                <div><span class="bc-text-muted">${t("pkg_lbl_plan_rows")}</span> <strong>${p.planRows}</strong></div>
                <div><span class="bc-text-muted">${t("pkg_lbl_plan_drivers")}</span> <strong>${p.planDrivers}</strong></div>
                <div><span class="bc-text-muted">${t("pkg_lbl_month")}</span> <strong>${p.month || "—"}</strong></div>
                <div><span class="bc-text-muted">${t("pkg_lbl_catalog")}</span> <strong>${p.catalogCount}</strong></div>
            </div>
            ${p.errors.length ? `<p style="color:#fcd34d;font-size:0.8rem;margin-top:12px;">${p.errors.join(" · ")}</p>` : ""}
            ${p.driverNames.length ? `<p class="bc-text-muted bc-package-import-driver-names">${p.driverNames.join(", ")}</p>` : ""}
            <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap;">
                <button type="button" class="btn-primary" ${p.errors.length ? "disabled aria-disabled=\"true\"" : actionAttr("confirmPackageImport")}>
                    <i data-lucide="save"></i> ${t("btn_save_package") || "Save package"}
                </button>
                <button type="button" class="btn-secondary" ${actionAttr("clearPackageImport")}>${t("btn_clear_preview") || "Clear"}</button>
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

async function processPackageFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const pkg = {
        drivers: null,
        plans: [],
        driverCount: 0,
        planRows: 0,
        planDrivers: 0,
        catalogCount: 0,
        month: null,
        driverNames: [],
        errors: [],
        fileMeta: {},
        driverCsvText: null
    };

    for (const file of files) {
        const name = file.name.toLowerCase();
        try {
            if (name.endsWith(".csv")) {
                const text = await file.text();
                if (isMonthlyPlanCsv(text)) {
                    const parsed = parseMonthlyPlanCsv(text, getActiveLineId());
                    pkg.plans.push({
                        parsed,
                        fileMeta: { fileName: file.name, fileType: file.type, fileData: "" }
                    });
                    pkg.planRows += parsed.rowCount;
                    pkg.planDrivers += Object.keys(parsed.byDriver || {}).length;
                    pkg.month = pkg.month || parsed.month;
                    pkg.driverNames.push(...Object.keys(parsed.byDriver || {}));
                } else if (!isCompanyAdminRole()) {
                    pkg.errors.push(t("pkg_driver_csv_admin_only"));
                } else if (pkg.driverCsvText) {
                    pkg.errors.push(t("pkg_only_one_driver_csv") || `Only one driver CSV is allowed: ${file.name}`);
                } else {
                    try {
                        const { parseDriverCsv, driversToCanonicalCsv } = await loadDriverImportContract();
                        const drivers = parseDriverCsv(text);
                        pkg.driverCsvText = driversToCanonicalCsv(drivers);
                        pkg.drivers = { drivers };
                        pkg.driverCount = drivers.length;
                        pkg.driverNames.push(...drivers.map((driver) => (
                            `${driver.first_name || ""} ${driver.last_name || ""}`.trim() || driver.eid
                        )));
                    } catch (err) {
                        pkg.errors.push(mapDriverImportError(err));
                    }
                }
            } else if (name.endsWith(".xlsx")) {
                const wb = await readExcelWorkbook(file);
                const parsed = parseMonthlyPlanWorkbook(wb, getActiveLineId());
                if (parsed.errors?.length) pkg.errors.push(...parsed.errors);
                if (!parsed.rowCount) continue;
                const fileMeta = {
                    fileName: file.name,
                    fileType: file.type,
                    fileData: await readFileAsDataURL(file)
                };
                pkg.plans.push({ parsed, fileMeta });
                pkg.planRows += parsed.rowCount;
                pkg.planDrivers += Object.keys(parsed.byDriver || {}).length;
                pkg.catalogCount += Object.keys(parsed.shiftCatalog || {}).length;
                pkg.month = pkg.month || parsed.month;
                pkg.driverNames.push(...Object.keys(parsed.byDriver || {}));
            } else {
                pkg.errors.push(t("pkg_fmt_skipped", { file: file.name }));
            }
        } catch (err) {
            console.error(err);
            pkg.errors.push(`${file.name}: ${err.message}`);
        }
    }

    pkg.errors.push(...validatePlanBatch(pkg.plans));
    pkg.driverNames = [...new Set(pkg.driverNames)];

    if (!pkg.driverCount && !pkg.planRows) {
        showToast(t("pkg_not_recognized"), "error");
        return;
    }

    _pendingPackage = pkg;
    renderPackageImportPreview();
    showToast(t("pkg_ready_preview"), "success");
}

function handlePackageImportInput(event) {
    processPackageFiles(event.target.files);
    event.target.value = "";
}

function handlePackageImportDrop(event) {
    event.preventDefault();
    const zone = document.getElementById("package-import-dropzone") || document.getElementById("monthly-package-dropzone");
    if (zone) zone.style.borderColor = "var(--panel-border)";
    processPackageFiles(event.dataTransfer.files);
}

function clearPackageImport() {
    _pendingPackage = null;
    renderPackageImportPreview();
}

async function confirmPackageImport() {
    if (!_pendingPackage) {
        showToast(t("pkg_nothing_to_save"), "error");
        return;
    }

    const p = _pendingPackage;
    const msg = [];

    if (p.errors?.length) {
        showToast(t("pkg_fix_errors"), "error", 6000);
        return;
    }

    if (p.drivers?.drivers?.length) {
        if (!isCompanyAdminRole()) {
            showToast(t("ca_drivers_admin_only"), "error", 6000);
            return;
        }
        if (USE_LOCAL_STATE) {
            const n = applyDriversFromCsv(p.drivers);
            msg.push(t("pkg_saved_drivers", { count: n }));
        } else {
            const groupId = getActiveLineId();
            const result = await ApiClient.importDriversCsv(window.currentUser?.companyId, groupId, p.driverCsvText || "");
            if (!result.success) {
                const errMsg = result.code === "CREDENTIAL_COLUMNS_FORBIDDEN"
                    ? t("ca_drivers_error_credentials_column")
                    : (result.error || t("error_generic"));
                showToast(errMsg, "error");
                return;
            }
            msg.push(t("pkg_saved_drivers", { count: result.imported }));
            const refreshed = await loadStateFromFirestore(window.currentUser.companyId);
            window.state.drivers = refreshed?.drivers || [];
        }
    }

    if (p.plans?.length) {
        const planErrors = validatePlanBatch(p.plans, (window.state.drivers || []).map((driver) => driver.name));
        if (planErrors.length) {
            p.errors.push(...planErrors);
            renderPackageImportPreview();
            showToast(planErrors[0], "error", 7000);
            return;
        }
        const totals = { month: p.month, driverPlans: 0, totalDays: 0 };
        for (const item of p.plans) {
            const result = applyDienstplanFromExcel(item.parsed, item.fileMeta);
            totals.month ||= result.month;
            totals.driverPlans += result.driverPlans;
            totals.totalDays += result.totalDays;
        }
        if (!USE_LOCAL_STATE && totals.month) {
            showToast(t("pkg_saving_plan") !== "pkg_saving_plan" ? t("pkg_saving_plan") : "Saving plan to server…", "info", 4000);
            let serverOk = 0;
            let serverFail = 0;
            for (const item of p.plans) {
                const sync = await persistImportedMonthlyPlan(item.parsed?.byDriver || {}, totals.month, {
                    drivers: window.state.drivers || []
                });
                serverOk += sync.ok;
                serverFail += sync.fail + sync.skipped;
            }
            if (serverFail > 0 && serverOk === 0) {
                showToast(t("pkg_plan_server_failed") !== "pkg_plan_server_failed"
                    ? t("pkg_plan_server_failed")
                    : "Plan was not saved on the server. Fix drivers/group and retry.", "error", 8000);
                return;
            }
            if (serverFail > 0) {
                msg.push(`${serverOk} saved / ${serverFail} failed`);
            }
            const refreshed = await loadStateFromFirestore(window.currentUser.companyId);
            if (refreshed?.schedules) window.state.schedules = refreshed.schedules;
            if (refreshed?.shifts) window.state.shifts = refreshed.shifts;
        }
        msg.push(t("pkg_saved_plan", { month: totals.month, drivers: totals.driverPlans, days: totals.totalDays }));
        window.state.activeGroupFilter = getActiveLineId();
        const br = getBereitschaftDriverName();
        if (br && totals.month) applyBereitschaftForMonth(br, totals.month);
    }

    saveState();
    _pendingPackage = null;

    renderPackageImportPreview();
    renderDriversList();
    renderGroupsList();
    renderMonthlyPlansView();
    renderDispatcherDashboard();
    renderDispatcherDataHub();
    if (window.state.activeGroupHubId) renderGroupHub();
    initializeLoginSelects();

    showToast(t("pkg_import_done", { summary: msg.join(" + ") }), "success", 5000);
}

export {
    renderPackageImportPreview,
    handlePackageImportInput,
    handlePackageImportDrop,
    clearPackageImport,
    confirmPackageImport,
    processPackageFiles,
    validatePlanBatch,
    applyDriversFromCsv,
    isCompanyAdminRole,
    localDriverRecordFromCanonical
};

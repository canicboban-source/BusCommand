import ApiClient from "../core/api-client.js";
import { loadStateFromFirestore } from "../core/firebase-service.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml, showToast } from "../core/utils.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { closeModal, showModal } from "../ui/modals.js";
import { t, tp } from "../ui/i18n.js";

const MAX_FILE_BYTES = 1_000_000;
const MAX_IMPORT_ROWS = 250;
const PAGE_SIZE = 25;
const REQUIRED_CORE = ["eid", "phone", "email"];
const HEADER_ALIASES = Object.freeze({
    eid: ["eid", "employee_id", "employeeid", "personalnummer", "mitarbeiternummer", "maticni_broj", "maticni broj", "broj_zaposlenog", "firma_id", "firm_id"],
    first_name: ["first_name", "firstname", "vorname", "ime"],
    last_name: ["last_name", "lastname", "nachname", "prezime"],
    full_name: ["ime_prezime", "name", "vozac", "vozač", "full_name", "fullname"],
    phone: ["phone", "telephone", "telefon", "telefonnummer"],
    email: ["email", "e-mail", "e_mail"],
    company_code: [
        "company_code", "companycode", "firmencode", "firmen_code", "firmin_kod", "firmin kod", "kod_firme",
        "licni_kod_za_app", "licni_kod", "kod_za_app", "pin", "login_code"
    ],
    group: ["grupa", "grupa_csv", "group", "group_id", "groupid", "linie", "line", "linija"]
});

let pendingImport = null;
let currentPage = 1;
let importPending = false;
let editSavePending = false;
let driversFilterTimer = null;
const statusPending = new Set();

function normalizeHeader(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase();
}

function detectDelimiter(line) {
    const counts = { ",": 0, ";": 0, "\t": 0 };
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        if (line[index] === '"') {
            if (quoted && line[index + 1] === '"') index += 1;
            else quoted = !quoted;
        } else if (!quoted && Object.hasOwn(counts, line[index])) {
            counts[line[index]] += 1;
        }
    }
    return Object.entries(counts).sort((left, right) => right[1] - left[1])[0][0];
}

function parseCsvRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"') {
            if (quoted && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else quoted = !quoted;
        } else if (!quoted && character === delimiter) {
            row.push(field);
            field = "";
        } else if (!quoted && (character === "\n" || character === "\r")) {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            row.push(field);
            field = "";
            if (row.some((cell) => cell.trim())) rows.push(row);
            row = [];
        } else field += character;
    }
    if (quoted) throw new Error(t("ca_drivers_error_unclosed_quote"));
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
    return rows;
}

function splitFullName(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { first_name: "", last_name: "" };
    if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
    return {
        first_name: parts.slice(0, -1).join(" "),
        last_name: parts[parts.length - 1]
    };
}

function uniquifyCompanyCodes(drivers) {
    const counts = new Map();
    drivers.forEach((driver) => {
        const key = String(driver.company_code || "").trim().toLowerCase();
        if (!key) return;
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    drivers.forEach((driver) => {
        const key = String(driver.company_code || "").trim().toLowerCase();
        if (!key) return;
        if ((counts.get(key) || 0) > 1) {
            driver.company_code = `${driver.company_code}-${driver.eid}`;
        }
    });
}

function parseCompanyDriversCsv(text) {
    if (typeof text !== "string" || !text.trim()) throw new Error(t("ca_drivers_error_empty"));
    const delimiter = detectDelimiter(text.split(/\r?\n/, 1)[0]);
    const rows = parseCsvRows(text, delimiter);
    if (rows.length < 2) throw new Error(t("ca_drivers_error_no_rows"));
    if (rows.length - 1 > MAX_IMPORT_ROWS) throw new Error(t("ca_drivers_error_too_many", { count: MAX_IMPORT_ROWS }));

    const lookup = new Map();
    Object.entries(HEADER_ALIASES).forEach(([canonical, aliases]) => {
        aliases.forEach((alias) => lookup.set(normalizeHeader(alias), canonical));
    });
    const headers = rows[0].map((header) => lookup.get(normalizeHeader(header)) || null);
    const hasNames = headers.includes("first_name") && headers.includes("last_name");
    const hasFullName = headers.includes("full_name");
    const missing = REQUIRED_CORE.filter((key) => !headers.includes(key));
    if (!hasNames && !hasFullName) missing.push("first_name/last_name|ime_prezime");
    if (missing.length) throw new Error(t("ca_drivers_error_columns", { columns: missing.join(", ") }));

    const drivers = rows.slice(1).map((cells, rowIndex) => {
        const raw = {};
        headers.forEach((key, columnIndex) => {
            if (key) raw[key] = String(cells[columnIndex] || "").trim();
        });
        let firstName = raw.first_name || "";
        let lastName = raw.last_name || "";
        if ((!firstName || !lastName) && raw.full_name) {
            const split = splitFullName(raw.full_name);
            firstName = firstName || split.first_name;
            lastName = lastName || split.last_name;
        }
        const driver = {
            eid: raw.eid || "",
            first_name: firstName,
            last_name: lastName,
            phone: raw.phone || "",
            email: raw.email || "",
            company_code: raw.company_code || "",
            group: raw.group || ""
        };
        const missingValue = ["eid", "first_name", "last_name", "phone", "email"]
            .find((key) => !driver[key]);
        if (missingValue) throw new Error(t("ca_drivers_error_required", { row: rowIndex + 2, field: missingValue }));
        if (!/^\S+@\S+\.\S+$/.test(driver.email)) throw new Error(t("ca_drivers_error_email", { row: rowIndex + 2 }));
        return driver;
    });

    uniquifyCompanyCodes(drivers);
    for (const field of ["eid", "company_code"]) {
        const seen = new Set();
        drivers.forEach((driver, index) => {
            const value = driver[field].toLowerCase();
            if (!value) return;
            if (seen.has(value)) throw new Error(t("ca_drivers_error_duplicate", { field, row: index + 2 }));
            seen.add(value);
        });
    }
    return { drivers, delimiter };
}

function resolveDriverGroupId(groupValue, fallbackGroupId) {
    const needle = String(groupValue || "").trim().toLowerCase();
    if (!needle) return fallbackGroupId;
    const match = companyGroups().find((group) => {
        const id = String(group.id || "").toLowerCase();
        const name = String(group.name || "").toLowerCase();
        return id === needle || name === needle || name.includes(needle);
    });
    return match ? String(match.id) : fallbackGroupId;
}

function companyDrivers() {
    const companyId = window.currentUser?.companyId;
    return (window.state.drivers || []).filter((driver) => !companyId || !driver.companyId || driver.companyId === companyId);
}

function companyGroups() {
    const companyId = window.currentUser?.companyId;
    return (window.state.groups || []).filter((group) => !companyId || !group.companyId || group.companyId === companyId);
}

function driverName(driver) {
    return driver.name || [driver.firstName, driver.lastName].filter(Boolean).join(" ") || t("driver");
}

function driverGroupId(driver) {
    return String(driver.groupId || driver.lineId || "");
}

function fillGroupSelect(select, placeholderKey, previousValue) {
    if (!select) return;
    const groups = companyGroups();
    const previous = previousValue !== undefined ? previousValue : select.value;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t(placeholderKey);
    select.appendChild(placeholder);
    groups.forEach((group) => {
        const option = document.createElement("option");
        option.value = String(group.id);
        option.textContent = `${group.id} · ${group.name}`;
        select.appendChild(option);
    });
    if (groups.some((group) => String(group.id) === String(previous))) select.value = String(previous);
}

function populateGroupControls() {
    fillGroupSelect(document.getElementById("ca-drivers-import-group"), "ca_plan_group_placeholder");
    fillGroupSelect(document.getElementById("ca-drivers-group-filter"), "ca_drivers_all_groups");
}

function renderSummary() {
    const drivers = companyDrivers();
    const active = drivers.filter((driver) => driver.active !== false).length;
    const values = {
        "ca-drivers-stat-total": drivers.length,
        "ca-drivers-stat-active": active,
        "ca-drivers-stat-inactive": drivers.length - active,
        "ca-drivers-stat-groups": new Set(drivers.map(driverGroupId).filter(Boolean)).size
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    });
}

function renderImportPreview() {
    const container = document.getElementById("ca-drivers-import-preview");
    if (!container) return;
    if (!pendingImport) {
        container.replaceChildren();
        return;
    }
    const group = companyGroups().find((entry) => String(entry.id) === pendingImport.groupId);
    const rows = pendingImport.drivers.slice(0, 8).map((driver) => `
        <tr>
            <td>${escapeHtml(driver.eid)}</td>
            <td><strong>${escapeHtml(`${driver.first_name} ${driver.last_name}`)}</strong></td>
            <td>${escapeHtml(driver.email)}</td>
            <td>${escapeHtml(driver.phone)}</td>
            <td><span class="company-driver-code-ready"><i data-lucide="message-square-lock"></i>${t("ca_drivers_activation_ready")}</span></td>
        </tr>`).join("");
    container.innerHTML = `
        <div class="company-drivers-preview-header">
            <div><strong>${escapeHtml(pendingImport.fileName)}</strong><span>${tp("ca_drivers_preview_summary", pendingImport.drivers.length, { count: pendingImport.drivers.length, group: group?.name || pendingImport.groupId })}</span></div>
            <button type="button" class="btn-icon-nav" ${actionAttr("clearCompanyDriversImport")} aria-label="${escapeHtml(t("ca_drivers_clear_import"))}" title="${escapeHtml(t("ca_drivers_clear_import"))}"><i data-lucide="x"></i></button>
        </div>
        <div class="company-drivers-table-wrap">
            <table class="company-drivers-table">
                <thead><tr><th>EID</th><th>${t("ca_drivers_name")}</th><th>Email</th><th>${t("ca_drivers_phone")}</th><th>${t("ca_drivers_activation")}</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        ${pendingImport.drivers.length > 8 ? `<p class="company-drivers-more">${t("ca_drivers_more_rows", { count: pendingImport.drivers.length - 8 })}</p>` : ""}
        <button type="button" class="btn-primary company-drivers-import-button" ${actionAttr("confirmCompanyDriversImport")} ${importPending ? "disabled" : ""}>
            <i data-lucide="${importPending ? "loader-circle" : "user-plus"}"></i>
            <span>${importPending ? t("ca_drivers_importing") : tp("ca_drivers_confirm_import", pendingImport.drivers.length, { count: pendingImport.drivers.length })}</span>
        </button>`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function filteredDrivers() {
    const search = String(document.getElementById("ca-drivers-search")?.value || "").trim().toLowerCase();
    const groupId = String(document.getElementById("ca-drivers-group-filter")?.value || "");
    const status = String(document.getElementById("ca-drivers-status-filter")?.value || "");
    return companyDrivers().filter((driver) => {
    const matchesSearch = !search || [driverName(driver), driver.email, driver.phone, driver.eid]
            .some((value) => String(value || "").toLowerCase().includes(search));
        const matchesGroup = !groupId || driverGroupId(driver) === groupId;
        const active = driver.active !== false;
        const matchesStatus = !status || (status === "active" ? active : !active);
        return matchesSearch && matchesGroup && matchesStatus;
    }).sort((left, right) => driverName(left).localeCompare(driverName(right), undefined, { sensitivity: "base" }));
}

function renderDirectory() {
    const container = document.getElementById("ca-drivers-directory");
    if (!container) return;
    const groups = new Map(companyGroups().map((group) => [String(group.id), group]));
    const drivers = filteredDrivers();
    const pageCount = Math.max(1, Math.ceil(drivers.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, pageCount);
    const visible = drivers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    if (!visible.length) {
        container.innerHTML = `<div class="company-drivers-empty"><i data-lucide="users-round"></i><strong>${t("ca_drivers_empty_title")}</strong><span>${t("ca_drivers_empty_hint")}</span></div>`;
        if (typeof lucide !== "undefined") lucide.createIcons();
        return;
    }
    const rows = visible.map((driver) => {
        const active = driver.active !== false;
        const group = groups.get(driverGroupId(driver));
        const action = active ? t("driver_deactivate") : t("driver_activate");
        const pending = statusPending.has(driver.id);
        return `<tr data-driver-id="${escapeHtml(driver.id)}">
            <td data-label="${t("ca_drivers_eid")}"><code class="company-driver-eid">${escapeHtml(driver.eid || "—")}</code></td>
            <td data-label="${t("ca_drivers_name")}"><div class="company-driver-identity"><span>${escapeHtml(driverName(driver).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase())}</span><div><strong>${escapeHtml(driverName(driver))}</strong><small>${escapeHtml(driver.email || "—")}</small></div></div></td>
            <td data-label="${t("ca_plan_group")}">${group ? `<span class="company-driver-group-dot" style="--driver-group-color:${escapeHtml(group.color || "#3d7ef5")}"></span>${escapeHtml(group.name)}` : `<span class="company-driver-unassigned">${t("ca_drivers_unassigned")}</span>`}</td>
            <td data-label="${t("ca_drivers_phone")}">${escapeHtml(driver.phone || "—")}</td>
            <td data-label="${t("ca_drivers_pin_short")}"><span class="company-driver-pin-status">${driver.hasPersonalCode === false ? "—" : escapeHtml(t("ca_drivers_pin_set") || "Postavljen")}</span></td>
            <td data-label="${t("ca_col_status")}"><span class="company-driver-status ${active ? "is-active" : "is-inactive"}"><i data-lucide="${active ? "circle-check" : "circle-pause"}"></i>${t(active ? "driver_status_active" : "driver_status_inactive")}</span></td>
            <td data-label="${t("table_actions")}"><div class="company-driver-row-actions">
                <button type="button" class="btn-secondary company-driver-edit-action" ${actionAttr("openCompanyDriverEdit", [driver.id])} ${pending || editSavePending ? "disabled" : ""}><i data-lucide="pencil"></i><span>${escapeHtml(t("btn_edit"))}</span></button>
                <button type="button" class="btn-secondary company-driver-status-action ${active ? "is-danger" : ""}" ${actionAttr("toggleCompanyDriverStatus", [driver.id])} ${pending || editSavePending ? "disabled" : ""}>${pending ? t("ca_drivers_updating") : escapeHtml(action)}</button>
            </div></td>
        </tr>`;
    }).join("");
    container.innerHTML = `
        <div class="company-drivers-results-count">${tp("ca_drivers_results", drivers.length, { count: drivers.length })}</div>
        <div class="company-drivers-table-wrap"><table class="company-drivers-table company-drivers-directory-table">
            <thead><tr><th>${t("ca_drivers_eid")}</th><th>${t("ca_drivers_name")}</th><th>${t("ca_plan_group")}</th><th>${t("ca_drivers_phone")}</th><th>${t("ca_drivers_pin_short")}</th><th>${t("ca_col_status")}</th><th>${t("table_actions")}</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${pageCount > 1 ? `<nav class="company-drivers-pagination" aria-label="${escapeHtml(t("ca_drivers_pagination"))}">
            <button type="button" class="btn-icon-nav" ${actionAttr("changeCompanyDriversPage", [currentPage - 1])} ${currentPage === 1 ? "disabled" : ""} aria-label="${escapeHtml(t("ca_drivers_previous"))}"><i data-lucide="chevron-left"></i></button>
            <span>${t("ca_drivers_page", { page: currentPage, pages: pageCount })}</span>
            <button type="button" class="btn-icon-nav" ${actionAttr("changeCompanyDriversPage", [currentPage + 1])} ${currentPage === pageCount ? "disabled" : ""} aria-label="${escapeHtml(t("ca_drivers_next"))}"><i data-lucide="chevron-right"></i></button>
        </nav>` : ""}`;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

async function handleCompanyDriversFile(event) {
    const input = event?.target;
    const file = input?.files?.[0];
    if (input) input.value = "";
    if (!file) return;
    const groupId = String(document.getElementById("ca-drivers-import-group")?.value || "");
    if (!groupId) {
        showToast(t("ca_drivers_select_group"), "error");
        return;
    }
    if (!file.name.toLowerCase().endsWith(".csv") || file.size > MAX_FILE_BYTES) {
        showToast(file.size > MAX_FILE_BYTES ? t("ca_drivers_file_too_large") : t("ca_drivers_file_type"), "error");
        return;
    }
    try {
        const text = await file.text();
        const parsed = parseCompanyDriversCsv(text);
        pendingImport = { ...parsed, csv: text, groupId, fileName: file.name };
        renderImportPreview();
        showToast(tp("ca_drivers_preview_ready", parsed.drivers.length, { count: parsed.drivers.length }), "success");
    } catch (error) {
        pendingImport = null;
        renderImportPreview();
        showToast(error.message || t("error_generic"), "error", 6000);
    }
}

function clearCompanyDriversImport() {
    pendingImport = null;
    renderImportPreview();
}

function applyDemoImport(drivers, groupId) {
    const companyId = window.currentUser?.companyId || "demo";
    drivers.forEach((driver) => {
        window.state.drivers.push({
            id: crypto.randomUUID(), firstName: driver.first_name, lastName: driver.last_name,
            name: `${driver.first_name} ${driver.last_name}`, phone: driver.phone, email: driver.email,
            groupId, lineId: groupId, companyId, active: true, codeActivated: false
        });
    });
    saveState();
}

function driversToCanonicalCsv(drivers) {
    const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const header = "eid,first_name,last_name,phone,email,company_code";
    const rows = drivers.map((driver) => [
        driver.eid, driver.first_name, driver.last_name, driver.phone, driver.email, driver.company_code
    ].map(escape).join(","));
    return [header, ...rows].join("\n");
}

async function confirmCompanyDriversImport() {
    if (!pendingImport || importPending) return;
    const fallbackGroupId = pendingImport.groupId;
    const grouped = new Map();
    pendingImport.drivers.forEach((driver) => {
        const groupId = resolveDriverGroupId(driver.group, fallbackGroupId);
        if (!groupId) return;
        if (!grouped.has(groupId)) grouped.set(groupId, []);
        grouped.get(groupId).push(driver);
    });
    if (!grouped.size) {
        showToast(t("ca_drivers_select_group"), "error");
        return;
    }
    for (const groupId of grouped.keys()) {
        if (!companyGroups().some((group) => String(group.id) === String(groupId))) {
            showToast(t("ca_drivers_select_group"), "error");
            return;
        }
    }

    importPending = true;
    renderImportPreview();
    try {
        if (IS_DEMO_MODE) {
            grouped.forEach((drivers, groupId) => applyDemoImport(drivers, groupId));
        } else {
            for (const [groupId, drivers] of grouped.entries()) {
                const result = await ApiClient.importDriversCsv(
                    window.currentUser?.companyId,
                    groupId,
                    driversToCanonicalCsv(drivers)
                );
                if (!result.success) throw new Error(result.error || t("error_generic"));
            }
            const refreshed = await loadStateFromFirestore(window.currentUser.companyId);
            window.state.drivers = refreshed?.drivers || [];
        }
        const count = pendingImport.drivers.length;
        pendingImport = null;
        currentPage = 1;
        renderCompanyAdminDrivers();
        showToast(tp("driver_import_success", count, { count }), "success", 5000);
    } catch (error) {
        showToast(error.message || t("error_generic"), "error", 6000);
    } finally {
        importPending = false;
        renderImportPreview();
    }
}

function handleCompanyDriversFilter() {
    currentPage = 1;
    renderDirectory();
}

/** Debounced text search only — selects stay immediate (Ch17). */
function handleCompanyDriversSearch() {
    clearTimeout(driversFilterTimer);
    driversFilterTimer = setTimeout(() => {
        currentPage = 1;
        renderDirectory();
    }, 250);
}

function changeCompanyDriversPage(page) {
    currentPage = Math.max(1, Number(page) || 1);
    renderDirectory();
    document.querySelector(".company-drivers-directory-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function toggleCompanyDriverStatus(driverId) {
    const driver = companyDrivers().find((entry) => entry.id === driverId);
    if (!driver || statusPending.has(driverId)) return;
    const nextActive = driver.active === false;
    showConfirm(t(nextActive ? "driver_confirm_activate" : "driver_confirm_deactivate", { name: driverName(driver) }), async () => {
        statusPending.add(driverId);
        renderDirectory();
        try {
            if (!IS_DEMO_MODE) {
                const result = await ApiClient.setDriverActive(driverId, nextActive);
                if (!result.success) throw new Error(result.error || t("driver_status_failed"));
            }
            driver.active = nextActive;
            if (IS_DEMO_MODE) saveState();
            renderSummary();
            renderDirectory();
            showToast(t(nextActive ? "driver_activated" : "driver_deactivated"), "success");
        } catch (error) {
            showToast(error.message || t("driver_status_failed"), "error");
        } finally {
            statusPending.delete(driverId);
            renderDirectory();
        }
    }, { danger: !nextActive });
}

function openCompanyDriverEdit(driverId) {
    const driver = companyDrivers().find((entry) => entry.id === driverId);
    if (!driver || editSavePending) return;
    const idInput = document.getElementById("ca-driver-edit-id");
    const eidInput = document.getElementById("ca-driver-edit-eid");
    const firstName = document.getElementById("ca-driver-edit-first-name");
    const lastName = document.getElementById("ca-driver-edit-last-name");
    const phone = document.getElementById("ca-driver-edit-phone");
    const email = document.getElementById("ca-driver-edit-email");
    const group = document.getElementById("ca-driver-edit-group");
    const pin = document.getElementById("ca-driver-edit-pin");
    if (!idInput || !firstName || !lastName || !phone || !email || !group) return;

    idInput.value = String(driver.id);
    if (eidInput) eidInput.value = String(driver.eid || "—");
    if (pin) pin.value = "";
    firstName.value = String(driver.firstName || "").trim()
        || String(driverName(driver)).trim().split(/\s+/).slice(0, -1).join(" ")
        || String(driverName(driver)).trim();
    lastName.value = String(driver.lastName || "").trim()
        || (String(driverName(driver)).trim().includes(" ")
            ? String(driverName(driver)).trim().split(/\s+/).slice(-1)[0]
            : "");
    phone.value = String(driver.phone || "");
    email.value = String(driver.email || "");
    fillGroupSelect(group, "ca_plan_group_placeholder", driverGroupId(driver));
    showModal("ca-driver-edit-modal");
    if (typeof lucide !== "undefined") lucide.createIcons();
    firstName.focus();
}

function closeCompanyDriverEdit() {
    if (editSavePending) return;
    closeModal("ca-driver-edit-modal");
    const idInput = document.getElementById("ca-driver-edit-id");
    if (idInput) idInput.value = "";
}

async function saveCompanyDriverEdit() {
    if (editSavePending) return;
    const driverId = String(document.getElementById("ca-driver-edit-id")?.value || "").trim();
    const firstName = String(document.getElementById("ca-driver-edit-first-name")?.value || "").trim();
    const lastName = String(document.getElementById("ca-driver-edit-last-name")?.value || "").trim();
    const phone = String(document.getElementById("ca-driver-edit-phone")?.value || "").trim();
    const email = String(document.getElementById("ca-driver-edit-email")?.value || "").trim();
    const groupId = String(document.getElementById("ca-driver-edit-group")?.value || "").trim();
    const personalCode = String(document.getElementById("ca-driver-edit-pin")?.value || "").trim();
    const driver = companyDrivers().find((entry) => entry.id === driverId);
    if (!driver) {
        showToast(t("ca_drivers_edit_not_found"), "error");
        return;
    }
    if (!firstName || !lastName || !phone || !email || !groupId) {
        showToast(t("ca_drivers_edit_required"), "error");
        return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        showToast(t("ca_drivers_edit_email_invalid"), "error");
        return;
    }
    if (!companyGroups().some((group) => String(group.id) === groupId)) {
        showToast(t("ca_drivers_select_group"), "error");
        return;
    }

    const payload = { firstName, lastName, phone, email, groupId };
    editSavePending = true;
    const saveBtn = document.getElementById("ca-driver-edit-save");
    if (saveBtn) saveBtn.disabled = true;
    try {
        if (IS_DEMO_MODE) {
            Object.assign(driver, {
                ...payload,
                name: `${firstName} ${lastName}`.trim(),
                lineId: groupId,
                ...(personalCode ? { pin: personalCode, company_code: personalCode, hasPersonalCode: true, codeActivated: true } : {})
            });
            saveState();
        } else {
            const result = await ApiClient.updateCompanyDriver(window.currentUser?.companyId, driverId, payload);
            if (!result.success) throw new Error(result.error || t("ca_drivers_edit_failed"));
            if (personalCode) {
                const codeResult = await ApiClient.setCompanyDriverPersonalCode(
                    window.currentUser?.companyId,
                    driverId,
                    personalCode
                );
                if (!codeResult.success) throw new Error(codeResult.error || t("ca_drivers_edit_failed"));
                showToast(
                    t("ca_drivers_pin_saved", { code: codeResult.companyCode || personalCode }),
                    "success",
                    10000
                );
            }
            await enrichCompanyDriversFromApi();
        }
        closeModal("ca-driver-edit-modal");
        const idInput = document.getElementById("ca-driver-edit-id");
        if (idInput) idInput.value = "";
        const pinInput = document.getElementById("ca-driver-edit-pin");
        if (pinInput) pinInput.value = "";
        await renderCompanyAdminDrivers();
        if (!personalCode) showToast(t("ca_drivers_edit_saved"), "success");
    } catch (error) {
        showToast(error.message || t("ca_drivers_edit_failed"), "error", 6000);
    } finally {
        editSavePending = false;
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function enrichCompanyDriversFromApi() {
    if (IS_DEMO_MODE || window.currentUser?.role !== "company-admin") return;
    const result = await ApiClient.listCompanyDrivers(window.currentUser?.companyId);
    if (!result?.success || !Array.isArray(result.drivers)) return;
    const byId = new Map(result.drivers.map((driver) => [driver.id, driver]));
    window.state.drivers = (window.state.drivers || []).map((driver) => {
        const enriched = byId.get(driver.id);
        if (!enriched) return driver;
        return {
            ...driver,
            eid: enriched.eid || driver.eid || "",
            hasPersonalCode: enriched.hasPersonalCode !== false,
            codeActivated: enriched.codeActivated === true,
            firstName: enriched.firstName || driver.firstName,
            lastName: enriched.lastName || driver.lastName,
            name: enriched.name || driver.name,
            phone: enriched.phone || driver.phone,
            email: enriched.email || driver.email,
            groupId: enriched.groupId || driver.groupId,
            lineId: enriched.lineId || driver.lineId,
            active: enriched.active !== false
        };
    });
    result.drivers.forEach((driver) => {
        if (!(window.state.drivers || []).some((entry) => entry.id === driver.id)) {
            window.state.drivers.push(driver);
        }
    });
}

async function renderCompanyAdminDrivers() {
    if (window.currentUser?.role !== "company-admin") return;
    if (!IS_DEMO_MODE) {
        try { await enrichCompanyDriversFromApi(); } catch { /* keep local state */ }
    }
    populateGroupControls();
    renderSummary();
    renderImportPreview();
    renderDirectory();
}

export {
    parseCompanyDriversCsv,
    renderCompanyAdminDrivers,
    handleCompanyDriversFile,
    clearCompanyDriversImport,
    confirmCompanyDriversImport,
    handleCompanyDriversFilter,
    handleCompanyDriversSearch,
    changeCompanyDriversPage,
    toggleCompanyDriverStatus,
    openCompanyDriverEdit,
    closeCompanyDriverEdit,
    saveCompanyDriverEdit
};

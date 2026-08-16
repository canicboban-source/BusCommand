import ApiClient from "../core/api-client.js";
import { loadStateFromFirestore } from "../core/firebase-service.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { saveState } from "../core/state.js";
import { actionAttr } from "../core/action-delegate.js";
import { escapeHtml, showToast, refreshIcons } from "../core/utils.js";
import {
    normalizeKnownGroupIds,
    readKnownGroupIdsFromDom
} from "../data/driver-known-groups.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { closeModal, showModal } from "../ui/modals.js";
import { t, tp } from "../ui/i18n.js";
import { icon, tx } from "../ui/markup.js";
import { rowActionsMenuHtml } from "../ui/row-actions-menu.js";

const MAX_FILE_BYTES = 1_000_000;
/** Keep in sync with server/driver-csv.js (D24.2 guard tx write budget). */
const MAX_IMPORT_ROWS = 249;
const PAGE_SIZE = 25;
const REQUIRED_CORE = ["eid", "phone", "email"];
const HEADER_ALIASES = Object.freeze({
    eid: ["eid", "employee_id", "employeeid", "personalnummer", "mitarbeiternummer", "maticni_broj", "maticni broj", "broj_zaposlenog", "firma_id", "firm_id"],
    first_name: ["first_name", "firstname", "vorname", "ime"],
    last_name: ["last_name", "lastname", "nachname", "prezime"],
    full_name: ["ime_prezime", "name", "vozac", "vozač", "full_name", "fullname"],
    phone: ["phone", "telephone", "telefon", "telefonnummer"],
    email: ["email", "e-mail", "e_mail"],
    // Legacy CSV company_code column is accepted but ignored (D24.2.1-A).
    // NEVER alias pin/login_code here — personal login codes are set after SMS OTP.
    company_code: [
        "company_code", "companycode", "firmencode", "firmen_code", "firmin_kod", "firmin kod", "kod_firme"
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
    const legacyCompanyCodeIgnored = headers.includes("company_code");
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
            company_code: "",
            group: raw.group || ""
        };
        const missingValue = ["eid", "first_name", "last_name", "phone", "email"]
            .find((key) => !driver[key]);
        if (missingValue) throw new Error(t("ca_drivers_error_required", { row: rowIndex + 2, field: missingValue }));
        if (!/^\S+@\S+\.\S+$/.test(driver.email)) throw new Error(t("ca_drivers_error_email", { row: rowIndex + 2 }));
        return driver;
    });

    const seen = new Set();
    drivers.forEach((driver, index) => {
        const value = String(driver.eid || "").toLowerCase();
        if (!value) return;
        if (seen.has(value)) throw new Error(t("ca_drivers_error_duplicate", { field: "eid", row: index + 2 }));
        seen.add(value);
    });
    return { drivers, delimiter, legacyCompanyCodeIgnored };
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
    fillGroupSelect(document.getElementById("ca-driver-add-group"), "ca_plan_group_placeholder");
    fillGroupSelect(document.getElementById("ca-drivers-group-filter"), "ca_drivers_all_groups");
    const primary = String(document.getElementById("ca-driver-add-group")?.value || "");
    paintKnownGroupChecks([], primary, "ca-driver-add-known-groups");
    const addGroup = document.getElementById("ca-driver-add-group");
    if (addGroup && !addGroup.dataset.knownBound) {
        addGroup.dataset.knownBound = "1";
        addGroup.addEventListener("change", () => {
            const selected = readKnownGroupIdsFromDom(document.getElementById("ca-driver-add-known-groups"));
            paintKnownGroupChecks(selected, addGroup.value, "ca-driver-add-known-groups");
        });
    }
}

function normalizeE164Phone(phone) {
    const raw = String(phone || "").trim().replace(/[^\d+]/g, "");
    if (!raw) return "";
    if (raw.startsWith("+")) return raw;
    if (raw.startsWith("00")) return `+${raw.slice(2)}`;
    return `+${raw}`;
}

function readManualDriverForm() {
    const groupId = String(document.getElementById("ca-driver-add-group")?.value || "").trim();
    const knownFromDom = readKnownGroupIdsFromDom(document.getElementById("ca-driver-add-known-groups"));
    return {
        eid: String(document.getElementById("ca-driver-add-eid")?.value || "").trim(),
        first_name: String(document.getElementById("ca-driver-add-first-name")?.value || "").trim(),
        last_name: String(document.getElementById("ca-driver-add-last-name")?.value || "").trim(),
        phone: normalizeE164Phone(document.getElementById("ca-driver-add-phone")?.value || ""),
        email: String(document.getElementById("ca-driver-add-email")?.value || "").trim().toLowerCase(),
        postalCode: String(document.getElementById("ca-driver-add-postal-code")?.value || "").trim(),
        pin: String(document.getElementById("ca-driver-add-pin")?.value || "").trim(),
        groupId,
        knownGroupIds: normalizeKnownGroupIds({ knownGroupIds: knownFromDom, groupId }, groupId)
    };
}

function clearManualDriverForm() {
    for (const id of [
        "ca-driver-add-eid",
        "ca-driver-add-first-name",
        "ca-driver-add-last-name",
        "ca-driver-add-phone",
        "ca-driver-add-email",
        "ca-driver-add-postal-code",
        "ca-driver-add-pin"
    ]) {
        const el = document.getElementById(id);
        if (el) el.value = "";
    }
    const group = document.getElementById("ca-driver-add-group");
    if (group) group.value = "";
    paintKnownGroupChecks([], "", "ca-driver-add-known-groups");
}

function validateManualDriver(draft) {
    if (!draft.groupId || !companyGroups().some((group) => String(group.id) === draft.groupId)) {
        return t("ca_drivers_select_group");
    }
    for (const field of ["eid", "first_name", "last_name", "phone", "email", "pin"]) {
        if (!draft[field]) return t("ca_drivers_edit_required");
    }
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) return t("ca_drivers_edit_email_invalid");
    if (!/^\+[1-9]\d{7,14}$/.test(draft.phone)) return t("ca_drivers_add_phone_e164");
    if (!/^\d{5,12}$/.test(draft.pin)) return t("ca_drivers_add_pin_invalid");
    return "";
}

function findDriverByEid(eid) {
    const needle = String(eid || "").trim().toLowerCase();
    return (window.state.drivers || []).find((driver) => String(driver.eid || "").trim().toLowerCase() === needle) || null;
}

function promptDriverLimitUpgrade(extra = {}) {
    const max = Number(extra.maxDrivers || window._licenseInfo?.maxDrivers || 0);
    const pkg = String(extra.packageLabel || window._licenseInfo?.packageLabel || "STARTER").toUpperCase();
    const msg = t("license_upgrade_confirm", { max, pkg })
        || `${pkg} dozvoljava najviše ${max} vozača. Želite li nadogradnju paketa?`;
    showConfirm(msg, () => {
        showToast(t("license_upgrade_contact") || "Kontaktirajte BusCommand podršku za nadogradnju paketa.", "info", 7000);
    }, {
        confirmText: t("btn_yes") || "Da",
        danger: false
    });
}

function wouldExceedDriverLimit(incomingCount = 1) {
    const max = window._licenseInfo?.maxDrivers;
    if (max == null || max >= 5000) return false;
    return companyDrivers().length + incomingCount > Number(max);
}

async function submitCompanyDriverManualAdd(event) {
    if (event?.preventDefault) event.preventDefault();
    if (importPending) return false;
    const draft = readManualDriverForm();
    const error = validateManualDriver(draft);
    if (error) {
        showToast(error, "error");
        return false;
    }
    if (wouldExceedDriverLimit(1)) {
        promptDriverLimitUpgrade();
        return false;
    }
    const driver = {
        eid: draft.eid,
        first_name: draft.first_name,
        last_name: draft.last_name,
        phone: draft.phone,
        email: draft.email,
        company_code: ""
    };
    const submitBtn = document.getElementById("ca-driver-add-submit");
    importPending = true;
    if (submitBtn) submitBtn.disabled = true;
    try {
        if (USE_LOCAL_STATE) {
            applyDemoImport([driver], draft.groupId);
            const created = findDriverByEid(draft.eid);
            if (created) {
                Object.assign(created, {
                    knownGroupIds: draft.knownGroupIds,
                    pin: draft.pin,
                    company_code: draft.pin,
                    hasPersonalCode: true,
                    codeActivated: true
                });
                saveState();
            }
        } else {
            const companyId = window.currentUser?.companyId;
            // Atomic create: profile + credentials + PIN + known groups in one server write.
            const result = await ApiClient.createCompanyDriver(companyId, {
                eid: draft.eid,
                firstName: draft.first_name,
                lastName: draft.last_name,
                phone: draft.phone,
                email: draft.email,
                postalCode: draft.postalCode,
                groupId: draft.groupId,
                knownGroupIds: draft.knownGroupIds,
                companyCode: draft.pin
            });
            if (!result.success) {
                if (result.code === "DRIVER_LIMIT_REACHED") {
                    promptDriverLimitUpgrade(result);
                    return false;
                }
                if (result.code === "EID_EXISTS") {
                    throw new Error(t("ca_drivers_eid_exists"));
                }
                throw new Error(result.error || t("ca_drivers_add_failed") || t("error_generic"));
            }
            const refreshed = await loadStateFromFirestore(companyId);
            window.state.drivers = refreshed?.drivers || [];
            await enrichCompanyDriversFromApi();
            // Never persist plaintext PIN on the client driver object.
            if (result.companyCode) {
                showToast(
                    `${t("ca_drivers_add_success")} PIN: ${result.companyCode}`,
                    "success",
                    10000
                );
            } else {
                showToast(t("ca_drivers_add_success"), "success", 6000);
            }
            clearManualDriverForm();
            closeCompanyDriverAddModal();
            currentPage = 1;
            await renderCompanyAdminDrivers();
            return true;
        }
        clearManualDriverForm();
        closeCompanyDriverAddModal();
        currentPage = 1;
        await renderCompanyAdminDrivers();
        showToast(t("ca_drivers_add_success"), "success", 6000);
        return true;
    } catch (err) {
        showToast(err.message || t("ca_drivers_add_failed") || t("error_generic"), "error", 6000);
        return false;
    } finally {
        importPending = false;
        if (submitBtn) submitBtn.disabled = false;
    }
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
            <td><span class="company-driver-code-ready">${icon("message-square-lock")}${t("ca_drivers_activation_ready")}</span></td>
        </tr>`).join("");
    container.innerHTML = `
        <div class="company-drivers-preview-header">
            <div><strong>${escapeHtml(pendingImport.fileName)}</strong><span>${tp("ca_drivers_preview_summary", pendingImport.drivers.length, { count: pendingImport.drivers.length, group: group?.name || pendingImport.groupId })}</span></div>
            <button type="button" class="btn-icon-nav" ${actionAttr("clearCompanyDriversImport")} aria-label="${tx("ca_drivers_clear_import")}" title="${tx("ca_drivers_clear_import")}">${icon("x")}</button>
        </div>
        ${pendingImport.legacyCompanyCodeIgnored
        ? `<p class="company-drivers-legacy-notice" role="status">${tx("ca_drivers_legacy_company_code_ignored")}</p>`
        : ""}
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
    refreshIcons();
}

function filteredDrivers() {
    const search = String(document.getElementById("ca-drivers-search")?.value || "").trim().toLowerCase();
    const groupId = String(document.getElementById("ca-drivers-group-filter")?.value || "");
    const status = String(document.getElementById("ca-drivers-status-filter")?.value || "");
    return companyDrivers().filter((driver) => {
    const matchesSearch = !search || [driverName(driver), driver.email, driver.phone, driver.eid]
            .some((value) => String(value || "").toLowerCase().includes(search));
        const matchesGroup = !groupId
            || driverGroupId(driver) === groupId
            || normalizeKnownGroupIds(driver).includes(groupId);
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
        container.innerHTML = `<div class="company-drivers-empty">${icon("users-round")}<strong>${t("ca_drivers_empty_title")}</strong><span>${t("ca_drivers_empty_hint")}</span></div>`;
        refreshIcons();
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
            <td data-label="${t("ca_drivers_known_lines")}">${escapeHtml(knownLinesLabel(driver))}</td>
            <td data-label="${t("ca_drivers_phone")}">${escapeHtml(driver.phone || "—")}</td>
            <td data-label="${t("ca_drivers_pin_short")}"><span class="company-driver-pin-status">${driver.hasPersonalCode === false ? "—" : escapeHtml(t("ca_drivers_pin_set") || "Postavljen")}</span></td>
            <td data-label="${t("ca_col_status")}"><span class="company-driver-status ${active ? "is-active" : "is-inactive"}"><i data-lucide="${active ? "circle-check" : "circle-pause"}"></i>${t(active ? "driver_status_active" : "driver_status_inactive")}</span></td>
            <td data-label="${t("table_actions")}"><div class="company-driver-row-actions">
                ${rowActionsMenuHtml(`ca-drv-${driver.id}`, [
        {
            action: "openCompanyDriverEdit",
            args: [driver.id],
            label: t("btn_edit"),
            icon: "pencil",
            className: "company-driver-edit-action",
            disabled: pending || editSavePending
        },
        {
            action: "toggleCompanyDriverStatus",
            args: [driver.id],
            label: pending ? t("ca_drivers_updating") : action,
            icon: active ? "circle-pause" : "circle-check",
            className: "company-driver-status-action",
            danger: active,
            disabled: pending || editSavePending
        },
        {
            action: "deleteCompanyDriver",
            args: [driver.id],
            label: t("ca_drivers_delete") || "Obriši",
            icon: "trash-2",
            className: "company-driver-delete-action",
            danger: true,
            disabled: pending || editSavePending
        }
    ])}
            </div></td>
        </tr>`;
    }).join("");
    container.innerHTML = `
        <div class="company-drivers-results-count">${tp("ca_drivers_results", drivers.length, { count: drivers.length })}</div>
        <div class="company-drivers-table-wrap"><table class="company-drivers-table company-drivers-directory-table">
            <thead><tr><th>${t("ca_drivers_eid")}</th><th>${t("ca_drivers_name")}</th><th>${t("ca_plan_group")}</th><th>${t("ca_drivers_known_lines")}</th><th>${t("ca_drivers_phone")}</th><th>${t("ca_drivers_pin_short")}</th><th>${t("ca_col_status")}</th><th>${t("table_actions")}</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>
        ${pageCount > 1 ? `<nav class="company-drivers-pagination" aria-label="${tx("ca_drivers_pagination")}">
            <button type="button" class="btn-icon-nav" ${actionAttr("changeCompanyDriversPage", [currentPage - 1])} ${currentPage === 1 ? "disabled" : ""} aria-label="${tx("ca_drivers_previous")}">${icon("chevron-left")}</button>
            <span>${t("ca_drivers_page", { page: currentPage, pages: pageCount })}</span>
            <button type="button" class="btn-icon-nav" ${actionAttr("changeCompanyDriversPage", [currentPage + 1])} ${currentPage === pageCount ? "disabled" : ""} aria-label="${tx("ca_drivers_next")}">${icon("chevron-right")}</button>
        </nav>` : ""}`;
    refreshIcons();
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
    const header = "eid,first_name,last_name,phone,email";
    const rows = drivers.map((driver) => [
        driver.eid, driver.first_name, driver.last_name, driver.phone, driver.email
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
    const incoming = pendingImport.drivers.length;
    if (wouldExceedDriverLimit(incoming)) {
        promptDriverLimitUpgrade();
        return;
    }

    importPending = true;
    renderImportPreview();
    try {
        if (USE_LOCAL_STATE) {
            grouped.forEach((drivers, groupId) => applyDemoImport(drivers, groupId));
        } else {
            for (const [groupId, drivers] of grouped.entries()) {
                const result = await ApiClient.importDriversCsv(
                    window.currentUser?.companyId,
                    groupId,
                    driversToCanonicalCsv(drivers)
                );
                if (!result.success) {
                    if (result.code === "DRIVER_LIMIT_REACHED") {
                        promptDriverLimitUpgrade(result);
                        return;
                    }
                    if (result.code === "EID_EXISTS") {
                        throw new Error(t("ca_drivers_import_conflict"));
                    }
                    throw new Error(result.error || t("error_generic"));
                }
                if (result.legacyCompanyCodeIgnored) {
                    showToast(t("ca_drivers_legacy_company_code_ignored"), "info", 7000);
                }
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
            if (!USE_LOCAL_STATE) {
                const result = await ApiClient.setDriverActive(driverId, nextActive);
                if (!result.success) throw new Error(result.error || t("driver_status_failed"));
            }
            driver.active = nextActive;
            if (USE_LOCAL_STATE) saveState();
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

/** D21: removes the driver from the tenant database — the append-only
 *  audit log entry written server-side remains the permanent record. */
function deleteCompanyDriver(driverId) {
    const driver = companyDrivers().find((entry) => entry.id === driverId);
    if (!driver || statusPending.has(driverId)) return;
    showConfirm(t("ca_drivers_delete_confirm_msg", { name: driverName(driver) }), async () => {
        statusPending.add(driverId);
        renderDirectory();
        try {
            if (!USE_LOCAL_STATE) {
                const result = await ApiClient.deleteCompanyDriver(window.currentUser?.companyId, driverId);
                if (!result.success) throw new Error(result.error || t("ca_drivers_delete_failed"));
            }
            window.state.drivers = (window.state.drivers || []).filter((entry) => entry.id !== driverId);
            if (USE_LOCAL_STATE) saveState();
            renderSummary();
            renderDirectory();
            showToast(t("ca_drivers_deleted_toast", { name: driverName(driver) }), "success");
        } catch (error) {
            showToast(error.message || t("ca_drivers_delete_failed"), "error");
        } finally {
            statusPending.delete(driverId);
            renderDirectory();
        }
    }, { danger: true, title: t("ca_drivers_delete_confirm_title"), confirmText: t("ca_drivers_delete") || "Obriši" });
}

/** Eye toggle for PIN inputs — switches password↔text, never blocks typing. */
function toggleDriverPinVisibility(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    const button = input.closest(".company-pin-input-wrap")?.querySelector(".company-pin-toggle i");
    if (button) button.setAttribute("data-lucide", showing ? "eye" : "eye-off");
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function openCompanyDriverAddModal() {
    populateGroupControls();
    clearManualDriverForm();
    showModal("ca-driver-add-modal");
    refreshIcons();
    document.getElementById("ca-driver-add-eid")?.focus();
}

function closeCompanyDriverAddModal() {
    closeModal("ca-driver-add-modal");
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
    const postalCode = document.getElementById("ca-driver-edit-postal-code");
    const group = document.getElementById("ca-driver-edit-group");
    const pin = document.getElementById("ca-driver-edit-pin");
    const status = document.getElementById("ca-driver-edit-status");
    if (!idInput || !firstName || !lastName || !phone || !email || !group) return;

    idInput.value = String(driver.id);
    if (eidInput) eidInput.value = String(driver.eid || "—");
    if (pin) pin.value = "";
    if (status) status.value = driver.active === false ? "inactive" : "active";
    firstName.value = String(driver.firstName || "").trim()
        || String(driverName(driver)).trim().split(/\s+/).slice(0, -1).join(" ")
        || String(driverName(driver)).trim();
    lastName.value = String(driver.lastName || "").trim()
        || (String(driverName(driver)).trim().includes(" ")
            ? String(driverName(driver)).trim().split(/\s+/).slice(-1)[0]
            : "");
    phone.value = String(driver.phone || "");
    email.value = String(driver.email || "");
    if (postalCode) postalCode.value = String(driver.postalCode || "");
    fillGroupSelect(group, "ca_plan_group_placeholder", driverGroupId(driver));
    paintKnownGroupChecks(driver.knownGroupIds || [], driverGroupId(driver));
    group.onchange = () => {
        const selected = readKnownGroupIdsFromDom(document.getElementById("ca-driver-edit-known-groups"));
        paintKnownGroupChecks(selected, group.value);
    };
    showModal("ca-driver-edit-modal");
    refreshIcons();
    firstName.focus();
}

function knownLinesLabel(driver) {
    const ids = normalizeKnownGroupIds(driver);
    if (!ids.length) return "—";
    return ids.join(", ");
}

function paintKnownGroupChecks(selectedIds = [], primaryGroupId = "", hostId = "ca-driver-edit-known-groups") {
    const host = document.getElementById(hostId);
    if (!host) return;
    const selected = new Set(
        normalizeKnownGroupIds({ knownGroupIds: selectedIds, groupId: primaryGroupId }, primaryGroupId)
    );
    const groups = companyGroups().slice().sort((a, b) =>
        String(a.id).localeCompare(String(b.id), undefined, { numeric: true })
    );
    if (!groups.length) {
        host.innerHTML = `<p class="company-driver-known-empty">${escapeHtml(t("ca_drivers_known_empty") || "Nema grupa.")}</p>`;
        return;
    }
    host.innerHTML = groups.map((group) => {
        const id = String(group.id);
        const isPrimary = id === String(primaryGroupId || "");
        const checked = selected.has(id) || isPrimary;
        return `<label class="company-driver-known-option">
            <input type="checkbox" data-known-group value="${escapeHtml(id)}" ${checked ? "checked" : ""} ${isPrimary ? "disabled" : ""}>
            <span><strong>${escapeHtml(id)}</strong> ${escapeHtml(group.name || "")}${isPrimary ? ` · ${escapeHtml(t("ca_drivers_known_home") || "matična")}` : ""}</span>
        </label>`;
    }).join("");
}

function closeCompanyDriverEdit() {
    if (editSavePending) return;
    closeModal("ca-driver-edit-modal");
    const idInput = document.getElementById("ca-driver-edit-id");
    if (idInput) idInput.value = "";
    const host = document.getElementById("ca-driver-edit-known-groups");
    if (host) host.innerHTML = "";
}

async function saveCompanyDriverEdit() {
    if (editSavePending) return;
    const driverId = String(document.getElementById("ca-driver-edit-id")?.value || "").trim();
    const firstName = String(document.getElementById("ca-driver-edit-first-name")?.value || "").trim();
    const lastName = String(document.getElementById("ca-driver-edit-last-name")?.value || "").trim();
    const phone = String(document.getElementById("ca-driver-edit-phone")?.value || "").trim();
    const email = String(document.getElementById("ca-driver-edit-email")?.value || "").trim();
    const postalCode = String(document.getElementById("ca-driver-edit-postal-code")?.value || "").trim();
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

    const knownFromDom = readKnownGroupIdsFromDom(document.getElementById("ca-driver-edit-known-groups"));
    const knownGroupIds = normalizeKnownGroupIds({ knownGroupIds: knownFromDom, groupId }, groupId);
    const statusValue = String(document.getElementById("ca-driver-edit-status")?.value || "active");
    const active = statusValue !== "inactive";
    const payload = { firstName, lastName, phone, email, postalCode, groupId, knownGroupIds, active };
    // EID is editable — changes go through the dedicated identity-guard route.
    const eidInput = document.getElementById("ca-driver-edit-eid");
    const eidValue = eidInput ? String(eidInput.value || "").trim() : "";
    const eidChanged = Boolean(eidValue) && eidValue !== String(driver.eid || "").trim();
    editSavePending = true;
    const saveBtn = document.getElementById("ca-driver-edit-save");
    if (saveBtn) saveBtn.disabled = true;
    try {
        if (USE_LOCAL_STATE) {
            Object.assign(driver, {
                ...payload,
                name: `${firstName} ${lastName}`.trim(),
                lineId: groupId,
                knownGroupIds,
                active,
                ...(eidChanged ? { eid: eidValue } : {}),
                ...(personalCode ? { pin: personalCode, company_code: personalCode, hasPersonalCode: true, codeActivated: true } : {})
            });
            saveState();
        } else {
            const result = await ApiClient.updateCompanyDriver(window.currentUser?.companyId, driverId, payload);
            if (!result.success) throw new Error(result.error || t("ca_drivers_edit_failed"));
            if (eidChanged) {
                const eidResult = await ApiClient.setCompanyDriverEid(window.currentUser?.companyId, driverId, eidValue);
                if (!eidResult.success) throw new Error(result.error || t("ca_drivers_edit_failed"));
            }
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
    if (USE_LOCAL_STATE || window.currentUser?.role !== "company-admin") return;
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
            postalCode: enriched.postalCode || driver.postalCode,
            groupId: enriched.groupId || driver.groupId,
            lineId: enriched.lineId || driver.lineId,
            knownGroupIds: Array.isArray(enriched.knownGroupIds)
                ? enriched.knownGroupIds
                : normalizeKnownGroupIds(driver),
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
    if (!USE_LOCAL_STATE) {
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
    submitCompanyDriverManualAdd,
    handleCompanyDriversFilter,
    handleCompanyDriversSearch,
    changeCompanyDriversPage,
    toggleCompanyDriverStatus,
    deleteCompanyDriver,
    toggleDriverPinVisibility,
    openCompanyDriverAddModal,
    closeCompanyDriverAddModal,
    openCompanyDriverEdit,
    closeCompanyDriverEdit,
    saveCompanyDriverEdit
};

// BusCommand — mesečni plan: pregled po vozaču, izmena po danu
import { parseBusFromText, parseRouteCodeFromText } from "../core/shift-plan.js";
import {
    ensureShiftCatalogForEdit,
    inferOperationalShiftType,
    isCatalogLockedForLine,
    OPERATIONAL_SHIFT_TYPES
} from "../core/line-shift-catalog.js";
import { loadActiveServicePlanForLine } from "../core/service-plan.js";
import { getVisibleDrivers, getVisibleGroups, showToast } from "../core/utils.js";
import { getBusesForLineGroup, getDriversForLineGroup, countPlansForLineGroup } from "../data/group-membership.js";
import { getActiveLineId, getGroupById } from "../data/groups.js";
import { closeModal, showModal } from "../ui/modals.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { t } from "../ui/i18n.js";
import { actionAttr } from "../core/action-delegate.js";
import { persistShift, undoShift } from "./shifts.js";
import { isOperationalReadOnly } from "../core/access.js";
import { previewMassDayRange } from "../core/monthly-plan-ops.js";

let _selectedGroupId = null;
let _editCtx = null;

const SHIFT_TYPES = {
    morning: "shift_type_morning",
    afternoon: "shift_type_afternoon",
    night: "shift_type_night",
    bereitschaft: "shift_type_bereitschaft",
    off: "shift_type_off",
    vacation: "shift_type_vacation",
    sick: "shift_type_sick"
};

const WEEKDAY_SHORT = ["Ned", "Pon", "Uto", "Sre", "Čet", "Pet", "Sub"];

function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatPlanDate(year, monthNum, day) {
    const d = new Date(year, monthNum - 1, day);
    const wd = WEEKDAY_SHORT[d.getDay()];
    return `${String(day).padStart(2, "0")}.${String(monthNum).padStart(2, "0")}.${year}. (${wd})`;
}

function getShiftTypeLabel(type) {
    const key = SHIFT_TYPES[type];
    return (key ? t(key) : null) || t(`shift_${type}`) || type || "—";
}

function getShiftDisplayName(shift) {
    if (!shift) return "—";
    if (shift.routeCode) return shift.routeCode;
    if (shift.name && shift.name !== "Frei") return shift.name;
    return getShiftTypeLabel(shift.type);
}

function getShiftBus(shift) {
    if (!shift) return "—";
    return shift.bus || parseBusFromText(shift.name) || "—";
}

function getHubBuses() {
    const hubId = window.state.activeGroupHubId || _selectedGroupId;
    return hubId ? getBusesForLineGroup(hubId) : (window.state.buses || []);
}

function currentMonthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function ensureMonthlyMonthOptions() {
    const select = document.getElementById("monthly-month-select");
    if (!select) return null;
    const selected = /^\d{4}-\d{2}$/.test(select.value) ? select.value : currentMonthKey();
    const base = new Date();
    base.setDate(1);
    const language = window.state.language || "en";
    const formatter = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" });
    const months = [];
    for (let offset = -2; offset <= 9; offset += 1) {
        const date = new Date(base.getFullYear(), base.getMonth() + offset, 1);
        months.push({ value: currentMonthKey(date), label: formatter.format(date) });
    }
    select.innerHTML = "";
    for (const month of months) {
        const option = document.createElement("option");
        option.value = month.value;
        option.textContent = month.label;
        select.appendChild(option);
    }
    select.value = months.some(month => month.value === selected) ? selected : currentMonthKey();
    return select.value;
}

function getScheduleContext() {
    const driverSelect = document.getElementById("monthly-driver-select");
    const monthSelect = document.getElementById("monthly-month-select");
    if (!driverSelect || !monthSelect) return null;

    const driverName = driverSelect.value;
    const month = monthSelect.value;
    if (!driverName || !month) return null;

    const [year, monthNum] = month.split("-").map(Number);
    const totalDays = new Date(year, monthNum, 0).getDate();
    const scheduleKey = `${driverName}_${month}`;
    if (!Array.isArray(window.state.schedules)) window.state.schedules = [];
    const schedule = window.state.schedules.find(s => s.id === scheduleKey);

    return { driverName, month, year, monthNum, totalDays, scheduleKey, schedule };
}

function renderMonthlyPlansView() {
    const groupContainer = document.getElementById("monthly-groups-list");
    const hubId = window.state.activeGroupHubId;

    if (hubId) {
        _selectedGroupId = hubId;
    } else if (!_selectedGroupId && (window.state.groups || []).length > 0) {
        _selectedGroupId = window.state.groups[0].id;
    }

    if (groupContainer && !hubId) {
        const groups = getVisibleGroups();
        groupContainer.innerHTML = groups.map(g => {
            const isActive = _selectedGroupId === g.id;
            return `<button ${actionAttr("selectMonthlyPlanGroup", [g.id])} style="
                padding: 8px 16px; border-radius: 20px; font-size: 0.85rem; font-weight: 700; cursor: pointer;
                border: 2px solid ${isActive ? g.color : "rgba(255,255,255,0.1)"};
                background: ${isActive ? g.color + "33" : "transparent"};
                color: ${isActive ? g.color : "var(--text-muted)"};
                transition: all 0.15s; margin-right: 8px; margin-bottom: 8px;">
                ${g.name}
            </button>`;
        }).join("");
    }

    populateMonthlyPlanDrivers();
}

function selectMonthlyPlanGroup(groupId) {
    _selectedGroupId = groupId;
    renderMonthlyPlansView();
}

function populateMonthlyPlanDrivers() {
    const driverSelect = document.getElementById("monthly-driver-select");
    if (!driverSelect) return;
    ensureMonthlyMonthOptions();

    const prev = driverSelect.value;
    driverSelect.innerHTML = "";

    const hubId = window.state.activeGroupHubId || _selectedGroupId;
    const filtered = hubId
        ? getDriversForLineGroup(hubId)
        : getVisibleDrivers().filter(d => d.groupId === _selectedGroupId);

    const summaryEl = document.getElementById("monthly-plan-driver-summary");

    if (filtered.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.innerText = t("monthly_no_drivers_opt");
        driverSelect.appendChild(opt);
        if (summaryEl) summaryEl.textContent = "";

        const gridContainer = document.getElementById("monthly-plan-grid-container");
        if (gridContainer) {
            gridContainer.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:30px;">${t("no_drivers_in_group")}</p>`;
        }
        return;
    }

    filtered.forEach(d => {
        const grp = getGroupById(d.groupId);
        const opt = document.createElement("option");
        opt.value = d.name;
        opt.innerText = grp ? `${d.name} · ${grp.name}` : d.name;
        driverSelect.appendChild(opt);
    });

    if (prev && filtered.some(d => d.name === prev)) {
        driverSelect.value = prev;
    }

    loadMonthlyPlanForDriver();
}

function updateMonthlyPlanSummary(ctx) {
    const summaryEl = document.getElementById("monthly-plan-driver-summary");
    if (!summaryEl || !ctx) return;

    const driver = window.state.drivers?.find(d => d.name === ctx.driverName);
    const planDays = ctx.schedule
        ? Object.keys(ctx.schedule.parsedShifts || {}).filter(d => {
            const s = ctx.schedule.parsedShifts[d];
            return s && s.type !== "off";
        }).length
        : 0;

    summaryEl.innerHTML = `
        ${t("monthly_summary", { driver: ctx.driverName, month: ctx.month, days: planDays })}
        ${driver?.bus ? ` · ${t("monthly_default_bus")} <strong>${escapeHtml(driver.bus)}</strong>` : ""}`;
}

function ensureLocalScheduleShell(scheduleKey, driverName, month, totalDays, driverId = null) {
    if (!Array.isArray(window.state.schedules)) window.state.schedules = [];
    let schedule = window.state.schedules.find(s => s.id === scheduleKey);
    if (schedule) return schedule;
    const emptyShifts = {};
    for (let d = 1; d <= totalDays; d++) {
        emptyShifts[d] = { type: "off", name: "Frei" };
    }
    schedule = {
        id: scheduleKey,
        fileName: `plan-${driverName}-${month}.local`,
        fileType: "application/json",
        fileData: "",
        parsedShifts: emptyShifts,
        driverName,
        driverId: driverId || null,
        month,
        localOnly: true
    };
    window.state.schedules.push(schedule);
    return schedule;
}

function loadMonthlyPlanForDriver() {
    const container = document.getElementById("monthly-plan-grid-container");
    if (!container) return;

    const ctx = getScheduleContext();
    if (!ctx) {
        container.innerHTML = `<p class="plan-empty-state">${t("monthly_select_prompt")}</p>`;
        updateMonthlyPlanSummary(null);
        return;
    }

    updateMonthlyPlanSummary(ctx);

    const { driverName, month, year, monthNum, totalDays, scheduleKey, schedule } = ctx;
    const hubId = window.state.activeGroupHubId || _selectedGroupId;
    const drivers = hubId ? getDriversForLineGroup(hubId) : [];

    if (!schedule) {
        container.innerHTML = `
            <div class="plan-empty-state plan-empty-state--action">
                <p class="plan-empty-title">${t("monthly_no_plan_for", { driver: escapeHtml(driverName), month })}</p>
                <p class="plan-empty-hint">${t("monthly_empty_shell_hint") || t("monthly_import_hint")}</p>
                <button type="button" class="btn-primary plan-empty-cta" ${actionAttr("createEmptyMonthlyPlan", [scheduleKey, escapeHtml(driverName), month, totalDays])}>
                    ${t("monthly_create_empty")}
                </button>
            </div>
            ${drivers.length > 1 ? renderGroupMonthMatrix(drivers, year, monthNum, totalDays, month) : ""}`;
        if (typeof lucide !== "undefined") lucide.createIcons();
        return;
    }

    let html = "";
    if (drivers.length > 1) {
        html += renderGroupMonthMatrix(drivers, year, monthNum, totalDays, month);
    }
    html += renderMassOpsToolbar(totalDays);
    html += renderDriverDayTable(schedule, scheduleKey, year, monthNum, totalDays);

    container.innerHTML = html;
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function renderMassOpsToolbar(totalDays) {
    if (isOperationalReadOnly()) return "";
    return `
      <div class="monthly-mass-ops" role="group" aria-label="${escapeHtml(t("monthly_mass_ops_label") || "Masovne operacije")}">
        <span class="monthly-mass-ops__title">${t("monthly_mass_ops_label") || "Masovno odsustvo"}</span>
        <label class="monthly-mass-ops__field">
          <span>${t("monthly_mass_from") || "Od"}</span>
          <input type="number" id="monthly-mass-from" class="med-control" min="1" max="${totalDays}" value="1">
        </label>
        <label class="monthly-mass-ops__field">
          <span>${t("monthly_mass_to") || "Do"}</span>
          <input type="number" id="monthly-mass-to" class="med-control" min="1" max="${totalDays}" value="${Math.min(7, totalDays)}">
        </label>
        <label class="monthly-mass-ops__field">
          <span>${t("monthly_mass_type") || "Tip"}</span>
          <select id="monthly-mass-type" class="med-control">
            <option value="off">${escapeHtml(getShiftTypeLabel("off"))}</option>
            <option value="vacation">${escapeHtml(getShiftTypeLabel("vacation"))}</option>
            <option value="sick">${escapeHtml(getShiftTypeLabel("sick"))}</option>
          </select>
        </label>
        <button type="button" class="btn-secondary" ${actionAttr("previewMonthlyMassAbsence", [])}>
          <i data-lucide="list-checks"></i> ${t("monthly_mass_preview") || "Pregled"}
        </button>
      </div>`;
}

function renderDriverDayTable(schedule, scheduleKey, year, monthNum, totalDays) {
    let html = `<div class="monthly-plan-scroll">
        <table class="monthly-plan-table">
        <thead class="monthly-plan-thead">
            <tr>
                <th class="monthly-plan-th monthly-plan-th--day">${t("monthly_col_day")}</th>
                <th class="monthly-plan-th">${t("monthly_col_date")}</th>
                <th class="monthly-plan-th">${t("monthly_col_shift")}</th>
                <th class="monthly-plan-th">${t("monthly_col_bus")}</th>
                <th class="monthly-plan-th monthly-plan-th--edit">${t("monthly_col_edit")}</th>
            </tr>
        </thead>
        <tbody>`;

    for (let day = 1; day <= totalDays; day++) {
        const shift = getShiftForPlanDay(schedule, day) || { type: "off", name: "Frei" };
        const dateLabel = formatPlanDate(year, monthNum, day);
        const isWeekend = [0, 6].includes(new Date(year, monthNum - 1, day).getDay());
        const shiftLabel = getShiftDisplayName(shift);
        const busLabel = getShiftBus(shift);
        const rowClass = [
            "monthly-plan-row",
            isWeekend ? "is-weekend" : "",
            shift.type === "off" && !isWeekend ? "is-muted" : ""
        ].filter(Boolean).join(" ");

        html += `<tr class="${rowClass}">
            <td class="monthly-plan-td monthly-plan-td--day">${day}.</td>
            <td class="monthly-plan-td">${dateLabel}</td>
            <td class="monthly-plan-td">
                <span class="monthly-plan-shift">${escapeHtml(shiftLabel)}</span>
                ${shift.start && shift.end ? `<span class="monthly-plan-time">${shift.start}–${shift.end}</span>` : ""}
            </td>
            <td class="monthly-plan-td">${escapeHtml(busLabel)}</td>
            <td class="monthly-plan-td monthly-plan-td--edit">
                <button type="button" class="btn-secondary monthly-plan-edit-btn"
                    ${actionAttr("openMonthlyDayEdit", [scheduleKey, day])}>
                    <i data-lucide="pencil"></i> ${t("monthly_btn_edit")}
                </button>
            </td>
        </tr>`;
    }

    html += `</tbody></table></div>
        <div class="monthly-plan-actions">
            <button type="button" class="btn-primary" ${actionAttr("openMonthlyDayEdit", [scheduleKey, 1])}>
                <i data-lucide="calendar-days"></i> ${t("monthly_btn_edit_pick")}
            </button>
        </div>`;
    return html;
}

function cellLabelForMatrix(schedule, day) {
    const shift = getShiftForPlanDay(schedule, day);
    if (!shift || isPlanDayEmpty(shift)) return "·";
    if (shift.type === "vacation") return "U";
    if (shift.type === "sick") return "B";
    if (shift.type === "off") return "·";
    return (shift.routeCode || parseRouteCodeFromText(shift.name) || shift.type || "?").slice(0, 8);
}

function renderGroupMonthMatrix(drivers, year, monthNum, totalDays, month) {
    let html = `<div class="monthly-matrix-wrap">
      <p class="monthly-matrix-hint">${t("monthly_matrix_hint") || "Pregled grupe — klik na ćeliju otvara izmenu."}</p>
      <div class="monthly-matrix-scroll">
      <table class="monthly-matrix">
        <thead class="monthly-matrix-thead">
          <tr>
            <th class="monthly-matrix-corner">${t("monthly_label_driver") || "Vozač"}</th>`;
    for (let day = 1; day <= totalDays; day++) {
        const isWeekend = [0, 6].includes(new Date(year, monthNum - 1, day).getDay());
        html += `<th class="monthly-matrix-day${isWeekend ? " is-weekend" : ""}">${day}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (const driver of drivers) {
        const scheduleKey = `${driver.name}_${month}`;
        const schedule = window.state.schedules?.find(s =>
            s.id === scheduleKey
            || (driver.id && s.id === `${driver.id}_${month}`)
        );
        html += `<tr>
          <th class="monthly-matrix-driver" scope="row" title="${escapeHtml(driver.name)}">${escapeHtml(driver.name)}</th>`;
        for (let day = 1; day <= totalDays; day++) {
            const label = cellLabelForMatrix(schedule, day);
            const isWeekend = [0, 6].includes(new Date(year, monthNum - 1, day).getDay());
            html += `<td class="monthly-matrix-cell${isWeekend ? " is-weekend" : ""}">
              <button type="button" class="monthly-matrix-btn"
                ${actionAttr("openMonthlyDayEditForDriver", [driver.name, month, day])}
                title="${escapeHtml(driver.name)} · ${day}.${monthNum}.">${escapeHtml(label)}</button>
            </td>`;
        }
        html += `</tr>`;
    }
    html += `</tbody></table></div></div>`;
    return html;
}

function getActiveLineForEdit() {
    return window.state.activeGroupHubId
        || _selectedGroupId
        || getActiveLineId()
        || null;
}

function getShiftForPlanDay(schedule, day) {
    const ps = schedule?.parsedShifts;
    if (!ps) return null;
    const d = Number(day);
    return ps[d] ?? ps[String(d)] ?? null;
}

function isPlanDayEmpty(shift) {
    if (!shift) return true;
    if (shift.type && shift.type !== "off") return false;
    const name = String(shift.name || "").toLowerCase();
    return !name || name === "frei" || name.includes("slobod");
}

function collectShiftCodesForEdit(schedule) {
    const lineId = getActiveLineForEdit();
    if (lineId) ensureShiftCatalogForEdit(lineId);
    const codes = new Set();
    const catalog = window.state.shiftCatalog?.entries || {};
    Object.keys(catalog).forEach(k => codes.add(k));

    // When catalog is locked to active CA plan, do not surface invented/legacy codes
    // that are not in the catalog — only keep in-plan schedule codes already assigned.
    const locked = lineId ? isCatalogLockedForLine(lineId) : false;
    if (!locked) {
        Object.values(schedule?.parsedShifts || {}).forEach(s => {
            if (s.routeCode) codes.add(s.routeCode);
            else if (s.name && !isPlanDayEmpty(s)) {
                const c = parseRouteCodeFromText(s.name);
                if (c) codes.add(c);
            }
        });
    } else {
        Object.values(schedule?.parsedShifts || {}).forEach(s => {
            const code = s.routeCode || (s.name ? parseRouteCodeFromText(s.name) : "");
            if (code && catalog[code]) codes.add(code);
        });
    }

    return [...codes].sort();
}

function inferTypeFromShiftCode(code, catalogEntry) {
    if (!code && !catalogEntry?.type) return "off";
    const catalogType = String(catalogEntry?.type || "").trim().toLowerCase();
    if (OPERATIONAL_SHIFT_TYPES.has(catalogType)) return catalogType;
    // Do not map .F/.S letters to Früh/Spät — Blaguss uses S=škola, F=ferije (dayType).
    return inferOperationalShiftType({
        code,
        start: catalogEntry?.start || catalogEntry?.workStart,
        end: catalogEntry?.end || catalogEntry?.workEnd,
        endDayOffset: catalogEntry?.endDayOffset || 0
    });
}

function fillMedDaySelect(year, monthNum, totalDays, selectedDay) {
    const sel = document.getElementById("med-day-select");
    if (!sel) return;
    sel.innerHTML = "";
    for (let day = 1; day <= totalDays; day++) {
        const opt = document.createElement("option");
        opt.value = String(day);
        opt.textContent = formatPlanDate(year, monthNum, day);
        if (day === selectedDay) opt.selected = true;
        sel.appendChild(opt);
    }
}

function fillMedCatalogSelect(schedule, selectedCode) {
    const sel = document.getElementById("med-shift-code-select");
    if (!sel) return;

    const lineId = getActiveLineForEdit();
    ensureShiftCatalogForEdit(lineId);
    const codes = collectShiftCodesForEdit(schedule);
    const catalog = window.state.shiftCatalog?.entries || {};
    const locked = lineId ? isCatalogLockedForLine(lineId) : false;

    sel.innerHTML = `<option value="">${t("med_code_none")}</option>`;

    codes.forEach(code => {
        const e = catalog[code];
        const opt = document.createElement("option");
        opt.value = code;
        opt.textContent = e
            ? `${code}${e.shortName ? ` (${e.shortName})` : ""}${e.start ? ` ${e.start}–${e.end}` : ""}`
            : code;
        if (code === selectedCode) opt.selected = true;
        sel.appendChild(opt);
    });

    const custom = document.getElementById("med-shift-code-custom");
    if (custom) {
        custom.hidden = locked;
        custom.disabled = locked;
        if (locked) custom.value = selectedCode && catalog[selectedCode] ? selectedCode : (custom.value || "");
    }
    const lockHint = document.getElementById("med-catalog-lock-hint");
    if (lockHint) {
        lockHint.hidden = !locked;
        if (locked) {
            lockHint.textContent = t("med_catalog_locked_hint")
                || "Samo šifre aktivnog kataloga smena.";
        }
    }
}

function fillMedBusSelect(selectedBus) {
    const sel = document.getElementById("med-bus-select");
    if (!sel) return;

    const buses = getHubBuses();
    sel.innerHTML = `<option value="">${t("med_bus_none")}</option>`;

    if (buses.length === 0) {
        const hint = document.createElement("option");
        hint.value = "";
        hint.disabled = true;
        hint.textContent = t("med_no_buses");
        sel.appendChild(hint);
        return;
    }

    buses.forEach(b => {
        const opt = document.createElement("option");
        opt.value = String(b.number);
        opt.textContent = `Bus ${b.number}`;
        if (String(b.number) === String(selectedBus)) opt.selected = true;
        sel.appendChild(opt);
    });
}

function updateMedDateHint(day) {
    const hint = document.getElementById("med-date-hint");
    if (hint && _editCtx) {
        hint.textContent = formatPlanDate(_editCtx.year, _editCtx.monthNum, day);
    }
}

function readMedFormValues() {
    const typeSelect = document.getElementById("med-shift-type");
    const codeSelect = document.getElementById("med-shift-code-select");
    const codeCustom = document.getElementById("med-shift-code-custom");
    const busSelect = document.getElementById("med-bus-select");
    const busCustom = document.getElementById("med-bus-custom");

    return {
        type: typeSelect?.value || "off",
        code: (codeCustom?.value || codeSelect?.value || "").trim(),
        bus: (busCustom?.value || busSelect?.value || "").trim().replace(/^bus\s*/i, "")
    };
}

function applyMedFormValues({ type, code, bus }, schedule) {
    const typeSelect = document.getElementById("med-shift-type");
    const codeSelect = document.getElementById("med-shift-code-select");
    const codeCustom = document.getElementById("med-shift-code-custom");
    const busSelect = document.getElementById("med-bus-select");
    const busCustom = document.getElementById("med-bus-custom");

    fillMedCatalogSelect(schedule, code);
    fillMedBusSelect(bus);

    if (typeSelect) typeSelect.value = type || "off";

    const codesInList = collectShiftCodesForEdit(schedule);
    const codeInList = code && codesInList.includes(code);

    if (codeSelect) codeSelect.value = codeInList ? code : "";
    if (codeCustom) codeCustom.value = code || "";

    const buses = getHubBuses().map(b => String(b.number));
    const busInList = bus && buses.includes(String(bus));

    if (busSelect) busSelect.value = busInList ? String(bus) : "";
    if (busCustom) busCustom.value = bus || "";
}

function shiftToFormValues(shift) {
    if (!shift || isPlanDayEmpty(shift)) {
        return { type: "off", code: "", bus: "" };
    }
    return {
        type: shift.type || "morning",
        code: shift.routeCode || parseRouteCodeFromText(shift.name) || "",
        bus: shift.bus || parseBusFromText(shift.name) || ""
    };
}

function loadMonthlyDayEditForm(day, opts = {}) {
    if (!_editCtx) return;

    const schedule = window.state.schedules.find(s => s.id === _editCtx.scheduleKey);
    if (!schedule) return;

    const daySelect = document.getElementById("med-day-select");

    if (!opts.preserveLists) {
        fillMedDaySelect(_editCtx.year, _editCtx.monthNum, _editCtx.totalDays, day);
        ensureShiftCatalogForEdit();
        fillMedCatalogSelect(schedule, "");
        fillMedBusSelect("");
    }

    if (daySelect) daySelect.value = String(day);

    const values = opts.formValues || shiftToFormValues(getShiftForPlanDay(schedule, day));
    applyMedFormValues(values, schedule);
    const code = values.code;
    updateMedDutyTimeHint(code ? window.state.shiftCatalog?.entries?.[code] : null);

    updateMedDateHint(day);
    _editCtx.day = day;
}

function onMedDaySelectChange() {
    const daySelect = document.getElementById("med-day-select");
    if (!daySelect || !_editCtx) return;

    const newDay = Number(daySelect.value) || 1;
    const schedule = window.state.schedules.find(s => s.id === _editCtx.scheduleKey);
    const existing = getShiftForPlanDay(schedule, newDay);
    const currentForm = readMedFormValues();
    const userPickedWorkShift = currentForm.type !== "off"
        && currentForm.type !== "vacation"
        && currentForm.type !== "sick";

    if (isPlanDayEmpty(existing) && userPickedWorkShift) {
        _editCtx.day = newDay;
        updateMedDateHint(newDay);
        return;
    }

    loadMonthlyDayEditForm(newDay);
}

function updateMedDutyTimeHint(entry) {
    const hint = document.getElementById("med-duty-time-hint");
    if (!hint) return;
    const start = entry?.start || entry?.workStart || "";
    const end = entry?.end || entry?.workEnd || "";
    if (start && end) {
        const dayType = entry?.dayType ? ` · ${dayTypeShortLabel(entry.dayType)}` : "";
        hint.textContent = `${start}–${end}${dayType}`;
        hint.hidden = false;
        return;
    }
    hint.textContent = "";
    hint.hidden = true;
}

function dayTypeShortLabel(dayType) {
    const key = {
        SCHOOL_WEEKDAY: "ca_plan_day_school",
        HOLIDAY_WEEKDAY: "ca_plan_day_holiday_weekday",
        SATURDAY: "ca_plan_day_saturday",
        SUNDAY_HOLIDAY: "ca_plan_day_sunday",
        ALL_DAYS: "ca_plan_day_all"
    }[String(dayType || "").toUpperCase()];
    return key ? t(key) : "";
}

function onMedCatalogSelectChange() {
    const codeSelect = document.getElementById("med-shift-code-select");
    const codeCustom = document.getElementById("med-shift-code-custom");
    const typeSelect = document.getElementById("med-shift-type");
    if (!codeSelect) return;

    const code = codeSelect.value;
    if (codeCustom) codeCustom.value = code;

    if (!code) {
        updateMedDutyTimeHint(null);
        return;
    }

    ensureShiftCatalogForEdit(getActiveLineForEdit());
    const entry = window.state.shiftCatalog?.entries?.[code];
    updateMedDutyTimeHint(entry);
    // API still requires morning|afternoon|night — times from catalog are the real assignment.
    if (typeSelect) {
        typeSelect.value = inferTypeFromShiftCode(code, entry);
    }
}

function onMedShiftTypeChange() {
    const typeSelect = document.getElementById("med-shift-type");
    const codeSelect = document.getElementById("med-shift-code-select");
    const codeCustom = document.getElementById("med-shift-code-custom");
    if (!typeSelect) return;

    const type = typeSelect.value;

    if (type === "off" || type === "vacation" || type === "sick") {
        if (codeSelect) codeSelect.value = "";
        if (codeCustom) codeCustom.value = "";
    }
}

function onMedShiftCodeCustomInput() {
    const codeCustom = document.getElementById("med-shift-code-custom");
    const codeSelect = document.getElementById("med-shift-code-select");
    const typeSelect = document.getElementById("med-shift-type");
    if (!codeCustom) return;

    const code = codeCustom.value.trim();
    if (codeSelect && code) codeSelect.value = "";

    const entry = code ? window.state.shiftCatalog?.entries?.[code] : null;
    updateMedDutyTimeHint(entry);

    if (!code || !typeSelect) return;
    typeSelect.value = inferTypeFromShiftCode(code, entry);
}

function openMonthlyDayEditForDriver(driverName, month, day) {
    const driverSelect = document.getElementById("monthly-driver-select");
    const monthSelect = document.getElementById("monthly-month-select");
    if (driverSelect && driverName) driverSelect.value = driverName;
    if (monthSelect && month) monthSelect.value = month;
    const [year, monthNum] = String(month).split("-").map(Number);
    const totalDays = new Date(year, monthNum, 0).getDate();
    const scheduleKey = `${driverName}_${month}`;
    const driver = window.state.drivers?.find(d => d.name === driverName);
    ensureLocalScheduleShell(scheduleKey, driverName, month, totalDays, driver?.id || null);
    loadMonthlyPlanForDriver();
    openMonthlyDayEdit(scheduleKey, day);
}

function openMonthlyDayEdit(scheduleKey, day) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const parts = String(scheduleKey || "").match(/^(.+)_(\d{4}-\d{2})$/);
    if (!parts) return;

    const driverName = parts[1];
    const month = parts[2];
    const [year, monthNum] = month.split("-").map(Number);
    const totalDays = new Date(year, monthNum, 0).getDate();
    const driver = window.state.drivers?.find(d => d.name === driverName);
    const schedule = ensureLocalScheduleShell(
        scheduleKey,
        driverName,
        month,
        totalDays,
        driver?.id || null
    );

    const safeDay = Math.min(Math.max(1, day || 1), totalDays);
    _editCtx = {
        scheduleKey,
        driverName: schedule.driverName || driverName,
        month,
        year,
        monthNum,
        totalDays,
        day: safeDay
    };

    const driverLabel = document.getElementById("med-driver-label");
    const monthLabel = document.getElementById("med-month-label");
    if (driverLabel) driverLabel.textContent = _editCtx.driverName;
    if (monthLabel) monthLabel.textContent = month;

    const lineId = getActiveLineForEdit();
    if (lineId) {
        loadActiveServicePlanForLine(lineId).catch(() => {});
        ensureShiftCatalogForEdit(lineId);
    } else {
        ensureShiftCatalogForEdit();
    }
    loadMonthlyDayEditForm(safeDay);

    const undoBtn = document.getElementById("med-undo-btn");
    if (undoBtn) undoBtn.disabled = false;

    showModal("monthly-day-edit-modal");
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function closeMonthlyDayEditModal() {
    closeModal("monthly-day-edit-modal");
    _editCtx = null;
}

async function saveMonthlyDayEdit() {
    if (!_editCtx) return;

    const daySelect = document.getElementById("med-day-select");
    const typeSelect = document.getElementById("med-shift-type");
    const codeSelect = document.getElementById("med-shift-code-select");
    const codeCustom = document.getElementById("med-shift-code-custom");
    const busSelect = document.getElementById("med-bus-select");
    const busCustom = document.getElementById("med-bus-custom");

    const day = Math.min(
        Math.max(1, Number(daySelect?.value) || _editCtx.day),
        _editCtx.totalDays
    );

    let type = typeSelect?.value || "off";
    const code = (codeCustom?.value || codeSelect?.value || "").trim();
    const bus = (busCustom?.value || busSelect?.value || "").trim().replace(/^bus\s*/i, "");

    const schedule = window.state.schedules.find(s => s.id === _editCtx.scheduleKey);
    if (!schedule) {
        showToast(t("med_plan_not_found"), "error");
        return;
    }

    const driver = window.state.drivers?.find(d =>
        d.name === _editCtx.driverName || (schedule.driverId && d.id === schedule.driverId)
    );
    if (!driver?.id) {
        showToast(t("med_driver_missing") || "Vozač za ovaj plan nije pronađen.", "error");
        return;
    }

    const catalog = code ? window.state.shiftCatalog?.entries?.[code] : null;
    const lineId = getActiveLineForEdit();
    if (code && lineId && isCatalogLockedForLine(lineId) && !catalog) {
        showToast(t("med_code_not_in_catalog") || "Šifra nije u aktivnom katalogu smena.", "error");
        return;
    }

    if (code && (type === "off" || type === "vacation" || type === "sick")) {
        type = inferTypeFromShiftCode(code, catalog);
    }

    let name = code;
    if (!name) {
        if (type === "off") name = t("shift_off") || "Frei";
        else if (type === "vacation") name = t("shift_vacation") || "Urlaub";
        else if (type === "sick") name = t("shift_sick") || "Krank";
        else name = getShiftTypeLabel(type);
    }

    const displayName = bus ? `${name} (Bus ${bus})` : name;
    const dateStr = `${_editCtx.year}-${String(_editCtx.monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const toastDate = formatPlanDate(_editCtx.year, _editCtx.monthNum, day);

    const saved = await persistShift(
        driver,
        dateStr,
        type,
        displayName,
        catalog?.start || null,
        catalog?.end || null,
        bus || null
    );
    if (!saved) return;

    closeMonthlyDayEditModal();
    loadMonthlyPlanForDriver();
    showToast(t("med_shift_saved", { date: toastDate }), "success");
}

async function undoMonthlyDayEdit() {
    if (!_editCtx) return;
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }

    const day = _editCtx.day;
    const schedule = window.state.schedules.find(s => s.id === _editCtx.scheduleKey);
    const driver = window.state.drivers?.find(d =>
        d.name === _editCtx.driverName || (schedule?.driverId && d.id === schedule.driverId)
    );
    if (!driver?.id) {
        showToast(t("med_driver_missing") || "Vozač za ovaj plan nije pronađen.", "error");
        return;
    }

    const dateStr = `${_editCtx.year}-${String(_editCtx.monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const toastDate = formatPlanDate(_editCtx.year, _editCtx.monthNum, day);
    const ok = await undoShift(driver, dateStr);
    if (!ok) return;

    closeMonthlyDayEditModal();
    loadMonthlyPlanForDriver();
    showToast(t("med_shift_undone", { date: toastDate })
        || t("shift_undone")
        || "Izmena je poništena.", "success");
}

function previewMonthlyMassAbsence() {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return;
    }
    const ctx = getScheduleContext();
    if (!ctx) {
        showToast(t("monthly_select_prompt"), "error");
        return;
    }

    const fromEl = document.getElementById("monthly-mass-from");
    const toEl = document.getElementById("monthly-mass-to");
    const typeEl = document.getElementById("monthly-mass-type");
    const preview = previewMassDayRange(fromEl?.value, toEl?.value, ctx.totalDays);
    if (!preview.ok) {
        showToast(t("monthly_mass_invalid_range") || "Neispravan opseg dana.", "error");
        return;
    }
    const type = typeEl?.value || "off";
    if (!["off", "vacation", "sick"].includes(type)) {
        showToast(t("monthly_mass_invalid_type") || "Dozvoljeni tipovi: slobodno, odmor, bolovanje.", "error");
        return;
    }

    const typeLabel = getShiftTypeLabel(type);
    const message = (t("monthly_mass_confirm", {
        count: preview.affectedCount,
        from: preview.days[0],
        to: preview.days[preview.days.length - 1],
        type: typeLabel,
        driver: ctx.driverName
    }) || `Primeni „${typeLabel}“ na ${preview.affectedCount} dana (${preview.days[0]}–${preview.days[preview.days.length - 1]}) za ${ctx.driverName}?`);

    showConfirm(message, () => {
        applyMonthlyMassAbsence(preview.days, type).catch((err) => {
            console.warn("Mass absence failed", err);
            showToast(t("monthly_mass_failed") || "Masovna izmena nije uspela.", "error");
        });
    }, {
        title: t("monthly_mass_ops_label") || "Masovne operacije",
        confirmText: t("btn_confirm") || "Potvrdi",
        danger: false
    });
}

async function applyMonthlyMassAbsence(days, type) {
    const ctx = getScheduleContext();
    if (!ctx) return;

    const driver = window.state.drivers?.find(d => d.name === ctx.driverName);
    if (!driver?.id) {
        showToast(t("med_driver_missing") || "Vozač za ovaj plan nije pronađen.", "error");
        return;
    }

    ensureLocalScheduleShell(ctx.scheduleKey, ctx.driverName, ctx.month, ctx.totalDays, driver.id);

    let name = getShiftTypeLabel(type);
    if (type === "off") name = t("shift_off") || "Frei";
    else if (type === "vacation") name = t("shift_vacation") || "Urlaub";
    else if (type === "sick") name = t("shift_sick") || "Krank";

    let ok = 0;
    let fail = 0;
    for (const day of days) {
        const dateStr = `${ctx.year}-${String(ctx.monthNum).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const saved = await persistShift(driver, dateStr, type, name, null, null, null);
        if (saved) ok += 1;
        else fail += 1;
    }

    loadMonthlyPlanForDriver();
    if (fail === 0) {
        showToast(t("monthly_mass_done", { count: ok }) || `Sačuvano: ${ok} dana.`, "success");
    } else {
        showToast(
            t("monthly_mass_partial", { ok, fail }) || `Sačuvano ${ok}, neuspelo ${fail}.`,
            fail === days.length ? "error" : "warning"
        );
    }
}

function createEmptyMonthlyPlan(scheduleKey, driverName, month, totalDays) {
    const driver = window.state.drivers?.find(d => d.name === driverName);
    ensureLocalScheduleShell(scheduleKey, driverName, month, Number(totalDays) || 31, driver?.id || null);
    // Local shell only — not persisted until a day is saved via server assignment (§7).
    loadMonthlyPlanForDriver();
    showToast(t("monthly_shell_ready") || "Prazan plan je otvoren. Dan se čuva tek posle potvrde servera.", "info");
}

/** @deprecated koristi openMonthlyDayEdit + saveMonthlyDayEdit */
function updateMonthlyPlanDay(scheduleKey, day, field, value) {
    const schedule = window.state.schedules.find(s => s.id === scheduleKey);
    if (!schedule) return;
    if (!schedule.parsedShifts[day]) schedule.parsedShifts[day] = { type: "off", name: "Frei" };
    schedule.parsedShifts[day][field] = value;
    if (field === "type") {
        if (value === "off") schedule.parsedShifts[day].name = t("shift_off") || "Slobodan dan";
        else if (value === "vacation") schedule.parsedShifts[day].name = t("shift_vacation") || "Godišnji odmor";
        else if (value === "sick") schedule.parsedShifts[day].name = t("shift_sick") || "Bolovanje";
        loadMonthlyPlanForDriver();
    }
    // Intentionally no saveState — day writes go through persistShift / server only.
}

function renderHubMonthlyPreview() {
    const el = document.getElementById("hub-monthly-preview");
    const monthLabel = document.getElementById("hub-monthly-month-label");
    if (!el) return;

    const hubId = window.state.activeGroupHubId;
    const month = document.getElementById("monthly-month-select")?.value || currentMonthKey();
    if (monthLabel) monthLabel.textContent = month;

    const drivers = hubId ? getDriversForLineGroup(hubId) : [];
    if (drivers.length === 0) {
        el.innerHTML = `<p style="color:var(--text-muted);margin:0;">${t("hub_monthly_no_drivers")}</p>`;
        return;
    }

    const planCount = hubId ? countPlansForLineGroup(hubId) : 0;
    const withPlans = drivers.filter(d =>
        window.state.schedules?.some(s => s.id === `${d.name}_${month}` && s.parsedShifts)
    ).length;

    const first = drivers[0];
    const sched = window.state.schedules?.find(s => s.id === `${first.name}_${month}`);
    let snippet = "";
    if (sched?.parsedShifts) {
        const workDays = Object.entries(sched.parsedShifts)
            .filter(([, s]) => s && s.type !== "off")
            .slice(0, 3);
        snippet = workDays.map(([day, s]) =>
            `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
                <span>${t("hub_monthly_day", { day })}</span>
                <span style="font-weight:600;">${escapeHtml(s.routeCode || s.name || s.type)}</span>
            </div>`
        ).join("");
    }

    el.innerHTML = `
        <p style="margin:0 0 8px;color:var(--text-muted);">${t("hub_monthly_stats", { count: drivers.length, plans: planCount, withPlans })}</p>
        ${snippet
            ? `<div style="margin-top:6px;font-size:0.78rem;color:var(--text-muted);margin-bottom:4px;">${escapeHtml(first.name)}:</div>${snippet}`
            : `<p style="color:var(--text-muted);margin:8px 0 0;">${t("hub_monthly_no_plan", { month })}</p>`}`;
}

function populateUploadScheduleDrivers() {
    const hubId = window.state.activeGroupHubId;
    const scheduleDriverSelect = document.getElementById("upload-schedule-driver");
    if (!scheduleDriverSelect) return;

    scheduleDriverSelect.innerHTML = "";
    const drivers = hubId ? getDriversForLineGroup(hubId) : (window.state.drivers || []);
    drivers.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.name;
        opt.innerText = d.name;
        scheduleDriverSelect.appendChild(opt);
    });

    const driverSelect = document.getElementById("monthly-driver-select");
    if (driverSelect?.value) scheduleDriverSelect.value = driverSelect.value;
}

function renderMonthlyPlansFullPage() {
    const subtitle = document.getElementById("monthly-full-subtitle");
    const hubId = window.state.activeGroupHubId;
    const group = hubId ? getGroupById(hubId) : null;

    if (subtitle && group) {
        subtitle.textContent = t("monthly_full_subtitle", { name: group.name, id: group.id });
    }

    renderMonthlyPlansView();
    populateUploadScheduleDrivers();
    if (typeof lucide !== "undefined") lucide.createIcons();
}

export {
    renderMonthlyPlansView,
    renderMonthlyPlansFullPage,
    renderHubMonthlyPreview,
    populateUploadScheduleDrivers,
    selectMonthlyPlanGroup,
    ensureMonthlyMonthOptions,
    populateMonthlyPlanDrivers,
    loadMonthlyPlanForDriver,
    createEmptyMonthlyPlan,
    updateMonthlyPlanDay,
    openMonthlyDayEdit,
    openMonthlyDayEditForDriver,
    closeMonthlyDayEditModal,
    saveMonthlyDayEdit,
    undoMonthlyDayEdit,
    previewMonthlyMassAbsence,
    onMedDaySelectChange,
    onMedCatalogSelectChange,
    onMedShiftTypeChange,
    onMedShiftCodeCustomInput
};

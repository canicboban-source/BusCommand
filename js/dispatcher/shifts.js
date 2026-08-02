// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { getShiftForDriverDate, parseRouteCodeFromText, setShiftForDriverDate } from "../core/shift-plan.js";
import { getVisibleDrivers, showToast, todayDateStr } from "../core/utils.js";
import { getGroupById, renderGroupFilterBar } from "../data/groups.js";
import { renderShiftsWeeklyGrid } from "./shift-grid.js";
import { getWeekDates } from "./shift-utils.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { switchSection } from "../layout/navigation.js";
import { isOperationalReadOnly } from "../core/access.js";
import { ensureDemoDayLock } from "./plan-edit-lock-demo.js";
import {
    findCrossGroupBusConflicts,
    formatCrossGroupBusWarn,
    ACTIVE_DUTY_TYPES
} from "../core/bus-shift-conflicts.js";

const pendingShiftAssignments = new Set();

function driverByName(driverName) {
    return getVisibleDrivers().find(driver => driver.name === driverName) || null;
}

function warnIfBusUsedInOtherGroup(driver, date, type, start, end, busValue) {
    const dutyType = String(type || "").toLowerCase();
    if (!ACTIVE_DUTY_TYPES.has(dutyType)) return;
    if (!String(busValue || "").trim()) return;
    const groupId = driver.groupId || driver.lineId || window.state?.activeGroupHubId || null;
    const conflicts = findCrossGroupBusConflicts(window.state?.shifts || [], {
        bus: busValue,
        date,
        groupId,
        excludeDriverId: driver.id,
        start,
        end,
        drivers: window.state?.drivers || []
    });
    if (!conflicts.length) return;
    showToast(formatCrossGroupBusWarn(conflicts, t), "warning", 6000);
}

async function persistShift(driver, date, type, name = "", start = null, end = null, bus = null) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return false;
    }
    const groupId = driver.groupId || driver.lineId || window.state?.activeGroupHubId || null;
    if (IS_DEMO_MODE && groupId) {
        const lock = ensureDemoDayLock(groupId, date);
        if (!lock.ok) {
            const who = lock.lock?.holderName || lock.lock?.holderUid || "";
            showToast(
                (t("plan_lock_held") || "Plan is locked by {name}.").replace("{name}", who || "another dispatcher"),
                "error"
            );
            return false;
        }
    }
    const key = `${driver.id}:${date}`;
    if (pendingShiftAssignments.has(key)) return false;
    pendingShiftAssignments.add(key);
    try {
        const busValue = bus != null ? String(bus) : (driver.bus || "");
        warnIfBusUsedInOtherGroup(driver, date, type, start, end, busValue);
        const existing = getShiftForDriverDate(driver.name, date);
        const expectedRevision = Number.isInteger(existing?.revision) ? existing.revision : 0;
        if (!IS_DEMO_MODE) {
            const result = await ApiClient.assignStaffShift({
                driverId: driver.id, date, type, name,
                bus: busValue, routeCode: parseRouteCodeFromText(name) || "",
                expectedRevision,
                ...(start ? { start } : {}), ...(end ? { end } : {})
            });
            if (!result.success) {
                if (result.status === 409 || result.code === "REVISION_CONFLICT") {
                    showToast(t("shift_conflict_refresh") || "Raspored je izmenjen. Osvežite i pokušajte ponovo.", "error");
                } else if (result.code === "LOCK_HELD") {
                    const who = result.lock?.holderName || result.lock?.holderUid || "";
                    showToast(
                        (t("plan_lock_held") || "Plan is locked by {name}.").replace("{name}", who || "another dispatcher"),
                        "error"
                    );
                } else {
                    showToast(result.error || t("shift_save_failed") || "Smena nije sačuvana.", "error");
                }
                return false;
            }
            if (bus != null) driver.bus = String(bus);
            if (result.deleted) {
                setShiftForDriverDate(driver.name, date, { type: "clear", syncSchedule: true });
            } else {
                setShiftForDriverDate(driver.name, date, {
                    type,
                    name,
                    start,
                    end,
                    bus: busValue || undefined,
                    revision: result.shift?.revision ?? expectedRevision + 1
                });
            }
            return true;
        }
        if (bus != null) driver.bus = String(bus);
        setShiftForDriverDate(driver.name, date, { type, name, start, end, bus: busValue || undefined, revision: expectedRevision + 1 });
        saveState();
        return true;
    } finally {
        pendingShiftAssignments.delete(key);
    }
}

function renderDispatcherShifts() {
    renderGroupFilterBar("group-filter-bar-shifts");
    const drivers = getVisibleDrivers().filter(driver =>
        !window.state.activeGroupFilter || driver.groupId === window.state.activeGroupFilter
    );
    const driverSelect = document.getElementById("shift-driver-select");
    if (driverSelect) {
        const previous = driverSelect.value;
        driverSelect.replaceChildren();
        drivers.forEach(driver => {
            const option = document.createElement("option");
            option.value = driver.name;
            const group = getGroupById(driver.groupId);
            option.textContent = group ? `${driver.name} [${group.name}]` : driver.name;
            driverSelect.appendChild(option);
        });
        if (drivers.some(driver => driver.name === previous)) driverSelect.value = previous;
    }
    const dateInput = document.getElementById("shift-date-input");
    if (dateInput && !dateInput.value) dateInput.value = todayDateStr();

    const weekDays = getWeekDates(window.currentShiftWeekOffset);
    const label = document.getElementById("shifts-week-label");
    if (label) {
        const from = weekDays[0];
        const to = weekDays[6];
        label.textContent = `${from.getDate()}.${from.getMonth() + 1}. – ${to.getDate()}.${to.getMonth() + 1}.${to.getFullYear()}`;
    }
    renderShiftsWeeklyGrid(weekDays);
    if (typeof lucide !== "undefined") lucide.createIcons();
}

function openShiftCell(driverName, dateStr) {
    const driver = driverByName(driverName);
    if (!driver) return;
    switchSection("dispatcher-shifts");
    const driverSelect = document.getElementById("shift-driver-select");
    const dateInput = document.getElementById("shift-date-input");
    if (driverSelect) driverSelect.value = driver.name;
    if (dateInput) dateInput.value = dateStr;
    const shift = getShiftForDriverDate(driver.name, dateStr);
    const typeInput = document.getElementById("shift-type-select");
    const nameInput = document.getElementById("shift-name-input");
    const startInput = document.getElementById("shift-start-input");
    const endInput = document.getElementById("shift-end-input");
    if (typeInput && shift?.type) typeInput.value = shift.type;
    if (nameInput) nameInput.value = shift?.routeCode || shift?.name || "";
    if (startInput) startInput.value = shift?.start || "";
    if (endInput) endInput.value = shift?.end || "";
    window.setTimeout(() => {
        const form = document.querySelector(".shift-form-grid");
        form?.scrollIntoView({ behavior: "smooth", block: "center" });
        form?.querySelector("select, input, button")?.focus();
    }, 0);
}

async function assignShift() {
    const driverName = document.getElementById("shift-driver-select")?.value || "";
    const date = document.getElementById("shift-date-input")?.value || "";
    const type = document.getElementById("shift-type-select")?.value || "";
    const name = String(document.getElementById("shift-name-input")?.value || "").trim();
    const start = document.getElementById("shift-start-input")?.value || "";
    const end = document.getElementById("shift-end-input")?.value || "";
    const driver = driverByName(driverName);
    const types = ["morning", "afternoon", "night", "bereitschaft", "off", "vacation", "sick"];
    const working = !["off", "vacation", "sick"].includes(type);
    if (!driver || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !types.includes(type) || name.length > 120
        || (working && (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)))) {
        showToast(t("shift_err_required"), "error");
        return;
    }
    const saved = await persistShift(driver, date, type, name, working ? start : null, working ? end : null);
    if (!saved) return;
    showToast(`✓ ${driver.name} — ${date}`, "success");
    const nameInput = document.getElementById("shift-name-input");
    if (nameInput) nameInput.value = "";
    renderDispatcherShifts();
}

async function removeShift(driverName, dateStr) {
    const driver = driverByName(driverName);
    if (!driver || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const saved = await persistShift(driver, dateStr, "clear");
    if (!saved) return;
    showToast(t("shift_removed"), "info");
    renderDispatcherShifts();
}

export { renderDispatcherShifts, openShiftCell, assignShift, removeShift, persistShift };

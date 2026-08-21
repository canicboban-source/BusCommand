// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { getShiftForDriverIdOnly, parseRouteCodeFromText, setShiftForDriverIdOnly } from "../core/shift-plan.js";
import { getDriverById, getVisibleDrivers, showToast, todayDateStr } from "../core/utils.js";
import { getGroupById, renderGroupFilterBar } from "../data/groups.js";
import { renderShiftsWeeklyGrid } from "./shift-grid.js";
import { getWeekDates } from "./shift-utils.js";
import { t } from "../ui/i18n.js";
import ApiClient from "../core/api-client.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { switchSection } from "../layout/navigation.js";
import { isOperationalReadOnly } from "../core/access.js";
import { ensureLocalDayLock } from "./plan-edit-lock-local.js";
import {
    findOverlappingBusConflicts,
    formatBusConflictBlock,
    ACTIVE_DUTY_TYPES
} from "../core/bus-shift-conflicts.js";
import { busIsAssignable } from "../data/bus-ops.js";
import {
    ensureShiftCatalogForEdit,
    getShiftCatalogForLine,
    inferOperationalShiftType
} from "../core/line-shift-catalog.js";
import { loadActiveServicePlanForLine } from "../core/service-plan.js";

const pendingShiftAssignments = new Set();

function resolveDutyFromCaPlan(dutyCode, lineId) {
    const code = String(dutyCode || "").trim();
    if (!code) return null;
    const id = String(lineId || "").trim();
    if (id) ensureShiftCatalogForEdit(id);
    const cat = getShiftCatalogForLine(id);
    const entry = cat?.entries?.[code] || null;
    if (!entry) return null;
    const start = entry.start || entry.workStart || null;
    const end = entry.end || entry.workEnd || null;
    const type = inferOperationalShiftType({
        code: entry.code || code,
        type: entry.type,
        start,
        end,
        endDayOffset: entry.endDayOffset
    });
    return {
        code: entry.code || code,
        type,
        start: start || null,
        end: end || null,
        label: entry.label || entry.shortName || code
    };
}

function fillDutyDatalist(lineId) {
    const list = document.getElementById("shift-duty-datalist");
    if (!list) return;
    if (lineId) ensureShiftCatalogForEdit(lineId);
    const entries = getShiftCatalogForLine(lineId)?.entries || {};
    list.replaceChildren();
    Object.keys(entries).sort().forEach((code) => {
        const opt = document.createElement("option");
        opt.value = code;
        list.appendChild(opt);
    });
}

function paintResolvedDutyHint(duty) {
    const el = document.getElementById("shift-duty-resolved");
    if (!el) return;
    if (!duty) {
        el.textContent = "";
        return;
    }
    const time = duty.start && duty.end ? `${duty.start}–${duty.end}` : (t("shift_time_from_plan_missing") || "Time not set in CA plan");
    el.textContent = `${duty.code} · ${duty.type} · ${time}`;
}


/**
 * Local preflight for bus conflicts / inactive / non-ready.
 * Returns an error toast key detail string, or "" when clear.
 * Server remains final authority when not in local demo state.
 */
function preflightBusAssignment(driver, date, type, start, end, busValue) {
    const dutyType = String(type || "").toLowerCase();
    if (!ACTIVE_DUTY_TYPES.has(dutyType)) return "";
    const busNumber = String(busValue || "").trim();
    if (!busNumber) return "";

    const buses = window.state?.buses || [];
    const bus = buses.find((row) => String(row.number || "").trim() === busNumber) || null;
    if (!bus) {
        return t("ops_bus_not_found") || "Bus not found in fleet.";
    }
    if (bus.active === false) {
        return t("ops_bus_inactive") || "Bus is inactive.";
    }
    const existing = getShiftForDriverIdOnly(driver.id, date);
    const keepCurrent = String(existing?.bus || "").trim() === busNumber;
    if (!busIsAssignable(bus) && !keepCurrent) {
        return t("ops_bus_not_ready") || "Bus is not ready for assignment.";
    }
    const groupId = String(driver.groupId || driver.lineId || window.state?.activeGroupHubId || "");
    const busGroups = [
        ...(Array.isArray(bus.groupIds) ? bus.groupIds : []),
        bus.groupId,
        bus.lineId
    ].map((id) => String(id || "").trim()).filter(Boolean);
    if (groupId && busGroups.length && !busGroups.includes(groupId)) {
        return t("ops_bus_outside_group") || "Bus is outside the allowed group pool.";
    }

    const conflicts = findOverlappingBusConflicts(window.state?.shifts || [], {
        bus: busNumber,
        date,
        excludeDriverId: driver.id,
        start,
        end,
        drivers: window.state?.drivers || []
    });
    if (conflicts.length) {
        return formatBusConflictBlock(conflicts, t);
    }
    return "";
}

function toastForAssignmentCode(code, fallback) {
    const map = {
        BUS_NOT_FOUND: "ops_bus_not_found",
        BUS_INACTIVE: "ops_bus_inactive",
        BUS_NOT_AVAILABLE: "ops_bus_not_ready",
        BUS_OUTSIDE_GROUP: "ops_bus_outside_group",
        BUS_DOUBLE_BOOKED: "ops_bus_conflict_blocked",
        DUTY_CATALOG_MISSING: "ops_duty_catalog_missing",
        DUTY_NOT_IN_ACTIVE_CATALOG: "ops_duty_not_in_catalog",
        DUTY_TIME_MISMATCH: "ops_duty_time_mismatch",
        REVISION_CONFLICT: "shift_conflict_refresh",
        STAFF_SESSION_INVALID: "ops_staff_session_invalid",
        DRIVER_SCOPE_CHANGED: "ops_driver_scope_changed",
        DRIVER_SCOPE_DENIED: "ops_driver_scope_denied",
        DRIVER_INACTIVE: "ops_driver_inactive"
    };
    const key = map[code];
    if (!key) return fallback;
    return t(key) || fallback;
}

function applyServerShiftConflict(driver, date, conflict) {
    const remote = conflict?.shift;
    if (!remote || typeof remote !== "object") return;
    if (remote.type && remote.type !== "clear") {
        setShiftForDriverIdOnly(driver.id, driver.name, date, {
            type: remote.type,
            name: remote.name || "",
            start: remote.start || null,
            end: remote.end || null,
            bus: remote.bus || undefined,
            routeCode: remote.routeCode || undefined,
            revision: Number.isInteger(conflict.currentRevision)
                ? conflict.currentRevision
                : (Number.isInteger(remote.revision) ? remote.revision : 0),
            syncSchedule: true
        });
    } else {
        setShiftForDriverIdOnly(driver.id, driver.name, date, { type: "clear", syncSchedule: true });
    }
}

async function persistShift(driver, date, type, name = "", start = null, end = null, bus = null) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return false;
    }
    // Client UX preflight only — server revalidates LIVE active in the mutation tx (D24.1.1).
    if (type !== "clear" && driver?.active === false) {
        showToast(t("ops_driver_inactive") || t("shift_save_failed"), "error");
        return false;
    }
    const groupId = driver.groupId || driver.lineId || window.state?.activeGroupHubId || null;
    if (USE_LOCAL_STATE && groupId) {
        const lock = ensureLocalDayLock(groupId, date);
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
        const busBlock = preflightBusAssignment(driver, date, type, start, end, busValue);
        if (busBlock) {
            showToast(busBlock, "error", 6000);
            return false;
        }
        if (!driver.id) {
            showToast(t("ops_attn_data_integrity") || "Driver without a valid ID — resolve this data issue before assigning a shift.", "error");
            return false;
        }
        const existing = getShiftForDriverIdOnly(driver.id, date);
        // Mirror-only cells report revision 0; never invent a positive revision locally.
        const expectedRevision = existing?.source === "shift" && Number.isInteger(existing.revision)
            ? existing.revision
            : 0;
        if (!USE_LOCAL_STATE) {
            const result = await ApiClient.assignStaffShift({
                driverId: driver.id, date, type, name,
                bus: busValue, routeCode: parseRouteCodeFromText(name) || "",
                expectedRevision,
                ...(start ? { start } : {}), ...(end ? { end } : {})
            });
            if (!result.success) {
                if (result.code === "REVISION_CONFLICT") {
                    applyServerShiftConflict(driver, date, result.conflict);
                    showToast(toastForAssignmentCode(result.code, result.error), "error");
                } else if (result.code === "BUS_DOUBLE_BOOKED" || result.code === "BUS_NOT_FOUND"
                    || result.code === "BUS_INACTIVE" || result.code === "BUS_NOT_AVAILABLE"
                    || result.code === "BUS_OUTSIDE_GROUP"
                    || result.code === "DUTY_CATALOG_MISSING"
                    || result.code === "DUTY_NOT_IN_ACTIVE_CATALOG"
                    || result.code === "DUTY_TIME_MISMATCH"
                    || result.code === "STAFF_SESSION_INVALID"
                    || result.code === "DRIVER_SCOPE_CHANGED"
                    || result.code === "DRIVER_SCOPE_DENIED"
                    || result.code === "DRIVER_INACTIVE") {
                    // No optimistic write — refresh remote shift if server sent one.
                    if (result.conflict?.shift) {
                        applyServerShiftConflict(driver, date, result.conflict);
                    }
                    const msg = toastForAssignmentCode(result.code, result.error || t("shift_save_failed"));
                    showToast(
                        String(msg)
                            .replace("{bus}", result.bus || busValue || "")                            .replace("{group}", result.conflict?.bus?.groupId || "—")
                            .replace("{driver}", result.conflict?.bus?.driverName || "—"),
                        "error",
                        6000
                    );
                } else if (result.code === "LOCK_HELD") {
                    const who = result.lock?.holderName || result.lock?.holderUid || "";
                    showToast(
                        (t("plan_lock_held") || "Plan is locked by {name}.").replace("{name}", who || "another dispatcher"),
                        "error"
                    );
                } else if (result.status === 409) {
                    applyServerShiftConflict(driver, date, result.conflict);
                    showToast(result.error || t("shift_conflict_refresh"), "error");
                } else {
                    showToast(result.error || t("shift_save_failed") || "Smena nije sačuvana.", "error");
                }
                return false;
            }
            if (bus != null) driver.bus = String(bus);
            if (result.deleted) {
                const clearedRevision = Number.isInteger(result.revision)
                    ? result.revision
                    : (Number.isInteger(result.shift?.revision) ? result.shift.revision : expectedRevision + 1);
                setShiftForDriverIdOnly(driver.id, driver.name, date, {
                    type: "clear",
                    syncSchedule: true,
                    revision: clearedRevision
                });
            } else {
                setShiftForDriverIdOnly(driver.id, driver.name, date, {
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
        setShiftForDriverIdOnly(driver.id, driver.name, date, { type, name, start, end, bus: busValue || undefined, revision: expectedRevision + 1 });
        saveState();
        return true;
    } finally {
        pendingShiftAssignments.delete(key);
    }
}

async function undoShift(driver, date) {
    if (isOperationalReadOnly()) {
        showToast(t("error_ops_read_only") || "Read-only view — changes are not allowed.", "error");
        return false;
    }
    if (!driver?.id || !date) return false;
    const key = `${driver.id}:${date}:undo`;
    if (pendingShiftAssignments.has(key)) return false;
    pendingShiftAssignments.add(key);
    try {
        const existing = getShiftForDriverIdOnly(driver.id, date);
        const expectedRevision = existing?.source === "shift" && Number.isInteger(existing.revision)
            ? existing.revision
            : 0;
        if (expectedRevision < 1) {
            showToast(t("shift_undo_nothing") || "Nema izmene za poništavanje.", "error");
            return false;
        }
        if (USE_LOCAL_STATE) {
            showToast(t("shift_undo_demo") || "Undo nije dostupan u demo režimu.", "error");
            return false;
        }
        const result = await ApiClient.undoStaffShift({
            driverId: driver.id,
            date,
            expectedRevision
        });
        if (!result.success) {
            if (result.status === 409 || result.code === "REVISION_CONFLICT") {
                applyServerShiftConflict(driver, date, result.conflict);
                showToast(t("shift_conflict_refresh") || "Raspored je izmenjen. Osvežite i pokušajte ponovo.", "error");
            } else if (result.code === "NOTHING_TO_UNDO") {
                showToast(t("shift_undo_nothing") || "Nema izmene za poništavanje.", "error");
            } else if (result.code === "LOCK_HELD") {
                const who = result.lock?.holderName || result.lock?.holderUid || "";
                showToast(
                    (t("plan_lock_held") || "Plan is locked by {name}.").replace("{name}", who || "another dispatcher"),
                    "error"
                );
            } else {
                showToast(result.error || t("shift_undo_failed") || "Poništavanje nije uspelo.", "error");
            }
            return false;
        }
        if (result.deleted) {
            const clearedRevision = Number.isInteger(result.revision)
                ? result.revision
                : (Number.isInteger(result.shift?.revision) ? result.shift.revision : expectedRevision + 1);
            setShiftForDriverIdOnly(driver.id, driver.name, date, {
                type: "clear",
                syncSchedule: true,
                revision: clearedRevision
            });
        } else if (result.shift) {
            setShiftForDriverIdOnly(driver.id, driver.name, date, {
                type: result.shift.type,
                name: result.shift.name || "",
                start: result.shift.start || null,
                end: result.shift.end || null,
                bus: result.shift.bus || undefined,
                routeCode: result.shift.routeCode || undefined,
                revision: result.shift.revision ?? expectedRevision + 1,
                syncSchedule: true
            });
        }
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
            option.value = driver.id || driver.uid || "";
            const group = getGroupById(driver.groupId);
            option.textContent = group ? `${driver.name} [${group.name}]` : driver.name;
            driverSelect.appendChild(option);
        });
        if (drivers.some(driver => (driver.id || driver.uid || "") === previous)) driverSelect.value = previous;
    }
    const dateInput = document.getElementById("shift-date-input");
    if (dateInput && !dateInput.value) dateInput.value = todayDateStr();

    const lineId = window.state.activeGroupFilter || window.state.activeGroupHubId
        || drivers[0]?.groupId || drivers[0]?.lineId || null;
    fillDutyDatalist(lineId);

    const nameInput = document.getElementById("shift-name-input");
    if (nameInput && !nameInput.dataset.dutyHintBound) {
        nameInput.dataset.dutyHintBound = "1";
        nameInput.addEventListener("input", () => {
            const drv = getDriverById(driverSelect?.value || "");
            const lid = drv?.groupId || drv?.lineId || lineId;
            paintResolvedDutyHint(resolveDutyFromCaPlan(nameInput.value, lid));
        });
    }
    if (nameInput?.value) {
        const drv = getDriverById(driverSelect?.value || "");
        paintResolvedDutyHint(resolveDutyFromCaPlan(nameInput.value, drv?.groupId || drv?.lineId || lineId));
    }

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

async function openShiftCell(driverId, dateStr) {
    const driver = getDriverById(driverId);
    if (!driver) return;
    switchSection("dispatcher-shifts");
    const lineId = driver.groupId || driver.lineId || window.state?.activeGroupHubId || null;
    if (lineId) {
        try {
            await loadActiveServicePlanForLine(lineId);
        } catch (e) {
            console.warn("Active service plan could not be loaded", e);
        }
    }
    const driverSelect = document.getElementById("shift-driver-select");
    const dateInput = document.getElementById("shift-date-input");
    if (driverSelect) driverSelect.value = driver.id || driver.uid || "";
    if (dateInput) dateInput.value = dateStr;
    const shift = getShiftForDriverIdOnly(driver.id || driver.uid, dateStr);
    const nameInput = document.getElementById("shift-name-input");
    const code = shift?.routeCode || parseRouteCodeFromText(shift?.name) || shift?.name || "";
    if (nameInput) nameInput.value = code;
    fillDutyDatalist(lineId);
    paintResolvedDutyHint(resolveDutyFromCaPlan(code, lineId));
    window.setTimeout(() => {
        const form = document.querySelector(".shift-form-grid");
        form?.scrollIntoView({ behavior: "smooth", block: "center" });
        form?.querySelector("select, input, button")?.focus();
    }, 0);
}

function isCoveredWorkingShift(shift) {
    if (!shift) return false;
    const type = String(shift.type || "").toLowerCase();
    return type && !["clear", "off", "vacation", "sick", "slobodan", "odmor", "bolovanje"].includes(type);
}

/** Today’s covered duty must go through incident → guided resolution, not silent clear/absence. */
function requireIncidentForTodayCoveredChange(driver, date, nextType) {
    if (!driver || date !== todayDateStr()) return false;
    const existing = getShiftForDriverIdOnly(driver.id || driver.uid, date);
    if (!isCoveredWorkingShift(existing)) return false;
    const next = String(nextType || "").toLowerCase();
    if (!["clear", "off", "vacation", "sick"].includes(next)) return false;
    showToast(
        t("shift_today_needs_incident")
            || "Za današnju smenu prvo otvorite problem u operativnom centru, pa vodite zamenu.",
        "error"
    );
    if (typeof window.openOperationalIncident === "function") {
        window.openOperationalIncident(driver.id || driver.uid);
    }
    return true;
}

async function assignShift() {
    const driverId = document.getElementById("shift-driver-select")?.value || "";
    const date = document.getElementById("shift-date-input")?.value || "";
    const name = String(document.getElementById("shift-name-input")?.value || "").trim();
    const driver = getDriverById(driverId);
    if (!driver || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || name.length > 120) {
        showToast(t("shift_err_required"), "error");
        return;
    }
    const lineId = driver.groupId || driver.lineId || window.state.activeGroupHubId || null;
    const duty = resolveDutyFromCaPlan(name, lineId);
    if (!duty) {
        showToast(
            t("shift_err_duty_not_in_plan")
                || "Duty code is not in the CA-published plan. Import or pick a catalog code.",
            "error"
        );
        paintResolvedDutyHint(null);
        return;
    }
    const type = duty.type;
    const start = duty.start;
    const end = duty.end;
    const working = !["off", "vacation", "sick"].includes(type);
    if (working && (!/^\d{2}:\d{2}$/.test(String(start || "")) || !/^\d{2}:\d{2}$/.test(String(end || "")))) {
        showToast(
            t("shift_err_duty_times_missing")
                || "CA plan has this duty but no start/end time — cannot invent times.",
            "error"
        );
        paintResolvedDutyHint(duty);
        return;
    }
    if (requireIncidentForTodayCoveredChange(driver, date, type)) return;
    const saved = await persistShift(driver, date, type, duty.code || name, working ? start : null, working ? end : null);
    if (!saved) return;
    showToast(`✓ ${driver.name} — ${date}`, "success");
    const nameInput = document.getElementById("shift-name-input");
    if (nameInput) nameInput.value = "";
    paintResolvedDutyHint(null);
    renderDispatcherShifts();
}

async function removeShift(driverId, dateStr) {
    const driver = getDriverById(driverId);
    if (!driver || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    if (requireIncidentForTodayCoveredChange(driver, dateStr, "clear")) return;
    const saved = await persistShift(driver, dateStr, "clear");
    if (!saved) return;
    showToast(t("shift_removed"), "info");
    renderDispatcherShifts();
}

export { renderDispatcherShifts, openShiftCell, assignShift, removeShift, persistShift, undoShift };

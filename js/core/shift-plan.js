// BusCommand — jedinstveni izvor istine za smene / mesečne planove
import { getActiveLineId } from "../data/groups.js";
import { getBereitschaftCode } from "./line-shift-catalog.js";
import { getScheduleByKey, todayDateStr } from "./utils.js";

const BEREITSCHAFT_SLOT = 1;

function driverIdForName(driverName) {
    return window.state.drivers?.find(driver => driver.name === driverName)?.id || null;
}

function getActiveBereitschaftCode() {
    return getBereitschaftCode(getActiveLineId());
}

const SHIFT_TYPE_LABELS = {
    morning: "Frühdienst",
    afternoon: "Spätdienst",
    night: "Nachtdienst",
    bereitschaft: "Bereitschaft (x2)",
    off: "Frei",
    vacation: "Urlaub",
    sick: "Krank"
};

function isWeekdayDateStr(dateStr) {
    const d = new Date(`${dateStr}T12:00:00`);
    const day = d.getDay();
    return day >= 1 && day <= 5;
}

function getBereitschaftDriverName() {
    if (window.state.bereitschaftDriver) return window.state.bereitschaftDriver;
    const tagged = window.state.drivers?.find(d => d.bereitschaft);
    return tagged?.name || null;
}

function buildBereitschaftShift(lineId) {
    const line = lineId || getActiveLineId();
    const brCode = getBereitschaftCode(line);
    const catalog = window.state.shiftCatalog?.entries?.[brCode];
    return {
        type: "bereitschaft",
        name: brCode,
        routeCode: brCode,
        slot: BEREITSCHAFT_SLOT,
        shortName: catalog?.shortName || "x2",
        start: catalog?.start || null,
        end: catalog?.end || null,
        lines: catalog?.lines || line || ""
    };
}

function applyBereitschaftForMonth(driverName, month) {
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const parsedShifts = {};
    const brShift = buildBereitschaftShift(getActiveLineId());

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        if (!isWeekdayDateStr(dateStr)) continue;
        parsedShifts[day] = { ...brShift };
    }

    if (!Object.keys(parsedShifts).length) return null;

    const scheduleKey = `${driverName}_${month}`;
    if (!Array.isArray(window.state.schedules)) window.state.schedules = [];
    let schedule = window.state.schedules.find(s => s.id === scheduleKey && s.parsedShifts);
    if (!schedule) {
        schedule = {
            id: scheduleKey,
            driverId: driverIdForName(driverName),
            driverName,
            month,
            fileName: "",
            fileType: "application/json",
            fileData: "",
            parsedShifts: {}
        };
        window.state.schedules.push(schedule);
    }
    Object.assign(schedule.parsedShifts, parsedShifts);
    return schedule;
}

function getDailyPlanForDate(dateStr) {
    const drivers = window.state.drivers || [];
    const catalog = window.state.shiftCatalog?.entries || {};
    const slots = [];
    const isWeekday = isWeekdayDateStr(dateStr);
    const bereitchaftDriver = getBereitschaftDriverName();

    const brCode = getActiveBereitschaftCode();
    if (isWeekday && bereitchaftDriver && brCode) {
        const meta = catalog[brCode] || {};
        const brDuty = getShiftForDriverDate(bereitchaftDriver, dateStr);
        slots.push({
            position: BEREITSCHAFT_SLOT,
            code: brCode,
            shortName: meta.shortName || "x2",
            name: meta.label || "Bereitschaft",
            type: "bereitschaft",
            driverName: bereitchaftDriver,
            start: brDuty?.start || meta.start || null,
            end: brDuty?.end || meta.end || null
        });
    }

    let position = slots.length ? 2 : 1;
    drivers.forEach(drv => {
        if (isWeekday && drv.name === bereitchaftDriver) return;

        const duty = getShiftForDriverDate(drv.name, dateStr);
        if (!duty || ["off", "vacation", "sick"].includes(duty.type)) return;
        if (duty.routeCode === brCode || duty.type === "bereitschaft") return;

        const meta = duty.routeCode ? catalog[duty.routeCode] : null;
        slots.push({
            position: position++,
            code: duty.routeCode || duty.name,
            name: meta?.label || duty.name,
            type: duty.type,
            driverName: drv.name,
            start: duty.start || meta?.start || null,
            end: duty.end || meta?.end || null
        });
    });

    return {
        date: dateStr,
        isWeekday,
        bereitschaftDriver: bereitchaftDriver,
        slots
    };
}

function ensureShiftsArray() {
    if (!window.state.shifts) {
        window.state.shifts = [];
        return;
    }
    if (Array.isArray(window.state.shifts)) return;

    const migrated = [];
    for (const [driverName, dates] of Object.entries(window.state.shifts)) {
        if (!dates || typeof dates !== "object" || Array.isArray(dates)) continue;
        for (const [date, shift] of Object.entries(dates)) {
            if (!shift || typeof shift !== "object") continue;
            migrated.push({
                id: `shf-mig-${driverName}-${date}`,
                driverName,
                date,
                type: shift.type || "off",
                name: shift.name || "",
                confirmedByDriver: false
            });
        }
    }
    window.state.shifts = migrated;
}

function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseBusFromText(text) {
    if (!text) return null;
    const busMatch = String(text).match(/Bus\s*(\d+)/i) || String(text).match(/\b(91\d{3})\b/);
    return busMatch ? busMatch[1] : null;
}

function parseRouteCodeFromText(text) {
    if (!text) return null;
    const codeMatch = String(text).match(/\b(\d{3}\.[S\d]?\d{2,3})\b/) || String(text).match(/^(\d{3})\b/);
    return codeMatch ? codeMatch[1] : null;
}

function findRouteForDriver(driver, routeCode) {
    if (!routeCode || !window.state.routes) return null;
    const lineNum = routeCode.split(".")[0];
    return window.state.routes.find(r =>
        r.number === lineNum && (!driver?.groupId || r.groupId === driver.groupId)
    ) || window.state.routes.find(r => r.number === lineNum) || null;
}

/** Čitanje smene: prvo dnevne izmene (shifts[]), zatim mesečni plan (schedules) */
function getShiftForDriverDate(driverName, dateStr) {
    ensureShiftsArray();

    const driverId = driverIdForName(driverName);
    const direct = window.state.shifts.find(s =>
        s.date === dateStr
        && (s.driverName === driverName || (driverId && s.driverId === driverId))
    );
    if (direct) {
        return {
            ...direct,
            revision: Number.isInteger(direct.revision) ? direct.revision : 0,
            source: "override"
        };
    }

    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const schedule = (driverId && getScheduleByKey(`${driverId}_${yearMonth}`))
        || getScheduleByKey(`${driverName}_${yearMonth}`);

    if (schedule?.parsedShifts?.[day]) {
        const s = schedule.parsedShifts[day];
        return {
            driverId: driverId || schedule.driverId || null,
            driverName,
            date: dateStr,
            type: s.type || "off",
            name: s.name || "",
            bus: s.bus || parseBusFromText(s.name),
            routeCode: s.routeCode || parseRouteCodeFromText(s.name),
            start: s.start || null,
            end: s.end || null,
            revision: 0,
            source: "schedule"
        };
    }
    return null;
}

function getCurrentShiftForDriver(driverName, yearMonthStr, dayNum) {
    const dateStr = `${yearMonthStr}-${String(dayNum).padStart(2, "0")}`;
    const shift = getShiftForDriverDate(driverName, dateStr);
    if (shift) return shift;
    return { type: "off", name: "Frei" };
}

function setShiftForDriverDate(driverName, dateStr, { type, name, bus, routeCode, start, end, revision, syncSchedule = true }) {
    ensureShiftsArray();

    const driverId = driverIdForName(driverName);
    window.state.shifts = window.state.shifts.filter((s) => {
        if (s.date !== dateStr) return true;
        const sameName = s.driverName === driverName;
        const sameId = driverId && s.driverId && s.driverId === driverId;
        return !(sameName || sameId);
    });

    if (type && type !== "clear") {
        const label = name || SHIFT_TYPE_LABELS[type] || type;
        window.state.shifts.push({
            id: `shf-${driverId || "x"}-${dateStr}`,
            driverId: driverId,
            driverName,
            date: dateStr,
            type,
            name: label,
            bus: bus || parseBusFromText(label) || null,
            routeCode: routeCode || parseRouteCodeFromText(label) || null,
            start: start || null,
            end: end || null,
            revision: Number.isInteger(revision) ? revision : 0,
            confirmedByDriver: false,
            assignedBy: window.currentUser?.name || "Dispečer",
            assignedAt: todayDateStr()
        });
    }

    if (syncSchedule) {
        syncShiftToMonthlyPlan(driverName, dateStr, type, name, start, end, bus, routeCode);
    }
}

function syncShiftToMonthlyPlan(driverName, dateStr, type, name, start, end, bus = null, routeCode = null) {
    const parts = dateStr.split("-").map(Number);
    if (parts.length !== 3) return;
    const [year, month, day] = parts;
    const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
    const driverId = driverIdForName(driverName);
    const scheduleKeyById = driverId ? `${driverId}_${yearMonth}` : null;
    const scheduleKeyByName = `${driverName}_${yearMonth}`;

    if (!Array.isArray(window.state.schedules)) window.state.schedules = [];

    if (!type || type === "clear") {
        // Clear day on every matching schedule copy (canonical id + legacy name key).
        for (const schedule of window.state.schedules) {
            if (!schedule?.parsedShifts) continue;
            const sameId = scheduleKeyById && schedule.id === scheduleKeyById;
            const sameNameKey = schedule.id === scheduleKeyByName;
            const sameDriverMonth = schedule.month === yearMonth
                && (
                    (driverId && schedule.driverId === driverId)
                    || schedule.driverName === driverName
                );
            if (!sameId && !sameNameKey && !sameDriverMonth) continue;
            delete schedule.parsedShifts[day];
            delete schedule.parsedShifts[String(day)];
        }
        return;
    }

    let schedule = (scheduleKeyById && window.state.schedules.find(s => s.id === scheduleKeyById && s.parsedShifts))
        || window.state.schedules.find(s => s.id === scheduleKeyByName && s.parsedShifts);

    if (!schedule) {
        schedule = {
            id: scheduleKeyById || scheduleKeyByName,
            driverId,
            driverName,
            month: yearMonth,
            fileName: "",
            fileType: "application/json",
            fileData: "",
            parsedShifts: {}
        };
        window.state.schedules.push(schedule);
    } else if (scheduleKeyById && schedule.id !== scheduleKeyById) {
        schedule.id = scheduleKeyById;
        schedule.driverId = driverId;
    }

    const label = name || SHIFT_TYPE_LABELS[type] || type;
    schedule.parsedShifts[day] = {
        type,
        name: label,
        bus: bus || parseBusFromText(label),
        routeCode: routeCode || parseRouteCodeFromText(label),
        start: start || null,
        end: end || null
    };
}

function getDriverDutySummary(driverName, dateStr) {
    const driver = window.state.drivers?.find(d => d.name === driverName);
    const shift = getShiftForDriverDate(driverName, dateStr);
    const bus = shift?.bus || driver?.bus || "—";
    const routeCode = shift?.routeCode || parseRouteCodeFromText(shift?.name);
    const route = findRouteForDriver(driver, routeCode);
    const shiftLabel = shift?.name || (shift?.type ? SHIFT_TYPE_LABELS[shift.type] : "—");

    const catalog = window.state.shiftCatalog?.entries;
    const code = shift?.routeCode || routeCode;
    let timeRange = "";
    if (shift?.start && shift?.end) {
        timeRange = `${shift.start}–${shift.end}`;
    } else if (catalog && code && catalog[code]) {
        const e = catalog[code];
        if (e.start && e.end) timeRange = `${e.start}–${e.end}`;
    }

    const dailySlot = getDailyPlanForDate(dateStr).slots.find(s => s.driverName === driverName);

    return {
        driver,
        shift,
        bus,
        route,
        routeCode,
        shiftLabel,
        timeRange,
        dailyPosition: dailySlot?.position ?? null,
        isBereitschaft: shift?.type === "bereitschaft" || routeCode === getActiveBereitschaftCode()
    };
}

function getTomorrowDutySummary(driverName) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = dateToStr(tomorrow);
    const summary = getDriverDutySummary(driverName, dateStr);
    const stored = (window.state.tomorrowShifts || []).find(s => s.driver === driverName);

    return {
        date: dateStr,
        shift: summary.shiftLabel,
        bus: summary.bus !== "—" ? summary.bus : (stored?.bus || "—"),
        confirmed: summary.shift?.confirmedByDriver || stored?.confirmed || false,
        type: summary.shift?.type || "off"
    };
}

function detectDriverFromFilename(fileName, drivers) {
    const lower = fileName.toLowerCase();
    for (const driver of drivers || []) {
        if (lower.includes(driver.name.toLowerCase())) return driver;
        const parts = driver.name.toLowerCase().split(" ").filter(p => p.length > 2);
        if (parts.some(p => lower.includes(p))) return driver;
    }
    return null;
}

function detectMonthFromFilename(fileName) {
    const lower = fileName.toLowerCase();
    const iso = lower.match(/(20\d{2})[-_.](0[1-9]|1[0-2])/);
    if (iso) return `${iso[1]}-${iso[2]}`;

    const eu = lower.match(/(0[1-9]|1[0-2])[-_.](20\d{2})/);
    if (eu) return `${eu[2]}-${eu[1]}`;

    const months = {
        januar: "01", january: "01", jan: "01",
        februar: "02", february: "02", feb: "02",
        mart: "03", march: "03", mar: "03", märz: "03", maerz: "03",
        april: "04", apr: "04",
        maj: "05", may: "05",
        jun: "06", juni: "06", june: "06",
        jul: "07", juli: "07", july: "07",
        avgust: "08", august: "08", aug: "08",
        septembar: "09", september: "09", sep: "09",
        oktobar: "10", october: "10", okt: "10", oct: "10",
        novembar: "11", november: "11", nov: "11",
        decembar: "12", december: "12", dec: "12", dez: "12"
    };
    for (const [name, num] of Object.entries(months)) {
        if (lower.includes(name)) {
            const yearMatch = lower.match(/20\d{2}/);
            const year = yearMatch ? yearMatch[0] : String(new Date().getFullYear());
            return `${year}-${num}`;
        }
    }
    return null;
}

function saveMonthlyPlan(driverName, month, parsedShifts, fileMeta = {}) {
    if (!Array.isArray(window.state.schedules)) window.state.schedules = [];
    const scheduleKey = `${driverName}_${month}`;
    const entry = {
        id: scheduleKey,
        driverId: driverIdForName(driverName),
        driverName,
        month,
        fileName: fileMeta.fileName || `plan-${driverName}-${month}`,
        fileType: fileMeta.fileType || "application/octet-stream",
        fileData: fileMeta.fileData || "",
        parsedShifts,
        importedAt: new Date().toISOString(),
        parseQuality: fileMeta.parseQuality || "ok"
    };
    const idx = window.state.schedules.findIndex(s => s.id === scheduleKey);
    if (idx >= 0) window.state.schedules[idx] = entry;
    else window.state.schedules.push(entry);
    return entry;
}

export {
    getActiveBereitschaftCode,
    BEREITSCHAFT_SLOT,
    SHIFT_TYPE_LABELS,
    ensureShiftsArray,
    getShiftForDriverDate,
    getCurrentShiftForDriver,
    setShiftForDriverDate,
    syncShiftToMonthlyPlan,
    getDriverDutySummary,
    getTomorrowDutySummary,
    detectDriverFromFilename,
    detectMonthFromFilename,
    saveMonthlyPlan,
    parseBusFromText,
    parseRouteCodeFromText,
    findRouteForDriver,
    dateToStr,
    isWeekdayDateStr,
    getBereitschaftDriverName,
    buildBereitschaftShift,
    applyBereitschaftForMonth,
    getDailyPlanForDate
};

// BusCommand — test seed: Linija 310, 45+ smena, x2 Bereitschaft (poz. 1), dodatni vozači
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { getBereitschaftCode, persistCatalogForLine } from "../core/line-shift-catalog.js";
import {
    applyBereitschaftForMonth,
    saveMonthlyPlan
} from "../core/shift-plan.js";
import { renderDriversList } from "../data/drivers.js";
import { assignDriverToLine } from "../data/group-membership.js";
import { renderGroupsList } from "../data/groups.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderDailyPlanPanel } from "../dispatcher/daily-plan.js";
import { renderMonthlyPlansView } from "../dispatcher/monthly-plans.js";
import { renderDispatcherDataHub } from "../dispatcher/data-hub.js";
import { openGroupHub } from "../dispatcher/group-hub.js";
import { initializeLoginSelects } from "../auth/login-ui.js";

const LINE_ID = "310";
const DEFAULT_MONTH = "2026-08";
const GROUP_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

const REAL_DRIVERS = [
    { name: "Marko Petrović", pin: "12345", group: "G1", firma: "100601" },
    { name: "Nikola Jovanović", pin: "12345", group: "G1", firma: "100602" },
    { name: "Stefan Ilić", pin: "12345", group: "G1", firma: "100603" },
    { name: "Aleksandar Nikolić", pin: "12345", group: "G2", firma: "100604" },
    { name: "Milan Stojanović", pin: "12345", group: "G2", firma: "100605" },
    { name: "Dušan Pavlović", pin: "12345", group: "G2", firma: "100606" },
    { name: "Ivan Đorđević", pin: "12345", group: "G3", firma: "100607" },
    { name: "Luka Kovačević", pin: "12345", group: "G3", firma: "100608" },
    { name: "Nemanja Savić", pin: "12345", group: "G3", firma: "100609" },
    { name: "Petar Popović", pin: "12345", group: "G3", firma: "100610", bereitschaft: true }
];

const FICTIONAL_DRIVERS = [
    { name: "Goran Marić", pin: "12345", group: "G1", firma: "100611" },
    { name: "Tomislav Horvat", pin: "12345", group: "G1", firma: "100612" },
    { name: "Ivana Babić", pin: "12345", group: "G1", firma: "100613" },
    { name: "Dragan Stanišić", pin: "12345", group: "G2", firma: "100614" },
    { name: "Jelena Radić", pin: "12345", group: "G2", firma: "100615" },
    { name: "Filip Antić", pin: "12345", group: "G2", firma: "100616" },
    { name: "Saša Kostić", pin: "12345", group: "G3", firma: "100617" },
    { name: "Miloš Vuković", pin: "12345", group: "G3", firma: "100618" },
    { name: "Ana Horvat", pin: "12345", group: "G3", firma: "100619" },
    { name: "Kristijan Novak", pin: "12345", group: "G1", firma: "100620" },
    { name: "Vedran Jurić", pin: "12345", group: "G2", firma: "100621" },
    { name: "Branko Leitner", pin: "12345", group: "G3", firma: "100622" }
];

function padTime(h, m) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function buildShiftCatalog310() {
    const catalog = {};
    const brCode = getBereitschaftCode(LINE_ID);

    catalog[brCode] = {
        code: brCode,
        label: "Bereitschaft",
        shortName: "x2",
        slot: 1,
        type: "bereitschaft",
        start: "04:00",
        end: "22:00",
        lines: "310",
        weekdaysOnly: true
    };

    for (let i = 1; i <= 20; i++) {
        const code = `310.F${String(i).padStart(2, "0")}`;
        const startH = 4 + Math.floor((i - 1) / 3);
        catalog[code] = {
            code,
            label: "Frühdienst Mo–Fr",
            start: padTime(startH, (i * 3) % 60),
            end: padTime(startH + 8, (i * 5) % 60),
            lines: "310,311,312"
        };
    }

    for (let i = 1; i <= 12; i++) {
        const code = `310.S${String(i).padStart(2, "0")}`;
        catalog[code] = {
            code,
            label: "Schule NÖ",
            start: padTime(4 + (i % 4), 10 + (i % 50)),
            end: padTime(12 + (i % 3), 20 + (i % 40)),
            lines: "310"
        };
    }

    for (let i = 1; i <= 6; i++) {
        const code = `310.60${i}`;
        catalog[code] = {
            code,
            label: "Samstag",
            start: padTime(5 + i, 15),
            end: padTime(13 + i, 45),
            lines: "310,314,315"
        };
    }

    for (let i = 1; i <= 4; i++) {
        const code = `310.70${i}`;
        catalog[code] = {
            code,
            label: "Sonntag",
            start: padTime(6 + i, 30),
            end: padTime(14 + i, 0),
            lines: "310,319"
        };
    }

    for (let i = 1; i <= 5; i++) {
        const code = `310.3${String(10 + i).padStart(2, "0")}`;
        catalog[code] = {
            code,
            label: "Zusatz Mo–Fr",
            start: padTime(5 + i, 0),
            end: padTime(13 + i, 30),
            lines: "310"
        };
    }

    return catalog;
}

function ensureGroups() {
    if (!Array.isArray(window.state.groups)) window.state.groups = [];
    const lineName = `Linija ${LINE_ID}`;
    if (!window.state.groups.find(g => g.id === LINE_ID)) {
        window.state.groups.unshift({
            id: LINE_ID,
            name: lineName,
            color: "#a6001a",
            description: "Glavna linija",
            active: true,
            companyId: "demo",
            lineId: LINE_ID
        });
    }
    ["G1", "G2", "G3"].forEach((name, i) => {
        if (!window.state.groups.find(g => g.name === name)) {
            window.state.groups.push({
                id: `grp-${name.toLowerCase()}`,
                name,
                color: GROUP_COLORS[i],
                description: lineName,
                active: true,
                companyId: "demo",
                lineId: LINE_ID
            });
        }
    });
}

function ensureDrivers() {
    if (!Array.isArray(window.state.drivers)) window.state.drivers = [];
    ensureGroups();

    const all = [...REAL_DRIVERS, ...FICTIONAL_DRIVERS];
    all.forEach((d, i) => {
        const groupId = `grp-${d.group.toLowerCase()}`;
        const existing = window.state.drivers.find(x => x.name.toLowerCase() === d.name.toLowerCase());
        const entry = {
            id: existing?.id || `drv-seed-${i}`,
            name: d.name,
            pin: d.pin,
            email: "",
            phone: "",
            companyId: d.firma,
            groupId,
            lineId: LINE_ID,
            subGroup: d.group,
            active: false,
            bereitschaft: !!d.bereitschaft
        };
        if (existing) Object.assign(existing, entry);
        else window.state.drivers.push(entry);
    });

    const br = window.state.drivers.find(d => d.bereitschaft) || window.state.drivers.find(d => d.name === "Petar Popović");
    window.state.bereitschaftDriver = br?.name || null;
}

function weekdayCountInMonth(yearMonth) {
    const [y, m] = yearMonth.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const weekdays = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const dow = new Date(y, m - 1, day).getDay();
        if (dow >= 1 && dow <= 5) weekdays.push(day);
    }
    return weekdays;
}

function generateMonthlyPlans(month = DEFAULT_MONTH) {
    const catalog = window.state.shiftCatalog?.entries || {};
    const fCodes = Object.keys(catalog).filter(c => /^310\.F\d{2}$/.test(c)).sort();
    const weekdays = weekdayCountInMonth(month);
    const workDrivers = window.state.drivers.filter(d => !d.bereitschaft);
    const brDriver = window.state.bereitschaftDriver;

    workDrivers.forEach((driver, driverIdx) => {
        const parsedShifts = {};
        weekdays.forEach((day, wi) => {
            const code = fCodes[(driverIdx + wi) % fCodes.length];
            const meta = catalog[code] || {};
            parsedShifts[day] = {
                type: "morning",
                name: code,
                routeCode: code,
                start: meta.start || null,
                end: meta.end || null,
                lines: meta.lines || ""
            };
        });
        saveMonthlyPlan(driver.name, month, parsedShifts, {
            fileName: `seed-${driver.name}-${month}.json`,
            parseQuality: "seed",
            source: "blaguss-310-seed"
        });
    });

    if (brDriver) {
        applyBereitschaftForMonth(brDriver, month);
    }
}

function loadBlaguss310TestSeed() {
    persistCatalogForLine(LINE_ID, buildShiftCatalog310(), {
        version: "V66",
        updatedAt: new Date().toISOString()
    });

    ensureDrivers();
    generateMonthlyPlans(DEFAULT_MONTH);
    window.state.activeGroupFilter = LINE_ID;
    window.state.activeGroupHubId = LINE_ID;

    saveState();
    renderDriversList();
    renderGroupsList();
    renderMonthlyPlansView();
    renderDispatcherDashboard();
    renderDispatcherDataHub();
    renderDailyPlanPanel();
    openGroupHub(LINE_ID);
    initializeLoginSelects();

    const catalogCount = Object.keys(window.state.shiftCatalog.entries).length;
    const driverCount = window.state.drivers.length;
    showToast(
        `Test podaci 310: ${driverCount} vozača, ${catalogCount} smena, x2 Bereitschaft → ${window.state.bereitschaftDriver}`,
        "success",
        6000
    );
}

export {
    buildShiftCatalog310,
    loadBlaguss310TestSeed,
    REAL_DRIVERS,
    FICTIONAL_DRIVERS
};

// BusCommand — per-line shift catalog (svaka formirana grupa ima svoj šifarnik)
import { getActiveLineId } from "../data/groups.js";

const OPERATIONAL_SHIFT_TYPES = new Set(["morning", "afternoon", "night", "bereitschaft"]);

function getBereitschaftCode(lineId) {
    const line = String(lineId || getActiveLineId() || "").trim();
    return line ? `${line}.X2` : "";
}

function parseClockMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
}

/**
 * Technical type for API / grid colors only (morning|afternoon|night|bereitschaft).
 * Product assignment identity is duty code + workStart/workEnd from the plan —
 * not Prepodne/Popodne labels. S/F letters mean škola/ferije (dayType), never Früh/Spät.
 */
function inferOperationalShiftType(input = {}) {
    const code = String(input.code || "").trim();
    const existing = String(input.type || "").trim().toLowerCase();
    if (OPERATIONAL_SHIFT_TYPES.has(existing)) return existing;
    if (/\.X2$/i.test(code) || /^x2$/i.test(code)) return "bereitschaft";

    const startMin = parseClockMinutes(input.start || input.workStart);
    const endMin = parseClockMinutes(input.end || input.workEnd);
    const overnight = Number(input.endDayOffset) > 0
        || (startMin != null && endMin != null && endMin < startMin);
    if (overnight) return "night";
    if (startMin == null) return "morning";
    if (startMin < 12 * 60) return "morning";
    if (startMin < 18 * 60) return "afternoon";
    return "night";
}

function buildFallbackCatalogEntries(lineId) {
    const line = String(lineId || "").trim();
    if (!line) return {};

    const entries = {};

    entries[`${line}.X2`] = {
        code: `${line}.X2`,
        type: "bereitschaft",
        shortName: "x2",
        label: "Bereitschaft",
        start: "04:00",
        end: "22:00",
        lines: line
    };

    // Legacy empty placeholders only — NOT Blaguss S=škola / F=ferije semantics.
    // Replaced entirely when a company service plan is published (replace: true).
    for (let i = 1; i <= 25; i++) {
        const f = `${line}.F${String(i).padStart(2, "0")}`;
        entries[f] = { code: f, type: "morning", label: "Frühdienst" };
        const s = `${line}.S${String(i).padStart(2, "0")}`;
        entries[s] = { code: s, type: "afternoon", label: "Spätdienst" };
    }

    for (let i = 1; i <= 15; i++) {
        const n = `${line}.${600 + i}`;
        entries[n] = { code: n, type: "night", label: "Nachtdienst" };
    }

    return entries;
}

function ensureShiftCatalogsMap() {
    if (!window.state.shiftCatalogs || typeof window.state.shiftCatalogs !== "object") {
        window.state.shiftCatalogs = {};
    }
}

function migrateLegacyShiftCatalog() {
    ensureShiftCatalogsMap();
    const legacy = window.state.shiftCatalog;
    if (!legacy?.entries) return;

    const line = String(legacy.lineId || legacy.line || "").trim();
    if (!line) return;

    if (!window.state.shiftCatalogs[line]) {
        window.state.shiftCatalogs[line] = {
            line,
            lineId: line,
            entries: { ...legacy.entries }
        };
    }
}

function getShiftCatalogForLine(lineId) {
    migrateLegacyShiftCatalog();
    ensureShiftCatalogsMap();

    const id = String(lineId || getActiveLineId() || "").trim();
    if (!id) {
        return { line: "", lineId: "", entries: {} };
    }

    if (!window.state.shiftCatalogs[id]) {
        // Empty shell — do not invent fallback duties; active CA plan locks real codes (§7).
        window.state.shiftCatalogs[id] = {
            line: id,
            lineId: id,
            entries: {},
            locked: false
        };
    }

    return window.state.shiftCatalogs[id];
}

function activateShiftCatalogForLine(lineId) {
    const cat = getShiftCatalogForLine(lineId);
    window.state.shiftCatalog = cat;
    return cat;
}

/**
 * Prepare catalog for edit UI.
 * When locked (active CA service plan), never invent codes.
 * When unlocked and empty, optionally seed fallbacks only if explicitly allowed.
 */
function ensureShiftCatalogForEdit(lineId, opts = {}) {
    const id = String(lineId || getActiveLineId() || "").trim();
    if (!id) return null;

    const cat = getShiftCatalogForLine(id);
    if (cat.locked === true || cat.source === "company-service-plan") {
        activateShiftCatalogForLine(id);
        return cat;
    }
    const allowFallback = opts.allowFallback === true;
    if (allowFallback) {
        const fallback = buildFallbackCatalogEntries(id);
        cat.entries = { ...fallback, ...cat.entries };
    }
    cat.line = id;
    cat.lineId = id;
    activateShiftCatalogForLine(id);
    return cat;
}

function isCatalogLockedForLine(lineId) {
    const cat = getShiftCatalogForLine(lineId);
    return cat?.locked === true || cat?.source === "company-service-plan";
}

function listAssignableCatalogCodes(lineId) {
    const cat = ensureShiftCatalogForEdit(lineId);
    return Object.keys(cat?.entries || {}).sort();
}

function persistCatalogForLine(lineId, entries, meta = {}) {
    const id = String(lineId || getActiveLineId() || "").trim();
    if (!id) return null;

    ensureShiftCatalogsMap();
    const fallback = meta.replace === true ? {} : buildFallbackCatalogEntries(id);
    const merged = { ...fallback, ...(entries || {}) };

    const brCode = getBereitschaftCode(id);
    if (meta.replace !== true && brCode && !merged[brCode]) {
        merged[brCode] = {
            code: brCode,
            label: "Bereitschaft",
            shortName: "x2",
            slot: 1,
            type: "bereitschaft",
            start: "04:00",
            end: "22:00",
            lines: id,
            weekdaysOnly: true
        };
    }

    window.state.shiftCatalogs[id] = {
        line: id,
        lineId: id,
        updatedAt: meta.updatedAt || new Date().toISOString(),
        version: meta.version || undefined,
        source: meta.source || undefined,
        locked: meta.locked === true,
        entries: merged
    };

    if (getActiveLineId() === id) {
        window.state.shiftCatalog = window.state.shiftCatalogs[id];
    }

    return window.state.shiftCatalogs[id];
}

export {
    OPERATIONAL_SHIFT_TYPES,
    getBereitschaftCode,
    buildFallbackCatalogEntries,
    inferOperationalShiftType,
    migrateLegacyShiftCatalog,
    getShiftCatalogForLine,
    activateShiftCatalogForLine,
    ensureShiftCatalogForEdit,
    isCatalogLockedForLine,
    listAssignableCatalogCodes,
    persistCatalogForLine
};

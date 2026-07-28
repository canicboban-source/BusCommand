// BusCommand — per-line shift catalog (svaka formirana grupa ima svoj šifarnik)
import { getActiveLineId } from "../data/groups.js";

function getBereitschaftCode(lineId) {
    const line = String(lineId || getActiveLineId() || "").trim();
    return line ? `${line}.X2` : "";
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
        window.state.shiftCatalogs[id] = {
            line: id,
            lineId: id,
            entries: { ...buildFallbackCatalogEntries(id) }
        };
    }

    return window.state.shiftCatalogs[id];
}

function activateShiftCatalogForLine(lineId) {
    const cat = getShiftCatalogForLine(lineId);
    window.state.shiftCatalog = cat;
    return cat;
}

function ensureShiftCatalogForEdit(lineId) {
    const id = String(lineId || getActiveLineId() || "").trim();
    if (!id) return null;

    const cat = getShiftCatalogForLine(id);
    if (cat.locked === true) {
        activateShiftCatalogForLine(id);
        return cat;
    }
    const fallback = buildFallbackCatalogEntries(id);
    cat.entries = { ...fallback, ...cat.entries };
    cat.line = id;
    cat.lineId = id;
    activateShiftCatalogForLine(id);
    return cat;
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
    getBereitschaftCode,
    buildFallbackCatalogEntries,
    migrateLegacyShiftCatalog,
    getShiftCatalogForLine,
    activateShiftCatalogForLine,
    ensureShiftCatalogForEdit,
    persistCatalogForLine
};

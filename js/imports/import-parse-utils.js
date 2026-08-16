// BusCommand — shared import parse helpers (CSV / Excel monthly plan)
import { getActiveLineId } from "../data/groups.js";
import { getBereitschaftCode } from "../core/line-shift-catalog.js";

function excelValueToDateStr(value) {
    if (value == null || value === "") return null;

    if (typeof value === "number" && value > 40000) {
        const utcDays = Math.floor(value - 25569);
        const d = new Date(utcDays * 86400 * 1000);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    }

    const s = String(value).trim();
    const iso = s.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

    const eu = s.match(/(\d{1,2})\.(\d{1,2})\.(20\d{2})/);
    if (eu) {
        return `${eu[3]}-${String(eu[2]).padStart(2, "0")}-${String(eu[1]).padStart(2, "0")}`;
    }
    return null;
}

function normalizeShiftCode(raw, lineId) {
    const line = String(lineId || getActiveLineId() || "").trim();
    const text = String(raw || "").trim();
    if (!text) return null;

    const upper = text.toUpperCase();
    if (/SLOBODNO|FREI|^OFF$|ABWESEN/.test(upper)) {
        return { type: "off", name: "SLOBODNO", routeCode: null, lines: "" };
    }
    if (/URLAUB|ODMOR/.test(upper)) {
        return { type: "vacation", name: "Urlaub", routeCode: null, lines: "" };
    }
    if (/KRANK|BOLOVANJE|SICK/.test(upper)) {
        return { type: "sick", name: "Krank", routeCode: null, lines: "" };
    }
    // Bare "Dienst" (no route code) — operational day without assigned line code.
    if (/^DIENST$/.test(upper) || /^DIENST\s*$/.test(upper)) {
        return { type: "morning", name: "Dienst", routeCode: null, lines: "" };
    }

    const brCode = line ? getBereitschaftCode(line) : "";
    const brPattern = brCode
        ? new RegExp(`^X2$|BEREITSCHAFT|${brCode.replace(".", "\\.")}`, "i")
        : /^X2$|BEREITSCHAFT/i;

    if (brPattern.test(upper) || /\bx2\b/i.test(text)) {
        if (!line) return null;
        return {
            type: "bereitschaft",
            name: brCode,
            routeCode: brCode,
            lines: line,
            slot: 1,
            shortName: "x2"
        };
    }

    let code = null;
    if (line) {
        const lineEsc = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const full = text.match(new RegExp(`\\b(${lineEsc}\\.(?:F|S|X)\\d{2}|${lineEsc}\\.\\d{3})\\b`, "i"));
        if (full) {
            code = full[1].toUpperCase();
        } else {
            const shortFX = text.match(/\b([FSX]\d{2})\b/i);
            if (shortFX) code = `${line}.${shortFX[1].toUpperCase()}`;
            const shortNum = text.match(/^(\d{3})\//);
            if (!code && shortNum) code = `${line}.${shortNum[1]}`;
        }
    } else {
        const anyFull = text.match(/\b(\d{3}\.(?:[FSX]\d{2}|\d{3}))\b/i);
        if (anyFull) code = anyFull[1].toUpperCase();
    }

    if (!code) return null;

    const linesMatch = text.match(/\/([\d,\s]+)/);
    const lines = linesMatch ? linesMatch[1].replace(/\s/g, "") : "";

    return {
        type: inferShiftTypeFromCode(code),
        name: lines ? `${code} (${lines})` : code,
        routeCode: code,
        lines
    };
}

function inferShiftTypeFromCode(code, startTime) {
    if (/\.6\d{2}$/.test(code)) return "morning";
    if (/\.7\d{2}$/.test(code)) return "afternoon";
    if (startTime) {
        const hour = parseInt(String(startTime).split(":")[0], 10);
        if (!Number.isNaN(hour)) {
            if (hour < 11) return "morning";
            if (hour < 17) return "afternoon";
            return "night";
        }
    }
    if (/\.F/.test(code) || /\.S/.test(code)) return "morning";
    if (/\.X2$/i.test(code)) return "bereitschaft";
    return "morning";
}

function enrichShiftFromRow(base, row) {
    const start = String(row.start || "").trim();
    const end = String(row.end || "").trim();
    const lines = String(row.lines || base.lines || "").trim();
    const type = start ? inferShiftTypeFromCode(base.routeCode || base.name, start) : base.type;

    return {
        type: base.type === "off" ? "off" : type,
        name: base.name,
        routeCode: base.routeCode,
        lines,
        start: start || null,
        end: end || null,
        dayType: row.dayType || null,
        status: row.status || null
    };
}

function findSheetName(sheetNames, candidates) {
    for (const c of candidates) {
        const hit = sheetNames.find(n => n.toLowerCase().includes(c.toLowerCase()));
        if (hit) return hit;
    }
    return null;
}

function sheetToRows(sheet) {
    if (typeof XLSX === "undefined") throw new Error("XLSX biblioteka nije učitana.");
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}

/**
 * Folds Serbian/German diacritics so "Jovanovic" matches "Jovanović" and
 * "Djordjevic" matches "Đorđević" during CSV driver matching and header
 * alias resolution. Case- and whitespace-insensitive by contract.
 */
function foldDiacritics(value) {
    return String(value || "")
        .replace(/đ/g, "dj").replace(/Đ/g, "Dj")
        .replace(/č|ć/g, "c").replace(/Č|Ć/g, "C")
        .replace(/š/g, "s").replace(/Š/g, "S")
        .replace(/ž/g, "z").replace(/Ž/g, "Z")
        .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u")
        .replace(/ß/g, "ss");
}

export {
    excelValueToDateStr,
    foldDiacritics,
    normalizeShiftCode,
    inferShiftTypeFromCode,
    enrichShiftFromRow,
    findSheetName,
    sheetToRows
};

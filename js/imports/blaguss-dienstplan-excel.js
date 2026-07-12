// BusCommand — Blaguss Excel Dienstplan parser (Detaljno + Baza smena)
import {
    excelValueToDateStr,
    enrichShiftFromRow,
    findSheetName,
    normalizeShiftCode,
    sheetToRows
} from "./blaguss-parse-utils.js";

function colIndex(headers, needles) {
    return headers.findIndex(h => needles.some(n => h.includes(n)));
}

function parseDetaljnoSheet(rows, lineId) {
    const headerIdx = rows.findIndex(r => {
        const line = r.map(c => String(c).toLowerCase()).join("|");
        return line.includes("vozač") || line.includes("vozac")
            ? line.includes("smena") || line.includes("dienst")
            : false;
    });

    if (headerIdx < 0) return null;

    const headers = rows[headerIdx].map(h => String(h).trim().toLowerCase());
    const iDatum = colIndex(headers, ["datum"]);
    const iDan = colIndex(headers, ["dan"]);
    const iVozac = colIndex(headers, ["vozač", "vozac", "fahrer"]);
    const iGrupa = colIndex(headers, ["grupa", "group"]);
    const iTip = colIndex(headers, ["tip dana", "tip"]);
    const iSmena = colIndex(headers, ["smena", "dienst"]);
    const iStatus = colIndex(headers, ["status"]);
    const iStart = colIndex(headers, ["početak", "pocetak", "start"]);
    const iEnd = colIndex(headers, ["kraj", "end"]);
    const iLinije = colIndex(headers, ["linije", "linie", "lines"]);

    const byDriver = {};
    let month = null;
    let rowCount = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const driverName = String(r[iVozac] ?? "").trim();
        if (!driverName) continue;

        const dateStr = excelValueToDateStr(r[iDatum]);
        if (!dateStr) continue;

        if (!month) month = dateStr.slice(0, 7);
        const day = parseInt(dateStr.slice(8), 10);
        if (day < 1 || day > 31) continue;

        const shiftRaw = String(r[iSmena] ?? "").trim();
        const status = String(r[iStatus] ?? "").trim();
        let base = normalizeShiftCode(shiftRaw, lineId);

        if (!base && status.toUpperCase() === "RAD" && shiftRaw) {
            base = { type: "morning", name: shiftRaw, routeCode: shiftRaw, lines: "" };
        }
        if (!base) {
            base = { type: "off", name: "SLOBODNO", routeCode: null, lines: "" };
        }

        const shift = enrichShiftFromRow(base, {
            start: r[iStart],
            end: r[iEnd],
            lines: r[iLinije],
            dayType: r[iTip],
            status
        });

        if (!byDriver[driverName]) byDriver[driverName] = { groupName: String(r[iGrupa] ?? "").trim(), parsedShifts: {} };
        if (r[iGrupa]) byDriver[driverName].groupName = String(r[iGrupa]).trim();
        byDriver[driverName].parsedShifts[day] = shift;
        rowCount++;
    }

    return { month, byDriver, rowCount };
}

function parseBazaSmenaSheet(rows, lineId) {
    const line = String(lineId || "").trim();
    const linePrefix = line ? new RegExp(`^${line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`, "i") : null;
    const headerIdx = rows.findIndex(r => {
        const line = r.map(c => String(c).toLowerCase()).join("|");
        return line.includes("smena") && line.includes("početak");
    });
    if (headerIdx < 0) return {};

    const headers = rows[headerIdx].map(h => String(h).trim().toLowerCase());
    const iCode = colIndex(headers, ["smena", "dienst"]);
    const iTip = colIndex(headers, ["tip"]);
    const iStart = colIndex(headers, ["početak", "pocetak"]);
    const iEnd = colIndex(headers, ["kraj"]);
    const iLinije = colIndex(headers, ["linije", "linie"]);

    const catalog = {};
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i];
        const code = String(r[iCode] ?? "").trim();
        if (!code) continue;
        if (linePrefix && !linePrefix.test(code)) continue;

        catalog[code.toUpperCase()] = {
            code: code.toUpperCase(),
            label: String(r[iTip] ?? "").trim(),
            start: String(r[iStart] ?? "").trim() || null,
            end: String(r[iEnd] ?? "").trim() || null,
            lines: String(r[iLinije] ?? "").trim() || null
        };
    }
    return catalog;
}

function parseBlagussDienstplanWorkbook(workbook, lineId) {
    const sheetNames = workbook.SheetNames || [];
    const detaljnoName = findSheetName(sheetNames, ["detaljno", "detail"]);
    const bazaName = findSheetName(sheetNames, ["baza smena", "baza", "pdf"]);

    const result = {
        format: "blaguss-excel",
        month: null,
        byDriver: {},
        shiftCatalog: {},
        rowCount: 0,
        errors: [],
        sheets: sheetNames
    };

    if (detaljnoName) {
        const rows = sheetToRows(workbook.Sheets[detaljnoName]);
        const parsed = parseDetaljnoSheet(rows, lineId);
        if (parsed) {
            result.month = parsed.month;
            result.byDriver = parsed.byDriver;
            result.rowCount = parsed.rowCount;
        } else {
            result.errors.push("Sheet Detaljno — header nije prepoznat.");
        }
    } else {
        result.errors.push("Nedostaje sheet 'Detaljno'.");
    }

    if (bazaName) {
        const rows = sheetToRows(workbook.Sheets[bazaName]);
        result.shiftCatalog = parseBazaSmenaSheet(rows, lineId);
    }

    return result;
}

async function readExcelWorkbook(file) {
    const arrayBuffer = await file.arrayBuffer();
    return XLSX.read(arrayBuffer, { type: "array" });
}

export {
    parseBlagussDienstplanWorkbook,
    readExcelWorkbook,
    parseDetaljnoSheet,
    parseBazaSmenaSheet
};

// BusCommand — Monthly plan Excel parser (Detaljno + Baza smena)
import {
    excelValueToDateStr,
    enrichShiftFromRow,
    findSheetName,
    normalizeShiftCode,
    sheetToRows
} from "./import-parse-utils.js";

function foldImportText(value) {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function colIndex(headers, needles) {
    const foldedNeedles = needles.map(foldImportText);
    return headers.findIndex((h) => {
        const folded = foldImportText(h);
        return foldedNeedles.some((n) => folded.includes(n));
    });
}

function parseDetaljnoSheet(rows, lineId) {
    const headerIdx = rows.findIndex((r) => {
        const line = foldImportText(r.map((c) => String(c)).join("|"));
        return (line.includes("vozac") || line.includes("fahrer"))
            && (line.includes("smena") || line.includes("dienst"));
    });

    if (headerIdx < 0) return null;

    const headers = rows[headerIdx].map((h) => foldImportText(h));
    const iDatum = colIndex(headers, ["datum"]);
    const iVozac = colIndex(headers, ["vozac", "fahrer"]);
    const iGrupa = colIndex(headers, ["grupa", "group"]);
    const iTip = colIndex(headers, ["tip dana", "tip"]);
    const iSmena = colIndex(headers, ["smena", "dienst"]);
    const iBus = colIndex(headers, ["bus", "autobus"]);
    const iStatus = colIndex(headers, ["status"]);
    const iStart = colIndex(headers, ["pocetak", "start"]);
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
        if (iBus >= 0) {
            shift.bus = String(r[iBus] || "").trim() || null;
        }

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
    const headerIdx = rows.findIndex((r) => {
        const lineText = foldImportText(r.map((c) => String(c)).join("|"));
        return lineText.includes("smena") && lineText.includes("pocetak");
    });
    if (headerIdx < 0) return {};

    const headers = rows[headerIdx].map((h) => foldImportText(h));
    const iCode = colIndex(headers, ["smena", "dienst"]);
    const iTip = colIndex(headers, ["tip"]);
    const iStart = colIndex(headers, ["pocetak"]);
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

function inferTypeFromDayPart(value, fallback) {
    const part = String(value || "").trim().toLowerCase();
    if (/popodne|afternoon|nachmittag|spät/.test(part)) return "afternoon";
    if (/noć|noc|night|nacht/.test(part)) return "night";
    if (/pre podne|morning|vormittag|früh|subota|samstag|nedelja|sonntag|praznik|feiertag/.test(part)) return "morning";
    return fallback;
}

function parseDienstplanSheet(rows, lineId) {
    const headerIdx = rows.findIndex((row) => {
        const headers = row.map((cell) => String(cell).trim().toLowerCase());
        return headers.some((cell) => cell === "tag" || cell === "datum")
            && headers.some((cell) => cell.includes("linie/dienst") || cell === "dienst" || cell === "smena");
    });
    if (headerIdx < 0) return null;

    const headers = rows[headerIdx].map((cell) => String(cell).trim().toLowerCase());
    const iDate = colIndex(headers, ["tag", "datum"]);
    const iBus = colIndex(headers, ["bus", "autobus"]);
    const iShift = colIndex(headers, ["linie/dienst", "dienst", "smena"]);
    const iDayPart = colIndex(headers, ["deo dana", "day part", "tageszeit"]);
    if (iDate < 0 || iShift < 0) return null;

    const titleRow = rows.find((row) => row.some((cell) => /dienstplan\s+f(?:ü|u)r\s*:/i.test(String(cell))));
    const titleIndex = titleRow?.findIndex((cell) => /dienstplan\s+f(?:ü|u)r\s*:/i.test(String(cell))) ?? -1;
    let driverName = "";
    if (titleIndex >= 0) {
        const titleCell = String(titleRow[titleIndex] || "");
        const inline = titleCell.match(/dienstplan\s+f(?:ü|u)r\s*:\s*(.+)$/i);
        driverName = String(inline?.[1] || titleRow[titleIndex + 1] || "").trim();
    }
    if (!driverName) return null;

    const parsedShifts = {};
    let month = null;
    let rowCount = 0;
    for (let i = headerIdx + 1; i < rows.length; i += 1) {
        const row = rows[i];
        const dateStr = excelValueToDateStr(row[iDate]);
        if (!dateStr) continue;
        const base = normalizeShiftCode(row[iShift], lineId);
        if (!base) continue;
        month ||= dateStr.slice(0, 7);
        if (dateStr.slice(0, 7) !== month) continue;
        const day = Number(dateStr.slice(8));
        parsedShifts[day] = {
            ...base,
            type: inferTypeFromDayPart(row[iDayPart], base.type),
            bus: iBus >= 0 ? String(row[iBus] || "").trim() || null : null
        };
        rowCount += 1;
    }
    return month && rowCount
        ? { month, byDriver: { [driverName]: { groupName: "", parsedShifts } }, rowCount }
        : null;
}

function parseMonthlyPlanWorkbook(workbook, lineId) {
    const sheetNames = workbook.SheetNames || [];
    const detaljnoName = findSheetName(sheetNames, ["detaljno", "detail"]);
    const bazaName = findSheetName(sheetNames, ["baza smena", "baza", "pdf"]);

    const result = {
        format: "monthly-excel",
        month: null,
        byDriver: {},
        shiftCatalog: {},
        rowCount: 0,
        errors: [],
        sheets: sheetNames
    };

    // Prefer named Detaljno, then scan every sheet for Detaljno OR single-driver Dienstplan layout.
    const preferredDetaljno = detaljnoName
        ? [detaljnoName, ...sheetNames.filter((name) => name !== detaljnoName)]
        : sheetNames;
    let detaljnoParsed = null;
    for (const sheetName of preferredDetaljno) {
        detaljnoParsed = parseDetaljnoSheet(sheetToRows(workbook.Sheets[sheetName]), lineId);
        if (detaljnoParsed?.rowCount) {
            result.format = detaljnoName && sheetName === detaljnoName
                ? "monthly-excel"
                : "monthly-excel-detaljno-scan";
            result.month = detaljnoParsed.month;
            result.byDriver = detaljnoParsed.byDriver;
            result.rowCount = detaljnoParsed.rowCount;
            break;
        }
        detaljnoParsed = null;
    }

    if (!detaljnoParsed) {
        const preferredDienst = findSheetName(sheetNames, ["dienstplan"]);
        const ordered = preferredDienst
            ? [preferredDienst, ...sheetNames.filter((name) => name !== preferredDienst)]
            : sheetNames;
        let parsed = null;
        for (const sheetName of ordered) {
            parsed = parseDienstplanSheet(sheetToRows(workbook.Sheets[sheetName]), lineId);
            if (parsed?.rowCount) break;
            parsed = null;
        }
        if (parsed) {
            result.format = "driver-dienstplan-excel";
            result.month = parsed.month;
            result.byDriver = parsed.byDriver;
            result.rowCount = parsed.rowCount;
        } else {
            result.errors.push("Fajl nije BusCommand 'Detaljno' niti pojedinačni Dienstplan sa kolonama Tag i Linie/Dienst.");
        }
    }

    if (bazaName) {
        const rows = sheetToRows(workbook.Sheets[bazaName]);
        result.shiftCatalog = parseBazaSmenaSheet(rows, lineId);
    }

    return result;
}

async function readExcelWorkbook(file) {
    const { ensureXlsx } = await import("../core/office-parsers.js");
    const XLSX = await ensureXlsx();
    const arrayBuffer = await file.arrayBuffer();
    return XLSX.read(arrayBuffer, { type: "array" });
}

export {
    parseMonthlyPlanWorkbook,
    readExcelWorkbook,
    parseDetaljnoSheet,
    parseBazaSmenaSheet,
    parseDienstplanSheet
};

import { excelValueToDateStr, foldDiacritics, normalizeShiftCode } from "./import-parse-utils.js";

/** Header key: lowercase + diacritics folded + spaces/dashes collapsed to "_",
 *  so "Ime i prezime", "ime_prezime", "Ime Prezime" and "Ime-Prezime" all resolve. */
function normalizeHeaderKey(value) {
    return foldDiacritics(String(value || "").trim().toLowerCase()).replace(/[\s\-.]+/g, "_");
}

function column(headers, aliases) {
    const foldedAliases = aliases.map((alias) => normalizeHeaderKey(alias));
    return headers.findIndex((header) => foldedAliases.includes(normalizeHeaderKey(header)));
}

function isMonthlyPlanCsv(text) {
    const header = foldDiacritics(String(text || "").split(/\r?\n/, 1)[0].toLowerCase()).replace(/[\s\-.]+/g, "_");
    return /(datum|date)/.test(header) && /(dienst|smena|shift)/.test(header) && /(ime_prezime|ime_i_prezime|vozac|driver|name)/.test(header);
}

function detectDelimiter(line) {
    return [";", ",", "\t"].sort((left, right) => line.split(right).length - line.split(left).length)[0];
}

function parseRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (char === '"') {
            if (quoted && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else quoted = !quoted;
        } else if (!quoted && char === delimiter) {
            row.push(field);
            field = "";
        } else if (!quoted && (char === "\n" || char === "\r")) {
            if (char === "\r" && text[index + 1] === "\n") index += 1;
            row.push(field);
            field = "";
            if (row.some((cell) => String(cell).trim())) rows.push(row);
            row = [];
        } else field += char;
    }
    if (quoted) throw new Error("CSV sadrži nezatvorenu vrednost pod navodnicima.");
    row.push(field);
    if (row.some((cell) => String(cell).trim())) rows.push(row);
    return rows;
}

function parseMonthlyPlanCsv(text, lineId) {
    if (!isMonthlyPlanCsv(text)) throw new Error("CSV nije mesečni plan u long formatu.");
    const rows = parseRows(text, detectDelimiter(text.split(/\r?\n/, 1)[0]));
    const headers = rows[0].map((value) => String(value).trim().toLowerCase());
    const indexes = {
        date: column(headers, ["datum", "date"]),
        line: column(headers, ["linija", "line"]),
        shift: column(headers, ["dienst", "smena", "shift", "shift_code"]),
        bus: column(headers, ["bus", "autobus"]),
        driver: column(headers, ["ime_prezime", "ime i prezime", "vozac", "vozač", "driver", "driver name", "driver_name", "name", "ime"]),
        dayPart: column(headers, ["deo_dana", "deo dana", "day_part"])
    };
    if (indexes.date < 0 || indexes.shift < 0 || indexes.driver < 0) {
        throw new Error("Plan CSV mora imati kolone datum, dienst/smena i ime_prezime/vozač.");
    }

    const byDriver = {};
    let month = null;
    let rowCount = 0;
    rows.slice(1).forEach((row, index) => {
        const date = excelValueToDateStr(row[indexes.date]);
        const driverName = String(row[indexes.driver] || "").trim().replace(/\s+/g, " ");
        const rowLine = indexes.line >= 0 ? String(row[indexes.line] || "").trim() : "";
        if (!date || !driverName) throw new Error(`Red ${index + 2}: datum i vozač su obavezni.`);
        if (lineId && rowLine && String(lineId) !== rowLine) {
            throw new Error(`Red ${index + 2}: linija ${rowLine} ne odgovara izabranoj grupi ${lineId}.`);
        }
        const shift = normalizeShiftCode(row[indexes.shift], lineId || rowLine);
        if (!shift) throw new Error(`Red ${index + 2}: smena nije prepoznata.`);
        month ||= date.slice(0, 7);
        if (date.slice(0, 7) !== month) throw new Error("Jedan plan CSV može sadržati samo jedan mesec.");
        const part = String(row[indexes.dayPart] || "").toLowerCase();
        if (/popodne|afternoon|nachmittag/.test(part)) shift.type = "afternoon";
        if (/noć|noc|night|nacht/.test(part)) shift.type = "night";
        shift.bus = indexes.bus >= 0 ? String(row[indexes.bus] || "").trim() || null : null;
        const day = Number(date.slice(8));
        byDriver[driverName] ||= { groupName: "", parsedShifts: {} };
        if (byDriver[driverName].parsedShifts[day]) {
            throw new Error(`Red ${index + 2}: vozač ${driverName} već ima smenu ${date}.`);
        }
        byDriver[driverName].parsedShifts[day] = shift;
        rowCount += 1;
    });
    return { format: "monthly-plan-csv", month, byDriver, shiftCatalog: {}, rowCount, errors: [], sheets: [] };
}

export { isMonthlyPlanCsv, parseMonthlyPlanCsv };

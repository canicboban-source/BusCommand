const REQUIRED_HEADERS = Object.freeze(["eid", "date", "duty_code"]);
const MAX_ROWS = 2500;
const ABSENCE_CODES = new Set(["OFF", "VACATION", "SICK"]);

function normalizeHeader(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function detectDelimiter(line) {
    return [",", ";", "\t"]
        .map(delimiter => ({ delimiter, fields: String(line || "").split(delimiter).length }))
        .sort((left, right) => right.fields - left.fields)[0].delimiter;
}

function parseCsvRows(text, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    const source = String(text || "").replace(/^\uFEFF/, "");

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (char === "\"") {
            if (quoted && source[index + 1] === "\"") {
                field += "\"";
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (!quoted && char === delimiter) {
            row.push(field);
            field = "";
        } else if (!quoted && (char === "\n" || char === "\r")) {
            if (char === "\r" && source[index + 1] === "\n") index += 1;
            row.push(field);
            if (row.some(cell => String(cell).trim())) rows.push(row);
            row = [];
            field = "";
        } else {
            field += char;
        }
    }

    if (quoted) throw new Error("monthly_import_unclosed_quote");
    row.push(field);
    if (row.some(cell => String(cell).trim())) rows.push(row);
    return rows;
}

function normalizeDate(value) {
    const raw = String(value || "").trim();
    let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (match) return raw;
    match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/.exec(raw);
    if (!match) return "";
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

function parseGroupMonthlyRows(inputRows, { month = "" } = {}) {
    if (!Array.isArray(inputRows) || !inputRows.length) {
        throw new Error("monthly_import_empty");
    }
    const headers = inputRows[0].map(normalizeHeader);
    const indexes = Object.fromEntries(REQUIRED_HEADERS.map(header => [header, headers.indexOf(header)]));
    const missing = REQUIRED_HEADERS.filter(header => indexes[header] < 0);
    if (missing.length) {
        const error = new Error("monthly_import_missing_columns");
        error.params = { columns: missing.join(", ") };
        throw error;
    }

    const parsed = [];
    const seen = new Set();
    for (let index = 1; index < inputRows.length; index += 1) {
        const row = inputRows[index];
        if (!row?.some(cell => String(cell).trim())) continue;
        const eid = String(row[indexes.eid] || "").trim();
        const date = normalizeDate(row[indexes.date]);
        const dutyCode = String(row[indexes.duty_code] || "").trim().toUpperCase();
        const sourceRow = index + 1;
        if (!eid || !date || !dutyCode) {
            const error = new Error("monthly_import_required_value");
            error.params = { row: sourceRow };
            throw error;
        }
        if (month && !date.startsWith(`${month}-`)) {
            const error = new Error("monthly_import_wrong_month");
            error.params = { row: sourceRow, month };
            throw error;
        }
        if (!ABSENCE_CODES.has(dutyCode) && !/^[A-Z0-9_-]{1,24}\.[A-Z0-9_-]{1,24}$/i.test(dutyCode)) {
            const error = new Error("monthly_import_invalid_duty");
            error.params = { row: sourceRow, duty: dutyCode };
            throw error;
        }
        const key = `${eid.toLocaleLowerCase()}|${date}`;
        if (seen.has(key)) {
            const error = new Error("monthly_import_duplicate");
            error.params = { row: sourceRow, date };
            throw error;
        }
        seen.add(key);
        parsed.push({ eid, date, dutyCode, sourceRow });
        if (parsed.length > MAX_ROWS) throw new Error("monthly_import_too_many_rows");
    }
    if (!parsed.length) throw new Error("monthly_import_no_assignments");
    return parsed;
}

function parseGroupMonthlyCsv(text, options = {}) {
    const firstLine = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
    return parseGroupMonthlyRows(parseCsvRows(text, detectDelimiter(firstLine)), options);
}

async function readGroupMonthlyPlanFile(file, options = {}) {
    const name = String(file?.name || "").toLowerCase();
    if (name.endsWith(".csv")) return parseGroupMonthlyCsv(await file.text(), options);
    if (!name.endsWith(".xlsx")) throw new Error("monthly_import_file_type");
    if (typeof XLSX === "undefined") throw new Error("ca_plan_err_xlsx_missing");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames.find(item => normalizeHeader(item) === "monthly_plan");
    if (!sheetName) throw new Error("monthly_import_missing_sheet");
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false });
    return parseGroupMonthlyRows(rows, options);
}

export {
    ABSENCE_CODES,
    MAX_ROWS,
    parseGroupMonthlyCsv,
    parseGroupMonthlyRows,
    readGroupMonthlyPlanFile
};

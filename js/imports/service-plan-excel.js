import { TEMPLATE_VERSION } from "../../shared/service-plan-contract.mjs";
import { parseServicePlanCsvFile } from "./service-plan-csv.js";
import { parseServicePlanPdfFile } from "./service-plan-pdf.js";
import {
    ACTIVITY_HEADERS,
    DUTY_HEADERS,
    MAX_FILE_BYTES,
    clean,
    extensionOf,
    validateBuiltPlan,
    validateServicePlanFile
} from "./service-plan-shared.js";

const REQUIRED_SHEETS = Object.freeze(["PLAN", "SMENE", "AKTIVNOSTI"]);

function rowsFor(workbook, sheetName) {
    const sheet = workbook?.Sheets?.[sheetName];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

function objectRows(rows, requiredHeaders, sheetName, errors) {
    if (!rows.length) {
        errors.push({ path: sheetName, code: "empty_sheet", message: `Sheet ${sheetName} je prazan.` });
        return [];
    }
    const headers = rows[0].map(value => clean(value).toLowerCase());
    requiredHeaders.forEach(header => {
        if (!headers.includes(header)) {
            errors.push({ path: `${sheetName}.${header}`, code: "missing_column", message: `Nedostaje kolona ${header}.` });
        }
    });
    if (errors.some(error => error.path.startsWith(`${sheetName}.`))) return [];

    return rows.slice(1)
        .filter(row => row.some(value => clean(value)))
        .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parsePlanMetadata(rows, errors) {
    const pairs = new Map();
    rows.slice(1).forEach(row => {
        const key = clean(row[0]).toLowerCase();
        if (key) pairs.set(key, clean(row[1]));
    });
    for (const key of ["template_version", "plan_code", "plan_version", "valid_from", "timezone"]) {
        if (!pairs.get(key)) errors.push({ path: `PLAN.${key}`, code: "missing_value", message: `Nedostaje vrednost ${key}.` });
    }
    return {
        templateVersion: pairs.get("template_version") || "",
        planCode: pairs.get("plan_code") || "",
        planVersion: pairs.get("plan_version") || "",
        validFrom: pairs.get("valid_from") || "",
        timezone: pairs.get("timezone") || ""
    };
}

function parseServicePlanWorkbook(workbook) {
    const errors = [];
    const names = workbook?.SheetNames || [];
    REQUIRED_SHEETS.forEach(name => {
        if (!names.includes(name)) errors.push({ path: name, code: "missing_sheet", message: `Nedostaje obavezni sheet ${name}.` });
    });
    if (errors.length) return { valid: false, errors, plan: null, summary: null };

    const metadata = parsePlanMetadata(rowsFor(workbook, "PLAN"), errors);
    const dutyRows = objectRows(rowsFor(workbook, "SMENE"), DUTY_HEADERS, "SMENE", errors);
    const activityRows = objectRows(rowsFor(workbook, "AKTIVNOSTI"), ACTIVITY_HEADERS, "AKTIVNOSTI", errors);
    if (errors.length) return { valid: false, errors, plan: null, summary: null };

    return validateBuiltPlan({ metadata, dutyRows, activityRows });
}

async function parseServicePlanXlsxFile(file) {
    if (typeof XLSX === "undefined") throw new Error("ca_plan_err_xlsx_missing");
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
    return parseServicePlanWorkbook(workbook);
}

async function readServicePlanFile(file) {
    const fileError = validateServicePlanFile(file);
    if (fileError) throw new Error(fileError);
    const ext = extensionOf(file.name);
    if (ext === ".xlsx") return parseServicePlanXlsxFile(file);
    if (ext === ".csv") return parseServicePlanCsvFile(file);
    if (ext === ".pdf") return parseServicePlanPdfFile(file);
    throw new Error("ca_plan_err_file_type");
}

export {
    ACTIVITY_HEADERS,
    DUTY_HEADERS,
    MAX_FILE_BYTES,
    REQUIRED_SHEETS,
    TEMPLATE_VERSION,
    parseServicePlanWorkbook,
    readServicePlanFile,
    validateServicePlanFile
};

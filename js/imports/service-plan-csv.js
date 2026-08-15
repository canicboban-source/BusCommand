import {
    ACTIVITY_HEADERS,
    DUTY_HEADERS,
    clean,
    validateBuiltPlan
} from "./service-plan-shared.js";

function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === "\"") {
                if (line[i + 1] === "\"") {
                    current += "\"";
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
            continue;
        }
        if (ch === "\"") {
            inQuotes = true;
            continue;
        }
        if (ch === ",") {
            cells.push(current);
            current = "";
            continue;
        }
        current += ch;
    }
    cells.push(current);
    return cells;
}

function parseCsvText(text) {
    const lines = String(text || "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map(line => line.trimEnd())
        .filter(line => line.length > 0);
    if (!lines.length) {
        return { valid: false, errors: [{ path: "CSV", code: "empty_sheet", message: "CSV fajl je prazan." }], plan: null, summary: null };
    }

    const headers = parseCsvLine(lines[0]).map(value => clean(value).toLowerCase());
    if (!headers.includes("section")) {
        return {
            valid: false,
            errors: [{ path: "CSV.section", code: "missing_column", message: "Nedostaje kolona section." }],
            plan: null,
            summary: null
        };
    }

    const rows = lines.slice(1).map(line => {
        const cells = parseCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    });

    const metadata = {};
    const dutyRows = [];
    const activityRows = [];
    const errors = [];

    rows.forEach((row, index) => {
        const section = clean(row.section).toUpperCase();
        if (section === "PLAN") {
            const key = clean(row.key).toLowerCase();
            if (!key) {
                errors.push({ path: `CSV.PLAN[${index}]`, code: "missing_value", message: "PLAN red mora imati key." });
                return;
            }
            metadata[key] = clean(row.value);
            return;
        }
        if (section === "SMENE") {
            dutyRows.push(row);
            return;
        }
        if (section === "AKTIVNOSTI") {
            activityRows.push(row);
            return;
        }
        if (section) {
            errors.push({ path: `CSV.section[${index}]`, code: "unknown_section", message: `Nepoznata sekcija ${section}.` });
        }
    });

    for (const key of ["template_version", "plan_code", "plan_version", "valid_from", "timezone"]) {
        if (!clean(metadata[key])) {
            errors.push({ path: `PLAN.${key}`, code: "missing_value", message: `Nedostaje vrednost ${key}.` });
        }
    }
    DUTY_HEADERS.forEach(header => {
        if (dutyRows.length && dutyRows.some(row => !(header in row))) {
            errors.push({ path: `SMENE.${header}`, code: "missing_column", message: `Nedostaje kolona ${header}.` });
        }
    });
    ACTIVITY_HEADERS.forEach(header => {
        if (activityRows.length && activityRows.some(row => !(header in row))) {
            errors.push({ path: `AKTIVNOSTI.${header}`, code: "missing_column", message: `Nedostaje kolona ${header}.` });
        }
    });
    if (errors.length) return { valid: false, errors, plan: null, summary: null };

    return validateBuiltPlan({
        metadata: {
            templateVersion: metadata.template_version,
            planCode: metadata.plan_code,
            planVersion: metadata.plan_version,
            validFrom: metadata.valid_from,
            timezone: metadata.timezone
        },
        dutyRows,
        activityRows
    });
}

async function parseServicePlanCsvFile(file) {
    const text = await file.text();
    return parseCsvText(text);
}

export {
    parseCsvText,
    parseServicePlanCsvFile
};

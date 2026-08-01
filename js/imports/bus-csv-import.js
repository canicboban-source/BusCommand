// BusCommand — dispatcher bus CSV/TXT import helpers

const MAX_BUS_IMPORT_BYTES = 256 * 1024;
const MAX_BUS_IMPORT_ROWS = 500;
const BUS_NUMBER_RE = /^[\p{L}\p{N} ._/-]{1,32}$/u;
const HEADER_NAMES = new Set([
    "bus", "bus_number", "bus number", "number", "vehicle", "vehicle_number",
    "autobus", "broj autobusa", "vozilo", "fahrzeug", "fahrzeugnummer"
]);

function extensionOf(fileName) {
    const name = String(fileName || "").toLowerCase();
    const dot = name.lastIndexOf(".");
    return dot >= 0 ? name.slice(dot) : "";
}

function validateBusImportFile(file) {
    if (!file || file.size < 1 || file.size > MAX_BUS_IMPORT_BYTES) return false;
    return [".csv", ".txt"].includes(extensionOf(file.name));
}

function firstDelimitedCell(line) {
    const source = String(line || "").trim();
    if (!source) return "";
    if (!source.startsWith('"')) return source.split(/[;,\t]/, 1)[0].trim();

    let value = "";
    for (let i = 1; i < source.length; i += 1) {
        if (source[i] !== '"') {
            value += source[i];
            continue;
        }
        if (source[i + 1] === '"') {
            value += '"';
            i += 1;
            continue;
        }
        break;
    }
    return value.trim();
}

function normalizeBusNumber(value) {
    return String(value || "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function parseBusImportText(text) {
    const lines = String(text || "").split(/\r?\n/).filter(line => line.trim());
    const numbers = [];
    const errors = [];
    const seen = new Set();

    if (lines.length > MAX_BUS_IMPORT_ROWS + 1) {
        return { numbers, errors: [{ line: 0, code: "too_many_rows" }] };
    }

    lines.forEach((line, index) => {
        const number = normalizeBusNumber(firstDelimitedCell(line));
        if (!number) return;
        if (index === 0 && HEADER_NAMES.has(number.toLowerCase())) return;
        if (!BUS_NUMBER_RE.test(number)) {
            errors.push({ line: index + 1, code: "invalid_number", value: number });
            return;
        }
        const key = number.toLocaleLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        numbers.push(number);
    });

    if (!numbers.length && !errors.length) errors.push({ line: 0, code: "empty" });
    return { numbers, errors };
}

export {
    MAX_BUS_IMPORT_BYTES,
    MAX_BUS_IMPORT_ROWS,
    normalizeBusNumber,
    parseBusImportText,
    validateBusImportFile
};

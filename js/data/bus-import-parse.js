/**
 * Dispatcher bus import — curated formats (TXT / CSV / paste / XLSX rows).
 * Pure helpers for unit tests; no DOM.
 */

const BUS_NUMBER_RE = /^[\p{L}\p{N} ._/-]+$/u;
const HEADER_ALIASES = new Set([
  "number", "bus", "autobus", "fahrzeug", "wagen", "wagennr", "wagennummer",
  "busnummer", "bus_number", "busno", "bus_no", "nr", "broj"
]);

const MAX_IMPORT_ROWS = 500;

function normalizeBusNumber(raw) {
  const value = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!value) return null;
  if (value.length > 32) return null;
  if (!BUS_NUMBER_RE.test(value)) return null;
  return value;
}

function detectDelimiter(line) {
  const commas = (line.match(/,/g) || []).length;
  const semis = (line.match(/;/g) || []).length;
  // Mixed separators on one line → treat as a flat paste list, not CSV
  if (commas > 0 && semis > 0) return null;
  if (semis > commas) return ";";
  if (commas > 0) return ",";
  return null;
}

function splitCsvLine(line, delimiter) {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^["']|["']$/g, ""));
}

/**
 * Parse plain text / CSV / paste into ordered unique bus numbers.
 * @param {string} text
 * @returns {{ numbers: string[], invalid: string[] }}
 */
function parseBusImportText(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const numbers = [];
  const invalid = [];
  const seen = new Set();

  if (lines.length === 0) return { numbers, invalid };

  let delimiter = detectDelimiter(lines[0]);
  let startIdx = 0;
  let columnIndex = 0;

  if (delimiter) {
    const headerCells = splitCsvLine(lines[0], delimiter).map((c) => c.toLowerCase());
    const headerHit = headerCells.findIndex((c) => HEADER_ALIASES.has(c));
    if (headerHit >= 0) {
      columnIndex = headerHit;
      startIdx = 1;
    } else {
      columnIndex = 0; // no header: first column only (notes stay in other columns)
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    let chunks;
    if (delimiter) {
      const cells = splitCsvLine(line, delimiter);
      chunks = [cells[columnIndex] ?? ""];
    } else {
      chunks = line.split(/[,;\t|]+/).map((c) => c.trim()).filter(Boolean);
      if (!chunks.length) chunks = [line];
    }

    for (const chunk of chunks) {
      const normalized = normalizeBusNumber(chunk);
      if (!normalized) {
        if (String(chunk || "").trim()) invalid.push(String(chunk).trim());
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (numbers.length >= MAX_IMPORT_ROWS) break;
      numbers.push(normalized);
    }
    if (numbers.length >= MAX_IMPORT_ROWS) break;
  }

  return { numbers, invalid };
}

/**
 * Parse SheetJS-style rows (array of arrays) from first sheet.
 * @param {unknown[][]} rows
 */
function parseBusImportRows(rows) {
  const lines = (rows || [])
    .map((row) => {
      if (!Array.isArray(row)) return "";
      return row.map((cell) => String(cell ?? "").trim()).filter((c) => c !== "").join(",");
    })
    .filter((line) => line.length > 0);
  return parseBusImportText(lines.join("\n"));
}

/**
 * Classify against existing fleet for a group.
 * @param {string[]} numbers
 * @param {Array<{ number?: string, groupId?: string, lineId?: string, active?: boolean }>} existingBuses
 * @param {string|null} groupId
 */
function classifyBusImport(numbers, existingBuses, groupId) {
  const inGroup = (existingBuses || []).filter((b) => {
    if (!groupId) return true;
    const gid = b.groupId || b.lineId || null;
    return !gid || gid === groupId;
  });
  const byNumber = new Map(
    inGroup.map((b) => [String(b.number || "").trim().toLowerCase(), b])
  );

  const toCreate = [];
  const existing = [];
  const toReactivate = [];

  for (const number of numbers) {
    const hit = byNumber.get(number.toLowerCase());
    if (!hit) {
      toCreate.push(number);
      continue;
    }
    if (hit.active === false) toReactivate.push({ number, id: hit.id });
    else existing.push(number);
  }

  return { toCreate, existing, toReactivate };
}

export {
  MAX_IMPORT_ROWS,
  normalizeBusNumber,
  parseBusImportText,
  parseBusImportRows,
  classifyBusImport
};

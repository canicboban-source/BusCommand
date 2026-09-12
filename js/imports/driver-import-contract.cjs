"use strict";

/**
 * Canonical CA driver import contract (CSV + XLSX matrix).
 * Machine columns: eid,last_name,first_name,email,phone,postal_code
 * Credential columns fail closed. Cell values are never included in errors.
 */

const MAX_IMPORT_ROWS = 249;
const MAX_FILE_BYTES = 1_000_000;
const POSTAL_CODE_MAX = 10;
const EID_MAX = 64;
const NAME_MAX = 80;
const PHONE_MIN = 3;
const PHONE_MAX = 40;
const EMAIL_MAX = 254;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const CANONICAL_COLUMNS = Object.freeze([
  "eid",
  "last_name",
  "first_name",
  "email",
  "phone",
  "postal_code"
]);

const CANONICAL_HEADER = CANONICAL_COLUMNS.join(",");

const GENERIC_EXAMPLE_ROW = Object.freeze([
  "EMP-001",
  "Sample",
  "Driver",
  "driver01@example.invalid",
  "+43100000000",
  "1010"
]);

const HEADER_ALIASES = Object.freeze({
  eid: [
    "eid", "employee_id", "employeeid", "mitarbeiter_id", "mitarbeiterid",
    "personalnummer", "mitarbeiternummer", "maticni_broj", "broj_zaposlenog",
    "firma_id", "firm_id"
  ],
  last_name: ["last_name", "lastname", "prezime", "nachname"],
  first_name: ["first_name", "firstname", "ime", "vorname"],
  full_name: ["ime_prezime", "name", "vozac", "full_name", "fullname"],
  email: ["email", "e_mail", "mail"],
  phone: ["phone", "telephone", "telefon", "mobile", "telefonnummer"],
  postal_code: ["postal_code", "postalcode", "postcode", "zip", "plz", "postleitzahl"],
  group: ["grupa", "grupa_csv", "group", "group_id", "groupid", "linie", "line", "linija"]
});

const CREDENTIAL_HEADERS = Object.freeze([
  "pin", "initial_pin", "initialpin", "company_code", "companycode",
  "activation_code", "activationcode", "password", "passcode",
  "login_code", "logincode", "otp", "firmencode", "firmen_code",
  "firmin_kod", "kod_firme", "licni_kod", "licni_kod_za_app",
  "personal_code", "personalcode", "company_code_hash"
]);

class DriverImportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DriverImportError";
    this.code = code;
  }
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildHeaderLookup() {
  const lookup = new Map();
  Object.entries(HEADER_ALIASES).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) => lookup.set(normalizeHeader(alias), canonical));
  });
  return lookup;
}

const HEADER_LOOKUP = buildHeaderLookup();
const CREDENTIAL_LOOKUP = new Set(CREDENTIAL_HEADERS.map(normalizeHeader));

function detectDelimiter(line) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && Object.hasOwn(counts, line[i])) counts[line[i]] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (!quoted && char === delimiter) {
      row.push(field);
      field = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) {
    throw new DriverImportError("UNCLOSED_QUOTE", "CSV sadrži nezatvorenu vrednost pod navodnicima.");
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  return rows;
}

function splitFullName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: "", last_name: "" };
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return {
    first_name: parts.slice(0, -1).join(" "),
    last_name: parts[parts.length - 1]
  };
}

function isEmptyRow(cells) {
  return !Array.isArray(cells) || !cells.some((cell) => String(cell ?? "").trim());
}

function cellToText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.replace(/^\uFEFF/, "").trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

function normalizeImportPhone(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  else if (!digits.startsWith("+")) digits = `+${digits.replace(/\D/g, "")}`;
  // Same ITU-T E.164 bound as server/sms-provider.normalizePhone; kept local so
  // the browser contract never imports Node SMS code.
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return "";
  return digits;
}

function assertSafeCell(text, field) {
  const value = String(text || "").trim();
  if (!value) return;
  const first = value[0];
  if (first === "=" || first === "@" || first === "-") {
    throw new DriverImportError("FORMULA_FORBIDDEN", "Formula ćelije nisu dozvoljene.");
  }
  if (first === "+") {
    if (field !== "phone" || !normalizeImportPhone(value)) {
      throw new DriverImportError("FORMULA_FORBIDDEN", "Formula ćelije nisu dozvoljene.");
    }
  }
}

function limit(value, max) {
  return String(value || "").trim().slice(0, max);
}

function parseDriverMatrix(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) {
    throw new DriverImportError("EMPTY", "Fajl je prazan.");
  }
  const rows = matrix.filter((row) => !isEmptyRow(row));
  if (rows.length < 2) {
    throw new DriverImportError("NO_ROWS", "Fajl mora sadržati zaglavlje i najmanje jednog vozača.");
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    throw new DriverImportError("TOO_MANY", `Fajl može sadržati najviše ${MAX_IMPORT_ROWS} vozača.`);
  }

  const rawHeaders = rows[0].map((header) => cellToText(header));
  const forbidden = [];
  rawHeaders.forEach((header) => {
    const normalized = normalizeHeader(header);
    if (normalized && CREDENTIAL_LOOKUP.has(normalized)) forbidden.push(normalized);
  });
  if (forbidden.length) {
    throw new DriverImportError(
      "CREDENTIAL_COLUMNS_FORBIDDEN",
      "Pristupni kodovi se ne uvoze fajlom."
    );
  }

  const headers = rawHeaders.map((header) => HEADER_LOOKUP.get(normalizeHeader(header)) || null);
  const seenCanonical = new Set();
  for (const key of headers) {
    if (!key) continue;
    if (seenCanonical.has(key)) {
      throw new DriverImportError("DUPLICATE_CANONICAL_COLUMN", `Duplikat kolone: ${key}.`);
    }
    seenCanonical.add(key);
  }
  const hasNames = headers.includes("first_name") && headers.includes("last_name");
  const hasFullName = headers.includes("full_name");
  const required = ["eid", "phone", "email"];
  const missing = required.filter((key) => !headers.includes(key));
  if (!hasNames && !hasFullName) missing.push("last_name/first_name");
  if (missing.length) {
    throw new DriverImportError("MISSING_COLUMNS", `Nedostaju kolone: ${missing.join(", ")}.`);
  }

  const drivers = rows.slice(1).map((cells, index) => {
    const raw = {};
    headers.forEach((key, column) => {
      if (!key) return;
      const text = cellToText(cells[column]);
      assertSafeCell(text, key);
      raw[key] = key === "phone" && text.startsWith("+")
        ? (normalizeImportPhone(text) || text)
        : text;
    });

    let firstName = raw.first_name || "";
    let lastName = raw.last_name || "";
    if ((!firstName || !lastName) && raw.full_name) {
      const split = splitFullName(raw.full_name);
      firstName = firstName || split.first_name;
      lastName = lastName || split.last_name;
    }

    const driver = {
      eid: limit(raw.eid, EID_MAX),
      last_name: limit(lastName, NAME_MAX),
      first_name: limit(firstName, NAME_MAX),
      email: limit(String(raw.email || "").toLowerCase(), EMAIL_MAX),
      phone: limit(raw.phone, PHONE_MAX),
      postal_code: limit(raw.postal_code, POSTAL_CODE_MAX),
      group: String(raw.group || "").trim()
    };

    const row = index + 2;
    for (const key of ["eid", "last_name", "first_name", "phone", "email"]) {
      if (!driver[key]) {
        throw new DriverImportError("REQUIRED_FIELD", `Red ${row}: ${key} je obavezan.`);
      }
    }
    if (driver.phone.length < PHONE_MIN) {
      throw new DriverImportError("INVALID_PHONE", `Red ${row}: telefon nije ispravan.`);
    }
    if (!EMAIL_RE.test(driver.email)) {
      throw new DriverImportError("INVALID_EMAIL", `Red ${row}: email nije ispravan.`);
    }
    return driver;
  });

  assertUniqueDrivers(drivers);
  return drivers;
}

function parseDriverCsv(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new DriverImportError("EMPTY", "CSV je prazan.");
  }
  const firstLine = text.split(/\r?\n/, 1)[0];
  return parseDriverMatrix(parseRows(text, detectDelimiter(firstLine)));
}

function assertUniqueDrivers(drivers) {
  const seen = new Set();
  drivers.forEach((driver, index) => {
    const value = String(driver.eid || "").trim().toLowerCase();
    if (!value) return;
    if (seen.has(value)) {
      throw new DriverImportError("DUPLICATE_EID", `Duplikat eid u redu ${index + 2}.`);
    }
    seen.add(value);
  });
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function driversToCanonicalCsv(drivers) {
  const rows = (drivers || []).map((driver) => CANONICAL_COLUMNS
    .map((key) => csvEscape(driver[key] || ""))
    .join(","));
  return [CANONICAL_HEADER, ...rows].join("\n");
}

function canonicalCsvText() {
  return `${CANONICAL_HEADER}\n${GENERIC_EXAMPLE_ROW.join(",")}\n`;
}

function inspectWorkbookSafety(workbook) {
  // Extra visible sheets are ignored: only SheetNames[0] is parsed.
  // Hidden/veryHidden, formulas, VBA and macros still fail closed.
  // Changing extra-visible-sheet policy is out of scope for MACHINE-FIX-01-R1.
  if (workbook?.vbaraw) {
    throw new DriverImportError("MACRO_FORBIDDEN", "Makroi nisu dozvoljeni.");
  }
  const metaSheets = workbook?.Workbook?.Sheets;
  if (Array.isArray(metaSheets)) {
    for (const sheet of metaSheets) {
      if (sheet && Number(sheet.Hidden) > 0) {
        throw new DriverImportError("HIDDEN_SHEET_FORBIDDEN", "Skriveni sheetovi nisu dozvoljeni.");
      }
    }
  }
  const names = workbook?.SheetNames || [];
  for (const name of names) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    for (const [addr, cell] of Object.entries(sheet)) {
      if (addr.startsWith("!")) continue;
      if (cell && cell.f) {
        throw new DriverImportError("FORMULA_FORBIDDEN", "Formula ćelije nisu dozvoljene.");
      }
    }
  }
}

function isZipWorkbook(bytes) {
  return Boolean(bytes && bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b);
}

function parseDriverWorkbook(XLSX, bytes) {
  if (!XLSX) {
    throw new DriverImportError("XLSX_UNAVAILABLE", "XLSX parser nije dostupan.");
  }
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!isZipWorkbook(view)) {
    throw new DriverImportError("XLSX_INVALID", "XLSX mora biti pravi Excel workbook.");
  }
  const workbook = XLSX.read(view, {
    type: "array",
    cellFormula: true,
    raw: false,
    bookVBA: true
  });
  inspectWorkbookSafety(workbook);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new DriverImportError("EMPTY", "Fajl je prazan.");
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false
  });
  return parseDriverMatrix(matrix);
}

module.exports = {
  MAX_IMPORT_ROWS,
  MAX_FILE_BYTES,
  POSTAL_CODE_MAX,
  CANONICAL_COLUMNS,
  CANONICAL_HEADER,
  GENERIC_EXAMPLE_ROW,
  HEADER_ALIASES,
  CREDENTIAL_HEADERS,
  DriverImportError,
  normalizeHeader,
  detectDelimiter,
  splitFullName,
  parseRows,
  parseDriverMatrix,
  parseDriverCsv,
  parseDriverWorkbook,
  normalizeImportPhone,
  inspectWorkbookSafety,
  isZipWorkbook,
  driversToCanonicalCsv,
  canonicalCsvText,
  assertUniqueDrivers
};

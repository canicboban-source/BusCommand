const HEADER_ALIASES = {
  eid: ["eid", "employee_id", "employeeid", "personalnummer", "mitarbeiternummer", "maticni_broj", "maticni broj", "broj_zaposlenog", "firma_id", "firm_id"],
  first_name: ["first_name", "firstname", "vorname", "ime"],
  last_name: ["last_name", "lastname", "nachname", "prezime"],
  full_name: ["ime_prezime", "name", "vozac", "vozač", "full_name", "fullname"],
  phone: ["phone", "telephone", "telefon", "telefonnummer"],
  email: ["email", "e-mail", "e_mail"],
  company_code: [
    "company_code", "companycode", "firmencode", "firmen_code", "firmin_kod", "firmin kod", "kod_firme",
    "licni_kod_za_app", "licni_kod", "kod_za_app", "pin", "login_code"
  ],
  group: ["grupa", "group", "group_id", "groupid", "linie", "line"]
};
const MAX_IMPORT_ROWS = 250;

function normalizeHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase();
}

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
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error("CSV sadrži nezatvorenu vrednost pod navodnicima.");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
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

function uniquifyCompanyCodes(drivers) {
  const counts = new Map();
  drivers.forEach((driver) => {
    const key = String(driver.company_code || "").trim().toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  drivers.forEach((driver) => {
    const key = String(driver.company_code || "").trim().toLowerCase();
    if ((counts.get(key) || 0) > 1) {
      driver.company_code = `${driver.company_code}-${driver.eid}`;
    }
  });
}

function parseDriverCsv(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("CSV je prazan.");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const rows = parseRows(text, detectDelimiter(firstLine));
  if (rows.length < 2) throw new Error("CSV mora sadržati zaglavlje i najmanje jednog vozača.");
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new Error(`CSV može sadržati najviše ${MAX_IMPORT_ROWS} vozača.`);

  const lookup = new Map();
  Object.entries(HEADER_ALIASES).forEach(([canonical, aliases]) => {
    aliases.forEach((alias) => lookup.set(normalizeHeader(alias), canonical));
  });
  const headers = rows[0].map((header) => lookup.get(normalizeHeader(header)) || null);
  const hasNames = headers.includes("first_name") && headers.includes("last_name");
  const hasFullName = headers.includes("full_name");
  const required = ["eid", "phone", "email", "company_code"];
  const missing = required.filter((key) => !headers.includes(key));
  if (!hasNames && !hasFullName) missing.push("first_name/last_name or ime_prezime");
  if (missing.length) throw new Error(`Nedostaju CSV kolone: ${missing.join(", ")}.`);

  const drivers = rows.slice(1).map((cells, index) => {
    const raw = {};
    headers.forEach((key, column) => {
      if (key) raw[key] = String(cells[column] || "").trim();
    });

    let firstName = raw.first_name || "";
    let lastName = raw.last_name || "";
    if ((!firstName || !lastName) && raw.full_name) {
      const split = splitFullName(raw.full_name);
      firstName = firstName || split.first_name;
      lastName = lastName || split.last_name;
    }

    const driver = {
      eid: raw.eid || "",
      first_name: firstName,
      last_name: lastName,
      phone: raw.phone || "",
      email: raw.email || "",
      company_code: raw.company_code || "",
      group: raw.group || ""
    };

    for (const key of ["eid", "first_name", "last_name", "phone", "email", "company_code"]) {
      if (!driver[key]) throw new Error(`Red ${index + 2}: ${key} je obavezan.`);
    }
    if (!/^\S+@\S+\.\S+$/.test(driver.email)) throw new Error(`Red ${index + 2}: email nije ispravan.`);
    return driver;
  });

  uniquifyCompanyCodes(drivers);
  assertUniqueDrivers(drivers);
  return drivers;
}

function assertUniqueDrivers(drivers) {
  for (const field of ["eid", "company_code"]) {
    const seen = new Set();
    drivers.forEach((driver, index) => {
      const value = String(driver[field]).trim().toLowerCase();
      if (seen.has(value)) throw new Error(`Duplikat ${field} u redu ${index + 2}.`);
      seen.add(value);
    });
  }
}

module.exports = {
  HEADER_ALIASES,
  parseDriverCsv,
  assertUniqueDrivers,
  detectDelimiter,
  splitFullName,
  uniquifyCompanyCodes
};

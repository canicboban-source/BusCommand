"use strict";

const EXPORT_ROW_LIMIT = 10000;

const EXPORT_SPECS = Object.freeze({
  reports: {
    collection: "reports",
    headers: ["id", "time", "driverId", "driver", "bus", "type", "reason", "severity", "status"],
    row: (id, data) => [
      id,
      data.time || data.createdAt,
      data.driverId,
      data.driver,
      data.bus,
      data.type,
      data.reason || data.description || data.details,
      data.severity,
      data.status
    ]
  },
  drivers: {
    collection: "drivers",
    headers: ["id", "name", "bus", "groupId", "active"],
    row: (id, data) => [id, driverName(data), data.bus, data.groupId || data.lineId, data.active !== false]
  },
  lost_items: {
    collection: "lost_items",
    headers: ["id", "time", "driverId", "driver", "bus", "type", "location", "status"],
    row: (id, data) => [id, data.time || data.createdAt, data.driverId, data.driver, data.bus, data.type, data.location, data.status]
  }
});

function driverName(data = {}) {
  return String(data.name || `${data.firstName || ""} ${data.lastName || ""}`).trim();
}

function exportScalar(value) {
  if (value == null) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  return JSON.stringify(value);
}

function neutralizeSpreadsheetFormula(value) {
  const text = exportScalar(value).replaceAll(String.fromCharCode(0), "");
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
  return `"${neutralizeSpreadsheetFormula(value).replace(/"/g, '""')}"`;
}

function rowsToCsv(headers, rows) {
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

async function buildCompanyExport(companyRef, dataset) {
  const spec = EXPORT_SPECS[dataset];
  if (!spec) {
    const error = new Error("Nepodrzan skup podataka za izvoz.");
    error.code = "export-not-supported";
    throw error;
  }
  const snapshot = await companyRef.collection(spec.collection).limit(EXPORT_ROW_LIMIT + 1).get();
  if (snapshot.docs.length > EXPORT_ROW_LIMIT) {
    const error = new Error("Izvoz je prevelik. Suzite period ili koristite serverski arhivski izvoz.");
    error.code = "export-too-large";
    throw error;
  }
  const rows = snapshot.docs.map(doc => spec.row(doc.id, doc.data()).map(exportScalar));
  return {
    dataset,
    count: rows.length,
    filename: `buscommand_${dataset}.csv`,
    csv: rowsToCsv(spec.headers, rows)
  };
}

module.exports = {
  EXPORT_ROW_LIMIT,
  EXPORT_SPECS,
  buildCompanyExport,
  csvCell,
  neutralizeSpreadsheetFormula,
  rowsToCsv
};

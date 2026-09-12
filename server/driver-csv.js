"use strict";

const contract = require("../js/imports/driver-import-contract.cjs");

function parseDriverXlsx(buffer) {
  let XLSX;
  try {
    XLSX = require("xlsx");
  } catch {
    const error = new contract.DriverImportError("XLSX_UNAVAILABLE", "XLSX parser nije dostupan.");
    throw error;
  }
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return contract.parseDriverWorkbook(XLSX, bytes);
}

module.exports = {
  ...contract,
  parseDriverXlsx
};

/**
 * Official CA driver import templates (CSV + XLSX). No PIN/code columns.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const {
  CANONICAL_HEADER,
  GENERIC_EXAMPLE_ROW,
  canonicalCsvText
} = require("../js/imports/driver-import-contract.cjs");

function ensureXlsx() {
  return require("xlsx");
}

function writeDriverImportCsv(dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `\uFEFF${canonicalCsvText()}`, "utf8");
  console.log("Wrote", dest);
}

function styleDriverSheet(XLSX, sheet) {
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  for (let R = 0; R <= range.e.r; R += 1) {
    for (let C = 0; C <= range.e.c; C += 1) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr];
      if (!cell) continue;
      cell.t = "s";
      cell.v = String(cell.v ?? "");
      delete cell.w;
      if (C === 0 || C === 4 || C === 5) cell.z = "@";
      if (R === 0) {
        cell.s = {
          font: { bold: true, color: { rgb: "F8FAFC" } },
          fill: { patternType: "solid", fgColor: { rgb: "0B1F3A" } }
        };
      }
    }
  }
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 28 },
    { wch: 16 },
    { wch: 12 }
  ];
}

function writeDriverImportXlsx(dest) {
  const XLSX = ensureXlsx();
  const wb = XLSX.utils.book_new();
  const headers = CANONICAL_HEADER.split(",");
  const sheet = XLSX.utils.aoa_to_sheet([headers, [...GENERIC_EXAMPLE_ROW]]);
  styleDriverSheet(XLSX, sheet);
  XLSX.utils.book_append_sheet(wb, sheet, "Drivers");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  XLSX.writeFile(wb, dest, { cellStyles: true, bookSST: true, bookType: "xlsx" });
  console.log("Wrote", dest);
}

function writeAllDriverImportTemplates(rootDir) {
  const templates = path.join(rootDir, "public", "templates");
  const downloads = path.join(rootDir, "public", "downloads");
  writeDriverImportCsv(path.join(templates, "BusCommand_Drivers_Import_v1.csv"));
  writeDriverImportXlsx(path.join(templates, "BusCommand_Drivers_Import_v1.xlsx"));
  writeDriverImportCsv(path.join(downloads, "BusCommand_Driver_Roster_Template.csv"));
  writeDriverImportXlsx(path.join(downloads, "BusCommand_Driver_Roster_Template.xlsx"));
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  writeAllDriverImportTemplates(root);
}

export {
  writeDriverImportCsv,
  writeDriverImportXlsx,
  writeAllDriverImportTemplates
};

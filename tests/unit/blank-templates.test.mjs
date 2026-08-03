import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseCsvText } from "../../js/imports/service-plan-csv.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templates = path.join(root, "public", "templates");

/** Read one OOXML zip entry without SheetJS (CI has no `xlsx` package). */
function readXlsxEntry(xlsxPath, entryName) {
  const buf = fs.readFileSync(xlsxPath);
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString("utf8");
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    offset = dataStart + compressedSize;
    if (name !== entryName) continue;
    if (method === 0) return data.toString("utf8");
    if (method === 8) return inflateRawSync(data).toString("utf8");
    throw new Error(`unsupported zip compression ${method} for ${entryName}`);
  }
  throw new Error(`zip entry not found: ${entryName}`);
}

test("blank Dienstplan CSV has headers and no sample duties", () => {
  const csv = fs.readFileSync(path.join(templates, "BusCommand_Dienstplan_Blank_v1.csv"), "utf8");
  assert.match(csv, /template_version,BUSCOMMAND-DIENSTPLAN-1/);
  assert.doesNotMatch(csv, /310\.S01/);
  assert.doesNotMatch(csv, /^SMENE,/m);
  const parsed = parseCsvText(csv);
  assert.equal(parsed.valid, false);
  assert.ok(parsed.errors.some((error) => error.code === "missing_value"));
});

test("blank Dienstplan XLSX has PLAN/SMENE/AKTIVNOSTI sheets without duties", () => {
  const xlsxPath = path.join(templates, "BusCommand_Dienstplan_Blank_v1.xlsx");
  assert.ok(fs.existsSync(xlsxPath));
  const workbook = readXlsxEntry(xlsxPath, "xl/workbook.xml");
  for (const name of ["PLAN", "SMENE", "AKTIVNOSTI"]) {
    assert.match(workbook, new RegExp(`sheet name="${name}"`));
  }
  const smene = readXlsxEntry(xlsxPath, "xl/worksheets/sheet2.xml");
  assert.match(smene, /<v>duty_code<\/v>/);
  assert.match(smene, /dimension ref="A1:H1"/);
  assert.doesNotMatch(smene, /<row r="2"/);
});

test("drivers import CSV is header-only official blank", () => {
  const csv = fs.readFileSync(path.join(templates, "BusCommand_Drivers_Import_v1.csv"), "utf8").trim();
  assert.equal(csv, "eid,first_name,last_name,phone,email,company_code");
});

test("monthly group CSV and XLSX are header-only official blanks", () => {
  const csv = fs.readFileSync(path.join(templates, "BusCommand_Monthly_Group_Plan_Blank_v1.csv"), "utf8").trim();
  assert.equal(csv, "eid,date,duty_code");

  const xlsxPath = path.join(templates, "BusCommand_Monthly_Group_Plan_Blank_v1.xlsx");
  const workbook = readXlsxEntry(xlsxPath, "xl/workbook.xml");
  assert.match(workbook, /sheet name="MONTHLY_PLAN"/);
  assert.match(workbook, /sheet name="INSTRUCTIONS"/);
  const plan = readXlsxEntry(xlsxPath, "xl/worksheets/sheet1.xml");
  assert.match(plan, /<v>eid<\/v>/);
  assert.match(plan, /<v>date<\/v>/);
  assert.match(plan, /<v>duty_code<\/v>/);
  assert.match(plan, /dimension ref="A1:C1"/);
  assert.doesNotMatch(plan, /<row r="2"/);

  const copier = fs.readFileSync(path.join(root, "scripts", "copy-static-to-dist.js"), "utf8");
  assert.match(copier, /BusCommand_Monthly_Group_Plan_Blank_v1\.csv/);
  assert.match(copier, /BusCommand_Monthly_Group_Plan_Blank_v1\.xlsx/);
});

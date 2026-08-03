import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseCsvText } from "../../js/imports/service-plan-csv.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templates = path.join(root, "public", "templates");

/** Read one entry from an .xlsx (OOXML zip) without the SheetJS dependency. */
function readXlsxEntry(xlsxPath, entry) {
  return execFileSync("tar", ["-xOf", xlsxPath, entry], { encoding: "utf8" });
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

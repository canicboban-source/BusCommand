import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { parseCsvText } from "../../js/imports/service-plan-csv.js";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templates = path.join(root, "public", "templates");

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
  const XLSX = require("xlsx");
  const workbook = XLSX.readFile(path.join(templates, "BusCommand_Dienstplan_Blank_v1.xlsx"));
  assert.deepEqual(
    ["PLAN", "SMENE", "AKTIVNOSTI"].every((name) => workbook.SheetNames.includes(name)),
    true
  );
  const smene = XLSX.utils.sheet_to_json(workbook.Sheets.SMENE, { header: 1 });
  assert.equal(smene.length, 1);
  assert.equal(String(smene[0][0]).toLowerCase(), "duty_code");
});

test("drivers import CSV is header-only official blank", () => {
  const csv = fs.readFileSync(path.join(templates, "BusCommand_Drivers_Import_v1.csv"), "utf8").trim();
  assert.equal(csv, "eid,first_name,last_name,phone,email,company_code");
});

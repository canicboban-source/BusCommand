import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  parseGroupMonthlyCsv,
  parseGroupMonthlyRows
} from "../../js/imports/group-monthly-plan.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("group monthly CSV parses EID assignments and absence codes", () => {
  const rows = parseGroupMonthlyCsv([
    "eid,date,duty_code",
    "E-100,2026-09-01,310.S01",
    "E-100,02.09.2026,OFF",
    "E-200,2026-09-01,310.F02"
  ].join("\n"), { month: "2026-09" });

  assert.deepEqual(rows, [
    { eid: "E-100", date: "2026-09-01", dutyCode: "310.S01", sourceRow: 2 },
    { eid: "E-100", date: "2026-09-02", dutyCode: "OFF", sourceRow: 3 },
    { eid: "E-200", date: "2026-09-01", dutyCode: "310.F02", sourceRow: 4 }
  ]);
});

test("group monthly parser rejects missing columns, duplicates and wrong month", () => {
  assert.throws(
    () => parseGroupMonthlyRows([["eid", "date"], ["E-1", "2026-09-01"]]),
    error => error.message === "monthly_import_missing_columns"
  );
  assert.throws(
    () => parseGroupMonthlyCsv("eid,date,duty_code\nE-1,2026-09-01,310.S01\nE-1,2026-09-01,310.S02"),
    error => error.message === "monthly_import_duplicate"
  );
  assert.throws(
    () => parseGroupMonthlyCsv("eid,date,duty_code\nE-1,2026-10-01,310.S01", { month: "2026-09" }),
    error => error.message === "monthly_import_wrong_month"
  );
});

test("group monthly parser accepts semicolon CSV and quoted EID", () => {
  const rows = parseGroupMonthlyCsv("eid;date;duty_code\n\"E;1\";2026-09-01;310.S01");
  assert.equal(rows[0].eid, "E;1");
  assert.equal(rows[0].dutyCode, "310.S01");
});

test("Company Admin page no longer exposes group monthly assignment import (D21)", () => {
  const html = fs.readFileSync(path.join(root, "index.legacy-monolith.html"), "utf8");
  const api = fs.readFileSync(path.join(root, "api-server.js"), "utf8");
  assert.doesNotMatch(html, /id="ca-monthly-import-group"/);
  assert.doesNotMatch(html, /id="ca-monthly-import-file"/);
  assert.doesNotMatch(html, /ca-monthly-import-card/);
  assert.match(html, /id="dispo-monthly-plan-import"/);
  assert.match(html, /id="bulk-plan-import-files"/);
  assert.match(api, /MONTHLY_ASSIGNMENTS_DISPATCHER_ONLY/);
});

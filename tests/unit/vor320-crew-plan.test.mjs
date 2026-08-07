import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "../fixtures");

globalThis.window = {
  location: { hostname: "localhost", search: "" },
  state: { activeLineId: "320", groups: [{ id: "320" }] }
};

const { isMonthlyPlanCsv, parseMonthlyPlanCsv } = await import("../../js/imports/monthly-plan-csv.js");

const CREW = [
  "Canic Boban",
  "Marko Petrović",
  "Nikola Jovanović",
  "Stefan Ilić",
  "Aleksandar Nikolić"
];

test("VOR 320 group plan has 5 drivers and complementary F05–F09 on Ferien days", () => {
  const csv = fs.readFileSync(path.join(fixtures, "vor320-group-plan-2026-08.csv"), "utf8");
  assert.equal(isMonthlyPlanCsv(csv), true);
  const parsed = parseMonthlyPlanCsv(csv, "320");
  assert.equal(parsed.month, "2026-08");
  assert.deepEqual(Object.keys(parsed.byDriver).sort(), [...CREW].sort());

  // 03.08 Boban F06 — others fill F05,F07,F08,F09
  const day3 = {};
  for (const name of CREW) {
    day3[name] = parsed.byDriver[name].parsedShifts[3];
  }
  assert.equal(day3["Canic Boban"].routeCode, "320.F06");
  assert.equal(day3["Canic Boban"].bus, "91504");
  const codes = CREW.map((n) => day3[n].routeCode).filter(Boolean).sort();
  assert.deepEqual(codes, ["320.F05", "320.F06", "320.F07", "320.F08", "320.F09"]);
  assert.equal(new Set(codes).size, 5);

  // Boban Urlaub 11.08 — his vacation preserved
  assert.equal(parsed.byDriver["Canic Boban"].parsedShifts[11].type, "vacation");
});

test("crew drivers CSV matches BusCommand template headers", () => {
  const csv = fs.readFileSync(path.join(fixtures, "vor320-crew-drivers.csv"), "utf8");
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  assert.equal(header, "eid,first_name,last_name,phone,email,company_code");
  assert.equal(rows.length, 5);
  assert.ok(rows.some((r) => r.startsWith("100615,")));
});

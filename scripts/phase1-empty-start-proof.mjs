/**
 * Phase 1 proof: product empty shell has zero business entities.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Dynamic import of ESM constants
const { FRESH_STATE, LOCAL_EMPTY_STATE } = await import(
  pathToFileURL(path.join(root, "js/core/constants.js")).href
);

const emptyArrays = [
  "groups", "dispatchers", "drivers", "buses", "routes", "reports",
  "vacations", "messages", "lostItems", "schedules", "tomorrowShifts",
  "shifts", "companyAdmins", "servicePlans"
];

for (const key of emptyArrays) {
  assert.ok(Array.isArray(FRESH_STATE[key]), `${key} must be array`);
  assert.equal(FRESH_STATE[key].length, 0, `${key} must be empty`);
}
assert.equal(FRESH_STATE.shiftCatalog, null);
assert.deepEqual(FRESH_STATE.shiftCatalogs, {});
assert.equal(FRESH_STATE.branding?.name, "");
assert.equal(LOCAL_EMPTY_STATE, FRESH_STATE);

// No filled product templates
const templatesDir = path.join(root, "public/templates");
const forbidden = [
  "BusCommand_Dienstplan_Import_v1.xlsx",
  "BusCommand_Dienstplan_Import_v1.csv",
  "BusCommand_Dienstplan_Import_v1.pdf",
  "BusCommand_Drivers_Import_pilot_sr.csv"
];
for (const name of forbidden) {
  assert.equal(fs.existsSync(path.join(templatesDir, name)), false, `must not ship ${name}`);
}

// Blank drivers template is headers-only
const driversCsv = fs.readFileSync(path.join(templatesDir, "BusCommand_Drivers_Import_v1.csv"), "utf8").trim();
assert.ok(driversCsv.split(/\r?\n/).length <= 1, "drivers blank template must be header-only");

// Product modules removed
assert.equal(fs.existsSync(path.join(root, "js/core/demo-ops-baseline.js")), false);
assert.equal(fs.existsSync(path.join(root, "js/dispatcher/plan-edit-lock-demo.js")), false);

// Runtime config has no IS_DEMO_MODE
const runtimeConfig = fs.readFileSync(path.join(root, "js/core/runtime-config.js"), "utf8");
assert.doesNotMatch(runtimeConfig, /\bIS_DEMO_MODE\b/);
assert.doesNotMatch(runtimeConfig, /FORCE_LOCAL_DEMO/);

const api = fs.readFileSync(path.join(root, "api-server.js"), "utf8");
assert.match(api, /BUSCOMMAND_QA_HARNESS/);
assert.doesNotMatch(api, /FORCE_LOCAL_DEMO/);

console.log("phase1-empty-start-proof: OK");
console.log(JSON.stringify({
  freshGroups: FRESH_STATE.groups.length,
  freshDrivers: FRESH_STATE.drivers.length,
  freshAdmins: FRESH_STATE.companyAdmins.length,
  freshShifts: FRESH_STATE.shifts.length,
  publicTemplates: fs.readdirSync(templatesDir)
}, null, 2));

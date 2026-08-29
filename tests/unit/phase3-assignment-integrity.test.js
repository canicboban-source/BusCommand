/**
 * FAZA 3 fail-first: assignment route wires resource guard + stable 409 codes.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const ROUTES = fs.readFileSync(path.join(ROOT, "server", "driver-routes.js"), "utf8");
const SHIFTS = fs.readFileSync(path.join(ROOT, "js", "dispatcher", "shifts.js"), "utf8");
const CONFLICTS = fs.readFileSync(path.join(ROOT, "js", "core", "bus-shift-conflicts.js"), "utf8");

test("assignment PUT imports and applies assignment-resource-guard", () => {
  assert.match(ROUTES, /assignment-resource-guard/);
  assert.match(ROUTES, /evaluateBusResource/);
  assert.match(ROUTES, /findOverlappingBusAssignments/);
  assert.match(ROUTES, /evaluateDutyAgainstCatalog/);
  assert.match(ROUTES, /BUS_DOUBLE_BOOKED/);
  assert.match(ROUTES, /BUS_INACTIVE/);
  assert.match(ROUTES, /BUS_OUTSIDE_GROUP/);
  assert.match(ROUTES, /DUTY_NOT_IN_ACTIVE_CATALOG/);
});

test("D24.1 assignment revalidates live bus/duty/scope inside mutation transaction", () => {
  const assignIdx = ROUTES.indexOf('app.put("/api/staff/shifts/assignment"');
  assert.ok(assignIdx > 0);
  const slice = ROUTES.slice(assignIdx, assignIdx + 30000);
  assert.match(slice, /getActiveServicePlanInTx/);
  assert.match(slice, /busLookupQuery/);
  assert.match(slice, /tx\.get\(driverRef\)/);
  assert.match(slice, /tx\.get\(staffUserRef\)/);
  // Bus lookup must not be the sole pre-tx authority for evaluateBusResource.
  const txIdx = slice.indexOf("runTransaction");
  const evalIdx = slice.indexOf("evaluateBusResource");
  assert.ok(txIdx > 0 && evalIdx > txIdx, "evaluateBusResource must run after runTransaction starts");
});

test("client never warn-but-saves on bus conflict", () => {
  assert.doesNotMatch(SHIFTS, /warnIfBusUsedInOtherGroup/);
  assert.match(SHIFTS, /preflightBusAssignment/);
  assert.match(SHIFTS, /return false/);
  assert.doesNotMatch(CONFLICTS, /warn, not ban/);
  assert.match(CONFLICTS, /hard block/);
});

test("translations hard-block copy has no Assignment saved claim", () => {
  const translations = fs.readFileSync(path.join(ROOT, "translations.js"), "utf8");
  assert.doesNotMatch(translations, /Assignment saved — check coverage/);
  assert.doesNotMatch(translations, /Dodela sačuvana — proverite/);
  assert.doesNotMatch(translations, /Zuweisung gespeichert — Einsatz prüfen/);
  assert.match(translations, /ops_bus_conflict_blocked/);
});

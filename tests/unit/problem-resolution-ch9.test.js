const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  canTransitionProblem,
  simulateProblemTransition,
  buildProblemCreateFields,
  normalizedProblemStatus,
  isOpenProblemStatus,
  isOpsActivityAction
} = require("../../server/problem-resolution");

test("legacy active normalizes to open and stays open for ops", () => {
  assert.equal(normalizedProblemStatus("active"), "open");
  assert.equal(isOpenProblemStatus("active"), true);
  assert.equal(isOpenProblemStatus("acknowledged"), true);
  assert.equal(isOpenProblemStatus("resolved"), false);
});

test("problem lifecycle allows open→acknowledged→applying→resolved path", () => {
  assert.equal(canTransitionProblem("open", "acknowledged"), true);
  assert.equal(canTransitionProblem("acknowledged", "solution_proposed"), true);
  assert.equal(canTransitionProblem("solution_proposed", "applying"), true);
  assert.equal(canTransitionProblem("applying", "cancelled"), true);
  assert.equal(canTransitionProblem("open", "cancelled"), true);
  assert.equal(canTransitionProblem("resolved", "open"), false);
});

test("simulateProblemTransition bumps revision and records lifecycle", () => {
  const created = {
    status: "open",
    revision: 0,
    ...buildProblemCreateFields({ affectedEntity: "driver", reporterId: "disp-1" })
  };
  // buildProblemCreateFields already sets status/revision — use plain open doc
  const base = { status: "open", revision: 0, lifecycle: { open: "t0" } };
  const next = simulateProblemTransition(base, "acknowledged", {
    expectedRevision: 0,
    assigneeId: "disp-1",
    actorId: "disp-1",
    at: "t1"
  });
  assert.equal(next.ok, true);
  assert.equal(next.status, "acknowledged");
  assert.equal(next.revision, 1);
  assert.equal(next.patch.lifecycle.acknowledged, "t1");
  assert.equal(simulateProblemTransition(base, "acknowledged", { expectedRevision: 1 }).code, "REVISION_CONFLICT");
  assert.equal(simulateProblemTransition({ status: "open", revision: 0 }, "resolved", { expectedRevision: 0 }).code, "INVALID_TRANSITION");
  void created;
});

test("vehicle create fields mark affectedEntity", () => {
  const fields = buildProblemCreateFields({ affectedEntity: "vehicle", reporterId: "disp-1" });
  assert.equal(fields.affectedEntity, "vehicle");
  assert.equal(fields.status, "open");
  assert.equal(fields.revision, 0);
});

test("ops activity filter includes incident and assignment audits", () => {
  assert.equal(isOpsActivityAction("operational_incident_resolved"), true);
  assert.equal(isOpsActivityAction("shift_assigned"), true);
  assert.equal(isOpsActivityAction("company_created"), false);
});

test("driver-routes wires transition, ops-activity and open status create", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(source, /\/api\/staff\/operational-incidents\/:reportId\/transition/);
  assert.match(source, /\/api\/staff\/ops-activity/);
  assert.match(source, /buildProblemCreateFields/);
  assert.match(source, /tmpl_shift_now/);
  assert.match(source, /affectedEntity/);
});

test("dashboard exposes vehicle out, acknowledge and recent activity", () => {
  const dash = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/dashboard.js"), "utf8");
  assert.match(dash, /openVehicleOperationalIncident/);
  assert.match(dash, /transitionOperationalIncident/);
  assert.match(dash, /renderOpsActivityFeed/);
  assert.match(dash, /ops-recent-activity/);
  assert.match(dash, /return "neutral"/);
});

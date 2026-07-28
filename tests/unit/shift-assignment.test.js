const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  shiftDocumentId,
  scheduleMonthFromDate,
  scheduleDayNumber,
  scheduleDocumentId,
  currentRevision,
  assertExpectedRevision,
  buildAssignedShift,
  buildScheduleDayEntry
} = require("../../server/shift-assignment");

test("canonical shift id is driverId_date", () => {
  assert.equal(shiftDocumentId("drv-1", "2026-07-24"), "drv-1_2026-07-24");
});

test("schedule helpers parse month and day", () => {
  assert.equal(scheduleMonthFromDate("2026-07-24"), "2026-07");
  assert.equal(scheduleDayNumber("2026-07-24"), 24);
  assert.equal(scheduleDayNumber("bad"), null);
});

test("schedule document ids prefer driverId key with legacy name alias", () => {
  assert.deepEqual(scheduleDocumentId("drv-1", "Alex Driver", "2026-07"), {
    canonical: "drv-1_2026-07",
    legacyName: "Alex Driver_2026-07"
  });
});

test("revision requires expectedRevision and rejects stale values", () => {
  assert.equal(currentRevision(undefined), 0);
  assert.equal(currentRevision({ revision: 3 }), 3);

  assert.equal(assertExpectedRevision(null, undefined).reason, "expected_revision_required");
  assert.equal(assertExpectedRevision(null, null).reason, "expected_revision_required");
  assert.equal(assertExpectedRevision(null, 0).ok, true);
  assert.equal(assertExpectedRevision(null, 1).ok, false);
  assert.equal(assertExpectedRevision({ revision: 2 }, 2).ok, true);
  assert.equal(assertExpectedRevision({ revision: 2 }, 1).reason, "revision_conflict");
  assert.equal(assertExpectedRevision({ revision: 2 }, 1).currentRevision, 2);
});

test("assigned shift and schedule day builders keep revision and mirror fields", () => {
  const shift = buildAssignedShift({
    data: {
      driverId: "drv-1",
      date: "2026-07-24",
      type: "morning",
      name: "310.F08",
      bus: "91103",
      routeCode: "310.F08",
      start: "04:02",
      end: "12:30"
    },
    driverName: "Alex Driver",
    staffUid: "staff-1",
    revision: 4,
    assignedAt: "ts"
  });
  assert.equal(shift.revision, 4);
  assert.equal(shift.confirmedByDriver, false);
  assert.deepEqual(buildScheduleDayEntry(shift), {
    type: "morning",
    name: "310.F08",
    bus: "91103",
    routeCode: "310.F08",
    start: "04:02",
    end: "12:30"
  });
});

test("assignment route wires revision conflict and schedule mirror", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(source, /expectedRevision/);
  assert.match(source, /REVISION_CONFLICT/);
  assert.match(source, /shiftDocumentId/);
  assert.match(source, /scheduleDocumentId/);
  assert.match(source, /buildScheduleDayEntry/);
  assert.match(source, /status\(409\)/);
  assert.match(source, /driver\.groupId \|\| driver\.lineId/);
  assert.match(source, /expectedRevision: z\.number\(\)\.int\(\)\.min\(0\)/);
});

test("client sync skips shifts and schedules writes", () => {
  const firebase = fs.readFileSync(path.join(__dirname, "../../js/core/firebase-service.js"), "utf8");
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(firebase, /item\.key === "shifts"/);
  assert.match(firebase, /item\.key === "schedules"/);
  assert.match(rules, /shifts\/\{shiftId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(rules, /schedules\/\{scheduleId\}[\s\S]*?allow write: if false/);
});

test("client monthly and daily assignment go through persistShift with expectedRevision", () => {
  const shifts = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/shifts.js"), "utf8");
  const monthly = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/monthly-plans.js"), "utf8");
  assert.match(shifts, /expectedRevision/);
  assert.match(shifts, /REVISION_CONFLICT/);
  assert.match(monthly, /persistShift/);
  assert.match(monthly, /from "\.\/shifts\.js"/);
});

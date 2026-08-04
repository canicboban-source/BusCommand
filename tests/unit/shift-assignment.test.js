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

test("assigned shift resets confirmation and binds the new revision", () => {
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
    driverGroupId: "31099",
    staffUid: "staff-1",
    revision: 4,
    assignedAt: "ts"
  });
  assert.equal(shift.revision, 4);
  assert.equal(shift.confirmationBoundRevision, 4);
  assert.equal(shift.confirmedByDriver, false);
  assert.equal(shift.confirmedAt, null);
  assert.equal(shift.shiftFingerprint, null);
  assert.deepEqual(buildScheduleDayEntry(shift), {
    type: "morning",
    name: "310.F08",
    bus: "91103",
    routeCode: "310.F08",
    start: "04:02",
    end: "12:30"
  });
});

test("two writers: second stale expectedRevision loses without overwriting", () => {
  const {
    simulateOptimisticWrite
  } = require("../../server/shift-assignment");

  const base = {
    data: {
      driverId: "drv-1",
      date: "2026-08-04",
      type: "morning",
      name: "A",
      bus: "91100",
      routeCode: "310.A",
      start: "05:00",
      end: "13:00"
    },
    driverName: "Ana",
    driverGroupId: "310",
    staffUid: "disp-1"
  };

  const first = simulateOptimisticWrite(null, 0, base);
  assert.equal(first.ok, true);
  assert.equal(first.revision, 1);
  assert.equal(first.shift.confirmedByDriver, false);

  const stale = simulateOptimisticWrite(first.shift, 0, {
    ...base,
    data: { ...base.data, name: "STALE" },
    staffUid: "disp-2"
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.code, "REVISION_CONFLICT");
  assert.equal(stale.currentRevision, 1);
  assert.equal(stale.current.name, "A");

  const fresh = simulateOptimisticWrite(first.shift, 1, {
    ...base,
    data: { ...base.data, name: "B" },
    staffUid: "disp-2"
  });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.revision, 2);
  assert.equal(fresh.shift.name, "B");
  assert.equal(fresh.shift.confirmationBoundRevision, 2);
});

test("confirmation is valid only for the bound revision", () => {
  const {
    assertConfirmationMatchesRevision
  } = require("../../server/shift-assignment");

  const confirmed = {
    revision: 3,
    confirmationBoundRevision: 3,
    confirmedByDriver: true
  };
  assert.equal(assertConfirmationMatchesRevision(confirmed, 3).ok, true);
  assert.equal(assertConfirmationMatchesRevision(confirmed, 2).ok, false);
  assert.equal(
    assertConfirmationMatchesRevision({ ...confirmed, revision: 4 }, 3).reason,
    "confirmation_revision_mismatch"
  );
  assert.equal(assertConfirmationMatchesRevision({ revision: 1, confirmedByDriver: false }, 1).ok, false);
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
  assert.match(source, /groupId: driverGroupId/);
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
  const plan = fs.readFileSync(path.join(__dirname, "../../js/core/shift-plan.js"), "utf8");
  const policy = fs.readFileSync(path.join(__dirname, "../../server/driver-work-policy.js"), "utf8");
  assert.match(shifts, /expectedRevision/);
  assert.match(shifts, /REVISION_CONFLICT/);
  assert.match(shifts, /applyServerShiftConflict/);
  assert.match(shifts, /result\.conflict/);
  assert.match(monthly, /persistShift/);
  assert.match(monthly, /from "\.\/shifts\.js"/);
  assert.match(plan, /source: "shift"/);
  assert.match(plan, /source: "schedule_mirror"/);
  assert.match(policy, /source: "shift"/);
  assert.match(policy, /source: "schedule_mirror"/);
  assert.doesNotMatch(policy, /source: "override"/);
});

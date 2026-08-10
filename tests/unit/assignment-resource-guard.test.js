const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateBusResource,
  findOverlappingBusAssignments,
  evaluateDutyAgainstCatalog,
  timeRangesOverlap,
  assignmentResourceErrorMessage
} = require("../../server/assignment-resource-guard");

test("bus missing / inactive / not ready / outside pool", () => {
  assert.equal(evaluateBusResource({
    bus: null, busNumber: "91504", groupId: "310"
  }).code, "BUS_NOT_FOUND");
  assert.equal(evaluateBusResource({
    bus: { number: "91504", active: false, groupIds: ["310"] },
    busNumber: "91504",
    groupId: "310"
  }).code, "BUS_INACTIVE");
  assert.equal(evaluateBusResource({
    bus: { number: "91504", active: true, opsStatus: "breakdown", groupIds: ["310"] },
    busNumber: "91504",
    groupId: "310"
  }).code, "BUS_NOT_AVAILABLE");
  assert.equal(evaluateBusResource({
    bus: { number: "91504", active: true, opsStatus: "ready", groupIds: ["320"] },
    busNumber: "91504",
    groupId: "310"
  }).code, "BUS_OUTSIDE_GROUP");
});

test("keep-current allows non-ready bus already on this shift", () => {
  const result = evaluateBusResource({
    bus: { number: "91504", active: true, opsStatus: "technical", groupIds: ["310"] },
    busNumber: "91504",
    groupId: "310",
    existingBusNumber: "91504"
  });
  assert.equal(result.ok, true);
  assert.equal(result.keepCurrent, true);
});

test("ready bus in pool passes", () => {
  const result = evaluateBusResource({
    bus: { number: "91504", active: true, opsStatus: "ready", groupIds: ["310", "320"] },
    busNumber: "91504",
    groupId: "320"
  });
  assert.equal(result.ok, true);
});

test("overlapping bus assignments hard-fail same and cross group", () => {
  const shifts = [
    {
      id: "a",
      driverId: "d1",
      driverName: "Ana",
      date: "2026-08-02",
      type: "morning",
      bus: "91504",
      groupId: "310",
      start: "06:00",
      end: "14:00"
    }
  ];
  const sameGroup = findOverlappingBusAssignments(shifts, {
    bus: "91504",
    date: "2026-08-02",
    excludeDriverId: "d2",
    start: "06:30",
    end: "14:30"
  });
  assert.equal(sameGroup.length, 1);
  assert.equal(timeRangesOverlap("06:00", "10:00", "11:00", "15:00"), false);
  const noOverlap = findOverlappingBusAssignments(shifts, {
    bus: "91504",
    date: "2026-08-02",
    excludeDriverId: "d2",
    start: "15:00",
    end: "22:00"
  });
  assert.equal(noOverlap.length, 0);
});

test("duty catalog codes and time mismatch", () => {
  const dutiesByCode = new Map([
    ["101.S01", { code: "101.S01", start: "05:00", end: "13:00" }],
    ["101.S01".toUpperCase(), { code: "101.S01", start: "05:00", end: "13:00" }]
  ]);
  assert.equal(evaluateDutyAgainstCatalog({
    type: "morning",
    dutyCode: "UNKNOWN",
    dutiesByCode
  }).code, "DUTY_NOT_IN_ACTIVE_CATALOG");
  assert.equal(evaluateDutyAgainstCatalog({
    type: "morning",
    dutyCode: "101.S01",
    start: "06:00",
    end: "13:00",
    dutiesByCode
  }).code, "DUTY_TIME_MISMATCH");
  const ok = evaluateDutyAgainstCatalog({
    type: "morning",
    dutyCode: "101.S01",
    dutiesByCode
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.start, "05:00");
  assert.equal(evaluateDutyAgainstCatalog({
    type: "morning",
    dutyCode: "101.S01",
    dutiesByCode: new Map()
  }).code, "DUTY_CATALOG_MISSING");
});

test("stable error messages for assignment resource codes", () => {
  assert.match(assignmentResourceErrorMessage("BUS_DOUBLE_BOOKED"), /Autobus/i);
  assert.match(assignmentResourceErrorMessage("REVISION_CONFLICT"), /Dodela/i);
});

import test from "node:test";
import assert from "node:assert/strict";
import { detectDailyPlanCoverageGaps } from "../../js/dispatcher/daily-plan-coverage.js";

const date = "2026-07-30";

test("finds an unassigned published duty and uncovered standby", () => {
  const gaps = detectDailyPlanCoverageGaps({
    date,
    isWeekday: true,
    servicePlanActive: true,
    catalogEntries: {
      A: { code: "A", type: "service", dayType: "weekday", start: "06:00", end: "14:00" }
    },
    slots: []
  });
  assert.deepEqual(gaps.map(gap => gap.kind), ["missing_driver", "uncovered_standby"]);
});

test("ten red missing duties are ten health issues, never a healthy plan", () => {
  const catalogEntries = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => {
      const code = `D${index + 1}`;
      return [code, { code, type: "service", dayType: "weekend", start: "06:00", end: "14:00" }];
    })
  );
  const gaps = detectDailyPlanCoverageGaps({
    date,
    isWeekday: false,
    servicePlanActive: true,
    catalogEntries,
    slots: []
  });
  assert.equal(gaps.length, 10);
  assert.ok(gaps.every(gap => gap.kind === "missing_driver" && gap.severity === "high"));
});

test("finds missing vehicles and overlapping duplicate vehicle assignments", () => {
  const shifts = new Map([
    ["d1", { type: "morning", start: "06:00", end: "14:00", bus: "12" }],
    ["d2", { type: "morning", start: "08:00", end: "16:00", bus: "12" }],
    ["d3", { type: "morning", start: "07:00", end: "15:00", bus: "" }]
  ]);
  const gaps = detectDailyPlanCoverageGaps({
    date,
    isWeekday: false,
    slots: [
      { code: "A", driverId: "d1", start: "06:00", end: "14:00" },
      { code: "B", driverId: "d2", start: "08:00", end: "16:00" },
      { code: "C", driverId: "d3", start: "07:00", end: "15:00" }
    ],
    getShift: driverId => shifts.get(driverId)
  });
  assert.equal(gaps.filter(gap => gap.kind === "duplicate_bus").length, 1);
  assert.equal(gaps.filter(gap => gap.kind === "missing_bus").length, 1);
});

test("marks a driver removed by absence or non-working shift", () => {
  const gaps = detectDailyPlanCoverageGaps({
    date,
    isWeekday: false,
    slots: [{ code: "A", driverId: "d1", driverName: "Ana" }],
    getShift: () => ({ type: "vacation" })
  });
  assert.equal(gaps[0].kind, "driver_unavailable");
});

test("marks an assigned working driver unavailable during approved leave", () => {
  const gaps = detectDailyPlanCoverageGaps({
    date,
    isWeekday: false,
    slots: [{ code: "A", driverId: "d1", driverName: "Ana" }],
    vacations: [{ driverId: "d1", status: "approved", start: date, end: date }],
    getShift: () => ({ type: "morning", bus: "12", start: "06:00", end: "14:00" })
  });
  assert.equal(gaps[0].kind, "driver_unavailable");
});

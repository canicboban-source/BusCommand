import test from "node:test";
import assert from "node:assert/strict";
import {
  findCrossGroupBusConflicts,
  formatCrossGroupBusWarn,
  timeRangesOverlap
} from "../../js/core/bus-shift-conflicts.js";

const drivers = [
  { id: "d310", name: "Ana 310", groupId: "310" },
  { id: "d320", name: "Marko 320", groupId: "320" }
];

test("same group active bus is not a cross-group conflict", () => {
  const hits = findCrossGroupBusConflicts(
    [{ driverId: "d310", driverName: "Ana 310", date: "2026-08-02", type: "morning", bus: "91504", groupId: "310", start: "06:00", end: "14:00" }],
    { bus: "91504", date: "2026-08-02", groupId: "310", excludeDriverId: "d310b", drivers }
  );
  assert.equal(hits.length, 0);
});

test("other group active bus same day warns", () => {
  const hits = findCrossGroupBusConflicts(
    [{ driverId: "d310", driverName: "Ana 310", date: "2026-08-02", type: "morning", bus: "91504", start: "06:00", end: "14:00" }],
    { bus: "91504", date: "2026-08-02", groupId: "320", excludeDriverId: "d320", start: "06:30", end: "14:30", drivers }
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].groupId, "310");
  assert.equal(hits[0].driverName, "Ana 310");
});

test("off vacation sick clear do not warn", () => {
  for (const type of ["off", "vacation", "sick", "clear"]) {
    const hits = findCrossGroupBusConflicts(
      [{ driverId: "d310", driverName: "Ana 310", date: "2026-08-02", type, bus: "91504", groupId: "310" }],
      { bus: "91504", date: "2026-08-02", groupId: "320", drivers }
    );
    assert.equal(hits.length, 0, type);
  }
});

test("non-overlapping times do not warn; missing times do", () => {
  assert.equal(timeRangesOverlap("06:00", "10:00", "11:00", "15:00"), false);
  assert.equal(timeRangesOverlap("22:00", "06:00", "05:00", "09:00"), true);
  const noOverlap = findCrossGroupBusConflicts(
    [{ driverId: "d310", driverName: "Ana 310", date: "2026-08-02", type: "morning", bus: "91504", groupId: "310", start: "06:00", end: "10:00" }],
    { bus: "91504", date: "2026-08-02", groupId: "320", start: "11:00", end: "15:00", drivers }
  );
  assert.equal(noOverlap.length, 0);
  const missingTimes = findCrossGroupBusConflicts(
    [{ driverId: "d310", driverName: "Ana 310", date: "2026-08-02", type: "morning", bus: "91504", groupId: "310" }],
    { bus: "91504", date: "2026-08-02", groupId: "320", drivers }
  );
  assert.equal(missingTimes.length, 1);
});

test("formatCrossGroupBusWarn fills placeholders", () => {
  const msg = formatCrossGroupBusWarn(
    [{ bus: "91504", groupId: "310", driverName: "Ana" }],
    (key) => (key === "ops_bus_cross_group_warn" ? "Bus {bus} / {group} / {driver}" : key)
  );
  assert.equal(msg, "Bus 91504 / 310 / Ana");
});

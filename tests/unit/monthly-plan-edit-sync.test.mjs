import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = globalThis.window || {
  location: { hostname: "localhost", protocol: "http:", href: "http://localhost/" },
  state: {},
  currentUser: { role: "dispatcher", companyId: "demo" },
  TRANSLATIONS: { en: {}, de: {}, sr: {} }
};

const { resolveScheduleForDriverMonth } = await import("../../js/dispatcher/monthly-plans.js");

test("resolveSchedule prefers driverId month key over empty name shell", () => {
  window.state = {
    drivers: [{ id: "drv-petar", name: "Petar Popović", groupId: "320" }],
    schedules: [
      {
        id: "Petar Popović_2026-08",
        driverName: "Petar Popović",
        month: "2026-08",
        parsedShifts: {
          12: { type: "off", name: "Frei" }
        }
      },
      {
        id: "drv-petar_2026-08",
        driverId: "drv-petar",
        driverName: "Petar Popović",
        month: "2026-08",
        parsedShifts: {
          12: { type: "morning", name: "320", routeCode: "320", bus: "" }
        }
      }
    ],
    shifts: []
  };

  const schedule = resolveScheduleForDriverMonth("Petar Popović", "2026-08", "drv-petar");
  assert.equal(schedule.id, "drv-petar_2026-08");
  assert.equal(schedule.parsedShifts[12].routeCode, "320");
});

test("resolveSchedule falls back to name key when id key missing", () => {
  window.state = {
    drivers: [{ id: "drv-1", name: "Ana", groupId: "101" }],
    schedules: [
      {
        id: "Ana_2026-08",
        driverName: "Ana",
        month: "2026-08",
        parsedShifts: { 1: { type: "morning", routeCode: "101.S01" } }
      }
    ],
    shifts: []
  };
  const schedule = resolveScheduleForDriverMonth("Ana", "2026-08", "drv-1");
  assert.equal(schedule.id, "Ana_2026-08");
  assert.equal(schedule.parsedShifts[1].routeCode, "101.S01");
});

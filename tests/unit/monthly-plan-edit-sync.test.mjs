import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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

const monthlyPlansSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../../js/dispatcher/monthly-plans.js"),
  "utf8"
);

function deleteMonthlyPlanSource() {
  const start = monthlyPlansSrc.indexOf("async function deleteMonthlyPlan");
  const end = monthlyPlansSrc.indexOf("\nfunction updateMonthlyPlanDay");
  assert.ok(start >= 0 && end > start, "deleteMonthlyPlan source window");
  return monthlyPlansSrc.slice(start, end);
}

test("WIDE-26 deleteMonthlyPlan persists clear via server for every duty day", () => {
  const fn = deleteMonthlyPlanSource();
  assert.doesNotMatch(fn, /existing\.source\s*===\s*["']shift["']/);
  assert.match(fn, /await persistShift\(driver, dateStr, "clear"\)/);
  assert.doesNotMatch(fn, /setShiftForDriverDate/);
  assert.match(fn, /if\s*\(!driver\?\.id\)/);
  const failIdx = fn.indexOf("if (fail)");
  const doneIdx = fn.indexOf("dispo_delete_month_plan_done");
  const filterIdx = fn.indexOf(".filter((s) => s.id !== key");
  assert.ok(failIdx >= 0 && doneIdx > failIdx, "success toast only after persist failures abort");
  assert.ok(filterIdx > failIdx, "local schedule drop only after persist failures abort");
});

test("WIDE-26 getShiftForDriverDate still classifies schedule-only cells as mirror", async () => {
  const { getShiftForDriverDate } = await import("../../js/core/shift-plan.js");
  window.state = {
    drivers: [{ id: "drv-1", name: "Ana" }],
    shifts: [],
    schedules: [
      {
        id: "drv-1_2026-08",
        driverId: "drv-1",
        driverName: "Ana",
        month: "2026-08",
        parsedShifts: { 3: { type: "morning", name: "101.S01" } }
      }
    ]
  };
  const cell = getShiftForDriverDate("Ana", "2026-08-03");
  assert.equal(cell.source, "schedule_mirror");
  assert.equal(cell.type, "morning");
  assert.equal(cell.revision, 0);
});

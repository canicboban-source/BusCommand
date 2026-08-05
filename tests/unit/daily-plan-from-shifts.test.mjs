import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  location: { hostname: "localhost", search: "", pathname: "/" },
  state: {},
  currentUser: null
};

const { getDailyPlanForDate } = await import("../../js/core/shift-plan.js");

function seedState() {
  window.state = {
    activeGroupHubId: "320",
    drivers: [
      { id: "d1", name: "Marko Petrović", groupId: "320", companyId: "bc-test", active: true },
      { id: "d2", name: "Nikola Jovanović", groupId: "320", companyId: "bc-test", active: true },
      { id: "d3", name: "Other Line", groupId: "310", companyId: "bc-test", active: true }
    ],
    groups: [
      { id: "320", name: "Leobersdorf" },
      { id: "310", name: "Linie 310" }
    ],
    shiftCatalog: { entries: {} },
    shifts: [
      {
        id: "d1_2026-08-05",
        driverId: "d1",
        driverName: "Marko Petrović",
        date: "2026-08-05",
        groupId: "320",
        type: "morning",
        name: "320.S01",
        routeCode: "320.S01",
        start: "04:02",
        end: "14:35"
      },
      {
        id: "d2_2026-08-05",
        driverId: "d2",
        driverName: "Nikola Jovanović",
        date: "2026-08-05",
        groupId: "320",
        type: "morning",
        name: "320.F01",
        routeCode: "320.F01",
        start: "04:03",
        end: "14:35"
      },
      {
        id: "d3_2026-08-05",
        driverId: "d3",
        driverName: "Other Line",
        date: "2026-08-05",
        groupId: "310",
        type: "morning",
        name: "310.S01",
        routeCode: "310.S01",
        start: "05:00",
        end: "13:00"
      }
    ],
    schedules: []
  };
  window.currentUser = {
    id: "disp-1",
    role: "dispatcher",
    companyId: "bc-test",
    activeGroupId: "320",
    groups: ["310", "320"]
  };
}

test("daily plan builds selected drivers from group shifts after monthly import", () => {
  seedState();
  const plan = getDailyPlanForDate("2026-08-05");
  assert.equal(plan.slots.length, 2);
  const byCode = Object.fromEntries(plan.slots.map(slot => [slot.code, slot]));
  assert.equal(byCode["320.S01"].driverName, "Marko Petrović");
  assert.equal(byCode["320.S01"].driverId, "d1");
  assert.equal(byCode["320.F01"].driverName, "Nikola Jovanović");
  assert.equal(byCode["320.F01"].driverId, "d2");
  assert.equal(plan.slots.some(slot => slot.code === "310.S01"), false);
});

test("daily plan resolves driver name from driverId when name is missing", () => {
  seedState();
  window.state.shifts = [{
    id: "anon",
    driverId: "d1",
    driverName: "",
    date: "2026-08-05",
    groupId: "320",
    type: "morning",
    routeCode: "320.S01",
    start: "04:02",
    end: "14:35"
  }];
  const plan = getDailyPlanForDate("2026-08-05");
  assert.equal(plan.slots.length, 1);
  assert.equal(plan.slots[0].driverName, "Marko Petrović");
  assert.equal(plan.slots[0].driverId, "d1");
});

test("daily plan builds display name from firstName/lastName when name is empty", () => {
  seedState();
  window.state.drivers = [{
    id: "d1",
    name: "",
    firstName: "Marko",
    lastName: "Petrović",
    groupId: "320",
    companyId: "bc-test",
    active: true
  }];
  window.state.shifts = [{
    id: "anon",
    driverId: "d1",
    driverName: "",
    date: "2026-08-05",
    groupId: "320",
    type: "morning",
    routeCode: "320.S01",
    start: "04:02",
    end: "14:35"
  }];
  const plan = getDailyPlanForDate("2026-08-05");
  assert.equal(plan.slots.length, 1);
  assert.equal(plan.slots[0].driverName, "Marko Petrović");
});

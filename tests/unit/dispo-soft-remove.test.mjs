import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  location: { hostname: "localhost", search: "", pathname: "/" },
  state: {},
  currentUser: null
};

const {
  busHasGroup,
  withDetachedGroup,
  normalizeGroupIds
} = await import("../../js/data/bus-group-membership.js");
const { busIsAssignable } = await import("../../js/data/bus-ops.js");
const {
  clearDriverLineMembership,
  driverBelongsToLine,
  getDriversForLineGroup,
  lineDetachGroupIds
} = await import("../../js/data/group-membership.js");
const { getVisibleDrivers } = await import("../../js/core/utils.js");
const {
  dispoDriverIncidentReasonOptions,
  dispoBusIncidentReasonOptions,
  recordDemoChangeReason
} = await import("../../js/dispatcher/change-reason.js");

function seedDispatcherLine() {
  globalThis.window.state = {
    drivers: [
      { id: "d1", name: "Marko", groupId: "101", lineId: "101", companyId: "demo", active: true },
      { id: "d2", name: "Ana", groupId: "101", lineId: "101", companyId: "demo", active: true }
    ],
    groups: [
      { id: "101", name: "Line 101", companyId: "demo" },
      { id: "grp-g1", name: "G1", lineId: "101", companyId: "demo" }
    ],
    buses: [
      {
        id: "b1",
        number: "91103",
        groupId: "101",
        lineId: "101",
        groupIds: ["101"],
        active: true,
        opsStatus: "active"
      }
    ],
    dispatchers: [{ id: "disp-1", groups: ["101"], companyId: "demo" }]
  };
  globalThis.window.currentUser = {
    id: "disp-1",
    role: "dispatcher",
    companyId: "demo",
    groups: ["101"],
    activeGroupId: "101"
  };
}

test("withDetachedGroup removes line membership and keeps company bus", () => {
  const bus = {
    id: "b1",
    number: "91103",
    groupId: "101",
    lineId: "101",
    groupIds: ["101", "320"],
    active: true,
    opsStatus: "active"
  };
  const next = withDetachedGroup(bus, "101");
  assert.equal(busHasGroup(next, "101"), false);
  assert.equal(busHasGroup(next, "320"), true);
  assert.deepEqual(normalizeGroupIds(next), ["320"]);
  assert.equal(next.active, true);
});

test("inactive bus is not assignable", () => {
  assert.equal(busIsAssignable({ active: false, opsStatus: "active" }), false);
  assert.equal(busIsAssignable({ active: true, opsStatus: "active" }), true);
});

test("clearDriverLineMembership removes line visibility for dispatcher", () => {
  seedDispatcherLine();
  const before = getVisibleDrivers().map((d) => d.id).sort();
  assert.deepEqual(before, ["d1", "d2"]);

  const marko = window.state.drivers.find((d) => d.id === "d1");
  clearDriverLineMembership(marko);
  assert.equal(driverBelongsToLine(marko, "101"), false);
  assert.equal(getDriversForLineGroup("101").some((d) => d.id === "d1"), false);

  const after = getVisibleDrivers().map((d) => d.id).sort();
  assert.deepEqual(after, ["d2"]);
  assert.equal(window.state.drivers.some((d) => d.id === "d1" && d.active === true), true);
});

test("lineDetachGroupIds includes subgroups", () => {
  seedDispatcherLine();
  const ids = [...lineDetachGroupIds("101")].sort();
  assert.deepEqual(ids, ["101", "grp-g1"]);
});

test("incident reason lists include sick and ac_climate", () => {
  globalThis.window.TRANSLATIONS = {
    en: {
      dispo_inc_driver_sick: "Sick leave",
      dispo_inc_bus_ac_climate: "AC / comfort"
    }
  };
  globalThis.window.state = { language: "en", opsChangeLog: [] };
  const driverReasons = dispoDriverIncidentReasonOptions().map((r) => r.value);
  const busReasons = dispoBusIncidentReasonOptions().map((r) => r.value);
  assert.ok(driverReasons.includes("sick"));
  assert.ok(busReasons.includes("ac_climate"));
  recordDemoChangeReason({ type: "driver_incident_opened", reason: "sick" });
  assert.equal(window.state.opsChangeLog[0].reason, "sick");
  assert.ok(window.state.opsChangeLog[0].at);
});

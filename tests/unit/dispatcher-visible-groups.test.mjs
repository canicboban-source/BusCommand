import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  location: { hostname: "localhost", search: "", pathname: "/" },
  state: {},
  currentUser: null
};

const { getVisibleDrivers, getVisibleGroups } = await import("../../js/core/utils.js");

function seedStaleDispatcherDoc() {
  globalThis.window.state = {
    drivers: [
      { id: "a", name: "A", groupId: "320", companyId: "bc-test" },
      { id: "b", name: "B", groupId: "310", companyId: "bc-test" },
      { id: "c", name: "C", groupId: "999", companyId: "bc-test" }
    ],
    groups: [
      { id: "320", name: "Leobersdorf" },
      { id: "310", name: "Linie 310" },
      { id: "999", name: "Other" }
    ],
    dispatchers: [
      // Stale doc still only lists 310 while claims already include 320.
      { id: "disp-1", groups: ["310"], companyId: "bc-test" }
    ]
  };
  globalThis.window.currentUser = {
    id: "disp-1",
    role: "dispatcher",
    companyId: "bc-test",
    groups: ["310", "320"],
    activeGroupId: "320"
  };
}

test("dispatcher visibility merges claim groups with Firestore dispatcher doc", () => {
  seedStaleDispatcherDoc();
  const visible = getVisibleDrivers().map(driver => driver.id).sort();
  assert.deepEqual(visible, ["a", "b"]);
});

test("dispatcher group list also merges claim groups with stale Firestore doc", () => {
  seedStaleDispatcherDoc();
  const visible = getVisibleGroups().map(group => group.id).sort();
  assert.deepEqual(visible, ["310", "320"]);
});

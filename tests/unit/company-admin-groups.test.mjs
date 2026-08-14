import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCompanyGroups,
  getCompanyGroupDependencies,
  getCompanyGroupsScope,
  groupReadiness,
  safeGroupColor,
  validateCompanyGroupDraft
} from "../../js/admin/company-admin-groups-model.js";

function stateFixture() {
  return {
    groups: [
      { id: "310", name: "Line 310", companyId: "alpha" },
      { id: "105", name: "Line 105", companyId: "alpha" },
      { id: "999", name: "Foreign", companyId: "beta" },
      { id: "777", name: "Legacy unscoped" }
    ],
    drivers: [{ id: "d1", groupId: "310", companyId: "alpha" }, { id: "foreign", groupId: "310", companyId: "beta" }],
    buses: [{ id: "b1", lineId: "310", companyId: "alpha" }],
    dispatchers: [{ id: "u1", groups: ["310"], companyId: "alpha" }],
    servicePlans: [{ id: "p1", groupId: "310", status: "active", companyId: "alpha" }],
    shifts: [], schedules: [], routes: []
  };
}

test("production group scope fails closed for foreign and unscoped records", () => {
  const scope = getCompanyGroupsScope(stateFixture(), { companyId: "alpha" }, false);
  assert.deepEqual(scope.groups.map(group => group.id).sort(), ["105", "310"]);
  assert.equal(scope.drivers.length, 1);
});

test("legacy unscoped groups are accepted only in explicit demo mode", () => {
  const scope = getCompanyGroupsScope(stateFixture(), { companyId: "alpha" }, true);
  assert.deepEqual(scope.groups.map(group => group.id).sort(), ["105", "310", "777"]);
});

test("dependencies block destructive deletion and drive truthful readiness", () => {
  const scope = getCompanyGroupsScope(stateFixture(), { companyId: "alpha" }, false);
  const used = getCompanyGroupDependencies("310", scope);
  assert.deepEqual(used.references.sort(), ["buses", "dispatchers", "drivers", "plans"]);
  assert.equal(used.canDelete, false);
  assert.equal(groupReadiness(used).ready, true);
  const empty = getCompanyGroupDependencies("105", scope);
  assert.equal(empty.canDelete, true);
  assert.equal(groupReadiness(empty).ready, false);
});

test("group draft enforces immutable numeric ID and bounded metadata", () => {
  assert.equal(validateCompanyGroupDraft({ id: "310", name: " Line 310 ", color: "#10b981", description: " North " }).valid, true);
  assert.equal(validateCompanyGroupDraft({ id: "north", name: "X", color: "red", description: "x".repeat(201) }).valid, false);
  assert.equal(safeGroupColor("url(javascript:alert(1))"), "#0EA5E9");
});

test("group search and readiness filter are deterministic and naturally sorted", () => {
  const scope = getCompanyGroupsScope(stateFixture(), { companyId: "alpha" }, false);
  assert.deepEqual(filterCompanyGroups(scope.groups, "line", "all", scope).map(group => group.id), ["105", "310"]);
  assert.deepEqual(filterCompanyGroups(scope.groups, "", "ready", scope).map(group => group.id), ["310"]);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatcherReadiness,
  filterCompanyDispatchers,
  getCompanyTeamScope,
  normalizeDispatcherGroups,
  validateCompanyDispatcherDraft
} from "../../js/admin/company-admin-team-model.js";

const groups = [
  { id: "310", name: "Line 310", companyId: "alpha" },
  { id: "105", name: "Line 105", companyId: "alpha" }
];

test("production team scope rejects foreign and unscoped records", () => {
  const state = {
    groups: [...groups, { id: "999", companyId: "beta" }, { id: "777" }],
    dispatchers: [
      { id: "a", name: "Alpha", companyId: "alpha" },
      { id: "b", name: "Beta", companyId: "beta" },
      { id: "legacy", name: "Legacy" },
      { id: "superadmin", isSuperAdmin: true, companyId: "alpha" }
    ]
  };
  const production = getCompanyTeamScope(state, { companyId: "alpha" }, false);
  assert.deepEqual(production.dispatchers.map(item => item.id), ["a"]);
  assert.deepEqual(production.groups.map(item => item.id).sort(), ["105", "310"]);
  const demo = getCompanyTeamScope(state, { companyId: "alpha" }, true);
  assert.deepEqual(demo.dispatchers.map(item => item.id).sort(), ["a", "legacy"]);
});

test("dispatcher draft requires strong bounded fields and at least one allowed group", () => {
  const valid = validateCompanyDispatcherDraft({
    name: " Ana Dispatcher ", email: "ANA@EXAMPLE.TEST", password: "safe-password-123", groups: ["310", "999", "310"]
  }, groups);
  assert.equal(valid.valid, true);
  assert.equal(valid.value.email, "ana@example.test");
  assert.deepEqual(valid.value.groups, ["310"]);
  assert.equal(validateCompanyDispatcherDraft({
    name: "Ana Dispatcher", email: "ana@example.test", password: "abc123", groups: ["310"]
  }, groups).valid, true);

  const invalid = validateCompanyDispatcherDraft({
    name: "A", email: "not-an-email", password: "short", groups: ["999"]
  }, groups);
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["email", "groups", "name", "password"]);
});

test("group normalization, readiness and filtering are deterministic", () => {
  assert.deepEqual(normalizeDispatcherGroups(["310", "105", "310", "foreign"], groups), ["105", "310"]);
  assert.equal(dispatcherReadiness({ active: true, groups: ["310"] }, groups).ready, true);
  assert.equal(dispatcherReadiness({ active: false, groups: ["310"] }, groups).ready, false);
  const dispatchers = [
    { id: "2", name: "Zed", email: "zed@example.test", active: false },
    { id: "1", name: "Ana", email: "ana@example.test", active: true }
  ];
  assert.deepEqual(filterCompanyDispatchers(dispatchers, "example", "active").map(item => item.id), ["1"]);
  assert.deepEqual(filterCompanyDispatchers(dispatchers, "", "all").map(item => item.id), ["1", "2"]);
});

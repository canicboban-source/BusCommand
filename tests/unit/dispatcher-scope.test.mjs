import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";
import {
  normalizeGroupIds,
  resolveDispatcherGroupIds,
  filterAssignedGroups
} from "../../js/core/dispatcher-scope.js";

test("cold load uses own profile groups when claims omit groups", () => {
  const assigned = resolveDispatcherGroupIds({ profileExists: true, profileGroups: ["310"], claimGroups: [] });
  const visible = filterAssignedGroups([
    { id: "310", name: "LEO", companyId: "buscommand-preview-test" },
    { id: "311", name: "Hidden", companyId: "buscommand-preview-test" },
    { id: "310", name: "Other tenant", companyId: "other-company" }
  ], assigned, "buscommand-preview-test");
  assert.deepEqual(visible, [{ id: "310", name: "LEO", companyId: "buscommand-preview-test" }]);
});

test("hard refresh deterministically restores the same assigned group", () => {
  const load = () => filterAssignedGroups(
    [{ id: "310", name: "LEO", companyId: "alpha" }],
    resolveDispatcherGroupIds({ profileExists: true, profileGroups: ["310"], claimGroups: [] }),
    "alpha"
  );
  assert.deepEqual(load(), load());
});

test("existing profile is authoritative over stale claims", () => {
  assert.deepEqual(resolveDispatcherGroupIds({
    profileExists: true, profileGroups: [], claimGroups: ["old-group"]
  }), []);
});

test("group IDs are trimmed, unique and stable", () => {
  assert.deepEqual(normalizeGroupIds([" 311 ", "310", "310", ""]), ["310", "311"]);
});

test("dispatcher create-group control remains unavailable", () => {
  const html = fs.readFileSync(new URL("../../staff.html", import.meta.url), "utf8");
  const setupBlock = html.match(/<div id="group-setup-create-block"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || "";
  assert.match(setupBlock, /display:none/);
  const source = fs.readFileSync(new URL("../../js/admin/dispatcher-setup.js", import.meta.url), "utf8");
  assert.match(source, /function createDispatcherGroup\(\)[\s\S]*?if \(!IS_DEMO_MODE\)/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("CA group delete deps count buses attached only via groupIds", async () => {
  const mod = await import(pathToFileURL(path.join(root, "js/admin/company-admin-groups-model.js")).href);
  const scope = mod.getCompanyGroupsScope({
    groups: [{ id: "105", companyId: "demo" }, { id: "310", companyId: "demo" }],
    drivers: [],
    buses: [{ id: "b1", companyId: "demo", groupId: "310", groupIds: ["310", "105"] }],
    dispatchers: [],
    shifts: [],
    schedules: [],
    routes: [],
    servicePlans: []
  }, { companyId: "demo", role: "company-admin" }, true);

  const deps = mod.getCompanyGroupDependencies("105", scope);
  assert.equal(deps.counts.buses, 1);
  assert.equal(deps.canDelete, false);
  assert.ok(deps.references.includes("buses"));
});

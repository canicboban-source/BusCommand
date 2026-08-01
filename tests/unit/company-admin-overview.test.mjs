import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";

import {
  calculateGroupStats,
  getCompanyLicenseInfo,
  getCompanyScope
} from "../../js/admin/company-admin-overview-model.js";

test("Company Admin overview fails closed for foreign and unscoped production records", () => {
  const state = {
    groups: [
      { id: "310", companyId: "alpha" },
      { id: "999", companyId: "beta" },
      { id: "legacy" }
    ],
    drivers: [
      { id: "a", companyId: "alpha", groupId: "310" },
      { id: "b", companyId: "beta", groupId: "999" },
      { id: "legacy" }
    ],
    buses: [
      { id: "bus-a", companyId: "alpha", groupId: "310" },
      { id: "bus-b", companyId: "beta", groupId: "999" }
    ],
    dispatchers: [
      { id: "disp-a", companyId: "alpha", groups: ["310"], role: "dispatcher" },
      { id: "ca-a", companyId: "alpha", role: "company_admin", groups: ["310"] },
      { id: "disp-b", companyId: "beta", groups: ["999"] },
      { id: "superadmin", isSuperAdmin: true, companyId: "alpha" }
    ],
    servicePlans: [
      { id: "plan-a", groupId: "310", status: "active" },
      { id: "plan-b", groupId: "999", status: "active" }
    ]
  };

  const scope = getCompanyScope(state, { companyId: "alpha" }, false);
  assert.deepEqual(scope.groups.map(item => item.id), ["310"]);
  assert.deepEqual(scope.drivers.map(item => item.id), ["a"]);
  assert.deepEqual(scope.buses.map(item => item.id), ["bus-a"]);
  assert.deepEqual(scope.dispatchers.map(item => item.id), ["disp-a"]);
  assert.deepEqual(scope.servicePlans.map(item => item.id), ["plan-a"]);
});

test("legacy unscoped records are accepted only in explicit local demo mode", () => {
  const state = {
    groups: [{ id: "legacy" }],
    drivers: [{ id: "legacy-driver", groupId: "legacy" }],
    buses: [],
    dispatchers: [],
    servicePlans: []
  };
  assert.equal(getCompanyScope(state, { companyId: "demo" }, false).groups.length, 0);
  assert.equal(getCompanyScope(state, { companyId: "demo" }, true).groups.length, 1);
});

test("group readiness requires drivers, buses, active plan and assigned dispatcher", () => {
  const group = { id: "310", companyId: "alpha" };
  const scope = {
    groups: [group, { id: "g1", lineId: "310", companyId: "alpha" }],
    drivers: [{ id: "d1", groupId: "g1", companyId: "alpha" }],
    buses: [{ id: "b1", lineId: "310", companyId: "alpha" }],
    servicePlans: [{ id: "p1", groupId: "310", status: "active" }],
    dispatchers: [{ id: "x1", groups: ["310"], companyId: "alpha" }]
  };

  assert.deepEqual(calculateGroupStats(group, scope), {
    driverCount: 1,
    busCount: 1,
    planCount: 1,
    dispatcherCount: 1,
    missing: [],
    ready: true
  });

  const withoutPlan = calculateGroupStats(group, { ...scope, servicePlans: [] });
  assert.equal(withoutPlan.ready, false);
  assert.deepEqual(withoutPlan.missing, ["plan"]);
});

test("production license state never fabricates a trial fallback or reuses another tenant", () => {
  const stale = getCompanyLicenseInfo("alpha", {
    licenseInfo: { companyId: "beta", plan: "paid", status: "active", daysRemaining: 50 },
    state: {},
    isDemoMode: false
  });
  assert.deepEqual(stale, { plan: "unknown", status: "unknown", daysRemaining: null, available: false });

  const current = getCompanyLicenseInfo("alpha", {
    licenseInfo: { companyId: "alpha", plan: "paid", status: "active", daysRemaining: 50 },
    state: {},
    isDemoMode: false
  });
  assert.equal(current.available, true);
  assert.equal(current.plan, "paid");
});

test("overview markup exposes active plans and responsive table labels", () => {
  const index = fs.readFileSync(new URL("../../staff.html", import.meta.url), "utf8");
  const module = fs.readFileSync(new URL("../../js/admin/company-admin.js", import.meta.url), "utf8");
  assert.match(index, /id="ca-stat-plans"/);
  assert.doesNotMatch(index, /id="ca-stat-online"/);
  assert.match(module, /data-label=/);
  assert.match(module, /ca_missing_title/);
});

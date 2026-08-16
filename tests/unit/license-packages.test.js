const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeLicenseType,
  resolveLicenseSnapshot,
  maxDriversForType,
  PACKAGES
} = require("../../server/license-packages");

test("package caps match Phase 2 model", () => {
  assert.equal(PACKAGES.micro.maxDrivers, 8);
  assert.equal(PACKAGES.micro.maxDispatchers, 1);
  assert.equal(PACKAGES.micro.maxBuses, 5);
  assert.equal(PACKAGES.starter.maxDrivers, 15);
  assert.equal(PACKAGES.starter.maxDispatchers, 2);
  assert.equal(PACKAGES.pro.maxDrivers, 50);
  assert.equal(PACKAGES.pro.maxDispatchers, 5);
  assert.equal(PACKAGES.fleet_master.maxDrivers, 200);
  assert.equal(PACKAGES.fleet_master.maxDispatchers, 15);
  assert.equal(PACKAGES.enterprise.maxDrivers, null);
  assert.equal(PACKAGES.enterprise.maxDispatchers, 50);
});

test("micro package is in LICENSE_TYPES and resolves correctly", () => {
  assert.equal(normalizeLicenseType("micro"), "micro");
  assert.equal(maxDriversForType("micro"), 8);
  assert.equal(PACKAGES.micro.label, "MICRO");
});

test("legacy plan values normalize to package types", () => {
  assert.equal(normalizeLicenseType("trial"), "pro");
  assert.equal(normalizeLicenseType("standard"), "pro");
  assert.equal(normalizeLicenseType("enterprise"), "enterprise");
  assert.equal(maxDriversForType("starter"), 15);
});

test("resolveLicenseSnapshot derives trial countdown", () => {
  const inTenDays = new Date(Date.now() + 10 * 86400000).toISOString();
  const snap = resolveLicenseSnapshot({
    licenseType: "pro",
    licenseStatus: "trial",
    status: "active",
    trialValidUntil: inTenDays,
    maxDrivers: 50
  });
  assert.equal(snap.licenseType, "pro");
  assert.equal(snap.licenseStatus, "trial");
  assert.equal(snap.packageLabel, "PRO");
  assert.ok(snap.daysRemaining >= 9 && snap.daysRemaining <= 10);
});

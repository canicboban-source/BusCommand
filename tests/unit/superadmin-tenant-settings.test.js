const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTenantSettingsPatch,
  sanitizeFeaturePatch,
  EDITABLE_FEATURE_KEYS
} = require("../../server/superadmin-tenant-settings");

test("tenant settings patch accepts plan limits and known flags", () => {
  const built = buildTenantSettingsPatch({
    plan: "standard",
    maxDrivers: 120,
    maxDispatchers: 8,
    trialEndsAt: "2026-09-01T00:00:00.000Z",
    features: { supportSession: true, liveGps: false, unknownFlag: true }
  });
  assert.equal(built.ok, true);
  assert.equal(built.patch.plan, "pro");
  assert.equal(built.patch.licenseType, "pro");
  assert.equal(built.patch.maxDrivers, 120);
  assert.deepEqual(built.patch.features, { supportSession: true, liveGps: false });
  assert.ok(!Object.prototype.hasOwnProperty.call(built.patch.features, "unknownFlag"));
});

test("tenant settings patch maps starter package defaults", () => {
  const built = buildTenantSettingsPatch({ plan: "starter" });
  assert.equal(built.ok, true);
  assert.equal(built.patch.licenseType, "starter");
  assert.equal(built.patch.maxDrivers, 15);
});

test("tenant settings patch rejects empty body", () => {
  const built = buildTenantSettingsPatch({});
  assert.equal(built.ok, false);
});

test("editable feature keys stay allowlisted", () => {
  assert.ok(EDITABLE_FEATURE_KEYS.includes("supportSession"));
  assert.ok(EDITABLE_FEATURE_KEYS.includes("liveGps"));
  assert.deepEqual(sanitizeFeaturePatch({ supportSession: true, foo: true }), {
    supportSession: true
  });
});

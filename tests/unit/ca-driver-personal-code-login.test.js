const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const { verifyDriverLogin, COST } = require("../../server/driver-routes");
const { companyDriverPersonalCodeBody } = require("../../server/validation");

const API_SOURCE = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");

function personalCodeHandlerSource() {
  const start = API_SOURCE.indexOf('"/api/company-admin/drivers/:driverId/personal-code"');
  assert.ok(start > -1, "personal-code route missing");
  const end = API_SOURCE.indexOf('"/api/company-admin/drivers/:driverId"', start + 10);
  return API_SOURCE.slice(start, end > start ? end : start + 3500);
}

test("CA personal-code validation requires 5–12 digit login PIN", () => {
  assert.equal(companyDriverPersonalCodeBody.safeParse({
    companyId: "qa-test",
    companyCode: "13579"
  }).success, true);
  assert.equal(companyDriverPersonalCodeBody.safeParse({
    companyId: "qa-test",
    companyCode: "12"
  }).success, false);
  assert.equal(companyDriverPersonalCodeBody.safeParse({
    companyId: "qa-test",
    companyCode: "abcd12"
  }).success, false);
});

test("CA personal-code route writes loginCodeHash and activates the driver account", () => {
  const handler = personalCodeHandlerSource();
  assert.match(handler, /loginCodeHash/);
  assert.match(handler, /codeActivated:\s*true/);
  assert.match(handler, /activationCodeHash:\s*admin\.firestore\.FieldValue\.delete\(\)/);
  assert.match(handler, /revokeRefreshTokens\(driverId\)/);
  assert.match(handler, /driver_personal_code_set/);
  // Must not only update the legacy companyCodeHash field used by import uniqueness.
  assert.doesNotMatch(handler, /credentialRef\.update\(\{\s*companyCodeHash/);
});

test("after CA sets PIN, verifyDriverLogin accepts that PIN without OTP", async () => {
  const pin = "13579";
  const loginCodeHash = await bcrypt.hash(pin, COST);
  const profile = { active: true, codeActivated: true };
  const credentials = {
    loginCodeHash,
    activationCodeHash: undefined,
    activationUsedAt: new Date().toISOString()
  };
  assert.equal(await verifyDriverLogin(profile, credentials, pin), true);
  assert.equal(await verifyDriverLogin(profile, credentials, "000000"), false);
  // Pre-fix bug state: codeActivated false + only companyCodeHash → PIN login fails.
  const broken = {
    companyCodeHash: await bcrypt.hash(pin, COST),
    activationCodeHash: await bcrypt.hash("482913", COST),
    activationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    activationUsedAt: null
  };
  assert.equal(await verifyDriverLogin({ active: true, codeActivated: false }, broken, pin), false);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcrypt");
const { verifyDriverLogin, COST } = require("../../server/driver-routes");

const API_SOURCE = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");

function personalCodeHandlerSource() {
  const start = API_SOURCE.indexOf('"/api/company-admin/drivers/:driverId/personal-code"');
  assert.ok(start > -1, "personal-code route missing");
  const end = API_SOURCE.indexOf('"/api/company-admin/drivers/:driverId"', start + 10);
  return API_SOURCE.slice(start, end > start ? end : start + 2000);
}

test("CA personal-code route is a fail-closed 410 and never writes credentials", () => {
  const handler = personalCodeHandlerSource();
  assert.match(handler, /DIRECT_PIN_SET_REMOVED/);
  assert.match(handler, /status\(410\)/);
  assert.doesNotMatch(handler, /loginCodeHash/);
  assert.doesNotMatch(handler, /bcrypt\.hash/);
  assert.doesNotMatch(handler, /companyCode/);
  assert.doesNotMatch(handler, /validateBody/);
  assert.doesNotMatch(handler, /req\.body/);
  assert.doesNotMatch(handler, /logAudit|_logAuditEvent/);
  assert.doesNotMatch(handler, /profileRef|credentialRef/);
});

test("after driver activation, verifyDriverLogin accepts the personal PIN without OTP", async () => {
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
  const pending = {
    activationCodeHash: await bcrypt.hash("482913", COST),
    activationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    activationUsedAt: null
  };
  assert.equal(await verifyDriverLogin({ active: true, codeActivated: false }, pending, pin), false);
  assert.equal(await verifyDriverLogin({ active: true, codeActivated: false }, pending, "482913"), true);
});

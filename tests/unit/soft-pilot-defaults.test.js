const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../..");

test("soft-pilot bootstrap defaults keep supportSession and scheduler OFF", () => {
  const src = fs.readFileSync(path.join(root, "scripts/bootstrap-preview-test-accounts.js"), "utf8");
  assert.match(src, /enableSupportSession/);
  assert.match(src, /supportSession:\s*enableSupportSession\s*===\s*true/);
  assert.match(src, /shiftConfirmationScheduler:\s*false/);
  assert.match(src, /liveGps:\s*false/);
  assert.match(src, /--enable-support-session/);
  assert.match(src, /--seed-group/);
  assert.doesNotMatch(src, /supportSession:\s*true\s*\}/);
});

test("provisioning creates companies with supportSession and liveGps disabled", () => {
  const src = fs.readFileSync(path.join(root, "server/provisioning.js"), "utf8");
  assert.match(src, /supportSession:\s*false/);
  assert.match(src, /liveGps:\s*false/);
  assert.match(src, /shiftConfirmationScheduler:\s*false/);
});

test("production SMS defaults to none when unset", () => {
  const src = fs.readFileSync(path.join(root, "server/sms-provider.js"), "utf8");
  assert.match(src, /NODE_ENV === "production" \? "none" : "stub"/);
});

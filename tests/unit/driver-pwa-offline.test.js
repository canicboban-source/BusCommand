const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  DRIVER_SW_CACHE,
  shouldHandleDriverSwFetch,
  isDriverShellPath
} = require("../../server/driver-sw-policy");
const { normalizeIdempotencyKey } = require("../../server/driver-report-idempotency");

test("SW cache name is versioned v2", () => {
  assert.equal(DRIVER_SW_CACHE, "buscommand-driver-v2");
});

test("SW allowlist covers driver shell and rejects staff/api", () => {
  assert.equal(shouldHandleDriverSwFetch("/driver.html", "GET"), true);
  assert.equal(shouldHandleDriverSwFetch("/manifest-driver.webmanifest", "GET"), true);
  assert.equal(shouldHandleDriverSwFetch("/assets/shell-driver-abc.js", "GET"), true);
  assert.equal(shouldHandleDriverSwFetch("/assets/driver-xyz.js", "GET"), true);
  assert.equal(shouldHandleDriverSwFetch("/api/driver/reports", "GET"), false);
  assert.equal(shouldHandleDriverSwFetch("/staff.html", "GET"), false);
  assert.equal(shouldHandleDriverSwFetch("/assets/staff-abc.js", "GET"), false);
  assert.equal(shouldHandleDriverSwFetch("/driver.html", "POST"), false);
  assert.equal(isDriverShellPath("/icons/driver-192.png"), true);
});

test("public sw-driver.js stays aligned with policy", () => {
  const sw = fs.readFileSync(path.join(__dirname, "../../public/sw-driver.js"), "utf8");
  assert.match(sw, /buscommand-driver-v2/);
  assert.match(sw, /\/api\//);
  assert.match(sw, /staff\.html/);
  assert.match(sw, /driver\.html/);
  const main = fs.readFileSync(path.join(__dirname, "../../js/main-driver.js"), "utf8");
  assert.match(main, /scope:\s*["']\/driver\.html["']/);
  const manifest = fs.readFileSync(path.join(__dirname, "../../public/manifest-driver.webmanifest"), "utf8");
  assert.match(manifest, /"scope"\s*:\s*"\/driver\.html"/);
});

test("idempotency key normalization", () => {
  assert.equal(normalizeIdempotencyKey("short"), null);
  assert.equal(normalizeIdempotencyKey("off_abcdefghijklmnop"), "off_abcdefghijklmnop");
  assert.equal(normalizeIdempotencyKey("bad key!!"), null);
  assert.equal(normalizeIdempotencyKey("x".repeat(65)), null);
});

test("routes accept idempotencyKey on reports and lost-items", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(routes, /idempotencyKeySchema/);
  assert.match(routes, /idem_\$\{req\.driver\.uid\}_\$\{idempotencyKey\}/);
  assert.match(routes, /deduped:\s*true/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("api-server uses exact-origin CORS policy module without production host hardcoding", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");
  const runtimeIsolation = fs.readFileSync(path.join(__dirname, "../../server/runtime-isolation.js"), "utf8");
  assert.match(src, /require\("\.\/server\/cors-policy"\)/);
  assert.match(src, /evaluateCorsOrigin/);
  assert.match(src, /require\("\.\/server\/runtime-isolation"\)/);
  assert.match(src, /validateRuntimeBeforeListen/);
  assert.match(runtimeIsolation, /BUSCOMMAND_QA_HARNESS/);
  assert.match(runtimeIsolation, /["']1["']/);
  assert.doesNotMatch(src, /function isBusCommandCorsOrigin/);
  assert.doesNotMatch(src, /https:\/\/www\.buscommand\.com/);
  assert.doesNotMatch(src, /hostname\.endsWith\("\.buscommand\.com"\)/);
});

test("cors-policy allows localhost only in development runtime", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../server/cors-policy.js"), "utf8");
  assert.match(src, /function isLocalDevCorsOrigin/);
  assert.match(src, /runtime === "staging" \|\| runtime === "production"/);
  assert.match(src, /exact-allowlist/);
});

test("closed overlay modals use display:none so CSS failure cannot leave SOS open", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../index.legacy-monolith.html"), "utf8");
  for (const id of ["clear-sos-modal", "factory-reset-modal", "monthly-day-edit-modal", "msg-fullscreen-alert"]) {
    const re = new RegExp(`id="${id}"[\\s\\S]{0,280}?style="([\\s\\S]*?)">`);
    const match = re.exec(html);
    assert.ok(match, `${id} markup missing`);
    assert.match(match[1], /display:\s*none/, `${id} must default to display:none`);
    assert.doesNotMatch(match[1], /display:\s*flex/, `${id} must not default to display:flex`);
  }
});

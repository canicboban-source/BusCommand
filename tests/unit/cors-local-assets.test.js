const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("api-server allows localhost CORS ports outside production for Vite crossorigin assets", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");
  assert.match(src, /function isLocalDevCorsOrigin/);
  assert.match(src, /function isBusCommandCorsOrigin/);
  assert.match(src, /BUSCOMMAND_QA_HARNESS/);
  assert.match(src, /http:\/\/localhost:\$\{PORT\}/);
  assert.match(src, /isLocalDevCorsOrigin\(origin\)/);
  assert.match(src, /isBusCommandCorsOrigin\(origin\)/);
  assert.match(src, /https:\/\/www\.buscommand\.com/);
  assert.match(src, /\[\.\.\.new Set\(\[/);
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

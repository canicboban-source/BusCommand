import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("driver modules do not import dispatcher UI", () => {
  const driverDir = path.join(root, "js", "driver");
  for (const name of fs.readdirSync(driverDir)) {
    if (!name.endsWith(".js") || name.includes("legacy")) continue;
    const src = read(path.join("js", "driver", name));
    assert.equal(
      /from\s+["']\.\.\/dispatcher\//.test(src),
      false,
      `${name} still imports ../dispatcher/`
    );
  }
});

test("driver messages use shared message-text helper", () => {
  const inbox = read("js/driver/messages-inbox.js");
  const alerts = read("js/driver/message-alerts.js");
  assert.match(inbox, /message-text\.js/);
  assert.match(alerts, /message-text\.js/);
});

test("surface HTML is stripped per role", () => {
  const driver = read("driver.html");
  const staff = read("staff.html");
  assert.match(driver, /data-app-surface="driver"/);
  assert.match(staff, /data-app-surface="staff"/);
  assert.match(driver, /driver-dashboard/);
  assert.equal(driver.includes("dispatcher-dashboard"), false);
  assert.equal(staff.includes("driver-dashboard"), false);
  assert.equal(staff.includes("mobile-bottom-nav"), false);
  assert.ok(driver.length < staff.length, "driver HTML should be smaller than staff");
});

test("surface entry files exist", () => {
  for (const rel of [
    "js/main-driver.js",
    "js/main-staff.js",
    "js/install-driver.js",
    "js/install-staff.js",
    "css/driver-pwa.css",
    "docs/ADR-001-surface-split.md",
    "docs/SURFACE-SPLIT-PROGRESS.md",
    "public/manifest-driver.webmanifest",
    "public/sw-driver.js"
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
  }
});

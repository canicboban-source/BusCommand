import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("driver surface keeps single SOS hold control after surface build source", () => {
  const html = fs.readFileSync(path.join(root, "driver.html"), "utf8");
  assert.match(html, /data-sos-hold="true"/);
  assert.match(html, /openDriverMessagesNav/);
  assert.doesNotMatch(html, /id="sos-btn"/);
});

test("staff service plan limit copy is 5 MB", () => {
  const html = fs.readFileSync(path.join(root, "staff.html"), "utf8");
  assert.match(html, /ca_plan_file_limit[^>]*>Najviše 5 MB</);
});

test("legacy monolith source matches Swiss SOS and plan limit", () => {
  const html = fs.readFileSync(path.join(root, "index.legacy-monolith.html"), "utf8");
  assert.match(html, /data-sos-hold="true"/);
  assert.doesNotMatch(html, /id="sos-btn"/);
  assert.match(html, /Najviše 5 MB/);
});

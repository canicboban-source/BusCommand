import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const baseline = readFileSync(join(root, "js/core/demo-ops-baseline.js"), "utf8");
const state = readFileSync(join(root, "js/core/state.js"), "utf8");
const init = readFileSync(join(root, "js/bootstrap/init.js"), "utf8");

test("ensureDemoOpsBaseline fills contact email and missing-bus ops seed in demo source", () => {
  assert.match(baseline, /export function ensureDemoOpsBaseline/);
  assert.match(baseline, /\["owner@", "demo\.local"\]\.join\(""\)/);
  assert.match(baseline, /drv-demo-nobus/);
  assert.match(baseline, /\["demo", "@buscommand\.com"\]\.join\(""\)/);
  assert.doesNotMatch(baseline, /demo@buscommand\.com/);
  assert.doesNotMatch(baseline, /demo123/);
});

test("demo ops baseline is lazy-loaded from init", () => {
  assert.match(init, /demo-ops-baseline\.js/);
  assert.match(init, /ensureDemoOpsBaseline/);
  assert.doesNotMatch(state, /applyDemoOpsBaselineIfNeeded/);
});

test("dispatcher nav includes vacation requests in monolith", () => {
  const html = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
  assert.match(html, /data-action-args='\["dispatcher-vacations"\]'/);
  assert.match(html, /nav_vacation_requests/);
});

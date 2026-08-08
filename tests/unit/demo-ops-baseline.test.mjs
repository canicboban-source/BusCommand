import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "../..");
const init = readFileSync(join(root, "js/bootstrap/init.js"), "utf8");
const runtime = readFileSync(join(root, "js/core/runtime-mode.js"), "utf8");
const runtimeConfig = readFileSync(join(root, "js/core/runtime-config.js"), "utf8");
const state = readFileSync(join(root, "js/core/state.js"), "utf8");

test("packaged demo baseline module is removed", () => {
  assert.equal(existsSync(join(root, "js/core/demo-ops-baseline.js")), false);
});

test("bootstrap never imports demo baseline seed", () => {
  assert.doesNotMatch(init, /demo-ops-baseline\.js/);
  assert.doesNotMatch(init, /ensureDemoOpsBaseline/);
  assert.match(init, /purgeLegacyDemoStorage/);
  assert.match(init, /USE_LOCAL_STATE/);
});

test("runtime activates local state only via QA harness, never mode=demo URL", () => {
  assert.match(runtime, /__BUSCOMMAND_QA_HARNESS__/);
  assert.match(runtimeConfig, /export const USE_LOCAL_STATE/);
  assert.doesNotMatch(runtimeConfig, /\bIS_DEMO_MODE\b/);
  assert.doesNotMatch(runtime, /\bisDemoMode\b/);
});

test("state layer never auto-seeds platform admin credentials", () => {
  assert.doesNotMatch(state, /ensureDemoPlatformAdmin/);
  assert.doesNotMatch(state, /sa@demo\.local/);
  assert.doesNotMatch(state, /sa-demo-ok/);
});

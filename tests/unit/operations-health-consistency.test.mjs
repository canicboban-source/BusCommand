import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(join(root, "js/dispatcher/operations-health-consistency.js"), "utf8");

test("health consistency never paints is-attention without panel items", () => {
  assert.match(source, /collectOpsAttentionItems/);
  assert.match(source, /is-plan-gap/);
  assert.match(source, /dispatcher-daily-plan-pick/);
  assert.match(source, /panelCount/);
  // Must not reintroduce the empty Needs attention lie.
  assert.doesNotMatch(source, /classList\.add\("is-attention"\)/);
});

test("ops attention empty state is shown once", () => {
  const attn = readFileSync(join(root, "js/dispatcher/ops-attention.js"), "utf8");
  assert.match(attn, /subtitle\.textContent = items\.length/);
  assert.match(attn, /subtitle\.textContent = items\.length[\s\S]*: ""/);
});

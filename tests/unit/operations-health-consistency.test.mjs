import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(join(root, "js/dispatcher/operations-health-consistency.js"), "utf8");

test("health consistency opens solutions panel for plan gaps", () => {
  assert.match(source, /collectOpsAttentionItems/);
  assert.match(source, /is-plan-gap/);
  assert.match(source, /openOpsAttentionPanel/);
  assert.match(source, /panelCount/);
  // Must not reintroduce the empty Needs attention lie via is-attention without items.
  assert.doesNotMatch(source, /classList\.add\("is-attention"\)/);
  // Soft gaps go to the solutions sheet, not a dead daily-plan picker jump alone.
  assert.doesNotMatch(source, /switchSection\("dispatcher-daily-plan-pick"\)/);
});

test("ops attention includes plan-gap cards with solutions", () => {
  const attn = readFileSync(join(root, "js/dispatcher/ops-attention.js"), "utf8");
  assert.match(attn, /subtitle\.textContent = items\.length/);
  assert.match(attn, /subtitle\.textContent = items\.length[\s\S]*: ""/);
  assert.match(attn, /collectPlanGapAttentionItems/);
  assert.match(attn, /collectAllAttentionItems/);
  assert.match(attn, /plan_gap_driver/);
  assert.match(attn, /plan_gap_slot/);
  assert.match(attn, /ops_attn_gap_open_daily/);
});

test("plan-health banner click opens attention panel", () => {
  const banner = readFileSync(join(root, "js/dispatcher/plan-health-banner.js"), "utf8");
  assert.match(banner, /openOpsAttentionPanel/);
  assert.match(banner, /collectPlanGapAttentionItems/);
  assert.match(banner, /actionAttr\("openOpsAttentionPanel"/);
});

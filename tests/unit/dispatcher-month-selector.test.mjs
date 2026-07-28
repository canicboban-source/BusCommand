import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("dispatcher monthly plan uses a dynamic month selector and has no upload duplicate", () => {
  const html = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
  const module = readFileSync(join(root, "js/dispatcher/monthly-plans.js"), "utf8");

  assert.match(html, /id="monthly-month-select"/);
  assert.doesNotMatch(html, /id="upload-schedule-form"/);
  assert.doesNotMatch(html, /<option value="2026-08"/);
  assert.match(module, /function ensureMonthlyMonthOptions\(\)/);
  assert.match(module, /for \(let offset = -2; offset <= 9; offset \+= 1\)/);
  assert.doesNotMatch(module, /\|\| "2026-08"/);
});

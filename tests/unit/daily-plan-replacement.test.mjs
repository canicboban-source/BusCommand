import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("daily plan is constrained to today and directs future changes to monthly plan", async () => {
  const [source, html] = await Promise.all([
    read("../../js/dispatcher/daily-plan.js"),
    read("../../staff.html")
  ]);
  assert.match(source, /picker\.min = today/);
  assert.match(source, /picker\.max = today/);
  assert.match(source, /if \(dateStr !== today\)/);
  assert.match(source, /shift_future_monthly_only/);
  assert.match(html, /id="daily-plan-date-picker"/);
});

test("daily driver replacement assigns the substitute and clears the previous driver", async () => {
  const source = await read("../../js/dispatcher/daily-plan.js");
  const start = source.indexOf("async function dailyPlanAssignDriver");
  const end = source.indexOf("\nexport {", start);
  const handler = source.slice(start, end);
  assert.ok(start > -1 && end > start);
  assert.match(handler, /planBeforeChange\.slots\.find/);
  assert.match(handler, /persistShift\(\s*nextDriver/);
  assert.match(handler, /persistShift\(previousDriver,\s*today,\s*"clear"\)/);
  assert.match(handler, /await persistShift\(nextDriver,\s*today,\s*"clear"\)/);
});

test("daily replacement guidance exists in EN SR and DE", async () => {
  const translations = await read("../../translations.js");
  assert.equal((translations.match(/shift_future_monthly_only:/g) || []).length, 3);
});

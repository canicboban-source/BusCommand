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

test("daily driver replacement opens the guided incident flow before changing the plan", async () => {
  const source = await read("../../js/dispatcher/daily-plan.js");
  const start = source.indexOf("async function dailyPlanAssignDriver");
  const end = source.indexOf("\nif (typeof window.addEventListener", start);
  const handler = source.slice(start, end);
  assert.ok(start > -1 && end > start);
  assert.match(handler, /planBeforeChange\.slots\.find/);
  assert.match(handler, /window\.openCoverageResolver\(incident\.id, preferredReplacementDriverId\)/);
  assert.match(handler, /window\.openOperationalIncident\(previousDriver\.name, preferredReplacementDriverId\)/);
  assert.match(handler, /if \(previousDriver\)[\s\S]*return;[\s\S]*persistShift\(/);
  assert.doesNotMatch(handler, /persistShift\(previousDriver/);
  assert.doesNotMatch(handler, /resolveReport\(/);
});

test("truly empty daily slot still supports a direct single assignment", async () => {
  const source = await read("../../js/dispatcher/daily-plan.js");
  const start = source.indexOf("async function dailyPlanAssignDriver");
  const end = source.indexOf("\nif (typeof window.addEventListener", start);
  const handler = source.slice(start, end);
  assert.match(handler, /if \(!nextDriver\) return;/);
  assert.match(handler, /const assigned = await persistShift\(\s*nextDriver/);
  assert.match(handler, /if \(!assigned\) return;/);
});

test("daily replacement guidance exists in EN SR and DE", async () => {
  const translations = await read("../../translations.js");
  assert.equal((translations.match(/shift_future_monthly_only:/g) || []).length, 3);
});

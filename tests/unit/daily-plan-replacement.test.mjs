import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("daily plan allows a 7-day forward lookahead but keeps future dates read-only and directs edits to monthly plan", async () => {
  const [source, html] = await Promise.all([
    read("../../js/dispatcher/daily-plan.js"),
    read("../../staff.html")
  ]);
  assert.match(source, /picker\.min = today/);
  assert.match(source, /maxDate\.setDate\(maxDate\.getDate\(\) \+ 7\)/);
  assert.match(source, /picker\.max = maxDate\.toISOString\(\)/);
  assert.match(source, /const isFuture = date > today/);
  assert.match(source, /editable = !isOperationalReadOnly\(\) && !isFuture/);
  assert.match(source, /if \(dateStr !== today\)/);
  assert.match(source, /shift_future_monthly_only/);
  assert.match(source, /daily_future_readonly/);
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
  assert.match(handler, /window\.openOperationalIncident\(previousDriverId, preferredReplacementDriverId\)/);
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

test("drag-and-drop driver pool and slot drop targets are wired", async () => {
  const [source, translations] = await Promise.all([
    read("../../js/dispatcher/daily-plan.js"),
    read("../../translations.js")
  ]);
  // Driver pool render
  assert.match(source, /function buildDriverPoolHtml/);
  assert.match(source, /dnd-driver-chip/);
  assert.match(source, /draggable="true"/);
  // Slot drop targets
  assert.match(source, /data-slot-drop/);
  assert.match(source, /data-slot-type/);
  assert.match(source, /data-slot-code/);
  // DnD bind function
  assert.match(source, /function bindDragAndDrop/);
  assert.match(source, /dragstart/);
  assert.match(source, /dragover/);
  assert.match(source, /drop.*event/);
  // Reuses existing server-authoritative assignment path
  assert.match(source, /dailyPlanAssignDriver\(dateStr, slotType, slotCode, driverId\)/);
  // Read-only guard
  assert.match(source, /isOperationalReadOnly\(\)/);
  // Assigned drivers are also draggable between slots
  assert.match(source, /dnd-assigned-driver/);
  assert.match(source, /data-assigned-driver/);
  // Translations exist in all 3 languages
  for (const key of ["dnd_pool_label", "dnd_pool_hint", "dnd_drop_here"]) {
    assert.equal((translations.match(new RegExp(`${key}:`, "g")) || []).length, 3,
      `${key} must appear in all 3 languages`);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../js/core/firebase-service.js"),
  "utf8"
);

test("dispatcher driver loading is constrained to assigned groups", () => {
  const start = source.indexOf("async function _loadAllowedCollection");
  const end = source.indexOf("if (!_isDriverSession())", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const block = source.slice(start, end);
  assert.match(source, /DISPATCHER_GROUP_SCOPED_KEYS[\s\S]*?"drivers"[\s\S]*?"shifts"[\s\S]*?"messages"[\s\S]*?"buses"[\s\S]*?"routes"[\s\S]*?"reports"[\s\S]*?"vacations"[\s\S]*?"lostItems"[\s\S]*?"schedules"/);
  assert.match(block, /DISPATCHER_GROUP_SCOPED_KEYS\.has\(item\.key\)/);
  assert.match(block, /where\("groupId",\s*"==",\s*groupId\)/);
  assert.doesNotMatch(block, /where\("lineId"/);
  assert.doesNotMatch(block, /load_assigned_drivers_legacy/);
  assert.match(block, /new Map\(\)/);
  assert.match(block, /_docsToDriversList/);
  assert.doesNotMatch(block, /collection\(item\.col\)\.get\(\)/);
});

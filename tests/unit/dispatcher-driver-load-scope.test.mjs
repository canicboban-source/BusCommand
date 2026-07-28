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
  const start = source.indexOf('if (_isDispatcherSession() && item.key === "drivers")');
  const end = source.indexOf('if (_isDispatcherSession() && item.key === "reports")', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const block = source.slice(start, end);
  assert.match(block, /where\("groupId",\s*"==",\s*groupId\)/);
  assert.match(block, /where\("lineId",\s*"==",\s*groupId\)/);
  assert.match(block, /new Map\(\)/);
  assert.match(block, /_docsToDriversList/);
  assert.doesNotMatch(block, /collection\(item\.col\)\.get\(\)/);
});

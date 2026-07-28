import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("fleet writes stay server-owned; buses use narrow APIs and routes remain local-only", async () => {
  const [firebase, rules, fleet, map] = await Promise.all([
    read("../../js/core/firebase-service.js"),
    read("../../firestore.rules"),
    read("../../js/data/buses-routes.js"),
    read("../../js/maps/live-map-core.js")
  ]);

  assert.match(firebase, /item\.key === "buses"/);
  assert.match(firebase, /item\.key === "routes"/);

  const busesBlock = rules.match(/match \/companies\/\{companyId\}\/buses\/\{busId\}[\s\S]*?\n {4}}/)[0];
  const routesBlock = rules.match(/match \/companies\/\{companyId\}\/routes\/\{routeId\}[\s\S]*?\n {4}}/)[0];
  assert.match(busesBlock, /allow write: if false/);
  assert.match(routesBlock, /allow write: if false/);

  assert.match(fleet, /IS_DEMO_MODE/);
  assert.match(fleet, /ApiClient\.createStaffBus/);
  assert.match(fleet, /ApiClient\.setStaffBusActive/);
  assert.match(fleet, /function addRoute\(event\) \{[\s\S]*?if \(!IS_DEMO_MODE\)/);
  assert.match(fleet, /function deleteRoute\(id\) \{[\s\S]*?if \(!IS_DEMO_MODE\)/);

  assert.match(map, /if \(IS_DEMO_MODE\) saveState\(\)/);
});

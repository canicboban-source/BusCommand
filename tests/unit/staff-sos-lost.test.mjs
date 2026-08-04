import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("staff SOS resolve and lost-item status are server-owned", async () => {
  const [routes, api, sos, lost, firebase, rules] = await Promise.all([
    read("../../server/driver-routes.js"),
    read("../../js/core/api-client.js"),
    read("../../js/maps/sos-siren.js"),
    read("../../js/dispatcher/lost-items.js"),
    read("../../js/core/firebase-service.js"),
    read("../../firestore.rules")
  ]);

  assert.match(routes, /\/api\/staff\/sos\/resolve/);
  assert.match(routes, /staff_sos_resolved/);
  assert.match(routes, /\/api\/staff\/lost-items\/:itemId\/status/);
  assert.match(routes, /lost_item_returned/);
  assert.match(routes, /lost_item_status_changed/);
  assert.match(routes, /stays_on_bus/);
  assert.match(api, /resolveStaffSos/);
  assert.match(api, /setLostItemStatus/);
  assert.match(sos, /ApiClient\.resolveStaffSos/);
  assert.match(sos, /if \(IS_DEMO_MODE\) saveState\(\)/);
  assert.match(lost, /ApiClient\.setLostItemStatus/);
  assert.match(lost, /setLostItemStatus/);
  assert.match(lost, /stays_on_bus/);
  assert.match(lost, /in_depot/);
  assert.match(firebase, /item\.key === "lostItems"/);
  assert.match(rules, /lost_items\/\{itemId\}[\s\S]*?allow write: if false/);
  assert.match(rules, /sos\/\{sosId\}[\s\S]*?allow create, update, delete: if false/);
});

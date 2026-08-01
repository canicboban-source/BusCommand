import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";

const firebase = fs.readFileSync(new URL("../../js/core/firebase-service.js", import.meta.url), "utf8");
const routes = fs.readFileSync(new URL("../../server/driver-routes.js", import.meta.url), "utf8");

test("dispatcher loads and observes every operational collection by assigned group", () => {
  const required = [
    "drivers", "shifts", "messages", "buses", "routes",
    "reports", "vacations", "lostItems", "schedules"
  ];
  required.forEach((key) => assert.match(firebase, new RegExp(`"${key}"`)));
  assert.match(firebase, /DISPATCHER_GROUP_SCOPED_KEYS\.has\(item\.key\)[\s\S]*?where\("groupId", "==", groupId\)\.get\(\)/);
  assert.match(firebase, /DISPATCHER_GROUP_SCOPED_KEYS\.has\(item\.key\)[\s\S]*?where\("groupId", "==", groupId\)\.onSnapshot/);
});

test("server-created dispatcher resources persist canonical groupId", () => {
  assert.match(routes, /driver:\s*safeDriver\(profileSnap\)\.name,\s*groupId:\s*profileSnap\.data\(\)\.groupId \|\| profileSnap\.data\(\)\.lineId/);
  assert.match(routes, /driverName,\s*groupId:\s*driverGroupId,\s*month:/);
  assert.match(routes, /driverGroupId,\s*staffUid/);
});

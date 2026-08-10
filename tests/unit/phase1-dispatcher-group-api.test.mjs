import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const routes = readFileSync(join(root, "server/driver-routes.js"), "utf8");
const rules = readFileSync(join(root, "firestore.rules"), "utf8");
const hub = readFileSync(join(root, "js/dispatcher/group-hub.js"), "utf8");

test("FAZA1 closeout: SOS resolve uses enumeration-safe SOS_UNAVAILABLE", () => {
  const resolveIdx = routes.indexOf('app.put("/api/staff/sos/resolve"');
  const resolve = routes.slice(resolveIdx, resolveIdx + 2800);
  assert.match(resolve, /SOS_UNAVAILABLE/);
  assert.match(resolve, /sosUnavailable/);
  assert.doesNotMatch(resolve, /SOS_GROUP_FORBIDDEN/);
});

test("FAZA1 closeout: message archive uses enumeration-safe MESSAGE_UNAVAILABLE", () => {
  const idx = routes.indexOf('app.put("/api/staff/messages/:messageId/archive"');
  const block = routes.slice(idx, idx + 2800);
  assert.match(block, /MESSAGE_UNAVAILABLE/);
  assert.match(block, /messageUnavailable/);
  assert.doesNotMatch(block, /MESSAGE_GROUP_FORBIDDEN/);
});

test("FAZA1 closeout: ops-activity drops ungrouped audit rows for Dispo", () => {
  const idx = routes.indexOf('app.get("/api/staff/ops-activity"');
  const block = routes.slice(idx, idx + 2200);
  assert.match(block, /Ungrouped audit rows must not leak/);
});

test("FAZA1 closeout: rules deny knownGroupIds as a read grant", () => {
  assert.match(rules, /knownGroupIds NEVER grants document read/);
  assert.match(rules, /canDispatcherReadHomeGroup/);
});

test("FAZA1 closeout: client rejects foreign openGroupHub", () => {
  assert.match(hub, /assertDispatcherMayOpenGroup/);
  assert.match(hub, /enforceDispatcherGroupScope/);
  assert.match(hub, /sanitizeDispatcherActiveGroups/);
});

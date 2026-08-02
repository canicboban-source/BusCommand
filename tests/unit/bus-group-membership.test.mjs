import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  busHasGroup,
  buildNewBusGroups,
  normalizeGroupIds,
  withAttachedGroup
} from "../../js/data/bus-group-membership.js";

const require = createRequire(import.meta.url);
const server = require("../../server/bus-group-membership.js");

test("normalizeGroupIds merges legacy groupId and groupIds", () => {
  assert.deepEqual(normalizeGroupIds({ groupId: "310", lineId: "310" }), ["310"]);
  assert.deepEqual(
    normalizeGroupIds({ groupId: "310", groupIds: ["310", "320"] }),
    ["310", "320"]
  );
});

test("attach keeps one record and adds membership", () => {
  const bus = { id: "b1", number: "91504", groupId: "310", lineId: "310" };
  const next = withAttachedGroup(bus, "320");
  assert.deepEqual(next.groupIds, ["310", "320"]);
  assert.equal(busHasGroup(next, "310"), true);
  assert.equal(busHasGroup(next, "320"), true);
  assert.equal(busHasGroup(next, "999"), false);
});

test("buildNewBusGroups seeds single membership", () => {
  assert.deepEqual(buildNewBusGroups("101"), {
    groupIds: ["101"],
    groupId: "101",
    lineId: "101"
  });
});

test("server CJS helpers stay aligned with ESM", () => {
  const bus = { groupId: "310" };
  const next = server.withAttachedGroup(bus, "320");
  assert.equal(server.busHasGroup(next, "320"), true);
  assert.deepEqual(server.normalizeGroupIds(next), ["310", "320"]);
});

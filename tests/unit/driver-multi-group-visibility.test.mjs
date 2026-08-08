import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { driverKnowsGroup, normalizeKnownGroupIds } from "../../js/data/driver-known-groups.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("normalizeKnownGroupIds always includes primary home group", () => {
  assert.deepEqual(
    normalizeKnownGroupIds({ groupId: "310", knownGroupIds: ["105", "310", "105"] }),
    ["310", "105"]
  );
});

test("driverKnowsGroup matches primary and extra groups", () => {
  const driver = { groupId: "310", knownGroupIds: ["105"] };
  assert.equal(driverKnowsGroup(driver, "310"), true);
  assert.equal(driverKnowsGroup(driver, "105"), true);
  assert.equal(driverKnowsGroup(driver, "999"), false);
});

test("driverBelongsToLine uses driverKnowsGroup for multi-group Dispo visibility", () => {
  const src = readFileSync(join(root, "js/data/group-membership.js"), "utf8");
  assert.match(src, /driverKnowsGroup\(driver,\s*target\)/);
  assert.match(src, /knownGroupIds/);
  assert.match(src, /clearDriverLineMembership[\s\S]*knownGroupIds\s*=\s*\[\]/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { findDriverByName, normalizeType } from "../../js/imports/monthly-plan-persist-utils.js";

test("normalizeType keeps allowed shift types", () => {
  assert.equal(normalizeType({ type: "afternoon" }), "afternoon");
  assert.equal(normalizeType({ type: "UNKNOWN" }), "morning");
});

test("findDriverByName matches case-insensitively", () => {
  const drivers = [{ id: "d1", name: "Marko Petrović" }];
  assert.equal(findDriverByName(drivers, "marko petrović")?.id, "d1");
  assert.equal(findDriverByName(drivers, "missing"), null);
});

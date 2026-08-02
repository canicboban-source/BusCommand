import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyBusImport,
  normalizeBusNumber,
  parseBusImportRows,
  parseBusImportText
} from "../../js/data/bus-import-parse.js";

test("normalizeBusNumber accepts common fleet labels", () => {
  assert.equal(normalizeBusNumber(" 91103 "), "91103");
  assert.equal(normalizeBusNumber("Bus-12A"), "Bus-12A");
  assert.equal(normalizeBusNumber(""), null);
  assert.equal(normalizeBusNumber("bad@id"), null);
});

test("parseBusImportText reads one number per line", () => {
  const parsed = parseBusImportText("91103\n91104\n91103\n");
  assert.deepEqual(parsed.numbers, ["91103", "91104"]);
  assert.deepEqual(parsed.invalid, []);
});

test("parseBusImportText supports CSV with header aliases", () => {
  const parsed = parseBusImportText("autobus;napomena\n100;ok\n101;rezerva\n");
  assert.deepEqual(parsed.numbers, ["100", "101"]);
});

test("parseBusImportText supports comma CSV without header", () => {
  const parsed = parseBusImportText("200,garage\n201,line\n");
  assert.deepEqual(parsed.numbers, ["200", "201"]);
});

test("parseBusImportText supports paste lists on one line", () => {
  const parsed = parseBusImportText("301, 302; 303");
  assert.deepEqual(parsed.numbers, ["301", "302", "303"]);
});

test("parseBusImportRows uses first sheet style rows", () => {
  const parsed = parseBusImportRows([
    ["number", "note"],
    ["401", "a"],
    ["402", "b"]
  ]);
  assert.deepEqual(parsed.numbers, ["401", "402"]);
});

test("classifyBusImport splits new existing and reactivate", () => {
  const result = classifyBusImport(
    ["10", "11", "12"],
    [
      { id: "b1", number: "11", groupId: "g1", active: true },
      { id: "b2", number: "12", groupId: "g1", active: false }
    ],
    "g1"
  );
  assert.deepEqual(result.toCreate, ["10"]);
  assert.deepEqual(result.existing, ["11"]);
  assert.deepEqual(result.toReactivate, [{ number: "12", id: "b2" }]);
});

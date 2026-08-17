import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
    location: { hostname: "localhost", search: "" },
    state: { activeLineId: "310", groups: [{ id: "310" }, { id: "320" }] }
};

const { normalizeShiftCode } = await import("../../js/imports/import-parse-utils.js");

test("GODIŠNJI maps to vacation", () => {
    const r = normalizeShiftCode("GODIŠNJI", "310");
    assert.equal(r.type, "vacation");
});

test("BOLEST maps to sick", () => {
    const r = normalizeShiftCode("BOLEST", "310");
    assert.equal(r.type, "sick");
});

test("SCHULUNG maps to training", () => {
    const r = normalizeShiftCode("SCHULUNG", "310");
    assert.equal(r.type, "training");
});

test("TRAINING maps to training", () => {
    const r = normalizeShiftCode("TRAINING", "310");
    assert.equal(r.type, "training");
});

test("OBUKA maps to training", () => {
    const r = normalizeShiftCode("OBUKA", "310");
    assert.equal(r.type, "training");
});

test("FEIERTAG maps to off", () => {
    const r = normalizeShiftCode("FEIERTAG", "310");
    assert.equal(r.type, "off");
});

test("PRAZNIK maps to off", () => {
    const r = normalizeShiftCode("PRAZNIK", "310");
    assert.equal(r.type, "off");
});

test("Bare numeric code 310.001 resolves", () => {
    const r = normalizeShiftCode("310.001", "310");
    assert.equal(r.routeCode, "310.001");
});

test("SLOBODNO maps to off", () => {
    const r = normalizeShiftCode("SLOBODNO", "310");
    assert.equal(r.type, "off");
});

test("FREI maps to off", () => {
    const r = normalizeShiftCode("FREI", "310");
    assert.equal(r.type, "off");
});

test("OFF maps to off", () => {
    const r = normalizeShiftCode("OFF", "310");
    assert.equal(r.type, "off");
});

test("Urlaub maps to vacation", () => {
    const r = normalizeShiftCode("Urlaub", "310");
    assert.equal(r.type, "vacation");
});

test("BOLOVANJE maps to sick", () => {
    const r = normalizeShiftCode("BOLOVANJE", "310");
    assert.equal(r.type, "sick");
});

test("KRANK maps to sick", () => {
    const r = normalizeShiftCode("KRANK", "310");
    assert.equal(r.type, "sick");
});

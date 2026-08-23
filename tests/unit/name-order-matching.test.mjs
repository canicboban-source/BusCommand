import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
    location: { hostname: "localhost", search: "" },
    state: { activeLineId: "320", groups: [] }
};

const { matchDriversByName, matchDriverByName } = await import("../../js/dispatcher/plan-import.js");
const { findDriverByName, tokenMultisetEquals } = await import("../../js/imports/monthly-plan-persist-utils.js");

test("Name matching: exact match with diacritics / case / space folding", () => {
    const drivers = [
        { id: "d1", name: "Boban Canić" }
    ];
    // Exact diacritic match
    const res1 = matchDriverByName("Boban Canić", drivers);
    assert.equal(res1?.id, "d1");

    // ASCII input vs diacritic record
    const res2 = matchDriverByName("Boban Canic", drivers);
    assert.equal(res2?.id, "d1");

    // Case & whitespace variants
    const res3 = matchDriverByName("  BOBAN   CANIC  ", drivers);
    assert.equal(res3?.id, "d1");
});

test("Name matching: token-multiset reordering (Canic Boban ↔ Boban Canic)", () => {
    const drivers = [
        { id: "d1", name: "Boban Canić" }
    ];
    // Inverted input
    const res1 = matchDriverByName("Canic Boban", drivers);
    assert.equal(res1?.id, "d1");

    const res2 = matchDriverByName("Canić Boban", drivers);
    assert.equal(res2?.id, "d1");

    // Three tokens reordering
    const multi = [{ id: "d2", name: "Petar Petrović Pavle" }];
    const res3 = matchDriverByName("Pavle Petar Petrovic", multi);
    assert.equal(res3?.id, "d2");
});

test("Name matching: no match on completely different names", () => {
    const drivers = [
        { id: "d1", name: "Boban Canić" }
    ];
    const res = matchDriverByName("Petar Petrović", drivers);
    assert.equal(res, null);
});

test("Name matching: single token vs multi-token must NOT match", () => {
    const drivers = [
        { id: "d1", name: "Boban Canić" }
    ];
    // "Boban" alone must NOT auto-match "Boban Canić"
    const res = matchDriverByName("Boban", drivers);
    assert.equal(res, null);
});

test("Name matching: token multiplicity (Ana Ana vs Ana)", () => {
    const drivers = [
        { id: "d1", name: "Ana Ana" }
    ];
    assert.equal(matchDriverByName("Ana", drivers), null);
    assert.equal(matchDriverByName("Ana Ana", drivers)?.id, "d1");
    assert.equal(tokenMultisetEquals(["ana"], ["ana", "ana"]), false);
    assert.equal(tokenMultisetEquals(["ana", "ana"], ["ana", "ana"]), true);
});

test("Name matching: ambiguous candidates require manual selection", () => {
    const drivers = [
        { id: "d1", name: "Boban Canić" },
        { id: "d2", name: "Canic Boban" }
    ];
    const result = matchDriversByName("Boban Canic", drivers);
    assert.equal(result.ambiguous, true);
    assert.equal(result.matches.length, 2);

    // matchDriverByName must return null on ambiguity
    assert.equal(matchDriverByName("Boban Canic", drivers), null);
});

test("Name matching: empty, null, and malformed inputs", () => {
    const drivers = [{ id: "d1", name: "Boban Canic" }];
    assert.equal(matchDriverByName("", drivers), null);
    assert.equal(matchDriverByName("   ", drivers), null);
    assert.equal(matchDriverByName(null, drivers), null);
    assert.equal(matchDriverByName(undefined, drivers), null);
    assert.equal(matchDriverByName(123, drivers), null);
});

test("Monthly plan persist utils: findDriverByName matches token multiset", () => {
    const drivers = [
        { id: "d1", name: "Boban Canić" }
    ];
    assert.equal(findDriverByName(drivers, "Boban Canić")?.id, "d1");
    assert.equal(findDriverByName(drivers, "Canic Boban")?.id, "d1");
    assert.equal(findDriverByName(drivers, "Petar Petrović"), null);
});

test("Parity: plan-import matchDriverByName and monthly-plan-persist-utils findDriverByName produce identical outcomes", () => {
    const drivers = [
        { id: "d1", name: "Boban Canić" },
        { id: "d2", name: "Ana Marija" },
        { id: "d3", name: "Petar Petrović Pavle" }
    ];

    const testInputs = [
        "Boban Canić",
        "Boban Canic",
        "Canic Boban",
        "  CANIC   BOBAN  ",
        "Ana Marija",
        "Marija Ana",
        "Ana",
        "Marija",
        "Petar Pavle Petrovic",
        "Pavle Petar Petrovic",
        "Petar",
        "Unknown Person",
        "",
        "   ",
        null,
        undefined
    ];

    for (const input of testInputs) {
        const fromPlanImport = matchDriverByName(input, drivers);
        const fromPersist = findDriverByName(drivers, input);
        assert.equal(
            fromPlanImport?.id || null,
            fromPersist?.id || null,
            `Parity failed for input: "${input}"`
        );
    }
});

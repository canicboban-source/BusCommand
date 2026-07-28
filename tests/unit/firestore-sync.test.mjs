import { test } from "node:test";
import assert from "node:assert/strict";
import {
    docIdFromRecord,
    diffCollectionOps,
    chunkArray,
    summarizeAuditChanges,
    hasAuditActivity
} from "../../js/core/firestore-sync.js";

test("docIdFromRecord prefers id then number", () => {
    assert.equal(docIdFromRecord({ id: "drv-1" }), "drv-1");
    assert.equal(docIdFromRecord({ number: 42 }), "42");
    assert.equal(docIdFromRecord({}), "");
});

test("diffCollectionOps detects add/update/delete", () => {
    const baseline = new Set(["a", "b"]);
    const { sets, deletes, localIds, audit } = diffCollectionOps(
        [{ id: "a", name: "A2" }, { id: "c", name: "C" }],
        baseline
    );
    assert.equal(sets.length, 2);
    assert.deepEqual(deletes, ["b"]);
    assert.deepEqual(audit.added, ["c"]);
    assert.deepEqual(audit.updated, ["a"]);
    assert.equal(localIds.has("c"), true);
});

test("diffCollectionOps skips delete when baseline unknown", () => {
    const { deletes, audit } = diffCollectionOps([{ id: "x" }], null);
    assert.deepEqual(deletes, []);
    assert.deepEqual(audit.removed, []);
});

test("chunkArray respects batch limit", () => {
    const items = Array.from({ length: 1200 }, (_, i) => i);
    const chunks = chunkArray(items, 500);
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 500);
    assert.equal(chunks[2].length, 200);
});

test("summarizeAuditChanges compacts audit payload", () => {
    const summary = summarizeAuditChanges({
        drivers: { added: ["d1"], updated: [], removed: [] }
    });
    assert.equal(summary.drivers.added, 1);
    assert.deepEqual(summary.drivers.addedIds, ["d1"]);
    assert.equal(hasAuditActivity(summary), true);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("vacations driverId+end composite index is declared for COLLECTION queries", () => {
  const indexes = JSON.parse(fs.readFileSync(path.join(__dirname, "../../firestore.indexes.json"), "utf8"));
  const found = (indexes.indexes || []).find((row) =>
    row.collectionGroup === "vacations"
    && row.queryScope === "COLLECTION"
    && (row.fields || []).map((field) => field.fieldPath).join(",") === "driverId,end"
  );
  assert.ok(found, "replacement eligibility requires vacations driverId + end");
});

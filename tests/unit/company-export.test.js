const test = require("node:test");
const assert = require("node:assert/strict");
const {
  EXPORT_ROW_LIMIT,
  buildCompanyExport,
  neutralizeSpreadsheetFormula,
  rowsToCsv
} = require("../../server/company-export");

function companyRef(collections) {
  return {
    collection(name) {
      return {
        limit(limit) {
          return {
            async get() {
              assert.equal(limit, EXPORT_ROW_LIMIT + 1);
              return {
                docs: (collections[name] || []).map(entry => ({ id: entry.id, data: () => entry.data }))
              };
            }
          };
        }
      };
    }
  };
}

test("driver export contains only safe operational fields and no credentials", async () => {
  const result = await buildCompanyExport(companyRef({ drivers: [{
    id: "driver-1",
    data: { firstName: "Ana", lastName: "Driver", bus: "10", groupId: "310", active: true, eid: "secret", loginCodeHash: "secret" }
  }] }), "drivers");
  assert.equal(result.count, 1);
  assert.match(result.csv, /Ana Driver/);
  assert.doesNotMatch(result.csv, /eid|loginCodeHash|secret/);
});

test("CSV export neutralizes spreadsheet formulas and quotes every cell", () => {
  for (const value of ["=2+2", "+cmd", "-10", "@SUM(A1)", "\tformula", "\rformula"]) {
    assert.equal(neutralizeSpreadsheetFormula(value).startsWith("'"), true);
  }
  const csv = rowsToCsv(["name"], [["=2+2"], ['A "quote"']]);
  assert.match(csv, /"'=2\+2"/);
  assert.match(csv, /"A ""quote"""/);
  assert.equal(csv.startsWith("\uFEFF"), true);
});

test("unsupported and oversized exports fail closed", async () => {
  await assert.rejects(buildCompanyExport(companyRef({}), "credentials"), error => error.code === "export-not-supported");
  const tooMany = Array.from({ length: EXPORT_ROW_LIMIT + 1 }, (_, index) => ({ id: String(index), data: {} }));
  await assert.rejects(buildCompanyExport(companyRef({ reports: tooMany }), "reports"), error => error.code === "export-too-large");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { findCompanyGroupReferences, normalizeCompanyGroupId } = require("../../server/company-groups.js");

function companyRefWith(records = {}) {
  return {
    collection(name) {
      return {
        where(field, operator, value) {
          return {
            limit() {
              return {
                async get() {
                  const rows = records[name] || [];
                  const match = rows.some(row => operator === "array-contains"
                    ? Array.isArray(row[field]) && row[field].includes(value)
                    : String(row[field] || "") === String(value));
                  return { empty: !match };
                }
              };
            }
          };
        }
      };
    }
  };
}

test("company group IDs are bounded numeric line identifiers", () => {
  assert.equal(normalizeCompanyGroupId(" 310 "), "310");
  for (const invalid of ["", "north", "1234567", "../310", "310/1"]) {
    assert.throws(() => normalizeCompanyGroupId(invalid), { code: "invalid-group" });
  }
});

test("server detects every supported group dependency without duplicate labels", async () => {
  const refs = await findCompanyGroupReferences(companyRefWith({
    drivers: [{ groupId: "310", lineId: "310" }],
    users: [{ groups: ["105", "310"] }],
    service_plans: [{ groupId: "310" }],
    routes: [{ lineId: "310" }]
  }), "310");
  assert.deepEqual(refs.sort(), ["dispatchers", "drivers", "plans", "routes"]);
});

test("server reports an empty group as unreferenced", async () => {
  assert.deepEqual(await findCompanyGroupReferences(companyRefWith(), "105"), []);
});

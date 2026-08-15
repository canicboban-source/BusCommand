const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  PlanImportValidationError,
  buildPlanImportPreview
} = require("../../server/plan-import-preview");

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";

function validInput(overrides = {}) {
  return {
    companyId: "company-1",
    staffUid: "dispatcher-1",
    payload: {
      groupId: "31099",
      month: "2026-08",
      sourceName: "plan-2026-08.xlsx",
      reason: "Objava mesečnog plana",
      rows: [{
        driverId: DRIVER_ID,
        date: "2026-08-03",
        type: "morning",
        name: "310.S01",
        bus: "101",
        routeCode: "310.S01",
        start: "04:02",
        end: "14:35",
        expectedRevision: 2
      }]
    },
    driversById: new Map([[DRIVER_ID, { active: true, groupId: "31099" }]]),
    shiftsById: new Map([[`${DRIVER_ID}|2026-08-03`, { revision: 2 }]]),
    ...overrides
  };
}

test("builds deterministic server preview for a valid monthly plan", () => {
  const first = buildPlanImportPreview(validInput());
  const second = buildPlanImportPreview(validInput());
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(first.summary, { rows: 1, drivers: 1, assignments: 1, removals: 0 });
});

test("rejects duplicate assignments for the same driver and date", () => {
  const input = validInput();
  input.payload.rows.push({ ...input.payload.rows[0] });
  assert.throws(() => buildPlanImportPreview(input), (error) => {
    assert.ok(error instanceof PlanImportValidationError);
    assert.ok(error.errors.some((item) => item.code === "DUPLICATE_ASSIGNMENT"));
    return true;
  });
});

test("rejects rows outside the selected month and stale revisions", () => {
  const input = validInput();
  input.payload.rows[0].date = "2026-09-03";
  input.payload.rows[0].expectedRevision = 1;
  assert.throws(() => buildPlanImportPreview(input), (error) => {
    assert.ok(error.errors.some((item) => item.code === "DATE_OUTSIDE_MONTH"));
    assert.ok(error.errors.some((item) => item.code === "REVISION_CONFLICT"));
    return true;
  });
});

test("validation reports the original source row before canonical sorting", () => {
  const input = validInput();
  input.payload.rows.unshift({
    ...input.payload.rows[0],
    date: "2026-09-20",
    expectedRevision: 0
  });
  assert.throws(() => buildPlanImportPreview(input), (error) => {
    const monthError = error.errors.find((item) => item.code === "DATE_OUTSIDE_MONTH");
    assert.equal(monthError.row, 1);
    return true;
  });
});

test("rejects missing, inactive and cross-group drivers", () => {
  const missing = validInput({ driversById: new Map() });
  assert.throws(() => buildPlanImportPreview(missing), (error) => {
    assert.ok(error.errors.some((item) => item.code === "DRIVER_NOT_FOUND"));
    return true;
  });

  const inactive = validInput({
    driversById: new Map([[DRIVER_ID, { active: false, groupId: "105" }]])
  });
  assert.throws(() => buildPlanImportPreview(inactive), (error) => {
    assert.ok(error.errors.some((item) => item.code === "DRIVER_INACTIVE"));
    assert.ok(error.errors.some((item) => item.code === "DRIVER_OUTSIDE_GROUP"));
    return true;
  });
});

test("dispatcher preview route is server-owned, scoped and audited", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(source, /monthly-plans\/import\/preview/);
  assert.match(source, /monthly-plans\/import\/commit/);
  assert.match(source, /req\.staff\.role !== "dispatcher"/);
  assert.match(source, /req\.staff\.groups\.includes\(parsed\.data\.groupId\)/);
  assert.match(source, /buildPlanImportPreview/);
  assert.match(source, /prepareStaffMonthlyImport/);
  assert.match(source, /commitStaffMonthlyImport/);
  assert.match(source, /monthly_plan_import_previewed/);
  assert.match(source, /monthly_plan_import_committed/);
  assert.match(source, /requireDutyCatalog:\s*true/);
  assert.match(source, /reason: z\.string\(\)\.trim\(\)\.min\(3\)/);
});

test("rejects unknown duty when catalog is required", () => {
  const input = validInput({
    dutiesByCode: new Map([["310.S99", { code: "310.S99" }]]),
    requireDutyCatalog: true
  });
  assert.throws(() => buildPlanImportPreview(input), (error) => {
    assert.ok(error.errors.some((item) => item.code === "DUTY_NOT_IN_ACTIVE_CATALOG"));
    return true;
  });
});

test("rejects missing inactive and unavailable buses when bus map provided", () => {
  const missing = validInput({ busesByNumber: new Map() });
  assert.throws(() => buildPlanImportPreview(missing), (error) => {
    assert.ok(error.errors.some((item) => item.code === "BUS_NOT_FOUND"));
    return true;
  });

  const inactive = validInput({
    busesByNumber: new Map([["101", { number: "101", active: false, groupId: "31099", opsStatus: "active" }]])
  });
  assert.throws(() => buildPlanImportPreview(inactive), (error) => {
    assert.ok(error.errors.some((item) => item.code === "BUS_INACTIVE"));
    return true;
  });

  const busy = validInput({
    busesByNumber: new Map([["101", { number: "101", active: true, groupId: "31099", opsStatus: "maintenance" }]])
  });
  assert.throws(() => buildPlanImportPreview(busy), (error) => {
    assert.ok(error.errors.some((item) => item.code === "BUS_NOT_AVAILABLE"));
    return true;
  });
});

test("preview rows include previous snapshot for compensation", () => {
  const preview = buildPlanImportPreview(validInput({
    dutiesByCode: new Map([["310.S01", { code: "310.S01" }]]),
    busesByNumber: new Map([["101", { number: "101", active: true, groupId: "31099", opsStatus: "active" }]]),
    shiftsById: new Map([[`${DRIVER_ID}|2026-08-03`, {
      revision: 2,
      type: "morning",
      name: "old",
      bus: "99",
      groupId: "31099"
    }]])
  }));
  assert.equal(preview.rows[0].previous.revision, 2);
  assert.equal(preview.rows[0].previous.bus, "99");
  assert.equal(preview.rows[0].driverName, "");
});

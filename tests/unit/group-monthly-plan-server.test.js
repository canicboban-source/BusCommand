const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  GroupMonthlyImportError,
  buildGroupMonthlyPreview,
  buildShiftDocument,
  lockDocumentId
} = require("../../server/group-monthly-plan-import");

const driversByEid = new Map([
  ["e-100", { id: "driver-100", name: "Ana Driver", active: true, groupId: "310" }],
  ["e-200", { id: "driver-200", name: "Inactive Driver", active: false, groupId: "310" }],
  ["e-300", { id: "driver-300", name: "Other Group", active: true, groupId: "320" }]
]);
const dutiesByCode = new Map([
  ["310.S01", { code: "310.S01", workStart: "04:02", workEnd: "14:35" }],
  ["310.F01", { code: "310.F01", workStart: "13:00", workEnd: "20:30" }]
]);

function validInput(overrides = {}) {
  return {
    companyId: "alpha",
    actorId: "ca-1",
    groupId: "310",
    month: "2026-09",
    mode: "merge",
    sourceName: "monthly.csv",
    reason: "September publication",
    rows: [
      { eid: "E-100", date: "2026-09-01", dutyCode: "310.S01", sourceRow: 2 },
      { eid: "E-100", date: "2026-09-02", dutyCode: "OFF", sourceRow: 3 }
    ],
    driversByEid,
    dutiesByCode,
    existingShifts: new Map(),
    ...overrides
  };
}

test("CA monthly preview resolves EID and exact active-catalog times", () => {
  const preview = buildGroupMonthlyPreview(validInput());
  assert.equal(preview.summary.drivers, 1);
  assert.equal(preview.summary.assignments, 2);
  assert.equal(preview.summary.removals, 0);
  assert.equal(preview.rows[0].driverId, "driver-100");
  assert.equal(preview.rows[0].routeCode, "310.S01");
  assert.equal(preview.rows[0].start, "04:02");
  assert.equal(preview.rows[0].end, "14:35");
  assert.equal(preview.rows[1].type, "off");
  assert.match(preview.fingerprint, /^[a-f0-9]{64}$/);
});

test("replace preview adds removals for existing assignments omitted from file", () => {
  const existing = {
    driverId: "driver-100",
    driverName: "Ana Driver",
    groupId: "310",
    date: "2026-09-03",
    routeCode: "310.F01",
    revision: 4
  };
  const preview = buildGroupMonthlyPreview(validInput({
    mode: "replace",
    existingShifts: new Map([["driver-100|2026-09-03", existing]])
  }));
  assert.equal(preview.summary.removals, 1);
  const removal = preview.rows.find(row => row.type === "clear");
  assert.equal(removal.date, "2026-09-03");
  assert.equal(removal.expectedRevision, 4);
});

test("preview rejects unknown EID, inactive/cross-group driver and unknown duty", () => {
  const input = validInput({
    rows: [
      { eid: "missing", date: "2026-09-01", dutyCode: "310.S01", sourceRow: 2 },
      { eid: "E-200", date: "2026-09-02", dutyCode: "310.S01", sourceRow: 3 },
      { eid: "E-300", date: "2026-09-03", dutyCode: "310.S01", sourceRow: 4 },
      { eid: "E-100", date: "2026-09-04", dutyCode: "310.X99", sourceRow: 5 }
    ]
  });
  assert.throws(() => buildGroupMonthlyPreview(input), error => {
    assert.ok(error instanceof GroupMonthlyImportError);
    const codes = error.details.map(item => item.code);
    assert.ok(codes.includes("EID_NOT_FOUND"));
    assert.ok(codes.includes("DRIVER_INACTIVE"));
    assert.ok(codes.includes("DRIVER_OUTSIDE_GROUP"));
    assert.ok(codes.includes("DUTY_NOT_IN_ACTIVE_CATALOG"));
    return true;
  });
});

test("server shift document preserves catalog times, clears bus and carries import revision", () => {
  const shift = buildShiftDocument({
    driverId: "driver-100",
    driverName: "Ana Driver",
    date: "2026-09-01",
    type: "morning",
    name: "310.S01",
    routeCode: "310.S01",
    start: "04:02",
    end: "14:35",
    expectedRevision: 2
  }, "310", "ca-1", "import-1", "timestamp");
  assert.equal(shift.revision, 3);
  assert.equal(shift.bus, "");
  assert.equal(shift.importId, "import-1");
  assert.equal(lockDocumentId("310", "2026-09"), lockDocumentId("310", "2026-09"));
});

test("merge import preserves bus and confirmation when duty identity is unchanged", () => {
  const preserved = buildShiftDocument({
    driverId: "driver-100",
    driverName: "Ana Driver",
    date: "2026-09-01",
    type: "morning",
    name: "310.S01",
    start: "04:02",
    end: "14:35",
    expectedRevision: 1
  }, "310", "ca-1", "import-2", "timestamp", {
    type: "morning",
    name: "310.S01",
    start: "04:02",
    end: "14:35",
    bus: "4401",
    confirmedByDriver: true
  }, { preserveOps: true });
  assert.equal(preserved.bus, "4401");
  assert.equal(preserved.confirmedByDriver, true);

  const replaced = buildShiftDocument({
    driverId: "driver-100",
    driverName: "Ana Driver",
    date: "2026-09-01",
    type: "morning",
    name: "310.S01",
    start: "04:02",
    end: "14:35",
    expectedRevision: 1
  }, "310", "ca-1", "import-3", "timestamp", {
    type: "morning",
    name: "310.S01",
    bus: "4401",
    confirmedByDriver: true
  }, { preserveOps: false });
  assert.equal(replaced.bus, "");
  assert.equal(replaced.confirmedByDriver, false);
});

test("CA import routes are server-owned, audited and block concurrent dispatcher edits", () => {
  const root = path.join(__dirname, "../..");
  const api = fs.readFileSync(path.join(root, "api-server.js"), "utf8");
  const driverRoutes = fs.readFileSync(path.join(root, "server/driver-routes.js"), "utf8");
  assert.match(api, /company-admin\/monthly-plans\/import\/preview[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /company-admin\/monthly-plans\/import\/commit[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /getActiveServicePlan/);
  assert.match(api, /group_monthly_plan_import_previewed/);
  assert.match(api, /group_monthly_plan_import_committed/);
  assert.match(api, /group_monthly_plan_import_failed/);
  assert.match(driverRoutes, /assertNoActiveGroupMonthlyImport/);
  assert.match(driverRoutes, /code: importLock\.code/);
});

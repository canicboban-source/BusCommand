const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  capturePriorSnapshot,
  simulateUndoWrite,
  previewMassDayRange,
  buildAssignedShift,
  buildClearedShift
} = require("../../server/shift-assignment");

test("capturePriorSnapshot marks empty for missing or clear docs", () => {
  assert.deepEqual(capturePriorSnapshot(null), { empty: true, revision: 0 });
  assert.equal(capturePriorSnapshot({ type: "clear", revision: 2 }).empty, true);
  const prior = capturePriorSnapshot({
    type: "morning",
    name: "310.S01",
    bus: "91100",
    routeCode: "310.S01",
    start: "05:00",
    end: "13:00",
    revision: 3
  });
  assert.equal(prior.empty, false);
  assert.equal(prior.routeCode, "310.S01");
  assert.equal(prior.revision, 3);
});

test("simulateUndoWrite restores prior assignment and bumps revision", () => {
  const current = buildAssignedShift({
    data: {
      driverId: "drv-1",
      date: "2026-08-10",
      type: "afternoon",
      name: "310.F02",
      bus: "91101",
      routeCode: "310.F02"
    },
    driverName: "Ana",
    driverGroupId: "310",
    staffUid: "disp-1",
    revision: 2,
    assignedAt: "ts",
    priorSnapshot: {
      empty: false,
      revision: 1,
      type: "off",
      name: "Frei",
      bus: "",
      routeCode: "",
      start: null,
      end: null
    }
  });

  const undone = simulateUndoWrite(current, 2);
  assert.equal(undone.ok, true);
  assert.equal(undone.deleted, false);
  assert.equal(undone.revision, 3);
  assert.equal(undone.restore.type, "off");
  assert.equal(undone.priorSnapshot.type, "afternoon");
});

test("simulateUndoWrite to empty prior returns deleted tombstone plan", () => {
  const current = buildAssignedShift({
    data: {
      driverId: "drv-1",
      date: "2026-08-10",
      type: "morning",
      name: "310.S01",
      routeCode: "310.S01"
    },
    driverName: "Ana",
    driverGroupId: "310",
    staffUid: "disp-1",
    revision: 1,
    assignedAt: "ts",
    priorSnapshot: { empty: true, revision: 0 }
  });
  const undone = simulateUndoWrite(current, 1);
  assert.equal(undone.ok, true);
  assert.equal(undone.deleted, true);
  assert.equal(undone.revision, 2);
});

test("simulateUndoWrite rejects stale revision and missing prior", () => {
  assert.equal(simulateUndoWrite({ revision: 2, priorSnapshot: { empty: true } }, 1).code, "REVISION_CONFLICT");
  assert.equal(simulateUndoWrite({ revision: 1 }, 1).code, "NOTHING_TO_UNDO");
});

test("buildClearedShift keeps priorSnapshot for undo", () => {
  const cleared = buildClearedShift({
    data: { driverId: "drv-1", date: "2026-08-10" },
    driverName: "Ana",
    driverGroupId: "310",
    staffUid: "disp-1",
    revision: 4,
    priorSnapshot: { empty: false, type: "sick", name: "Krank", revision: 3 },
    assignedAt: "ts"
  });
  assert.equal(cleared.type, "clear");
  assert.equal(cleared.revision, 4);
  assert.equal(cleared.priorSnapshot.type, "sick");
});

test("previewMassDayRange counts inclusive days", () => {
  assert.deepEqual(previewMassDayRange(3, 5, 31), {
    ok: true,
    days: [3, 4, 5],
    affectedCount: 3
  });
  assert.equal(previewMassDayRange(5, 3, 31).ok, false);
  assert.equal(previewMassDayRange(0, 2, 31).ok, false);
});

test("assignment undo route and soft-clear are wired", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(routes, /\/api\/staff\/shifts\/assignment\/undo/);
  assert.match(routes, /shift_undone/);
  assert.match(routes, /buildClearedShift/);
  assert.match(routes, /capturePriorSnapshot/);
});

test("monthly plan UI no longer saveState on empty shell; mass + undo actions exist", () => {
  const monthly = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/monthly-plans.js"), "utf8");
  // Day edits must not auto-save empty shells; demo month-clear may call saveState for audit only.
  assert.match(monthly, /Intentionally no saveState/);
  assert.match(monthly, /previewMonthlyMassAbsence/);
  assert.match(monthly, /undoMonthlyDayEdit/);
  assert.match(monthly, /monthly-plan-thead/);
  assert.match(monthly, /renderGroupMonthMatrix/);
  assert.match(monthly, /isCatalogLockedForLine/);
  assert.match(monthly, /recordDemoChangeReason/);
});

test("dispatcher hub bulk plan import is deferred in staff HTML", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../staff.html"), "utf8");
  assert.match(html, /hub-section-extra-import" hidden/);
  assert.match(html, /med-undo-btn/);
  assert.match(html, /undoMonthlyDayEdit/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dispatcherCanAccessGroup,
  isActiveReportStatus,
  isResolvedReportStatus
} = require("../../server/report-lifecycle");

test("server report status and dispatcher group checks fail closed", () => {
  assert.equal(isActiveReportStatus("Aktivno"), true);
  assert.equal(isResolvedReportStatus("status_resolved"), true);
  assert.equal(isActiveReportStatus("unknown"), false);
  assert.equal(dispatcherCanAccessGroup(["310"], "310"), true);
  assert.equal(dispatcherCanAccessGroup(["310"], "105"), false);
  assert.equal(dispatcherCanAccessGroup([], "310"), false);
  assert.equal(dispatcherCanAccessGroup(["310"], null), false);
});


import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");

test("report creation stores a server-derived group and resolution is dispatcher-only, scoped and audited", () => {
  const server = read("../../server/driver-routes.js");
  assert.match(server, /groupId: profileSnap\.data\(\)\.groupId \|\| profileSnap\.data\(\)\.lineId/);
  assert.match(server, /\/api\/staff\/reports\/:reportId\/resolve[\s\S]*?req\.staff\.role !== "dispatcher"/);
  assert.match(server, /dispatcherCanAccessGroup\(req\.staff\.groups, groupId\)/);
  assert.match(server, /status: "resolved"[\s\S]*?resolvedAt[\s\S]*?resolvedBy/);
  assert.match(server, /"driver_report_resolved"/);
});

test("report writes are server-only and global state sync cannot bypass lifecycle", () => {
  const rules = read("../../firestore.rules");
  const sync = read("../../js/core/firebase-service.js");
  const reportBlock = rules.match(/match \/companies\/\{companyId\}\/reports\/\{reportId\}[\s\S]*?\n {4}}/)[0];
  assert.match(reportBlock, /isDispatcherAssignedGroup/);
  assert.match(reportBlock, /resource\.data\.driverId == request\.auth\.uid/);
  assert.match(reportBlock, /allow create, update, delete: if false/);
  assert.match(sync, /item\.key === "reports"/);
});

test("report UI has one locked resolution path, no delete and hides resolved records from dashboard alerts", () => {
  const reports = read("../../js/dispatcher/reports.js");
  const dashboard = read("../../js/dispatcher/dashboard.js");
  assert.match(reports, /pendingReportResolutions/);
  assert.match(reports, /ApiClient\.resolveStaffReport/);
  assert.doesNotMatch(reports, /function deleteReport|trash-2/);
  assert.match(dashboard, /\.filter\(isActiveReport\)/);
  assert.match(dashboard, /visibleOperationalReports/);
});


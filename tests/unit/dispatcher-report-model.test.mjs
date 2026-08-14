import test from "node:test";
import assert from "node:assert/strict";
import {
  isActiveReport,
  isResolvedReport,
  reportGroupId,
  scopedDispatcherReports,
  sortReportsForOperations
} from "../../js/dispatcher/report-model.js";

const currentUser = { id: "disp-1", role: "dispatcher", groups: ["310"] };
const dispatchers = [{ id: "disp-1", groups: ["310"] }];
const drivers = [
  { id: "drv-1", name: "Ana", groupId: "310" },
  { id: "drv-2", name: "Ben", groupId: "105" }
];

test("report lifecycle normalizes legacy statuses without keeping resolved alerts active", () => {
  for (const status of ["active", "Aktivno", "open"]) assert.equal(isActiveReport({ status }), true);
  for (const status of ["resolved", "Rešeno", "status_resolved"]) assert.equal(isResolvedReport({ status }), true);
  assert.equal(isActiveReport({ status: "resolved" }), false);
});

test("dispatcher reports fail closed outside assigned groups and production requires a stable identity", () => {
  const reports = [
    { id: "own", groupId: "310", status: "active" },
    { id: "other", groupId: "105", status: "active" },
    { id: "own-driver", driverId: "drv-1", status: "active" },
    { id: "legacy-name", driver: "Ana", status: "active" }
  ];
  assert.deepEqual(scopedDispatcherReports({ reports, drivers, dispatchers, currentUser }).map(report => report.id), ["own", "own-driver"]);
  assert.deepEqual(scopedDispatcherReports({ reports, drivers, dispatchers, currentUser, demo: true }).map(report => report.id), ["own", "own-driver", "legacy-name"]);
  assert.equal(reportGroupId(reports[3], drivers), "");
});

test("operational sorting keeps active newest first and resolved records in history", () => {
  const sorted = sortReportsForOperations([
    { id: "resolved-new", status: "resolved", createdAt: "2026-07-22T12:00:00Z" },
    { id: "active-old", status: "active", createdAt: "2026-07-22T08:00:00Z" },
    { id: "active-new", status: "active", createdAt: "2026-07-22T10:00:00Z" }
  ]);
  assert.deepEqual(sorted.map(report => report.id), ["active-new", "active-old", "resolved-new"]);
});


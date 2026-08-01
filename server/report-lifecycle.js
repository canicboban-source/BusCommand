"use strict";

const ACTIVE_REPORT_STATUSES = new Set(["active", "aktivno", "open"]);
const RESOLVED_REPORT_STATUSES = new Set(["resolved", "rešeno", "reseno", "status_resolved"]);

function normalizedReportStatus(value) {
  return String(value || "active").trim().toLowerCase();
}

function isActiveReportStatus(value) {
  return ACTIVE_REPORT_STATUSES.has(normalizedReportStatus(value));
}

function isResolvedReportStatus(value) {
  return RESOLVED_REPORT_STATUSES.has(normalizedReportStatus(value));
}

function dispatcherCanAccessGroup(groups, groupId) {
  const assigned = new Set(Array.isArray(groups) ? groups.map(value => String(value).trim()) : []);
  return Boolean(groupId) && assigned.has(String(groupId).trim());
}

module.exports = {
  dispatcherCanAccessGroup,
  isActiveReportStatus,
  isResolvedReportStatus,
  normalizedReportStatus
};

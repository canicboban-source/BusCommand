"use strict";

const {
  isOpenProblemStatus,
  isTerminalProblemStatus,
  normalizedProblemStatus
} = require("./problem-resolution");

const ACTIVE_REPORT_STATUSES = new Set([
  "active",
  "aktivno",
  "open",
  "acknowledged",
  "solution_proposed",
  "applying"
]);
const RESOLVED_REPORT_STATUSES = new Set(["resolved", "rešeno", "reseno", "status_resolved", "cancelled"]);

function normalizedReportStatus(value) {
  return normalizedProblemStatus(value);
}

function isActiveReportStatus(value) {
  return ACTIVE_REPORT_STATUSES.has(String(value || "").trim().toLowerCase())
    || isOpenProblemStatus(value);
}

function isResolvedReportStatus(value) {
  return RESOLVED_REPORT_STATUSES.has(String(value || "").trim().toLowerCase())
    || isTerminalProblemStatus(value);
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

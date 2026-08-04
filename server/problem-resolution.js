/**
 * Universal problem-resolution lifecycle (§9 / Ch9).
 *
 * open → acknowledged → solution_proposed → applying → resolved
 *                                                    ↘ cancelled
 * Legacy `active` maps to `open` for reads/transitions.
 */

"use strict";

const PROBLEM_STATUSES = Object.freeze([
  "open",
  "acknowledged",
  "solution_proposed",
  "applying",
  "resolved",
  "cancelled"
]);

const OPEN_PROBLEM_STATUSES = new Set([
  "open",
  "acknowledged",
  "solution_proposed",
  "applying",
  "active", // legacy
  "aktivno"
]);

const TERMINAL_PROBLEM_STATUSES = new Set([
  "resolved",
  "cancelled",
  "rešeno",
  "reseno",
  "status_resolved"
]);

const TRANSITIONS = Object.freeze({
  open: ["acknowledged", "solution_proposed", "applying", "cancelled"],
  active: ["acknowledged", "solution_proposed", "applying", "cancelled"],
  acknowledged: ["solution_proposed", "applying", "cancelled"],
  solution_proposed: ["applying", "acknowledged", "cancelled"],
  applying: ["resolved", "cancelled"],
  resolved: [],
  cancelled: []
});

function normalizedProblemStatus(value) {
  const raw = String(value || "open").trim().toLowerCase();
  if (raw === "active" || raw === "aktivno") return "open";
  if (raw === "rešeno" || raw === "reseno" || raw === "status_resolved") return "resolved";
  return raw;
}

function isOpenProblemStatus(value) {
  return OPEN_PROBLEM_STATUSES.has(String(value || "").trim().toLowerCase())
    || OPEN_PROBLEM_STATUSES.has(normalizedProblemStatus(value));
}

function isTerminalProblemStatus(value) {
  return TERMINAL_PROBLEM_STATUSES.has(String(value || "").trim().toLowerCase())
    || TERMINAL_PROBLEM_STATUSES.has(normalizedProblemStatus(value));
}

function currentProblemRevision(report) {
  const value = report?.revision;
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function canTransitionProblem(fromStatus, toStatus) {
  const from = normalizedProblemStatus(fromStatus);
  const to = normalizedProblemStatus(toStatus);
  if (!PROBLEM_STATUSES.includes(to)) return false;
  if (from === to) return false;
  const allowed = TRANSITIONS[from] || TRANSITIONS[normalizedProblemStatus(fromStatus)] || [];
  return allowed.includes(to);
}

/**
 * Pure transition helper — used by API + unit tests.
 * Does not write Firestore.
 */
function simulateProblemTransition(existing, toStatus, opts = {}) {
  if (!existing || isTerminalProblemStatus(existing.status)) {
    return { ok: false, code: "INCIDENT_NOT_ACTIVE", currentRevision: currentProblemRevision(existing) };
  }
  const expectedRevision = opts.expectedRevision;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, code: "INVALID_REVISION" };
  }
  const current = currentProblemRevision(existing);
  if (current !== expectedRevision) {
    return {
      ok: false,
      code: "REVISION_CONFLICT",
      currentRevision: current
    };
  }
  if (!canTransitionProblem(existing.status, toStatus)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      from: normalizedProblemStatus(existing.status),
      to: normalizedProblemStatus(toStatus)
    };
  }
  const nextStatus = normalizedProblemStatus(toStatus);
  const revision = current + 1;
  const patch = {
    status: nextStatus,
    revision,
    assigneeId: opts.assigneeId !== undefined
      ? (opts.assigneeId || null)
      : (existing.assigneeId || null),
    proposedSolution: opts.proposedSolution !== undefined
      ? String(opts.proposedSolution || "").trim().slice(0, 1000)
      : (existing.proposedSolution || ""),
    lifecycle: {
      ...(existing.lifecycle && typeof existing.lifecycle === "object" ? existing.lifecycle : {}),
      [nextStatus]: opts.at || "ts"
    }
  };
  if (opts.actorId) {
    patch.lastTransitionBy = opts.actorId;
  }
  return { ok: true, revision, status: nextStatus, patch };
}

function buildProblemCreateFields({
  affectedEntity = "driver",
  reporterId,
  assigneeId = null,
  at = null
}) {
  const entity = affectedEntity === "vehicle" ? "vehicle" : "driver";
  return {
    status: "open",
    revision: 0,
    affectedEntity: entity,
    reporterId: reporterId || null,
    assigneeId: assigneeId || null,
    proposedSolution: "",
    lifecycle: {
      open: at || "ts"
    }
  };
}

/** Ops audit actions shown in dispatcher recent-activity feed. */
const OPS_ACTIVITY_ACTIONS = new Set([
  "operational_incident_created",
  "operational_incident_transitioned",
  "operational_incident_resolved",
  "shift_assigned",
  "shift_removed",
  "shift_undone",
  "report_resolved",
  "staff_message_sent"
]);

function isOpsActivityAction(action) {
  return OPS_ACTIVITY_ACTIONS.has(String(action || ""));
}

module.exports = {
  PROBLEM_STATUSES,
  OPEN_PROBLEM_STATUSES,
  TERMINAL_PROBLEM_STATUSES,
  OPS_ACTIVITY_ACTIONS,
  normalizedProblemStatus,
  isOpenProblemStatus,
  isTerminalProblemStatus,
  currentProblemRevision,
  canTransitionProblem,
  simulateProblemTransition,
  buildProblemCreateFields,
  isOpsActivityAction
};

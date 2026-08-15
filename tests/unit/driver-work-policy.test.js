const test = require("node:test");
const assert = require("node:assert/strict");
const {
  confirmationTargetDates,
  isWeekendPackageSourceDay,
  buildConfirmationTargets,
  evaluateDriverWorkPolicy
} = require("../../server/driver-work-policy");
const {
  planOutboxUpsert,
  buildOutboxEntries,
  planDispatchAttempt,
  shouldRetry,
  deliveryIdempotencyKey,
  summarizeOutboxStatuses,
  classifyOutboxForOps
} = require("../../server/confirmation-outbox");

const shift = (date, start = "06:00", end = "14:00") => ({
  date, type: "morning", start, end, name: `Shift ${date}`
});

test("company timezone, not device time, controls the work window", () => {
  const { localDateTimeToUtc } = require("../../server/driver-work-policy");
  assert.equal(localDateTimeToUtc("2026-07-22", "06:00", "Europe/Vienna").toISOString(), "2026-07-22T04:00:00.000Z");
  const policy = evaluateDriverWorkPolicy({
    now: new Date("2026-07-22T12:10:00.000Z"), timezone: "Europe/Vienna",
    shifts: [shift("2026-07-22")]
  });
  assert.equal(policy.status, "grace");
  assert.equal(policy.notificationsUntil, "2026-07-22T12:00:00.000Z");
  assert.equal(policy.sessionEndsAt, "2026-07-22T12:30:00.000Z");
});

test("overnight shifts end on the following local day", () => {
  const policy = evaluateDriverWorkPolicy({
    now: new Date("2026-07-23T00:00:00.000Z"), timezone: "Europe/Belgrade",
    shifts: [shift("2026-07-22", "22:00", "03:00")]
  });
  assert.equal(policy.status, "active");
  assert.equal(policy.notificationsUntil, "2026-07-23T01:00:00.000Z");
});

test("Friday confirmation package includes assigned weekend and Monday shifts", () => {
  const data = { shifts: [
    shift("2026-07-24"), shift("2026-07-25"),
    { date: "2026-07-26", type: "off" }, shift("2026-07-27")
  ] };
  assert.deepEqual(confirmationTargetDates(data, "2026-07-24"), ["2026-07-25", "2026-07-27"]);
  const targets = buildConfirmationTargets(data, "2026-07-24");
  assert.equal(targets[0].label, "saturday");
  assert.equal(targets[1].label, "monday");
  assert.equal(targets[0].separateRequest, true);
  assert.notEqual(targets[0].requestId, targets[1].requestId);
});

test("Thursday becomes the weekend confirmation day when Friday is free", () => {
  const data = { shifts: [
    shift("2026-07-23"), { date: "2026-07-24", type: "off" },
    shift("2026-07-25"), shift("2026-07-27")
  ] };
  assert.equal(isWeekendPackageSourceDay(data, "2026-07-23"), true);
  assert.deepEqual(confirmationTargetDates(data, "2026-07-23"), ["2026-07-25", "2026-07-27"]);
});

test("Wednesday is weekend package day when Thu and Fri are free", () => {
  const data = { shifts: [
    shift("2026-07-22"),
    { date: "2026-07-23", type: "off" },
    { date: "2026-07-24", type: "off" },
    shift("2026-07-25"),
    shift("2026-07-27")
  ] };
  assert.equal(isWeekendPackageSourceDay(data, "2026-07-22"), true);
  assert.equal(isWeekendPackageSourceDay(data, "2026-07-21"), false);
  assert.deepEqual(confirmationTargetDates(data, "2026-07-22"), ["2026-07-25", "2026-07-27"]);
});

test("ordinary workdays request only the next assigned shift", () => {
  const data = { shifts: [shift("2026-07-21"), shift("2026-07-22"), shift("2026-07-23")] };
  assert.deepEqual(confirmationTargetDates(data, "2026-07-21"), ["2026-07-22"]);
  const targets = buildConfirmationTargets(data, "2026-07-21");
  assert.equal(targets[0].label, "next_shift");
});

test("outbox upsert is idempotent for same fingerprint", () => {
  const entry = buildOutboxEntries({
    companyId: "bc-test",
    driverId: "drv1",
    sourceShiftDate: "2026-07-24",
    timezone: "Europe/Vienna",
    targets: [{ date: "2026-07-25", fingerprint: "abc", label: "saturday", requestId: "2026-07-24_2026-07-25" }]
  })[0];
  const first = planOutboxUpsert(null, entry);
  assert.equal(first.action, "create");
  const second = planOutboxUpsert(first.patch, entry);
  assert.equal(second.action, "skip");
});

test("outbox recreates pending when plan fingerprint changes", () => {
  const oldEntry = {
    fingerprint: "old",
    status: "delivered",
    createdAt: "2026-07-24T10:00:00.000Z"
  };
  const next = buildOutboxEntries({
    companyId: "bc-test",
    driverId: "drv1",
    sourceShiftDate: "2026-07-24",
    timezone: "Europe/Vienna",
    targets: [{ date: "2026-07-25", fingerprint: "new", label: "saturday", requestId: "r1" }]
  })[0];
  const plan = planOutboxUpsert(oldEntry, next);
  assert.equal(plan.action, "cancel_stale");
  assert.equal(plan.patch.fingerprint, "new");
  assert.equal(plan.patch.status, "pending");
  assert.equal(plan.patch.previousFingerprint, "old");
});

test("dispatch retry respects backoff window", () => {
  const now = new Date("2026-07-24T12:00:00.000Z");
  const failed = planDispatchAttempt({ attempts: 0 }, { ok: false, error: "timeout" }, now);
  assert.equal(failed.status, "failed");
  assert.equal(shouldRetry(failed, now), false);
  assert.equal(shouldRetry(failed, new Date("2026-07-24T12:03:00.000Z")), true);
});

test("delivery idempotency key is stable", () => {
  const a = deliveryIdempotencyKey({
    companyId: "c1", driverId: "d1", targetDate: "2026-07-25", fingerprint: "fp", channel: "in_app"
  });
  const b = deliveryIdempotencyKey({
    companyId: "c1", driverId: "d1", targetDate: "2026-07-25", fingerprint: "fp", channel: "in_app"
  });
  const c = deliveryIdempotencyKey({
    companyId: "c1", driverId: "d1", targetDate: "2026-07-25", fingerprint: "other", channel: "in_app"
  });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("outbox status summary counts known and unknown statuses", () => {
  const summary = summarizeOutboxStatuses([
    { status: "pending" },
    { status: "delivered" },
    { status: "failed" },
    { status: "failed" },
    { status: "confirmed" },
    { status: "weird" }
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.pending, 1);
  assert.equal(summary.delivered, 1);
  assert.equal(summary.failed, 2);
  assert.equal(summary.confirmed, 1);
  assert.equal(summary.other, 1);
});

test("ops classification separates failed delivery from awaiting confirm", () => {
  const confirmed = new Set(["drv1|2026-07-26"]);
  assert.equal(classifyOutboxForOps({
    driverId: "drv1", targetDate: "2026-07-26", status: "delivered"
  }, confirmed), null);

  const failed = classifyOutboxForOps({
    driverId: "drv2",
    targetDate: "2026-07-27",
    status: "failed",
    label: "sunday",
    attempts: 3,
    lastError: "sms_timeout"
  }, confirmed);
  assert.equal(failed.kind, "delivery_failed");
  assert.equal(failed.severity, "critical");
  assert.equal(failed.attempts, 3);

  const awaiting = classifyOutboxForOps({
    driverId: "drv3",
    targetDate: "2026-07-28",
    status: "delivered",
    label: "monday"
  }, confirmed);
  assert.equal(awaiting.kind, "awaiting_confirm");
  assert.equal(awaiting.severity, "warning");

  const queued = classifyOutboxForOps({
    driverId: "drv4",
    targetDate: "2026-07-28",
    status: "pending"
  }, confirmed);
  assert.equal(queued.kind, "pending_send");
});

test("ops classification marks past targetDate as expired", () => {
  const expired = classifyOutboxForOps({
    driverId: "drv5",
    targetDate: "2026-07-20",
    status: "delivered"
  }, new Set(), { today: "2026-07-28" });
  assert.equal(expired.kind, "expired");
  assert.equal(expired.severity, "warning");
});

test("ops classification marks fingerprint mismatch as expired", () => {
  const live = new Map([["drv6|2026-07-29", "fp-new"]]);
  const row = classifyOutboxForOps({
    driverId: "drv6",
    targetDate: "2026-07-29",
    status: "delivered",
    fingerprint: "fp-old"
  }, new Set(), { today: "2026-07-28", liveFingerprints: live });
  assert.equal(row.kind, "expired");
  assert.equal(row.lastError, "fingerprint_mismatch");
});

test("invalidate outbox cancels confirmed and pending rows", () => {
  const { planInvalidateOutbox } = require("../../server/confirmation-outbox");
  const cancelled = planInvalidateOutbox({
    status: "confirmed",
    fingerprint: "fp1"
  }, "staff_assignment", new Date("2026-07-28T10:00:00.000Z"));
  assert.equal(cancelled.action, "cancel");
  assert.equal(cancelled.patch.status, "cancelled");
  assert.equal(cancelled.patch.cancelReason, "staff_assignment");

  const skip = planInvalidateOutbox({ status: "cancelled" }, "staff_assignment");
  assert.equal(skip.action, "skip");
});

test("dispatch retry stops after max attempts", () => {
  const { MAX_DISPATCH_ATTEMPTS, planDispatchAttempt, shouldRetry } = require("../../server/confirmation-outbox");
  const now = new Date("2026-07-28T10:00:00.000Z");
  let row = { status: "pending", attempts: MAX_DISPATCH_ATTEMPTS - 1 };
  const terminal = planDispatchAttempt(row, { ok: false, error: "boom" }, now);
  assert.equal(terminal.status, "failed");
  assert.equal(terminal.attempts, MAX_DISPATCH_ATTEMPTS);
  assert.equal(terminal.terminalFailure, true);
  assert.equal(terminal.nextRetryAt, null);
  assert.equal(shouldRetry(terminal, now), false);
});

test("stale confirmation detects fingerprint and bound revision drift", () => {
  const { isStaleConfirmation } = require("../../server/confirmation-outbox");
  assert.equal(isStaleConfirmation({
    shiftFingerprint: "a",
    confirmationBoundRevision: 2
  }, { liveFingerprint: "b", liveRevision: 2 }), true);
  assert.equal(isStaleConfirmation({
    shiftFingerprint: "a",
    confirmationBoundRevision: 1
  }, { liveFingerprint: "a", liveRevision: 2 }), true);
  assert.equal(isStaleConfirmation({
    shiftFingerprint: "a",
    confirmationBoundRevision: 2
  }, { liveFingerprint: "a", liveRevision: 2 }), false);
});

test("plan change after confirm reopens outbox via cancel_stale", () => {
  const plan = planOutboxUpsert({
    status: "confirmed",
    fingerprint: "old",
    createdAt: "2026-07-27T08:00:00.000Z"
  }, {
    companyId: "c1",
    driverId: "d1",
    targetDate: "2026-07-29",
    fingerprint: "new",
    label: "next_shift"
  }, new Date("2026-07-28T10:00:00.000Z"));
  assert.equal(plan.action, "cancel_stale");
  assert.equal(plan.patch.status, "pending");
  assert.equal(plan.patch.fingerprint, "new");
  assert.equal(plan.patch.previousFingerprint, "old");
});

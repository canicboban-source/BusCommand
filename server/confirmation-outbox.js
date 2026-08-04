/**
 * Confirmation outbox — idempotent request records for next-shift confirms.
 * Doc id = driverId_targetDate (stable). Fingerprint change cancels + recreates logic.
 * Chapter 10: invalidate on plan change, expired attention, max retry.
 */
const crypto = require("crypto");

const OUTBOX_STATUSES = Object.freeze([
  "pending",
  "delivered",
  "failed",
  "cancelled",
  "confirmed"
]);

/** After this many failed dispatch attempts, stop retrying (terminal failure). */
const MAX_DISPATCH_ATTEMPTS = 8;

function outboxDocId(driverId, targetDate) {
  return `${String(driverId)}_${String(targetDate)}`;
}

function confirmationDocId(driverId, date) {
  return `${String(driverId)}_${String(date)}`;
}

function deliveryIdempotencyKey({ companyId, driverId, targetDate, fingerprint, channel }) {
  const raw = [companyId, driverId, targetDate, fingerprint, channel || "in_app"].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Merge one outbox write against an existing doc.
 * Returns { action: 'create'|'update'|'skip'|'cancel_stale', patch }
 */
function planOutboxUpsert(existing, entry, now = new Date()) {
  const iso = now.toISOString();
  if (!existing) {
    return {
      action: "create",
      patch: {
        ...entry,
        status: "pending",
        attempts: 0,
        lastAttemptAt: null,
        lastError: null,
        deliveredAt: null,
        createdAt: iso,
        updatedAt: iso
      }
    };
  }

  if (existing.status === "confirmed") {
    // Plan fingerprint changed after confirm — must reopen (§10 invalidate).
    if (existing.fingerprint && entry.fingerprint && existing.fingerprint !== entry.fingerprint) {
      return {
        action: "cancel_stale",
        patch: {
          ...entry,
          status: "pending",
          attempts: 0,
          lastAttemptAt: null,
          lastError: null,
          deliveredAt: null,
          confirmedAt: null,
          previousFingerprint: existing.fingerprint,
          createdAt: existing.createdAt || iso,
          updatedAt: iso
        }
      };
    }
    return { action: "skip", patch: null };
  }

  if (existing.fingerprint === entry.fingerprint) {
    if (existing.status === "delivered" || existing.status === "pending") {
      return { action: "skip", patch: null };
    }
    if (existing.status === "failed") {
      const attempts = Number(existing.attempts || 0);
      if (attempts >= MAX_DISPATCH_ATTEMPTS) {
        return { action: "skip", patch: null };
      }
      return {
        action: "update",
        patch: {
          status: "pending",
          updatedAt: iso,
          lastError: null,
          nextRetryAt: null,
          terminalFailure: false
        }
      };
    }
    if (existing.status === "cancelled") {
      return {
        action: "create",
        patch: {
          ...entry,
          status: "pending",
          attempts: 0,
          lastAttemptAt: null,
          lastError: null,
          deliveredAt: null,
          createdAt: existing.createdAt || iso,
          updatedAt: iso
        }
      };
    }
    return { action: "skip", patch: null };
  }

  // Plan changed — cancel stale fingerprint identity via rewrite
  return {
    action: "cancel_stale",
    patch: {
      ...entry,
      status: "pending",
      attempts: 0,
      lastAttemptAt: null,
      lastError: null,
      deliveredAt: null,
      confirmedAt: null,
      previousFingerprint: existing.fingerprint || null,
      createdAt: existing.createdAt || iso,
      updatedAt: iso
    }
  };
}

/** Staff mutate / resolve: cancel outstanding outbox row without recreating. */
function planInvalidateOutbox(existing, reason = "plan_changed", now = new Date()) {
  if (!existing) return { action: "skip", patch: null };
  if (existing.status === "cancelled") return { action: "skip", patch: null };
  const iso = now.toISOString();
  return {
    action: "cancel",
    patch: {
      status: "cancelled",
      cancelledAt: iso,
      cancelReason: String(reason || "plan_changed").slice(0, 120),
      updatedAt: iso,
      confirmedAt: existing.status === "confirmed" ? null : (existing.confirmedAt || null)
    }
  };
}

/**
 * A stored confirmation is stale when fingerprint or bound revision no longer
 * matches the live shift (§5 / §10).
 */
function isStaleConfirmation(confirmation, { liveFingerprint = null, liveRevision = null } = {}) {
  if (!confirmation) return true;
  if (liveFingerprint
    && confirmation.shiftFingerprint
    && confirmation.shiftFingerprint !== liveFingerprint) {
    return true;
  }
  if (Number.isInteger(confirmation.confirmationBoundRevision)
    && Number.isInteger(liveRevision)
    && confirmation.confirmationBoundRevision !== liveRevision) {
    return true;
  }
  return false;
}

function buildOutboxEntries({
  companyId,
  driverId,
  sourceShiftDate,
  timezone,
  targets = [],
  now = new Date()
}) {
  return targets.map((target) => ({
    companyId,
    driverId,
    sourceShiftDate,
    targetDate: target.date,
    fingerprint: target.fingerprint,
    label: target.label || "next_shift",
    requestId: target.requestId || `${sourceShiftDate}_${target.date}`,
    timezone,
    channel: "in_app",
    idempotencyKey: deliveryIdempotencyKey({
      companyId,
      driverId,
      targetDate: target.date,
      fingerprint: target.fingerprint,
      channel: "in_app"
    }),
    enqueuedAt: now.toISOString()
  }));
}

function nextRetryAt(attempts, now = new Date()) {
  const minutes = Math.min(60, 2 ** Math.max(0, attempts));
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

function planDispatchAttempt(existing, { ok, error = null, channel = "in_app" }, now = new Date()) {
  const attempts = Number(existing?.attempts || 0) + 1;
  const iso = now.toISOString();
  if (ok) {
    return {
      status: "delivered",
      attempts,
      lastAttemptAt: iso,
      lastError: null,
      deliveredAt: iso,
      channel,
      terminalFailure: false,
      nextRetryAt: null,
      updatedAt: iso
    };
  }
  const terminal = attempts >= MAX_DISPATCH_ATTEMPTS;
  return {
    status: "failed",
    attempts,
    lastAttemptAt: iso,
    lastError: String(error || "delivery_failed").slice(0, 200),
    nextRetryAt: terminal ? null : nextRetryAt(attempts, now),
    terminalFailure: terminal,
    updatedAt: iso
  };
}

function shouldRetry(existing, now = new Date()) {
  if (!existing || existing.status !== "failed") return false;
  if (existing.terminalFailure === true) return false;
  if (Number(existing.attempts || 0) >= MAX_DISPATCH_ATTEMPTS) return false;
  if (!existing.nextRetryAt) return true;
  return new Date(existing.nextRetryAt).getTime() <= now.getTime();
}

function summarizeOutboxStatuses(rows = []) {
  const summary = {
    pending: 0,
    delivered: 0,
    failed: 0,
    confirmed: 0,
    cancelled: 0,
    expired: 0,
    other: 0,
    total: 0
  };
  for (const row of rows) {
    summary.total += 1;
    const status = String(row?.status || "");
    if (status === "pending" || status === "delivered" || status === "failed"
      || status === "confirmed" || status === "cancelled") {
      summary[status] += 1;
    } else {
      summary.other += 1;
    }
  }
  return summary;
}

/**
 * Classify an outbox row for dispatcher ops ("Čeka akciju").
 * confirmedKeys = Set(`${driverId}|${date}`) from *valid* shift_confirmations.
 * opts.today = YYYY-MM-DD in tenant timezone (for expired).
 * opts.liveFingerprints = Map key → current shift fingerprint.
 */
function classifyOutboxForOps(row, confirmedKeys = new Set(), opts = {}) {
  if (!row?.driverId || !row?.targetDate) return null;
  if (row.status === "cancelled" || row.status === "confirmed") return null;
  const key = `${row.driverId}|${row.targetDate}`;
  if (confirmedKeys.has(key)) return null;

  const today = opts.today || null;
  const liveFingerprints = opts.liveFingerprints || null;
  if (liveFingerprints) {
    const live = liveFingerprints.get(key);
    if (live && row.fingerprint && live !== row.fingerprint) {
      return {
        kind: "expired",
        severity: "warning",
        driverId: row.driverId,
        targetDate: row.targetDate,
        label: row.label || "next_shift",
        attempts: Number(row.attempts || 0),
        lastError: "fingerprint_mismatch",
        nextRetryAt: null,
        status: row.status
      };
    }
  }

  if (today && String(row.targetDate) < String(today)) {
    return {
      kind: "expired",
      severity: "warning",
      driverId: row.driverId,
      targetDate: row.targetDate,
      label: row.label || "next_shift",
      attempts: Number(row.attempts || 0),
      lastError: row.lastError || null,
      nextRetryAt: null,
      status: row.status
    };
  }

  if (row.status === "failed") {
    return {
      kind: "delivery_failed",
      severity: "critical",
      driverId: row.driverId,
      targetDate: row.targetDate,
      label: row.label || "next_shift",
      attempts: Number(row.attempts || 0),
      lastError: row.lastError || null,
      nextRetryAt: row.nextRetryAt || null,
      status: row.status,
      terminalFailure: row.terminalFailure === true
        || Number(row.attempts || 0) >= MAX_DISPATCH_ATTEMPTS
    };
  }

  if (row.status === "pending") {
    return {
      kind: "pending_send",
      severity: "warning",
      driverId: row.driverId,
      targetDate: row.targetDate,
      label: row.label || "next_shift",
      attempts: Number(row.attempts || 0),
      lastError: null,
      nextRetryAt: null,
      status: row.status
    };
  }

  // delivered (or unknown non-terminal) → waiting for driver confirm click
  return {
    kind: "awaiting_confirm",
    severity: "warning",
    driverId: row.driverId,
    targetDate: row.targetDate,
    label: row.label || "next_shift",
    attempts: Number(row.attempts || 0),
    lastError: null,
    nextRetryAt: null,
    status: row.status || "delivered"
  };
}

module.exports = {
  OUTBOX_STATUSES,
  MAX_DISPATCH_ATTEMPTS,
  outboxDocId,
  confirmationDocId,
  deliveryIdempotencyKey,
  planOutboxUpsert,
  planInvalidateOutbox,
  isStaleConfirmation,
  buildOutboxEntries,
  planDispatchAttempt,
  shouldRetry,
  nextRetryAt,
  summarizeOutboxStatuses,
  classifyOutboxForOps
};

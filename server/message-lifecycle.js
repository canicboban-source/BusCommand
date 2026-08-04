/**
 * Message delivery lifecycle (§12 / Ch11).
 * In-app channel: Firestore write = delivered. Read/ack are driver APIs only.
 * Client must never invent status / deliveredAt / ackedAt.
 */
"use strict";

const MESSAGE_STATUSES = Object.freeze([
  "queued",
  "sent",
  "delivered",
  "read",
  "failed"
]);

const MAX_DELIVERY_ATTEMPTS = 5;

function shouldRequireAck({ requiresAck, type, template } = {}) {
  if (requiresAck === true) return true;
  if (requiresAck === false) return false;
  const tmpl = String(template || "");
  if (type === "urgent") return true;
  return tmpl === "tmpl_call_dispatch" || tmpl === "tmpl_pax_incident";
}

/**
 * Initial delivery fields for a newly written staff message.
 * In-app provider: queued → sent → delivered in one write (doc is immediately visible).
 */
function buildDeliveryFields({
  requiresAck = false,
  nowIso = new Date().toISOString(),
  channel = "in_app",
  purpose = "operational_staff_message",
  idempotencyKey = null
} = {}) {
  return {
    status: "delivered",
    deliveryChannel: channel,
    attempts: 1,
    lastError: null,
    nextRetryAt: null,
    queuedAt: nowIso,
    sentAt: nowIso,
    deliveredAt: nowIso,
    readAt: null,
    requiresAck: requiresAck === true,
    ackedAt: null,
    ackedBy: null,
    purpose,
    idempotencyKey: idempotencyKey || null
  };
}

function planMessageRead(existing, driverId, nowIso = new Date().toISOString()) {
  if (!existing) return { ok: false, reason: "missing" };
  return {
    ok: true,
    patch: {
      status: "read",
      read: existing.broadcast !== true,
      readAt: nowIso
    },
    driverId
  };
}

function planMessageAck(existing, driverId, nowIso = new Date().toISOString()) {
  if (!existing) return { ok: false, reason: "missing" };
  if (existing.requiresAck !== true) {
    return { ok: false, reason: "ack_not_required" };
  }
  if (existing.ackedBy && existing.ackedAt) {
    return { ok: true, already: true, patch: null };
  }
  return {
    ok: true,
    already: false,
    patch: {
      status: "read",
      read: existing.broadcast !== true,
      ackedAt: nowIso,
      ackedBy: driverId,
      readAt: nowIso
    }
  };
}

/** Outbound message still waiting for driver read or critical ack. */
function isAwaitingDriverReceipt(msg) {
  if (!msg) return false;
  if (msg.requiresAck === true) return !msg.ackedAt;
  if (msg.status === "read") return false;
  if (msg.status === "failed") return false;
  if (msg.broadcast !== true && msg.read === true) return false;
  if (Array.isArray(msg.readBy) && msg.readBy.length > 0 && msg.broadcast !== true) {
    return false;
  }
  // Legacy docs without status: unread personal = awaiting
  if (!msg.status) return msg.broadcast !== true ? !msg.read : true;
  return msg.status === "queued" || msg.status === "sent" || msg.status === "delivered";
}

function classifyOutboundForStaff(msg) {
  if (!msg) return null;
  if (msg.status === "failed") {
    return { kind: "delivery_failed", severity: "critical", status: "failed" };
  }
  if (msg.requiresAck === true && !msg.ackedAt) {
    return { kind: "awaiting_ack", severity: "warning", status: msg.status || "delivered" };
  }
  if (msg.ackedAt || msg.status === "read" || (msg.broadcast !== true && msg.read === true)) {
    return { kind: "read", severity: "ok", status: "read" };
  }
  if (msg.status === "queued" || msg.status === "sent") {
    return { kind: "pending_send", severity: "warning", status: msg.status };
  }
  return { kind: "awaiting_read", severity: "warning", status: msg.status || "delivered" };
}

module.exports = {
  MESSAGE_STATUSES,
  MAX_DELIVERY_ATTEMPTS,
  shouldRequireAck,
  buildDeliveryFields,
  planMessageRead,
  planMessageAck,
  isAwaitingDriverReceipt,
  classifyOutboundForStaff
};

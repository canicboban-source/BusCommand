"use strict";

const SENSITIVE_KEY = /(?:password|passcode|pin|secret|token|credential|authorization|cookie|companycode|company_code|otp|activationcode|activation_code|logincode|login_code|\beid\b)/i;
const ALLOWED_CATEGORIES = new Set(["access", "drivers", "plans", "scheduling", "company", "other"]);

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function categoryFor(action = "") {
  if (/login|code_activat|session|map_access|location/i.test(action)) return "access";
  if (/driver|vacation|lost_item|quick_report|sos|staff_message|message_sent|message_read|message_ack|message_archiv/i.test(action)) return "drivers";
  if (/service_plan/i.test(action)) return "plans";
  if (/shift|schedule|state_sync/i.test(action)) return "scheduling";
  if (/company|dispatcher|group|branding|user/i.test(action)) return "company";
  return "other";
}

function sanitizeDetails(value, depth = 0) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 180);
  if (depth >= 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 12).map(item => sanitizeDetails(item, depth + 1));
  if (typeof value !== "object") return String(value).slice(0, 180);
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .slice(0, 24)
    .map(([key, item]) => [key.slice(0, 64), sanitizeDetails(item, depth + 1)]));
}

function normalizeAuditFilters(input = {}) {
  const category = ALLOWED_CATEGORIES.has(input.category) ? input.category : "";
  const actor = typeof input.actor === "string" ? input.actor.trim().slice(0, 120) : "";
  const action = typeof input.action === "string" ? input.action.trim().toLowerCase().slice(0, 80) : "";
  const from = toIso(input.from);
  const to = toIso(input.to);
  const cursor = toIso(input.cursor);
  const requested = Number.parseInt(input.limit, 10);
  const limit = Number.isFinite(requested) ? Math.min(50, Math.max(10, requested)) : 25;
  return { category, actor, action, from, to, cursor, limit };
}

function normalizeStateSyncDetails(input = {}) {
  const collections = {};
  const allowedCollections = new Set(["buses", "shifts", "schedules", "messages", "vacations", "lostItems", "reports", "dailyOverrides"]);
  for (const [key, value] of Object.entries(input.collections || {})) {
    if (!allowedCollections.has(key) || !value || typeof value !== "object") continue;
    collections[key] = {
      added: Math.min(500, Math.max(0, Number.parseInt(value.added, 10) || 0)),
      updated: Math.min(500, Math.max(0, Number.parseInt(value.updated, 10) || 0)),
      removed: Math.min(500, Math.max(0, Number.parseInt(value.removed, 10) || 0))
    };
  }
  return { collections, sosChanged: input.sosChanged === true };
}

function mapAuditDocument(doc) {
  const data = doc.data() || {};
  const action = String(data.action || "unknown").slice(0, 100);
  return {
    id: doc.id,
    action,
    category: categoryFor(action),
    actorId: String(data.actorId || "system").slice(0, 128),
    actorName: data.actorName ? String(data.actorName).slice(0, 120) : null,
    actorRole: data.actorRole ? String(data.actorRole).slice(0, 40) : null,
    source: data.source === "client-reported" ? "client-reported" : "server",
    timestamp: toIso(data.timestamp),
    details: sanitizeDetails(data.details || {})
  };
}

async function listAuditEvents({ db, companyId, filters = {} }) {
  const normalized = normalizeAuditFilters(filters);
  let query = db.collection("companies").doc(companyId).collection("audit_log").orderBy("timestamp", "desc");
  if (normalized.cursor) query = query.startAfter(new Date(normalized.cursor));
  const scanLimit = Math.min(250, normalized.limit * 5);
  const snapshot = await query.limit(scanLimit).get();
  const scanned = snapshot.docs.map(mapAuditDocument);
  const matches = scanned.filter(event => {
    if (!event.timestamp) return false;
    if (normalized.category && event.category !== normalized.category) return false;
    if (normalized.actor && !`${event.actorId} ${event.actorName || ""}`.toLowerCase().includes(normalized.actor.toLowerCase())) return false;
    if (normalized.action && !event.action.toLowerCase().includes(normalized.action)) return false;
    if (normalized.from && event.timestamp < normalized.from) return false;
    if (normalized.to && event.timestamp > normalized.to) return false;
    return true;
  });
  const events = matches.slice(0, normalized.limit);
  const lastScanned = scanned.at(-1);
  return {
    events,
    nextCursor: snapshot.docs.length === scanLimit && lastScanned?.timestamp ? lastScanned.timestamp : null
  };
}

module.exports = { categoryFor, listAuditEvents, mapAuditDocument, normalizeAuditFilters, normalizeStateSyncDetails, sanitizeDetails, toIso };

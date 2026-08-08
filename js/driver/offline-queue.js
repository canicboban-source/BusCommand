/**
 * Driver offline write queue (§15 / Ch13).
 * Queues non-critical reports/lost-items with idempotency keys.
 * SOS, confirmations and vacations are never queued as "complete".
 */
import { USE_LOCAL_STATE } from "../core/runtime-config.js";

const STORAGE_KEY = "buscommand_driver_offline_queue_v1";
const MAX_ITEMS = 40;
const ALLOWED_KINDS = new Set(["report", "lost_item"]);

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function readQueue() {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items) {
  const store = storage();
  if (!store) return;
  store.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `off_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  }
  return `off_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function listOfflineQueue() {
  return readQueue();
}

function enqueueOfflineWrite({ kind, payload, localRecord, createdAtClient = new Date().toISOString() }) {
  if (!ALLOWED_KINDS.has(kind) || !payload || typeof payload !== "object") {
    return { ok: false, reason: "invalid_kind" };
  }
  const idempotencyKey = payload.idempotencyKey || newIdempotencyKey();
  const item = {
    id: `q_${idempotencyKey}`,
    kind,
    payload: { ...payload, idempotencyKey },
    localRecord: localRecord || null,
    createdAtClient,
    status: "queued",
    attempts: 0
  };
  const next = [item, ...readQueue().filter((entry) => entry.id !== item.id)].slice(0, MAX_ITEMS);
  writeQueue(next);
  return { ok: true, item };
}

function removeOfflineWrite(id) {
  writeQueue(readQueue().filter((entry) => entry.id !== id));
}

function clearOfflineQueue() {
  const store = storage();
  if (store) store.removeItem(STORAGE_KEY);
}

function isProbablyOfflineError(result) {
  if (!result) return true;
  if (result.success) return false;
  const status = result.status;
  if (status === 0 || status == null) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const err = String(result.error || "").toLowerCase();
  return err.includes("failed to fetch") || err.includes("network") || err.includes("nevalidan odgovor");
}

async function flushOfflineQueue(api = null) {
  if (USE_LOCAL_STATE) return { flushed: 0, remaining: 0 };
  const client = api || (typeof window !== "undefined" ? window.ApiClient : null);
  if (!client) return { flushed: 0, remaining: readQueue().length };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { flushed: 0, remaining: readQueue().length };
  }

  let flushed = 0;
  const remaining = [];
  for (const entry of readQueue()) {
    try {
      let result;
      if (entry.kind === "report") {
        result = await client.createDriverReport(entry.payload);
      } else if (entry.kind === "lost_item") {
        result = await client.createDriverLostItem(entry.payload);
      } else {
        continue;
      }
      if (result?.success) {
        flushed += 1;
        if (entry.kind === "report" && Array.isArray(window.state?.reports) && entry.localRecord) {
          const idx = window.state.reports.findIndex((r) => r.id === entry.localRecord.id || r.idempotencyKey === entry.payload.idempotencyKey);
          if (idx >= 0) {
            Object.assign(window.state.reports[idx], result.report || {}, { status: "active", syncStatus: "sent" });
          }
        }
        if (entry.kind === "lost_item" && Array.isArray(window.state?.lostItems) && entry.localRecord) {
          const idx = window.state.lostItems.findIndex((r) => r.id === entry.localRecord.id || r.idempotencyKey === entry.payload.idempotencyKey);
          if (idx >= 0) {
            Object.assign(window.state.lostItems[idx], result.item || {}, { syncStatus: "sent" });
          }
        }
        continue;
      }
      if (isProbablyOfflineError(result) || result?.status >= 500) {
        remaining.push({ ...entry, attempts: (entry.attempts || 0) + 1, lastError: result?.error || "retry" });
      }
      // 4xx (except transient): drop to avoid poison loops
    } catch (error) {
      remaining.push({
        ...entry,
        attempts: (entry.attempts || 0) + 1,
        lastError: error?.message || "flush_failed"
      });
    }
  }
  writeQueue(remaining);
  return { flushed, remaining: remaining.length };
}

export {
  STORAGE_KEY,
  listOfflineQueue,
  enqueueOfflineWrite,
  removeOfflineWrite,
  clearOfflineQueue,
  flushOfflineQueue,
  isProbablyOfflineError,
  newIdempotencyKey
};

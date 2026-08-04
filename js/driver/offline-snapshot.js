/**
 * Minimal offline read snapshot for driver shift + recent messages (§15 / Ch13).
 * Cleared on logout / deactivation. TTL-bounded.
 */
const STORAGE_KEY = "buscommand_driver_offline_snapshot_v1";
const TTL_MS = 8 * 60 * 60 * 1000; // 8h

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function saveDriverOfflineSnapshot({
  companyId,
  driverId,
  policy,
  messages = [],
  savedAt = new Date().toISOString()
}) {
  if (!companyId || !driverId || !policy) return false;
  const store = storage();
  if (!store) return false;
  const payload = {
    companyId: String(companyId),
    driverId: String(driverId),
    savedAt,
    expiresAt: new Date(Date.parse(savedAt) + TTL_MS).toISOString(),
    policy: {
      status: policy.status || null,
      shiftStart: policy.shiftStart || policy.windowStart || null,
      shiftEnd: policy.shiftEnd || policy.windowEnd || null,
      notificationsUntil: policy.notificationsUntil || null,
      sessionEndsAt: policy.sessionEndsAt || null,
      groupId: policy.groupId || null,
      bus: policy.bus || null,
      confirmationTargets: Array.isArray(policy.confirmationTargets)
        ? policy.confirmationTargets.slice(0, 7).map((target) => ({
          date: target.date,
          confirmed: !!target.confirmed,
          label: target.label || null
        }))
        : []
    },
    messages: (Array.isArray(messages) ? messages : []).slice(0, 20).map((message) => ({
      id: message.id,
      subject: message.subject || message.title || "",
      body: typeof message.body === "string" ? message.body.slice(0, 500) : "",
      createdAt: message.createdAt || message.sentAt || null,
      requiresAck: !!message.requiresAck,
      status: message.status || null
    }))
  };
  store.setItem(STORAGE_KEY, JSON.stringify(payload));
  return true;
}

function readDriverOfflineSnapshot({ companyId, driverId, now = Date.now() } = {}) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.companyId !== companyId || data.driverId !== driverId) return null;
    if (Date.parse(data.expiresAt) < now) {
      store.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function clearDriverOfflineSnapshot() {
  const store = storage();
  if (store) store.removeItem(STORAGE_KEY);
}

async function clearDriverSensitiveCaches() {
  clearDriverOfflineSnapshot();
  try {
    const { clearOfflineQueue } = await import("./offline-queue.js");
    clearOfflineQueue();
  } catch { /* ignore */ }
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => String(key).startsWith("buscommand-driver-"))
        .map((key) => caches.delete(key))
    );
  } catch { /* ignore */ }
}

export {
  STORAGE_KEY,
  TTL_MS,
  saveDriverOfflineSnapshot,
  readDriverOfflineSnapshot,
  clearDriverOfflineSnapshot,
  clearDriverSensitiveCaches
};

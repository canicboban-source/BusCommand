/**
 * Driver network + sync status UI (§15 / Ch13).
 */
import { t } from "../ui/i18n.js";
import { flushOfflineQueue, listOfflineQueue } from "./offline-queue.js";
import ApiClient from "../core/api-client.js";
import { showToast } from "../core/utils.js";

const BANNER_ID = "driver-network-status";
let bound = false;
let flushing = false;

function ensureBanner() {
  let el = document.getElementById(BANNER_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = BANNER_ID;
  el.className = "driver-network-status hidden";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  const host = document.getElementById("app-container") || document.body;
  host.prepend(el);
  return el;
}

function renderNetworkStatus() {
  const el = ensureBanner();
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  const queued = listOfflineQueue().length;
  if (online && queued === 0) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  if (!online) {
    el.dataset.state = "offline";
    el.textContent = queued > 0
      ? t("driver_offline_queued", { count: queued })
      : t("driver_offline_banner");
    return;
  }
  el.dataset.state = "syncing";
  el.textContent = t("driver_sync_pending", { count: queued });
}

async function flushAndRefresh() {
  if (flushing) return;
  flushing = true;
  try {
    const result = await flushOfflineQueue(ApiClient);
    renderNetworkStatus();
    if (result.flushed > 0) {
      showToast(t("driver_sync_flushed", { count: result.flushed }), "success");
    }
  } finally {
    flushing = false;
    renderNetworkStatus();
  }
}

function startDriverNetworkStatus() {
  renderNetworkStatus();
  if (bound) return;
  bound = true;
  window.addEventListener("online", () => {
    renderNetworkStatus();
    flushAndRefresh();
  });
  window.addEventListener("offline", () => renderNetworkStatus());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && navigator.onLine) flushAndRefresh();
  });
  if (navigator.onLine && listOfflineQueue().length) flushAndRefresh();
}

export { startDriverNetworkStatus, renderNetworkStatus, flushAndRefresh };

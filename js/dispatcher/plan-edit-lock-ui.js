/**
 * Plan edit lock banner + heartbeat (daily plan full page).
 */
import ApiClient from "../core/api-client.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { canBreakPlanEditLock, canWriteOperationalRoster } from "../core/ui-permissions.js";
import { showToast, todayDateStr } from "../core/utils.js";
import { t } from "../ui/i18n.js";
import { showConfirm } from "../ui/confirm-modal.js";
import { buildLockId } from "./plan-edit-lock-client.js";
import {
  getDemoDayLock,
  ensureDemoDayLock,
  heartbeatDemoDayLock,
  releaseDemoDayLock,
  breakDemoDayLock
} from "./plan-edit-lock-demo.js";

const HEARTBEAT_MS = 60_000;
let heartbeatTimer = null;
let lastKnownLock = null;

function activeGroupId() {
  return window.state?.activeGroupHubId || null;
}

function currentUid() {
  return window.currentUser?.id || window.currentUser?.uid || null;
}

function currentRole() {
  return window.currentUser?.role || null;
}

function formatExpiry(expiresAtMs) {
  if (!expiresAtMs) return "";
  try {
    return new Date(expiresAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function stopPlanLockHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startPlanLockHeartbeat(groupId, dateStr) {
  stopPlanLockHeartbeat();
  if (!groupId || !dateStr) return;
  if (!canWriteOperationalRoster(currentRole())) return;
  heartbeatTimer = setInterval(() => {
    void tickHeartbeat(groupId, dateStr);
  }, HEARTBEAT_MS);
}

async function tickHeartbeat(groupId, dateStr) {
  const lockId = buildLockId("day", groupId, dateStr);
  if (!lockId) return;
  if (IS_DEMO_MODE) {
    const result = heartbeatDemoDayLock(groupId, dateStr);
    if (result.ok) lastKnownLock = result.lock;
    else if (result.code === "LOCK_MISSING" || result.code === "LOCK_HELD") {
      stopPlanLockHeartbeat();
      await refreshPlanLockBanner();
    }
    return;
  }
  const result = await ApiClient.heartbeatPlanLock(lockId);
  if (result.success && result.lock) {
    lastKnownLock = result.lock;
    paintBanner(result.lock, groupId, dateStr);
  } else {
    stopPlanLockHeartbeat();
    await refreshPlanLockBanner();
  }
}

function ensureBannerEl() {
  let el = document.getElementById("plan-edit-lock-banner");
  if (el) return el;
  const host = document.getElementById("daily-plan-full-meta")?.parentElement;
  if (!host) return null;
  el = document.createElement("div");
  el.id = "plan-edit-lock-banner";
  el.className = "plan-lock-banner";
  el.setAttribute("role", "status");
  el.hidden = true;
  host.insertBefore(el, document.getElementById("daily-plan-full-meta"));
  return el;
}

function paintBanner(lock, groupId, dateStr) {
  const el = ensureBannerEl();
  if (!el) return;
  const uid = currentUid();
  const role = currentRole();
  const canWrite = canWriteOperationalRoster(role);
  const canBreak = canBreakPlanEditLock(role);

  if (!lock) {
    if (!canWrite) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    el.hidden = false;
    el.className = "plan-lock-banner plan-lock-banner--free";
    el.innerHTML = `
      <span class="plan-lock-banner__text">${escapeText(t("plan_lock_free") || "Plan unlocked — first save claims the edit lock.")}</span>
      <button type="button" class="btn-secondary plan-lock-banner__btn" data-action="acquirePlanEditLock">${escapeText(t("plan_lock_acquire") || "Claim lock")}</button>
    `;
    return;
  }

  const mine = uid && lock.holderUid === uid;
  const who = lock.holderName || lock.holderUid || "";
  const until = formatExpiry(lock.expiresAtMs);

  if (mine && canWrite) {
    el.hidden = false;
    el.className = "plan-lock-banner plan-lock-banner--mine";
    el.innerHTML = `
      <span class="plan-lock-banner__text">${escapeText(
        (t("plan_lock_held_by_you") || "You hold the edit lock until {time}.").replace("{time}", until || "—")
      )}</span>
      <button type="button" class="btn-secondary plan-lock-banner__btn" data-action="releasePlanEditLock">${escapeText(t("plan_lock_release") || "Release")}</button>
    `;
    startPlanLockHeartbeat(groupId, dateStr);
    return;
  }

  el.hidden = false;
  el.className = "plan-lock-banner plan-lock-banner--held";
  const breakBtn = canBreak
    ? `<button type="button" class="btn-secondary plan-lock-banner__btn" data-action="breakPlanEditLock">${escapeText(t("plan_lock_break") || "Break lock")}</button>`
    : "";
  el.innerHTML = `
    <span class="plan-lock-banner__text">${escapeText(
      (t("plan_lock_held") || "Plan is locked by {name}.").replace("{name}", who || "another dispatcher")
    )}${until ? ` (${escapeText(until)})` : ""}</span>
    ${breakBtn}
  `;
  stopPlanLockHeartbeat();
}

function escapeText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshPlanLockBanner() {
  const groupId = activeGroupId();
  const dateStr = todayDateStr();
  const section = document.getElementById("dispatcher-daily-plan-full");
  if (!section || section.classList.contains("hidden")) {
    stopPlanLockHeartbeat();
    return;
  }
  if (!groupId) {
    const el = ensureBannerEl();
    if (el) {
      el.hidden = true;
      el.replaceChildren();
    }
    return;
  }

  if (IS_DEMO_MODE) {
    const snap = getDemoDayLock(groupId, dateStr);
    lastKnownLock = snap.lock || null;
    paintBanner(lastKnownLock, groupId, dateStr);
    return;
  }

  const lockId = buildLockId("day", groupId, dateStr);
  if (!lockId) return;
  const result = await ApiClient.getPlanLock(lockId);
  lastKnownLock = result.success ? (result.lock || null) : null;
  paintBanner(lastKnownLock, groupId, dateStr);
}

async function acquirePlanEditLock() {
  const groupId = activeGroupId();
  const dateStr = todayDateStr();
  if (!groupId || !canWriteOperationalRoster(currentRole())) return;
  if (IS_DEMO_MODE) {
    const result = ensureDemoDayLock(groupId, dateStr);
    if (!result.ok) {
      const who = result.lock?.holderName || result.lock?.holderUid || "";
      showToast(
        (t("plan_lock_held") || "Plan is locked by {name}.").replace("{name}", who || "another dispatcher"),
        "error"
      );
    } else {
      showToast(t("plan_lock_acquired") || "Edit lock claimed.", "success");
    }
    await refreshPlanLockBanner();
    return;
  }
  const result = await ApiClient.acquirePlanLock({
    scopeType: "day",
    groupId,
    scopeKey: dateStr
  });
  if (!result.success) {
    const who = result.lock?.holderName || result.lock?.holderUid || "";
    showToast(
      (t("plan_lock_held") || "Plan is locked by {name}.").replace("{name}", who || "another dispatcher"),
      "error"
    );
  } else {
    showToast(t("plan_lock_acquired") || "Edit lock claimed.", "success");
  }
  await refreshPlanLockBanner();
}

async function releasePlanEditLock() {
  const groupId = activeGroupId();
  const dateStr = todayDateStr();
  if (!groupId) return;
  if (IS_DEMO_MODE) {
    const result = releaseDemoDayLock(groupId, dateStr);
    if (result.ok) showToast(t("plan_lock_released") || "Edit lock released.", "success");
    else showToast(t("plan_lock_release_failed") || "Could not release lock.", "error");
    stopPlanLockHeartbeat();
    await refreshPlanLockBanner();
    return;
  }
  const lockId = buildLockId("day", groupId, dateStr);
  const result = await ApiClient.releasePlanLock(lockId);
  if (result.success) showToast(t("plan_lock_released") || "Edit lock released.", "success");
  else showToast(result.error || t("plan_lock_release_failed") || "Could not release lock.", "error");
  stopPlanLockHeartbeat();
  await refreshPlanLockBanner();
}

function breakPlanEditLock() {
  const groupId = activeGroupId();
  if (!groupId || !canBreakPlanEditLock(currentRole())) return;

  const el = ensureBannerEl();
  if (!el) return;
  let reasonInput = el.querySelector("#plan-lock-break-reason");
  if (!reasonInput) {
    const wrap = document.createElement("div");
    wrap.className = "plan-lock-banner__break";
    wrap.innerHTML = `
      <label class="plan-lock-banner__label" for="plan-lock-break-reason">${escapeText(t("plan_lock_break_prompt") || "Break-glass reason (min 8 characters)")}</label>
      <input type="text" id="plan-lock-break-reason" class="plan-lock-banner__input" maxlength="200" autocomplete="off" />
      <button type="button" class="btn-secondary plan-lock-banner__btn" data-action="confirmBreakPlanEditLock">${escapeText(t("plan_lock_break") || "Break lock")}</button>
    `;
    el.appendChild(wrap);
    reasonInput = wrap.querySelector("#plan-lock-break-reason");
  }
  reasonInput?.focus();
}

async function confirmBreakPlanEditLock() {
  const groupId = activeGroupId();
  const dateStr = todayDateStr();
  if (!groupId || !canBreakPlanEditLock(currentRole())) return;
  const reasonInput = document.getElementById("plan-lock-break-reason");
  const reason = String(reasonInput?.value || "").trim();
  if (reason.length < 8) {
    showToast(t("plan_lock_break_reason_short") || "Reason must be at least 8 characters.", "error");
    reasonInput?.focus();
    return;
  }

  showConfirm(
    t("plan_lock_break_confirm") || "Force-release this plan lock? This is audited.",
    async () => {
      if (IS_DEMO_MODE) {
        const result = breakDemoDayLock(groupId, dateStr, reason);
        if (result.ok) showToast(t("plan_lock_broken") || "Lock broken.", "success");
        else showToast(t("plan_lock_break_failed") || "Break failed.", "error");
        await refreshPlanLockBanner();
        return;
      }
      const lockId = buildLockId("day", groupId, dateStr);
      const result = await ApiClient.breakPlanLock(lockId, reason);
      if (result.success) showToast(t("plan_lock_broken") || "Lock broken.", "success");
      else showToast(result.error || t("plan_lock_break_failed") || "Break failed.", "error");
      await refreshPlanLockBanner();
    },
    { danger: true, title: t("plan_lock_break") || "Break lock" }
  );
}

export {
  refreshPlanLockBanner,
  acquirePlanEditLock,
  releasePlanEditLock,
  breakPlanEditLock,
  confirmBreakPlanEditLock,
  stopPlanLockHeartbeat
};

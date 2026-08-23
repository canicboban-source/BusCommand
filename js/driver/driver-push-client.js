// BusCommand — Driver PWA FCM Push Client (Slice 1B)
import Auth from "../core/auth-client.js";
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";

let _currentToken = null;
let _cachedVapidConfig = null;
let _registerFlight = null;

export function isPushSupported() {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!("Notification" in window)) return false;
  return true;
}

export function getPushPermissionState() {
  if (!isPushSupported()) return "unsupported";
  return window.Notification?.permission || "default";
}

async function getMessagingInstance() {
  const messagingModule = await import("firebase/messaging");
  const isSupp = await messagingModule.isSupported();
  if (!isSupp) {
    throw new Error("Firebase Messaging is not supported in this browser.");
  }
  const appModule = await import("firebase/app");
  if (appModule.getApps().length === 0) {
    throw new Error("Firebase App is not initialized. Driver push requires an active Firebase instance.");
  }
  const app = appModule.getApp();
  const messaging = messagingModule.getMessaging(app);
  return {
    messaging,
    getToken: messagingModule.getToken,
    deleteToken: messagingModule.deleteToken
  };
}

async function fetchVapidConfig() {
  if (_cachedVapidConfig) return _cachedVapidConfig;
  const res = await fetch("/api/driver/fcm-config");
  if (!res.ok) throw new Error("Failed to fetch FCM configuration");
  const data = await res.json();
  _cachedVapidConfig = data;
  return data;
}

function resolveCurrentUser() {
  try {
    if (Auth && typeof Auth.getCurrentUser === "function") {
      const user = Auth.getCurrentUser();
      if (user) return user;
    }
  } catch { /* ignore */ }
  try {
    if (typeof window !== "undefined" && window.Auth && typeof window.Auth.getCurrentUser === "function") {
      const user = window.Auth.getCurrentUser();
      if (user) return user;
    }
  } catch { /* ignore */ }
  if (typeof window !== "undefined" && window.currentUser) {
    return window.currentUser;
  }
  return null;
}

async function resolveIdToken() {
  try {
    if (Auth && typeof Auth.getIdToken === "function") {
      const token = await Auth.getIdToken();
      if (token) return token;
    }
  } catch { /* ignore */ }
  try {
    if (typeof window !== "undefined" && window.Auth && typeof window.Auth.getIdToken === "function") {
      const token = await window.Auth.getIdToken();
      if (token) return token;
    }
  } catch { /* ignore */ }
  if (typeof window !== "undefined" && window.USE_LOCAL_STATE && window.currentUser) {
    return "qa-harness-driver-token";
  }
  return null;
}

async function registerPushToken({ _isOptIn = false, _mockMessaging = null } = {}) {
  if (_registerFlight) return _registerFlight;
  _registerFlight = (async () => {
    try {
      const initialUser = resolveCurrentUser();
      if (!initialUser) return { success: false, reason: "NOT_AUTHENTICATED" };
      const initialUid = initialUser.uid || initialUser.id || initialUser.driverId || initialUser.name;

      const idToken = await resolveIdToken();
      if (!idToken) return { success: false, reason: "NO_ID_TOKEN" };

      const config = await fetchVapidConfig();
      if (!config || !config.enabled || !config.vapidKey) {
        updateDriverPushUi("unavailable");
        return { success: false, error: "NOTIFICATIONS_DISABLED" };
      }

      let token;
      if (typeof window !== "undefined" && window.__MOCK_FCM_TOKEN__) {
        token = String(window.__MOCK_FCM_TOKEN__);
      } else {
        let messagingInstance;
        let getTokenFn;
        if (_mockMessaging) {
          messagingInstance = _mockMessaging.getMessaging();
          getTokenFn = _mockMessaging.getToken;
        } else {
          try {
            const mod = await getMessagingInstance();
            messagingInstance = mod.messaging;
            getTokenFn = mod.getToken;
          } catch (err) {
            updateDriverPushUi("unavailable");
            return { success: false, reason: "NO_FIREBASE_APP", error: err?.message };
          }
        }

        let swReg = undefined;
        if ("serviceWorker" in navigator) {
          swReg = await navigator.serviceWorker.ready;
        }

        try {
          token = await getTokenFn(messagingInstance, {
            vapidKey: config.vapidKey,
            serviceWorkerRegistration: swReg
          });
        } catch (err) {
          return { success: false, reason: "GET_TOKEN_ERROR", error: err?.message };
        }
      }

      if (!token || typeof token !== "string") {
        return { success: false, reason: "NO_TOKEN_RETURNED" };
      }

      // Check if user changed identity or logged out while token was being retrieved
      const currentUser = resolveCurrentUser();
      const currentUid = currentUser?.uid || currentUser?.id || currentUser?.driverId || currentUser?.name;
      if (!currentUser || currentUid !== initialUid) {
        return { success: false, reason: "IDENTITY_CHANGED" };
      }

      const activeIdToken = await resolveIdToken();
      if (!activeIdToken) {
        return { success: false, reason: "NOT_AUTHENTICATED" };
      }

      _currentToken = token;

      const res = await fetch("/api/driver/fcm-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeIdToken}`
        },
        body: JSON.stringify({
          token,
          deviceLabel: "Driver PWA"
        })
      });

      if (!res.ok) {
        return { success: false, reason: "REGISTRATION_HTTP_ERROR" };
      }

      updateDriverPushUi("enabled");
      return { success: true };
    } finally {
      _registerFlight = null;
    }
  })();
  return _registerFlight;
}

export async function enableDriverPush({ _mockMessaging = null } = {}) {
  if (!isPushSupported()) {
    updateDriverPushUi("unsupported");
    try {
      showToast(t("driver_notifications_unsupported") || "Obaveštenja nisu podržana na ovom uređaju.", "info");
    } catch { /* ignore */ }
    return { success: false, reason: "UNSUPPORTED" };
  }

  const permission = await window.Notification.requestPermission();
  if (permission !== "granted") {
    updateDriverPushUi(permission === "denied" ? "denied" : "default");
    if (permission === "denied") {
      try {
        showToast(t("driver_notifications_denied") || "Obaveštenja su blokirana u pregledaču.", "warning");
      } catch { /* ignore */ }
    }
    return { success: false, state: permission };
  }

  const result = await registerPushToken({ isOptIn: true, _mockMessaging });
  if (result.success) {
    try {
      showToast(t("driver_notifications_enabled") || "Obaveštenja su uključena.", "success");
    } catch { /* ignore */ }
  } else if (result.error === "NOTIFICATIONS_DISABLED") {
    try {
      showToast(t("driver_notifications_unavailable") || "Servis obaveštenja trenutno nije dostupan.", "info");
    } catch { /* ignore */ }
  }
  return result;
}

export async function refreshDriverPushOnStartup({ _mockMessaging = null } = {}) {
  try {
    if (!isPushSupported()) return;
    if (window.Notification?.permission !== "granted") {
      updateDriverPushUi(window.Notification?.permission || "default");
      return;
    }
    const user = resolveCurrentUser();
    if (!user) return;
    return await registerPushToken({ isOptIn: false, _mockMessaging });
  } catch {
    // Fail silently on startup
  }
}

export async function revokeDriverPushToken({ _mockMessaging = null } = {}) {
  try {
    const tokenToRevoke = _currentToken;
    _currentToken = null;
    _cachedVapidConfig = null;

    if (tokenToRevoke) {
      try {
        const idToken = await resolveIdToken();
        if (idToken) {
          await fetch("/api/driver/fcm-token", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`
            },
            body: JSON.stringify({ token: tokenToRevoke })
          }).catch(() => {});
        }
      } catch { /* ignore */ }
    }

    let deleteTokenFn;
    let messagingInstance;
    if (_mockMessaging) {
      messagingInstance = _mockMessaging.getMessaging();
      deleteTokenFn = _mockMessaging.deleteToken;
    } else {
      try {
        const mod = await getMessagingInstance();
        messagingInstance = mod.messaging;
        deleteTokenFn = mod.deleteToken;
      } catch { /* ignore */ }
    }

    if (deleteTokenFn && messagingInstance) {
      await deleteTokenFn(messagingInstance).catch(() => {});
    }
  } catch {
    // Never delay or throw during logout
  } finally {
    updateDriverPushUi("default");
  }
}

export function updateDriverPushUi(state) {
  if (typeof document === "undefined") return;
  const btn = document.getElementById("driver-push-toggle-btn");
  if (!btn) return;

  const current = state || getPushPermissionState();

  if (current === "unsupported" || current === "unavailable") {
    btn.style.opacity = "0.5";
    btn.setAttribute("title", t("driver_notifications_unsupported") || "Obaveštenja nisu podržana");
    btn.setAttribute("aria-label", t("driver_notifications_unsupported") || "Obaveštenja nisu podržana");
    return;
  }

  if (current === "enabled" || current === "granted") {
    btn.style.opacity = "1";
    btn.classList.add("active");
    btn.setAttribute("title", t("driver_notifications_enabled") || "Obaveštenja su uključena");
    btn.setAttribute("aria-label", t("driver_notifications_enabled") || "Obaveštenja su uključena");
    const icon = document.getElementById("driver-push-icon");
    if (icon) icon.setAttribute("data-lucide", "bell-ring");
  } else if (current === "denied") {
    btn.style.opacity = "0.5";
    btn.classList.remove("active");
    btn.setAttribute("title", t("driver_notifications_denied") || "Obaveštenja su blokirana");
    btn.setAttribute("aria-label", t("driver_notifications_denied") || "Obaveštenja su blokirana");
    const icon = document.getElementById("driver-push-icon");
    if (icon) icon.setAttribute("data-lucide", "bell-off");
  } else {
    btn.style.opacity = "1";
    btn.classList.remove("active");
    btn.setAttribute("title", t("driver_notifications_enable") || "Omogući obaveštenja");
    btn.setAttribute("aria-label", t("driver_notifications_enable") || "Omogući obaveštenja");
    const icon = document.getElementById("driver-push-icon");
    if (icon) icon.setAttribute("data-lucide", "bell");
  }

  if (typeof lucide !== "undefined" && lucide.createIcons) {
    lucide.createIcons();
  }
}

export function _resetDriverPushStateForTest() {
  _currentToken = null;
  _cachedVapidConfig = null;
  _registerFlight = null;
}

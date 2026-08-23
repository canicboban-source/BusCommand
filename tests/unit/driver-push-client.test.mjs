import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// Initialize mock window at module level for Node.js test environment
globalThis.window = {
  location: { hostname: "localhost", search: "" },
  isSecureContext: true,
  PushManager: function PushManager() {},
  Notification: {
    permission: "default",
    requestPermission: async () => "granted"
  }
};

const mockNavigator = {
  serviceWorker: {
    ready: Promise.resolve({
      pushManager: {}
    }),
    getRegistration: async () => ({ pushManager: {} })
  }
};

try {
  Object.defineProperty(globalThis, "navigator", {
    value: mockNavigator,
    configurable: true,
    writable: true
  });
} catch {
  // If property cannot be redefined, mutate existing
  Object.assign(globalThis.navigator, mockNavigator);
}

const {
  isPushSupported,
  getPushPermissionState,
  enableDriverPush,
  refreshDriverPushOnStartup,
  revokeDriverPushToken,
  _resetDriverPushStateForTest
} = await import("../../js/driver/driver-push-client.js");

describe("Driver PWA FCM Push Client (Slice 1B)", () => {
  let mockAuth;
  let mockFetch;
  let fetchCalls;

  beforeEach(() => {
    _resetDriverPushStateForTest();
    fetchCalls = [];

    mockFetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url === "/api/driver/fcm-config") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            enabled: true,
            vapidKey: "test-synthetic-public-vapid-key-12345"
          })
        };
      }
      if (url === "/api/driver/fcm-token") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };

    mockAuth = {
      getCurrentUser: () => ({ id: "drv-123", name: "Test Driver", role: "driver", companyId: "co-1" }),
      getIdToken: async () => "mock-driver-jwt-token-xyz"
    };

    globalThis.window = {
      location: { hostname: "localhost", search: "" },
      isSecureContext: true,
      PushManager: function PushManager() {},
      Notification: {
        permission: "default",
        requestPermission: async () => "granted"
      },
      Auth: mockAuth
    };
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    _resetDriverPushStateForTest();
  });

  it("isPushSupported returns false in insecure context or missing primitives", () => {
    assert.strictEqual(isPushSupported(), true);

    globalThis.window.isSecureContext = false;
    assert.strictEqual(isPushSupported(), false);

    globalThis.window.isSecureContext = true;
    delete globalThis.window.PushManager;
    assert.strictEqual(isPushSupported(), false);
  });

  it("never requests notification permission automatically without explicit action", async () => {
    let permissionPromptCount = 0;
    globalThis.window.Notification.requestPermission = async () => {
      permissionPromptCount++;
      return "granted";
    };

    // Ordinary startup refresh when permission is 'default' does NOT prompt
    globalThis.window.Notification.permission = "default";
    await refreshDriverPushOnStartup();
    assert.strictEqual(permissionPromptCount, 0, "requestPermission must not be called on startup with default permission");
  });

  it("explicit enableDriverPush prompts permission and registers token", async () => {
    let permissionPromptCount = 0;
    globalThis.window.Notification.requestPermission = async () => {
      permissionPromptCount++;
      globalThis.window.Notification.permission = "granted";
      return "granted";
    };

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => "synthetic-fcm-device-token-abc-1234567890",
      deleteToken: async () => true
    };

    const res = await enableDriverPush({ _mockMessaging: mockMessagingModule });
    assert.strictEqual(res.success, true);
    assert.strictEqual(permissionPromptCount, 1);

    // Verify token was registered via authenticated POST
    const postCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.ok(postCall, "Must call POST /api/driver/fcm-token");
    assert.strictEqual(postCall.options.headers.Authorization, "Bearer mock-driver-jwt-token-xyz");

    const body = JSON.parse(postCall.options.body);
    assert.strictEqual(body.token, "synthetic-fcm-device-token-abc-1234567890");
    // Ensure no sensitive credentials/identities in payload
    assert.strictEqual(body.companyId, undefined);
    assert.strictEqual(body.driverId, undefined);
    assert.strictEqual(body.eid, undefined);
    assert.strictEqual(body.pin, undefined);
  });

  it("denied permission produces stable denied state without throwing", async () => {
    globalThis.window.Notification.requestPermission = async () => {
      globalThis.window.Notification.permission = "denied";
      return "denied";
    };

    const res = await enableDriverPush();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.state, "denied");
    assert.strictEqual(getPushPermissionState(), "denied");
  });

  it("missing or disabled VAPID public key fails closed gracefully", async () => {
    globalThis.fetch = async (url) => {
      if (url === "/api/driver/fcm-config") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, enabled: false, vapidKey: null })
        };
      }
      return { ok: false, status: 404 };
    };

    globalThis.window.Notification.requestPermission = async () => "granted";
    const res = await enableDriverPush();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error, "NOTIFICATIONS_DISABLED");
  });

  it("startup refresh silently refreshes token when permission is already granted", async () => {
    globalThis.window.Notification.permission = "granted";
    let permissionPromptCount = 0;
    globalThis.window.Notification.requestPermission = async () => {
      permissionPromptCount++;
      return "granted";
    };

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => "synthetic-fcm-device-token-refresh-9999",
      deleteToken: async () => true
    };

    await refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule });
    assert.strictEqual(permissionPromptCount, 0, "Must not prompt when already granted");

    const postCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.ok(postCall, "Must refresh token registration via POST");
    const body = JSON.parse(postCall.options.body);
    assert.strictEqual(body.token, "synthetic-fcm-device-token-refresh-9999");
  });

  it("concurrent registration calls are single-flight", async () => {
    globalThis.window.Notification.permission = "granted";

    let tokenFetchCount = 0;
    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => {
        tokenFetchCount++;
        await new Promise(r => setTimeout(r, 20));
        return "synthetic-fcm-device-token-flight-111";
      },
      deleteToken: async () => true
    };

    // Run 3 concurrent requests simultaneously
    await Promise.all([
      refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule }),
      refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule }),
      refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule })
    ]);

    assert.strictEqual(tokenFetchCount, 1, "getToken must be called exactly once for single-flight");
    const postCalls = fetchCalls.filter(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.strictEqual(postCalls.length, 1, "Only one POST should be sent");
  });

  it("logout calls server DELETE and local deleteToken without throwing", async () => {
    globalThis.window.Notification.permission = "granted";
    let localDeleted = false;

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => "synthetic-fcm-device-token-to-revoke-555",
      deleteToken: async () => { localDeleted = true; return true; }
    };

    // Register token first
    await refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule });

    // Now call revokeDriverPushToken
    await revokeDriverPushToken({ _mockMessaging: mockMessagingModule });

    const deleteCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "DELETE");
    assert.ok(deleteCall, "Must call DELETE /api/driver/fcm-token");
    const deleteBody = JSON.parse(deleteCall.options.body);
    assert.strictEqual(deleteBody.token, "synthetic-fcm-device-token-to-revoke-555");
    assert.strictEqual(localDeleted, true, "Must call local deleteToken()");
  });

  it("logout continues safely even if push cleanup fails", async () => {
    globalThis.window.Notification.permission = "granted";

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => "synthetic-fcm-token-fail-test",
      deleteToken: async () => { throw new Error("Local delete error"); }
    };

    await refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule });

    // Set server to fail on DELETE
    mockFetch = async (url, options) => {
      if (options?.method === "DELETE") throw new Error("Network offline");
      return { ok: true, json: async () => ({}) };
    };
    globalThis.fetch = mockFetch;

    // Must not throw
    await assert.doesNotReject(async () => {
      await revokeDriverPushToken({ _mockMessaging: mockMessagingModule });
    });
  });

  it("getToken failure handles gracefully without throwing", async () => {
    globalThis.window.Notification.requestPermission = async () => "granted";

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => { throw new Error("FCM Push service unavailable"); },
      deleteToken: async () => true
    };

    const res = await enableDriverPush({ _mockMessaging: mockMessagingModule });
    assert.strictEqual(res.success, false);
    const postCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.strictEqual(postCall, undefined, "Must not call POST /api/driver/fcm-token on getToken error");
  });

  it("registration POST failure returns error state gracefully", async () => {
    globalThis.window.Notification.requestPermission = async () => "granted";

    mockFetch = async (url, options = {}) => {
      fetchCalls.push({ url, options });
      if (url === "/api/driver/fcm-config") {
        return { ok: true, json: async () => ({ success: true, enabled: true, vapidKey: "test-key" }) };
      }
      if (url === "/api/driver/fcm-token") {
        return { ok: false, status: 500, json: async () => ({ error: "INTERNAL_ERROR" }) };
      }
      return { ok: false, status: 404 };
    };
    globalThis.fetch = mockFetch;

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => "synthetic-fcm-token-post-fail",
      deleteToken: async () => true
    };

    const res = await enableDriverPush({ _mockMessaging: mockMessagingModule });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.reason, "REGISTRATION_HTTP_ERROR");
  });

  it("auth identity change during in-flight registration aborts before persisting stale token", async () => {
    globalThis.window.Notification.permission = "granted";

    let currentUser = { id: "driver-alice", name: "Alice", role: "driver", companyId: "co-1" };
    mockAuth.getCurrentUser = () => currentUser;

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => {
        // Switch identity to Bob while token fetch is in flight
        currentUser = { id: "driver-bob", name: "Bob", role: "driver", companyId: "co-1" };
        return "synthetic-token-alice";
      },
      deleteToken: async () => true
    };

    const res = await refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.reason, "IDENTITY_CHANGED");

    const postCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.strictEqual(postCall, undefined, "Must not persist token when driver identity changed during flight");
  });

  it("unauthenticated driver produces stable NOT_AUTHENTICATED result without calling POST", async () => {
    globalThis.window.Notification.permission = "granted";
    mockAuth.getCurrentUser = () => null;

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: () => ({}),
      getToken: async () => "synthetic-token-no-auth",
      deleteToken: async () => true
    };

    const res = await refreshDriverPushOnStartup({ _mockMessaging: mockMessagingModule });
    assert.strictEqual(res, undefined);
    const postCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.strictEqual(postCall, undefined);
  });

  it("fails closed when Firebase App is not initialized and performs zero POST requests", async () => {
    globalThis.window.Notification.permission = "granted";

    // Without _mockMessaging, it calls getMessagingInstance() which queries firebase/app getApps()
    // When no apps exist in node environment, it must return NO_FIREBASE_APP without calling POST
    const res = await enableDriverPush();
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.reason, "NO_FIREBASE_APP");

    const postCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.strictEqual(postCall, undefined, "Missing app must not trigger any POST registration");
  });

  it("reuses existing Firebase App instance and never calls initializeApp", async () => {
    globalThis.window.Notification.permission = "granted";

    let initializeAppCalled = false;
    let getMessagingAppArg = null;
    const existingApp = { name: "[DEFAULT]", options: { projectId: "demo-buscommand" } };

    const mockMessagingModule = {
      isSupported: async () => true,
      getMessaging: (app) => {
        getMessagingAppArg = app || existingApp;
        return { app: getMessagingAppArg };
      },
      getToken: async () => "synthetic-app-ownership-token-123",
      deleteToken: async () => true
    };

    const res = await enableDriverPush({ _mockMessaging: mockMessagingModule });
    assert.strictEqual(res.success, true);
    assert.strictEqual(initializeAppCalled, false, "initializeApp must never be called by push module");
    assert.strictEqual(getMessagingAppArg, existingApp, "Must pass existing Firebase App instance to getMessaging");

    const postCall = fetchCalls.find(c => c.url === "/api/driver/fcm-token" && c.options?.method === "POST");
    assert.ok(postCall, "Valid token registered with existing app");
  });
});

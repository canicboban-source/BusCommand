"use strict";

const crypto = require("crypto");

const ErrorCategory = Object.freeze({
  PERMANENT_INVALID_TOKEN: "PERMANENT_INVALID_TOKEN",
  CREDENTIAL_CONFIG_ERROR: "CREDENTIAL_CONFIG_ERROR",
  PAYLOAD_CONFIG_ERROR: "PAYLOAD_CONFIG_ERROR",
  TRANSIENT_RETRYABLE: "TRANSIENT_RETRYABLE",
  UNKNOWN_ERROR: "UNKNOWN_ERROR"
});

/**
 * Derives a deterministic 64-character SHA-256 hex string from the raw token.
 * Full 256-bit hash provides zero collision risk and conforms to Firestore document ID limits.
 */
function deriveTokenId(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Token must be a non-empty string");
  }
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

/**
 * Classifies error codes returned by Firebase Admin Messaging / FCM.
 * Only explicit token-unregistered or invalid-token errors are eligible for pruning.
 * Never logs or exposes raw tokens.
 */
function classifyMessagingError(error) {
  const code = String(error?.code || error?.message || "").trim();

  // A. PERMANENT_INVALID_TOKEN: Only these 2 explicitly token-specific errors
  if (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  ) {
    return {
      category: ErrorCategory.PERMANENT_INVALID_TOKEN,
      code,
      permanent: true,
      retryable: false,
      eligibleForTokenPrune: true
    };
  }

  // B. CREDENTIAL_CONFIG_ERROR: Project / service account authentication or mismatch
  if (
    code === "messaging/mismatched-credential" ||
    code === "messaging/authentication-error" ||
    code === "messaging/third-party-auth-error"
  ) {
    return {
      category: ErrorCategory.CREDENTIAL_CONFIG_ERROR,
      code,
      permanent: false,
      retryable: false,
      eligibleForTokenPrune: false
    };
  }

  // C. PAYLOAD_CONFIG_ERROR: Malformed request, invalid payload, or sizing
  if (
    code === "messaging/invalid-argument" ||
    code === "messaging/invalid-recipient" ||
    code === "messaging/invalid-payload" ||
    code === "messaging/invalid-data-payload-key" ||
    code === "messaging/payload-size-limit-exceeded" ||
    code === "messaging/invalid-options"
  ) {
    return {
      category: ErrorCategory.PAYLOAD_CONFIG_ERROR,
      code,
      permanent: false,
      retryable: false,
      eligibleForTokenPrune: false
    };
  }

  // D. TRANSIENT_RETRYABLE: Rate limit, quota, or server availability errors
  if (
    code === "messaging/server-unavailable" ||
    code === "messaging/internal-error" ||
    code === "messaging/quota-exceeded" ||
    code === "messaging/device-message-rate-exceeded" ||
    code === "messaging/topics-message-rate-exceeded" ||
    code === "messaging/topics-subscription-rate-exceeded" ||
    code === "messaging/message-rate-exceeded"
  ) {
    return {
      category: ErrorCategory.TRANSIENT_RETRYABLE,
      code,
      permanent: false,
      retryable: true,
      eligibleForTokenPrune: false
    };
  }

  // E. UNKNOWN_ERROR: Fallback for unclassified errors
  return {
    category: ErrorCategory.UNKNOWN_ERROR,
    code: code || "messaging/unknown-error",
    permanent: false,
    retryable: false,
    eligibleForTokenPrune: false
  };
}

/**
 * In-memory deterministic messaging adapter for local unit and E2E tests.
 * Performs zero network calls.
 */
class FakeMessagingAdapter {
  constructor() {
    this.calls = [];
    this.simulatedFailures = new Map();
  }

  simulateTokenFailure(token, errorCode) {
    this.simulatedFailures.set(token, errorCode);
  }

  async sendMulticast({ tokens, payload }) {
    if (!Array.isArray(tokens)) {
      throw new Error("tokens must be an array");
    }

    const responses = tokens.map((token) => {
      if (this.simulatedFailures.has(token)) {
        const code = this.simulatedFailures.get(token);
        const err = new Error(`Simulated FCM failure: ${code}`);
        err.code = code;
        return { success: false, error: err };
      }
      return {
        success: true,
        messageId: `fake-msg-${deriveTokenId(token).slice(0, 12)}-${Date.now()}`
      };
    });

    const successCount = responses.filter((r) => r.success).length;
    const failureCount = responses.length - successCount;

    this.calls.push({
      tokenCount: tokens.length,
      payload,
      timestamp: new Date().toISOString()
    });

    return {
      successCount,
      failureCount,
      responses
    };
  }
}

/**
 * Factory creating the notification dispatcher wrapper.
 * Produces Web Push compatible messages (WebpushConfig) and NO Android configuration.
 */
function createNotificationDispatcher({ admin, hasFirebase, messagingAdapter = null }) {
  const adapter = messagingAdapter || {
    async sendMulticast({ tokens, payload }) {
      if (!hasFirebase || !hasFirebase()) {
        const err = new Error("Firebase unavailable");
        err.code = "messaging/server-unavailable";
        throw err;
      }
      const adminInstance = typeof admin === "function" ? admin() : admin;
      if (!adminInstance || typeof adminInstance.messaging !== "function") {
        const err = new Error("Firebase Admin Messaging unavailable");
        err.code = "messaging/authentication-error";
        throw err;
      }
      const messaging = adminInstance.messaging();

      const notification = payload.notification || (payload.title ? {
        title: String(payload.title || ""),
        body: String(payload.body || "")
      } : undefined);

      const message = {
        tokens,
        webpush: {
          headers: {
            Urgency: "high"
          },
          notification: notification ? {
            title: String(notification.title || ""),
            body: String(notification.body || ""),
            tag: payload.tag ? String(payload.tag) : undefined,
            icon: "/brand/logo-icon-192.png",
            badge: "/brand/logo-icon-192.png"
          } : undefined
        },
        data: payload.data ? Object.fromEntries(
          Object.entries(payload.data).map(([k, v]) => [String(k), String(v)])
        ) : undefined
      };

      return messaging.sendEachForMulticast(message);
    }
  };

  async function sendToTokens({ tokens, payload }) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, responses: [] };
    }
    return adapter.sendMulticast({ tokens, payload });
  }

  return {
    sendToTokens,
    classifyError: classifyMessagingError
  };
}

module.exports = {
  ErrorCategory,
  deriveTokenId,
  classifyMessagingError,
  FakeMessagingAdapter,
  createNotificationDispatcher
};

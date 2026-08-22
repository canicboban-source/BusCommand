const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  deriveTokenId,
  classifyMessagingError,
  ErrorCategory,
  FakeMessagingAdapter,
  createNotificationDispatcher
} = require("../../server/notification-dispatcher");
const { registerDriverRoutes } = require("../../server/driver-routes");

function createMockFirestore() {
  const store = new Map();

  function docRef(path) {
    return {
      id: path.split("/").pop(),
      path,
      async get() {
        const exists = store.has(path);
        const docData = exists ? JSON.parse(JSON.stringify(store.get(path))) : undefined;
        return {
          exists,
          id: path.split("/").pop(),
          data: () => docData
        };
      },
      async set(fields, options = {}) {
        const existing = store.get(path) || {};
        const merged = options.merge ? { ...existing, ...fields } : { ...fields };
        store.set(path, JSON.parse(JSON.stringify(merged)));
        return { writeTime: new Date() };
      },
      async delete() {
        store.delete(path);
        return { writeTime: new Date() };
      }
    };
  }

  function colRef(path) {
    return {
      path,
      doc(id) {
        return docRef(`${path}/${id}`);
      }
    };
  }

  return {
    _raw: store,
    collection(name) {
      return {
        doc(id) {
          return {
            path: `${name}/${id}`,
            id,
            async get() {
              return docRef(`${name}/${id}`).get();
            },
            async set(data, opts) {
              return docRef(`${name}/${id}`).set(data, opts);
            },
            async delete() {
              return docRef(`${name}/${id}`).delete();
            },
            collection(subName) {
              return {
                doc(subId) {
                  return {
                    path: `${name}/${id}/${subName}/${subId}`,
                    id: subId,
                    async get() {
                      return docRef(`${name}/${id}/${subName}/${subId}`).get();
                    },
                    async set(data, opts) {
                      return docRef(`${name}/${id}/${subName}/${subId}`).set(data, opts);
                    },
                    async delete() {
                      return docRef(`${name}/${id}/${subName}/${subId}`).delete();
                    },
                    collection(subSubName) {
                      return colRef(`${name}/${id}/${subName}/${subId}/${subSubName}`);
                    }
                  };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(updateFunction) {
      const transaction = {
        async get(ref) {
          return ref.get();
        },
        set(ref, data, options = {}) {
          const existing = store.get(ref.path) || {};
          const merged = options.merge ? { ...existing, ...data } : { ...data };
          store.set(ref.path, JSON.parse(JSON.stringify(merged)));
        },
        delete(ref) {
          store.delete(ref.path);
        }
      };
      return updateFunction(transaction);
    }
  };
}

function createAuthMock() {
  const validClaims = {
    "valid-driver-token": { uid: "drv-1", role: "driver", companyId: "comp-a", mustChangeLoginCode: false },
    "driver-2-token": { uid: "drv-2", role: "driver", companyId: "comp-a", mustChangeLoginCode: false },
    "company-b-driver-token": { uid: "drv-99", role: "driver", companyId: "comp-b", mustChangeLoginCode: false },
    "pending-activation-token": { uid: "drv-1", role: "driver", companyId: "comp-a", mustChangeLoginCode: true }
  };

  return {
    auth: () => ({
      async verifyIdToken(token) {
        if (validClaims[token]) return validClaims[token];
        const err = new Error("Invalid token");
        err.code = "auth/invalid-token";
        throw err;
      }
    }),
    firestore: {
      FieldValue: {
        serverTimestamp: () => "ts"
      }
    }
  };
}

async function startTestServer({ firestore = createMockFirestore() } = {}) {
  const app = express();
  app.use(express.json());
  const authMock = createAuthMock();

  registerDriverRoutes(app, {
    admin: () => authMock,
    db: () => firestore,
    hasFirebase: () => true,
    rateLimit: () => (req, res, next) => next(),
    clearRateLimit: () => {},
    getClientIp: () => "127.0.0.1",
    logAudit: async () => {}
  });

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function close() {
    return new Promise((resolve) => server.close(resolve));
  }

  return { baseUrl, firestore, close };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Error Classification & Prune-Eligibility Tests
// ─────────────────────────────────────────────────────────────────────────────

test("only the two token-specific FCM errors are classified as PERMANENT_INVALID_TOKEN and eligibleForTokenPrune", () => {
  const notRegistered = new Error("Token not registered");
  notRegistered.code = "messaging/registration-token-not-registered";
  const c1 = classifyMessagingError(notRegistered);
  assert.equal(c1.category, ErrorCategory.PERMANENT_INVALID_TOKEN);
  assert.equal(c1.permanent, true);
  assert.equal(c1.retryable, false);
  assert.equal(c1.eligibleForTokenPrune, true);

  const invalidToken = new Error("Invalid registration token");
  invalidToken.code = "messaging/invalid-registration-token";
  const c2 = classifyMessagingError(invalidToken);
  assert.equal(c2.category, ErrorCategory.PERMANENT_INVALID_TOKEN);
  assert.equal(c2.permanent, true);
  assert.equal(c2.retryable, false);
  assert.equal(c2.eligibleForTokenPrune, true);
});

test("mismatched-credential is CREDENTIAL_CONFIG_ERROR and NOT prune-eligible", () => {
  const err = new Error("Mismatched credential");
  err.code = "messaging/mismatched-credential";
  const c = classifyMessagingError(err);
  assert.equal(c.category, ErrorCategory.CREDENTIAL_CONFIG_ERROR);
  assert.equal(c.permanent, false);
  assert.equal(c.retryable, false);
  assert.equal(c.eligibleForTokenPrune, false);
});

test("invalid-argument and invalid-recipient are PAYLOAD_CONFIG_ERROR and NOT prune-eligible", () => {
  const argErr = new Error("Invalid argument");
  argErr.code = "messaging/invalid-argument";
  const c1 = classifyMessagingError(argErr);
  assert.equal(c1.category, ErrorCategory.PAYLOAD_CONFIG_ERROR);
  assert.equal(c1.permanent, false);
  assert.equal(c1.retryable, false);
  assert.equal(c1.eligibleForTokenPrune, false);

  const recipErr = new Error("Invalid recipient");
  recipErr.code = "messaging/invalid-recipient";
  const c2 = classifyMessagingError(recipErr);
  assert.equal(c2.category, ErrorCategory.PAYLOAD_CONFIG_ERROR);
  assert.equal(c2.permanent, false);
  assert.equal(c2.retryable, false);
  assert.equal(c2.eligibleForTokenPrune, false);
});

test("transient errors are TRANSIENT_RETRYABLE, retryable: true, and NOT prune-eligible", () => {
  const serverErr = new Error("Server unavailable");
  serverErr.code = "messaging/server-unavailable";
  const c1 = classifyMessagingError(serverErr);
  assert.equal(c1.category, ErrorCategory.TRANSIENT_RETRYABLE);
  assert.equal(c1.permanent, false);
  assert.equal(c1.retryable, true);
  assert.equal(c1.eligibleForTokenPrune, false);

  const rateErr = new Error("Message rate exceeded");
  rateErr.code = "messaging/device-message-rate-exceeded";
  const c2 = classifyMessagingError(rateErr);
  assert.equal(c2.category, ErrorCategory.TRANSIENT_RETRYABLE);
  assert.equal(c2.permanent, false);
  assert.equal(c2.retryable, true);
  assert.equal(c2.eligibleForTokenPrune, false);
});

test("unknown errors are UNKNOWN_ERROR and NOT prune-eligible", () => {
  const unknownErr = new Error("Network blip or weird error");
  const c = classifyMessagingError(unknownErr);
  assert.equal(c.category, ErrorCategory.UNKNOWN_ERROR);
  assert.equal(c.permanent, false);
  assert.equal(c.retryable, false);
  assert.equal(c.eligibleForTokenPrune, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Web Push Payload & Privacy Shape Tests
// ─────────────────────────────────────────────────────────────────────────────

test("production dispatcher produces WebpushConfig and NO Android configuration", async () => {
  let capturedMessage = null;
  const fakeAdmin = {
    messaging: () => ({
      async sendEachForMulticast(msg) {
        capturedMessage = msg;
        return { successCount: 1, failureCount: 0, responses: [{ success: true }] };
      }
    })
  };

  const dispatcher = createNotificationDispatcher({
    admin: () => fakeAdmin,
    hasFirebase: () => true
  });

  await dispatcher.sendToTokens({
    tokens: ["fcm-test-token-1234567890-abcdef"],
    payload: {
      title: "Nova obaveštenja",
      body: "Imate novu operativnu poruku.",
      tag: "shift-update"
    }
  });

  assert.ok(capturedMessage, "Message must be sent to admin.messaging()");
  assert.equal(capturedMessage.android, undefined, "Must NOT contain Android configuration");
  assert.ok(capturedMessage.webpush, "Must contain webpush configuration");
  assert.equal(capturedMessage.webpush.headers?.Urgency, "high");
  assert.equal(capturedMessage.webpush.notification?.title, "Nova obaveštenja");
  assert.equal(capturedMessage.webpush.notification?.body, "Imate novu operativnu poruku.");
  assert.equal(capturedMessage.webpush.notification?.tag, "shift-update");
  assert.equal(capturedMessage.webpush.fcmOptions?.link, undefined, "Slice 1A must NOT emit fcmOptions.link");
});

test("Slice 1A ignores all payload.link values (external, http, javascript, malformed, and valid https)", async () => {
  const capturedMessages = [];
  const fakeAdmin = {
    messaging: () => ({
      async sendEachForMulticast(msg) {
        capturedMessages.push(msg);
        return { successCount: 1, failureCount: 0, responses: [{ success: true }] };
      }
    })
  };

  const dispatcher = createNotificationDispatcher({
    admin: () => fakeAdmin,
    hasFirebase: () => true
  });

  const testLinks = [
    "https://attacker.example/phish",
    "javascript:alert(document.cookie)",
    "http://insecure.example.com/driver",
    "not-a-valid-url://invalid",
    "https://buscommand.example.com/driver"
  ];

  for (const link of testLinks) {
    await dispatcher.sendToTokens({
      tokens: ["fcm-test-token-sample-1234567890-xyz"],
      payload: {
        title: "Test",
        body: "Test body",
        link
      }
    });
  }

  assert.equal(capturedMessages.length, testLinks.length);
  for (const msg of capturedMessages) {
    assert.equal(msg.webpush.fcmOptions?.link, undefined, "fcmOptions.link must never be emitted in Slice 1A");
  }
});

test("lock-screen notification payload remains generic with no sensitive operational data", async () => {
  const fake = new FakeMessagingAdapter();
  const dispatcher = createNotificationDispatcher({
    hasFirebase: () => true,
    messagingAdapter: fake
  });

  const payload = {
    title: "BusCommand",
    body: "Raspored smena je ažuriran.",
    tag: "schedule"
  };

  await dispatcher.sendToTokens({
    tokens: ["tok-1234567890-sample"],
    payload
  });

  assert.equal(fake.calls.length, 1);
  const recorded = fake.calls[0].payload;
  const serialized = JSON.stringify(recorded);
  assert.equal(serialized.includes("pin"), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("eid"), false);
  assert.equal(serialized.includes("passenger"), false);
  assert.equal(serialized.includes("tok-1234567890-sample"), false, "Payload must not contain raw token");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Adapter & Token ID Tests
// ─────────────────────────────────────────────────────────────────────────────

test("deriveTokenId produces deterministic 64-character SHA-256 hex string", () => {
  const token = "fcm-registration-token-sample-1234567890-abcdef";
  const id1 = deriveTokenId(token);
  const id2 = deriveTokenId(token);

  assert.equal(typeof id1, "string");
  assert.equal(id1.length, 64);
  assert.equal(id1, id2);
  assert.match(id1, /^[0-9a-f]{64}$/);

  const diffId = deriveTokenId(token + "-different");
  assert.notEqual(id1, diffId);
});

test("FakeMessagingAdapter records sends in-memory without network calls", async () => {
  const fake = new FakeMessagingAdapter();
  fake.simulateTokenFailure("dead-token-1", "messaging/registration-token-not-registered");

  const tokens = ["valid-token-1", "dead-token-1", "valid-token-2"];
  const payload = {
    title: "Nova poruka",
    body: "Dispečer vam je poslao poruku."
  };

  const result = await fake.sendMulticast({ tokens, payload });

  assert.equal(result.successCount, 2);
  assert.equal(result.failureCount, 1);
  assert.equal(result.responses.length, 3);
  assert.equal(result.responses[0].success, true);
  assert.equal(result.responses[1].success, false);
  assert.equal(result.responses[1].error.code, "messaging/registration-token-not-registered");
  assert.equal(result.responses[2].success, true);

  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].tokenCount, 3);
  assert.deepEqual(fake.calls[0].payload, payload);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Global Unique Ownership & Lifecycle Tests
// ─────────────────────────────────────────────────────────────────────────────

test("POST /api/driver/fcm-token creates one nested token and one global ownership record", async () => {
  const server = await startTestServer();
  try {
    const token = "valid-unique-token-0001-abcdef1234567890";
    const res = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token, deviceLabel: "Driver One Phone" })
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    const tokenId = body.tokenId;

    const nestedPath = `companies/comp-a/drivers/drv-1/fcm_tokens/${tokenId}`;
    const nestedDoc = server.firestore._raw.get(nestedPath);
    assert.ok(nestedDoc, "Nested token doc must exist");
    assert.equal(nestedDoc.token, token);
    assert.equal(nestedDoc.status, "active");
    assert.equal(nestedDoc.deviceLabel, "Driver One Phone");

    const ownerPath = `fcm_token_owners/${tokenId}`;
    const ownerDoc = server.firestore._raw.get(ownerPath);
    assert.ok(ownerDoc, "Global ownership doc must exist");
    assert.equal(ownerDoc.companyId, "comp-a");
    assert.equal(ownerDoc.driverId, "drv-1");
    assert.ok(ownerDoc.createdAt);
    assert.ok(ownerDoc.updatedAt);
    assert.equal(ownerDoc.token, undefined, "Ownership registry must not contain raw token");
  } finally {
    await server.close();
  }
});

test("Same token registered twice by the same driver preserves createdAt and updates updatedAt", async () => {
  const server = await startTestServer();
  try {
    const token = "valid-unique-token-0002-abcdef1234567890";

    const res1 = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token, deviceLabel: "Initial Phone" })
    });
    const body1 = await res1.json();
    assert.equal(res1.status, 200);

    const tokenId = body1.tokenId;
    const nestedPath = `companies/comp-a/drivers/drv-1/fcm_tokens/${tokenId}`;
    const initialCreatedAt = server.firestore._raw.get(nestedPath).createdAt;
    assert.ok(initialCreatedAt);

    const res2 = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token, deviceLabel: "Updated Phone" })
    });
    const body2 = await res2.json();
    assert.equal(res2.status, 200);
    assert.equal(body1.tokenId, body2.tokenId);

    const nestedDoc = server.firestore._raw.get(nestedPath);
    assert.equal(nestedDoc.deviceLabel, "Updated Phone");
    assert.equal(nestedDoc.createdAt, initialCreatedAt, "Original createdAt must be preserved");

    const ownerPath = `fcm_token_owners/${tokenId}`;
    const ownerDoc = server.firestore._raw.get(ownerPath);
    assert.equal(ownerDoc.companyId, "comp-a");
    assert.equal(ownerDoc.driverId, "drv-1");
  } finally {
    await server.close();
  }
});

test("Same token registered by Driver A then Driver B in same company atomically transfers ownership", async () => {
  const server = await startTestServer();
  try {
    const token = "shared-device-token-0003-abcdef1234567890";

    await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token, deviceLabel: "Shared Tablet - Shift 1" })
    });

    const tokenId = deriveTokenId(token);
    const drv1Path = `companies/comp-a/drivers/drv-1/fcm_tokens/${tokenId}`;
    const drv2Path = `companies/comp-a/drivers/drv-2/fcm_tokens/${tokenId}`;
    const ownerPath = `fcm_token_owners/${tokenId}`;

    assert.ok(server.firestore._raw.has(drv1Path), "Driver 1 nested doc must initially exist");
    assert.equal(server.firestore._raw.get(ownerPath).driverId, "drv-1");

    const res = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer driver-2-token"
      },
      body: JSON.stringify({ token, deviceLabel: "Shared Tablet - Shift 2" })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    assert.equal(server.firestore._raw.has(drv1Path), false, "Driver 1 nested token must be atomically deleted");
    assert.ok(server.firestore._raw.has(drv2Path), "Driver 2 nested token must exist");
    assert.equal(server.firestore._raw.get(drv2Path).deviceLabel, "Shared Tablet - Shift 2");

    assert.equal(server.firestore._raw.get(ownerPath).companyId, "comp-a");
    assert.equal(server.firestore._raw.get(ownerPath).driverId, "drv-2");
  } finally {
    await server.close();
  }
});

test("Same token transferred across companies atomically deletes old tenant token", async () => {
  const server = await startTestServer();
  try {
    const token = "transferred-device-token-0004-abcdef1234567890";

    await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token, deviceLabel: "Phone under Company A" })
    });

    const tokenId = deriveTokenId(token);
    const compAPath = `companies/comp-a/drivers/drv-1/fcm_tokens/${tokenId}`;
    const compBPath = `companies/comp-b/drivers/drv-99/fcm_tokens/${tokenId}`;
    const ownerPath = `fcm_token_owners/${tokenId}`;

    assert.ok(server.firestore._raw.has(compAPath));
    assert.equal(server.firestore._raw.get(ownerPath).companyId, "comp-a");

    const res = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer company-b-driver-token"
      },
      body: JSON.stringify({ token, deviceLabel: "Phone under Company B" })
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    assert.equal(server.firestore._raw.has(compAPath), false, "Old tenant nested doc must be deleted");
    assert.ok(server.firestore._raw.has(compBPath), "New tenant nested doc must exist");
    assert.equal(server.firestore._raw.get(ownerPath).companyId, "comp-b");
    assert.equal(server.firestore._raw.get(ownerPath).driverId, "drv-99");
  } finally {
    await server.close();
  }
});

test("Stale DELETE from Driver A after transfer to Driver B does not delete Driver B token or registry", async () => {
  const server = await startTestServer();
  try {
    const token = "stale-delete-token-0005-abcdef1234567890";

    await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token })
    });

    await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer driver-2-token"
      },
      body: JSON.stringify({ token })
    });

    const tokenId = deriveTokenId(token);
    const drv2Path = `companies/comp-a/drivers/drv-2/fcm_tokens/${tokenId}`;
    const ownerPath = `fcm_token_owners/${tokenId}`;

    assert.ok(server.firestore._raw.has(drv2Path));
    assert.equal(server.firestore._raw.get(ownerPath).driverId, "drv-2");

    const delRes = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token })
    });
    const delBody = await delRes.json();

    assert.equal(delRes.status, 200);
    assert.equal(delBody.success, true);

    assert.ok(server.firestore._raw.has(drv2Path), "Driver 2 token must not be deleted by stale Driver 1 request");
    assert.ok(server.firestore._raw.has(ownerPath), "Global ownership must not be deleted");
    assert.equal(server.firestore._raw.get(ownerPath).driverId, "drv-2");
  } finally {
    await server.close();
  }
});

test("Current owner DELETE removes nested token and ownership registry atomically", async () => {
  const server = await startTestServer();
  try {
    const token = "owner-delete-token-0006-abcdef1234567890";

    await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token })
    });

    const tokenId = deriveTokenId(token);
    const nestedPath = `companies/comp-a/drivers/drv-1/fcm_tokens/${tokenId}`;
    const ownerPath = `fcm_token_owners/${tokenId}`;

    assert.ok(server.firestore._raw.has(nestedPath));
    assert.ok(server.firestore._raw.has(ownerPath));

    const res = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token })
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.success, true);

    assert.equal(server.firestore._raw.has(nestedPath), false, "Nested token must be deleted");
    assert.equal(server.firestore._raw.has(ownerPath), false, "Ownership registry must be deleted");
  } finally {
    await server.close();
  }
});

test("POST /api/driver/fcm-token rejects unauthenticated requests with 401", async () => {
  const server = await startTestServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "sample-fcm-token-1234567890-abcdef" })
    });
    const body = await res.json();

    assert.equal(res.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.code, "INVALID_TOKEN");
  } finally {
    await server.close();
  }
});

test("POST /api/driver/fcm-token rejects missing or malformed token body with 400", async () => {
  const server = await startTestServer();
  try {
    const res1 = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({})
    });
    const body1 = await res1.json();
    assert.equal(res1.status, 400);
    assert.equal(body1.success, false);

    const res2 = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({ token: "short" })
    });
    const body2 = await res2.json();
    assert.equal(res2.status, 400);
    assert.equal(body2.success, false);
  } finally {
    await server.close();
  }
});

test("POST /api/driver/fcm-token rejects identity spoofing attempts in request body with 400", async () => {
  const server = await startTestServer();
  try {
    const res = await fetch(`${server.baseUrl}/api/driver/fcm-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: "Bearer valid-driver-token"
      },
      body: JSON.stringify({
        token: "valid-sample-fcm-token-1234567890-abcdef",
        companyId: "spoofed-company-id",
        driverId: "spoofed-driver-id"
      })
    });
    const body = await res.json();

    assert.equal(res.status, 400);
    assert.equal(body.success, false);
  } finally {
    await server.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Real Firestore Emulator Concurrency & Race-Condition Integration Test
// ─────────────────────────────────────────────────────────────────────────────

test("Real Firestore Emulator concurrency integration test for one-token/one-owner", async (t) => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulatorHost) {
    t.skip("FIRESTORE_EMULATOR_HOST not set (skipping emulator concurrency test in unit run)");
    return;
  }

  const admin = require("firebase-admin");
  const emulatorApp = admin.apps.find((a) => a?.name === "fcm-concurrency-test-app") ||
    admin.initializeApp({ projectId: "buscommand-preview" }, "fcm-concurrency-test-app");
  const firestore = emulatorApp.firestore();

  const app = express();
  app.use(express.json());

  const tokenA = "fcm-test-jwt-driver-a";
  const tokenB = "fcm-test-jwt-driver-b";
  const syntheticFcmToken = "fcm-synthetic-device-token-concurrency-998877665544332211";
  const tokenId = deriveTokenId(syntheticFcmToken);

  const compA = "comp-concur-a";
  const drvA = "drv-concur-a";
  const compB = "comp-concur-b";
  const drvB = "drv-concur-b";

  const authClaims = {
    [tokenA]: { uid: drvA, role: "driver", companyId: compA, mustChangeLoginCode: false },
    [tokenB]: { uid: drvB, role: "driver", companyId: compB, mustChangeLoginCode: false }
  };

  const authMock = {
    auth: () => ({
      async verifyIdToken(tok) {
        if (authClaims[tok]) return authClaims[tok];
        const err = new Error("Invalid token");
        err.code = "auth/invalid-token";
        throw err;
      }
    }),
    firestore: {
      FieldValue: admin.firestore.FieldValue
    }
  };

  registerDriverRoutes(app, {
    admin: () => authMock,
    db: () => firestore,
    hasFirebase: () => true,
    rateLimit: () => (req, res, next) => next(),
    clearRateLimit: () => {},
    getClientIp: () => "127.0.0.1",
    logAudit: async () => {}
  });

  const server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const cleanupPaths = async () => {
    try {
      await firestore.collection("fcm_token_owners").doc(tokenId).delete();
      await firestore.collection("companies").doc(compA).collection("drivers").doc(drvA).collection("fcm_tokens").doc(tokenId).delete();
      await firestore.collection("companies").doc(compB).collection("drivers").doc(drvB).collection("fcm_tokens").doc(tokenId).delete();
    } catch {}
  };

  try {
    await cleanupPaths();

    // 1. Fire overlapping concurrent registration requests using Promise.all
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/driver/fcm-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ token: syntheticFcmToken, deviceLabel: "Device Concurrent A" })
      }),
      fetch(`${baseUrl}/api/driver/fcm-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${tokenB}` },
        body: JSON.stringify({ token: syntheticFcmToken, deviceLabel: "Device Concurrent B" })
      })
    ]);

    assert.equal(resA.status, 200, "Request A should succeed");
    assert.equal(resB.status, 200, "Request B should succeed");

    // 2. Read final committed state from real Firestore Emulator
    const ownerDoc = await firestore.collection("fcm_token_owners").doc(tokenId).get();
    assert.ok(ownerDoc.exists, "Global owner doc must exist");
    const ownerData = ownerDoc.data();
    assert.ok(ownerData.companyId === compA || ownerData.companyId === compB, "Owner must be Company A or Company B");
    assert.equal(ownerData.token, undefined, "Raw token must not exist in global registry");

    const winningComp = ownerData.companyId;
    const winningDrv = ownerData.driverId;
    const losingComp = winningComp === compA ? compB : compA;
    const losingDrv = winningDrv === drvA ? drvB : drvA;
    const losingToken = winningComp === compA ? tokenB : tokenA;

    const winningDoc = await firestore.collection("companies").doc(winningComp).collection("drivers").doc(winningDrv).collection("fcm_tokens").doc(tokenId).get();
    const losingDoc = await firestore.collection("companies").doc(losingComp).collection("drivers").doc(losingDrv).collection("fcm_tokens").doc(tokenId).get();

    assert.ok(winningDoc.exists, "Winning driver nested token document must exist");
    assert.equal(winningDoc.data().status, "active");
    assert.equal(losingDoc.exists, false, "Losing driver nested token document must be deleted");

    // 3. Stale DELETE from losing owner after race must not remove winner
    const delRes = await fetch(`${baseUrl}/api/driver/fcm-token`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${losingToken}` },
      body: JSON.stringify({ token: syntheticFcmToken })
    });
    const delBody = await delRes.json();
    assert.equal(delRes.status, 200);
    assert.equal(delBody.success, true);

    const winnerAfterStaleDel = await firestore.collection("companies").doc(winningComp).collection("drivers").doc(winningDrv).collection("fcm_tokens").doc(tokenId).get();
    const ownerAfterStaleDel = await firestore.collection("fcm_token_owners").doc(tokenId).get();

    assert.ok(winnerAfterStaleDel.exists, "Winner token must still exist after stale DELETE");
    assert.ok(ownerAfterStaleDel.exists, "Global registry must still point to winner after stale DELETE");
    assert.equal(ownerAfterStaleDel.data().driverId, winningDrv);
  } finally {
    await cleanupPaths();
    await new Promise((resolve) => server.close(resolve));
  }
});

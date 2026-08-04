const test = require("node:test");
const assert = require("node:assert/strict");
const { createRequireActivatedDriver, registerDriverRoutes } = require("../../server/driver-routes");

/**
 * Deactivating a driver revokes their refresh tokens, which only takes effect if
 * every driver gate verifies with checkRevoked. Without it an already issued ID
 * token keeps opening driver APIs until it expires — up to an hour of access for
 * an account the dispatcher believes is closed. These tests drive the real
 * handlers with an Auth double that behaves like Firebase: it refuses a revoked
 * token only when the caller asks for the check.
 */
function createAuthDouble({ revoked = false, claims }) {
  const calls = [];
  return {
    calls,
    admin: () => ({
      auth: () => ({
        async verifyIdToken(token, checkRevoked) {
          calls.push({ token, checkRevoked });
          if (revoked && checkRevoked === true) {
            const error = new Error("Firebase ID token has been revoked.");
            error.code = "auth/id-token-revoked";
            throw error;
          }
          return claims;
        },
        createCustomToken: async () => "fresh-token"
      }),
      firestore: {
        FieldValue: {
          serverTimestamp: () => "ts",
          delete: () => "del"
        }
      }
    })
  };
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

const ACTIVE_CLAIMS = Object.freeze({
  uid: "driver-1", role: "driver", companyId: "alpha", mustChangeLoginCode: false
});
const PENDING_CLAIMS = Object.freeze({
  uid: "driver-1", role: "driver", companyId: "alpha", mustChangeLoginCode: true
});

test("the /api/driver gate asks Firebase to check revocation", async () => {
  const auth = createAuthDouble({ claims: ACTIVE_CLAIMS });
  const gate = createRequireActivatedDriver({ admin: auth.admin, hasFirebase: () => true });
  const req = { headers: { authorization: "Bearer abc" } };
  const res = response();
  let passed = false;

  await gate(req, res, () => { passed = true; });

  assert.equal(passed, true);
  assert.equal(req.driver.uid, "driver-1");
  assert.deepEqual(auth.calls, [{ token: "abc", checkRevoked: true }]);
});

test("a revoked driver token is refused by the /api/driver gate", async () => {
  const auth = createAuthDouble({ revoked: true, claims: ACTIVE_CLAIMS });
  const gate = createRequireActivatedDriver({ admin: auth.admin, hasFirebase: () => true });
  const res = response();
  let passed = false;

  await gate({ headers: { authorization: "Bearer abc" } }, res, () => { passed = true; });

  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_TOKEN");
});

function registerActivationRoute(auth) {
  const routes = new Map();
  const app = {
    use() {},
    get() {},
    put() {},
    post(path, ...handlers) { routes.set(path, handlers.at(-1)); }
  };
  registerDriverRoutes(app, {
    admin: auth.admin,
    db: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              get: async () => ({ exists: true, id: "driver-1", data: () => ({ codeActivated: false, activationUsedAt: null }) })
            })
          })
        })
      }),
      batch: () => ({ update() {}, commit: async () => {} })
    }),
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "203.0.113.10",
    logAudit: async () => {},
    staffAuth: { requireCompanyStaff: (_req, _res, next) => next() }
  });
  return routes.get("/api/auth/driver/activate-personal-code");
}

test("setting a personal code asks Firebase to check revocation", async () => {
  const auth = createAuthDouble({ claims: PENDING_CLAIMS });
  const handler = registerActivationRoute(auth);
  const res = response();

  await handler({ headers: { authorization: "Bearer abc" }, body: { personalLoginCode: "556677" } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(auth.calls, [{ token: "abc", checkRevoked: true }]);
});

test("a revoked token cannot set a new personal code", async () => {
  const auth = createAuthDouble({ revoked: true, claims: PENDING_CLAIMS });
  const handler = registerActivationRoute(auth);
  const res = response();

  await handler({ headers: { authorization: "Bearer abc" }, body: { personalLoginCode: "556677" } }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_TOKEN");
});

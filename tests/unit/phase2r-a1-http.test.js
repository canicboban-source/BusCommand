/**
 * FAZA 2R-A.1 — executable HTTP proofs.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { registerDriverRoutes } = require("../../server/driver-routes");

function chainHandlers(handlers) {
  return async (req, res) => {
    let index = 0;
    const next = async (err) => {
      if (err) throw err;
      const handler = handlers[index++];
      if (!handler) return undefined;
      return handler(req, res, next);
    };
    return next();
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("auth-middleware-wiring: stubbed requireCompanyStaff 401 reaches preview/commit (not real verifier)", async () => {
  // Proves route middleware wiring only. Real token verification is covered by
  // tests/unit/staff-auth-http.test.js (missing/forged/revoked tokens).
  const routes = new Map();
  const app = {
    use() {},
    get(p, ...h) { routes.set(`GET ${p}`, chainHandlers(h)); },
    post(p, ...h) { routes.set(`POST ${p}`, chainHandlers(h)); },
    put(p, ...h) { routes.set(`PUT ${p}`, chainHandlers(h)); }
  };
  registerDriverRoutes(app, {
    admin: () => ({ firestore: { FieldValue: { serverTimestamp: () => new Date() } } }),
    db: () => ({ collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) }) }) }),
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "203.0.113.10",
    logAudit: async () => {},
    staffAuth: {
      requireCompanyStaff(req, res, _next) {
        res.status(401).json({ success: false, error: "Unauthorized" });
      }
    }
  });

  const preview = response();
  await routes.get("POST /api/staff/monthly-plans/import/preview")({
    headers: {},
    body: {},
    log: { error() {} }
  }, preview);
  assert.equal(preview.statusCode, 401);

  const commit = response();
  await routes.get("PUT /api/staff/monthly-plans/import/commit")({
    headers: {},
    body: {
      importId: "11111111-2222-4333-8444-555555555555",
      fingerprint: "a".repeat(64)
    },
    log: { error() {} }
  }, commit);
  assert.equal(commit.statusCode, 401);
});

test("apiFetch and commit route surface recoveryRequired + retryable + compensated", () => {
  const api = fs.readFileSync(path.join(__dirname, "../../js/core/api-client.js"), "utf8");
  assert.match(api, /recoveryRequired:\s*data\s*&&\s*data\.recoveryRequired\s*===\s*true/);
  assert.match(api, /retryable:\s*data\s*&&\s*data\.retryable\s*===\s*true/);
  assert.match(api, /compensated:\s*data\s*&&\s*data\.compensated\s*===\s*true/);
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(routes, /recoveryRequired:\s*recovery\s*===\s*true/);
  assert.match(routes, /MONTHLY_IMPORT_COMPENSATION_FAILED/);
  assert.match(routes, /MONTHLY_IMPORT_RECOVERY_REQUIRED/);
  assert.match(routes, /Uvoz se još obrađuje/);
});

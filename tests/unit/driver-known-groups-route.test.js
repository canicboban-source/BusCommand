const test = require("node:test");
const assert = require("node:assert/strict");
const { registerDriverRoutes } = require("../../server/driver-routes");

/**
 * Dispatcher-editable "Streckenkenntnis" (knownGroupIds) — full company access,
 * never touches eid/pin/companyCode. See server/driver-routes.js.
 */
function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function fakeCompanyGroups(existingGroupIds) {
  const set = new Set(existingGroupIds);
  return {
    doc: (groupId) => ({
      get: async () => ({ exists: set.has(groupId) })
    })
  };
}

function registerKnownGroupsRoute({ driverData, existingGroupIds, auditCalls, updateCalls }) {
  const routes = new Map();
  const app = {
    use() {},
    get() {},
    post() {},
    put(path, ...handlers) { routes.set(path, handlers.at(-1)); }
  };
  registerDriverRoutes(app, {
    admin: () => ({ firestore: { FieldValue: { serverTimestamp: () => "ts" } } }),
    db: () => ({
      collection: () => ({
        doc: () => ({
          collection: (name) => {
            if (name === "drivers") {
              return {
                doc: () => ({
                  get: async () => ({ exists: Boolean(driverData), data: () => driverData }),
                  update: async (patch) => { updateCalls.push(patch); }
                })
              };
            }
            if (name === "groups") return fakeCompanyGroups(existingGroupIds);
            return { doc: () => ({ get: async () => ({ exists: true }) }) };
          }
        })
      })
    }),
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "203.0.113.10",
    logAudit: async (companyId, uid, action, details) => { auditCalls.push({ companyId, uid, action, details }); }
  });
  return routes.get("/api/staff/drivers/:driverId/known-groups");
}

test("known-groups route rejects non-dispatcher roles", async () => {
  const handler = registerKnownGroupsRoute({ driverData: { groupId: "101" }, existingGroupIds: ["101", "202"], auditCalls: [], updateCalls: [] });
  const req = { staff: { role: "company_admin", companyId: "alpha", uid: "u1" }, params: { driverId: "11111111-1111-4111-8111-111111111111" }, body: { knownGroupIds: ["202"] } };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 403);
});

test("known-groups route rejects malformed body", async () => {
  const handler = registerKnownGroupsRoute({ driverData: { groupId: "101" }, existingGroupIds: ["101"], auditCalls: [], updateCalls: [] });
  const req = { staff: { role: "dispatcher", companyId: "alpha", uid: "u1" }, params: { driverId: "11111111-1111-4111-8111-111111111111" }, body: { knownGroupIds: "not-an-array" } };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
});

test("known-groups route rejects a foreign/garbage group id", async () => {
  const auditCalls = [];
  const updateCalls = [];
  const handler = registerKnownGroupsRoute({ driverData: { groupId: "101" }, existingGroupIds: ["101"], auditCalls, updateCalls });
  const req = { staff: { role: "dispatcher", companyId: "alpha", uid: "u1" }, params: { driverId: "11111111-1111-4111-8111-111111111111" }, body: { knownGroupIds: ["999-does-not-exist"] } };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(updateCalls.length, 0);
  assert.equal(auditCalls.length, 0);
});

test("known-groups route accepts groups outside the dispatcher's own assigned groups (full company access)", async () => {
  const auditCalls = [];
  const updateCalls = [];
  const handler = registerKnownGroupsRoute({
    driverData: { groupId: "101" },
    existingGroupIds: ["101", "202", "303"],
    auditCalls,
    updateCalls
  });
  // Dispatcher's own claim only covers "101" — request includes "303", outside that set.
  const req = {
    staff: { role: "dispatcher", companyId: "alpha", uid: "u1", groups: ["101"] },
    params: { driverId: "11111111-1111-4111-8111-111111111111" },
    body: { knownGroupIds: ["202", "303"] }
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.knownGroupIds.sort(), ["101", "202", "303"]);
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].knownGroupIds.sort(), ["101", "202", "303"]);
});

test("known-groups route always keeps the driver's home group in the saved list", async () => {
  const auditCalls = [];
  const updateCalls = [];
  const handler = registerKnownGroupsRoute({ driverData: { groupId: "101" }, existingGroupIds: ["101", "202"], auditCalls, updateCalls });
  const req = {
    staff: { role: "dispatcher", companyId: "alpha", uid: "u1" },
    params: { driverId: "11111111-1111-4111-8111-111111111111" },
    body: { knownGroupIds: ["202"] }
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.knownGroupIds.includes("101"), "home group must remain in the saved list");
});

test("known-groups route audits without any eid/pin/companyCode fields", async () => {
  const auditCalls = [];
  const updateCalls = [];
  const handler = registerKnownGroupsRoute({ driverData: { groupId: "101" }, existingGroupIds: ["101"], auditCalls, updateCalls });
  const req = {
    staff: { role: "dispatcher", companyId: "alpha", uid: "u1" },
    params: { driverId: "11111111-1111-4111-8111-111111111111" },
    body: { knownGroupIds: ["101"] }
  };
  const res = response();
  await handler(req, res);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].action, "driver_known_groups_updated");
  const keys = Object.keys(auditCalls[0].details);
  assert.deepEqual(keys.sort(), ["driverId", "knownGroupIds"]);
});

test("known-groups route returns 404 for a missing driver", async () => {
  const handler = registerKnownGroupsRoute({ driverData: null, existingGroupIds: ["101"], auditCalls: [], updateCalls: [] });
  const req = {
    staff: { role: "dispatcher", companyId: "alpha", uid: "u1" },
    params: { driverId: "11111111-1111-4111-8111-111111111111" },
    body: { knownGroupIds: ["101"] }
  };
  const res = response();
  await handler(req, res);
  assert.equal(res.statusCode, 404);
});

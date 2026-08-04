const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { COST, registerDriverRoutes } = require("../../server/driver-routes");

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const PERSONAL_CODE = "556677";
const OTP = "482913";

/**
 * Minimal Firestore stand-in for the login path. It keeps real documents so the
 * tests observe what the handler actually writes (attempt counters, lock
 * windows, activation consumption) instead of asserting on source text.
 */
function createWorld({ suspended = false, driver, credentials } = {}) {
  const state = {
    settings: suspended ? { status: "suspended" } : { status: "active" },
    drivers: { [DRIVER_ID]: driver },
    driver_credentials: { [DRIVER_ID]: credentials },
    audit: [],
    tokens: []
  };

  function snapshot(collection, id) {
    const data = state[collection][id];
    return {
      id,
      exists: data !== undefined,
      data: () => (data === undefined ? undefined : { ...data })
    };
  }

  function docRef(collection, id) {
    return {
      __collection: collection,
      __id: id,
      get: async () => snapshot(collection, id),
      set: async (value) => { state[collection][id] = { ...(state[collection][id] || {}), ...value }; },
      update: async (value) => applyUpdate(collection, id, value),
      delete: async () => { delete state[collection][id]; }
    };
  }

  function applyUpdate(collection, id, value) {
    const current = state[collection][id] || {};
    const next = { ...current };
    for (const [key, item] of Object.entries(value)) {
      next[key] = item && item.__sentinel === "serverTimestamp" ? new Date() : item;
    }
    state[collection][id] = next;
  }

  const companyRef = {
    collection(name) {
      return {
        doc: (id) => (name === "settings" ? docRef("settingsDoc", id) : docRef(name, id)),
        where: (field, _op, value) => ({
          limit: () => ({
            get: async () => {
              const docs = Object.entries(state[name] || {})
                .filter(([, item]) => item && item[field] === value)
                .map(([id]) => snapshot(name, id));
              return { empty: docs.length === 0, docs };
            }
          })
        })
      };
    }
  };

  // settings/main is read through the same doc() surface
  state.settingsDoc = { main: state.settings };

  const db = () => ({
    collection: () => ({ doc: () => companyRef }),
    runTransaction: async (fn) => fn({
      get: async (ref) => ref.get(),
      update: (ref, value) => applyUpdate(ref.__collection, ref.__id, value)
    })
  });

  const admin = () => ({
    auth: () => ({
      createCustomToken: async (uid, claims) => {
        state.tokens.push({ uid, claims });
        return `token:${uid}`;
      }
    }),
    firestore: {
      FieldValue: { serverTimestamp: () => ({ __sentinel: "serverTimestamp" }) }
    }
  });

  return { state, db, admin };
}

function registerLoginRoutes(world, { now = () => new Date() } = {}) {
  const routes = new Map();
  const app = {
    use() {},
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
    put(path, ...handlers) { routes.set(`PUT ${path}`, handlers.at(-1)); }
  };
  registerDriverRoutes(app, {
    admin: world.admin,
    db: world.db,
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "203.0.113.10",
    logAudit: async (companyId, actorId, action, details) => {
      world.state.audit.push({ companyId, actorId, action, details });
    },
    now
  });
  return routes;
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function login(routes, body) {
  const res = response();
  await routes.get("POST /api/auth/driver-login")({ body, headers: {} }, res);
  return res;
}

async function activatedDriverWorld() {
  return createWorld({
    driver: { active: true, codeActivated: true, firstName: "Ana", lastName: "Marić", eid: "4711" },
    credentials: { eid: "4711", loginCodeHash: await bcrypt.hash(PERSONAL_CODE, COST) }
  });
}

test("login by EID succeeds and clears the failure counters", async () => {
  const world = await activatedDriverWorld();
  world.state.driver_credentials[DRIVER_ID].failedLoginAttempts = 3;
  const routes = registerLoginRoutes(world);

  const res = await login(routes, { companyId: "alpha", eid: "4711", loginCode: PERSONAL_CODE });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.mustChangeLoginCode, false);
  assert.equal(res.body.user.id, DRIVER_ID);
  assert.equal(res.body.user.name, "Ana Marić");
  assert.equal(world.state.driver_credentials[DRIVER_ID].failedLoginAttempts, 0);
  assert.equal(world.state.driver_credentials[DRIVER_ID].lockedUntil, null);
  assert.equal(world.state.tokens[0].claims.role, "driver");
  assert.equal(world.state.tokens[0].claims.mustChangeLoginCode, false);
});

test("an unknown EID is answered exactly like a wrong code and reveals no driver", async () => {
  const world = await activatedDriverWorld();
  const routes = registerLoginRoutes(world);

  const unknown = await login(routes, { companyId: "alpha", eid: "9999", loginCode: PERSONAL_CODE });
  const wrongCode = await login(routes, { companyId: "alpha", eid: "4711", loginCode: "000000" });

  assert.equal(unknown.statusCode, 401);
  assert.equal(wrongCode.statusCode, 401);
  assert.deepEqual(unknown.body, wrongCode.body);
  assert.equal(unknown.body.code, "INVALID_LOGIN");
  assert.equal(JSON.stringify(unknown.body).includes("Ana"), false);
  assert.equal(world.state.audit.filter(entry => entry.action === "driver_login_failed").length, 2);
});

test("the account locks after ten failures and refuses even the correct code", async () => {
  const world = await activatedDriverWorld();
  let clock = new Date("2026-08-04T10:00:00.000Z");
  const routes = registerLoginRoutes(world, { now: () => clock });

  for (let attempt = 1; attempt <= 9; attempt += 1) {
    const res = await login(routes, { companyId: "alpha", eid: "4711", loginCode: "000000" });
    assert.equal(res.statusCode, 401, `attempt ${attempt}`);
    assert.equal(world.state.driver_credentials[DRIVER_ID].failedLoginAttempts, attempt);
  }

  const locking = await login(routes, { companyId: "alpha", eid: "4711", loginCode: "000000" });
  assert.equal(locking.statusCode, 429);
  assert.equal(locking.body.code, "ACCOUNT_LOCKED");
  assert.equal(locking.body.retryAfterSeconds, 900);

  const duringLock = await login(routes, { companyId: "alpha", eid: "4711", loginCode: PERSONAL_CODE });
  assert.equal(duringLock.statusCode, 429);
  assert.equal(duringLock.body.code, "ACCOUNT_LOCKED");
  assert.equal(world.state.tokens.length, 0, "no token may be minted while locked");

  clock = new Date("2026-08-04T10:16:00.000Z");
  const afterLock = await login(routes, { companyId: "alpha", eid: "4711", loginCode: PERSONAL_CODE });
  assert.equal(afterLock.statusCode, 200);
  assert.equal(world.state.audit.some(entry => entry.action === "driver_login_locked_out"), true);
});

test("a suspended company is refused before any credential is checked", async () => {
  const world = createWorld({
    suspended: true,
    driver: { active: true, codeActivated: true, firstName: "Ana", lastName: "Marić" },
    credentials: { eid: "4711", loginCodeHash: await bcrypt.hash(PERSONAL_CODE, COST) }
  });
  const routes = registerLoginRoutes(world);

  const res = await login(routes, { companyId: "alpha", eid: "4711", loginCode: PERSONAL_CODE });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "COMPANY_SUSPENDED");
  assert.equal(world.state.tokens.length, 0);
  assert.equal(world.state.driver_credentials[DRIVER_ID].failedLoginAttempts, undefined);
});

test("a deactivated driver cannot sign in with a valid personal code", async () => {
  const world = createWorld({
    driver: { active: false, codeActivated: true, firstName: "Ana", lastName: "Marić" },
    credentials: { eid: "4711", loginCodeHash: await bcrypt.hash(PERSONAL_CODE, COST) }
  });
  const routes = registerLoginRoutes(world);

  const res = await login(routes, { companyId: "alpha", eid: "4711", loginCode: PERSONAL_CODE });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_LOGIN");
  assert.equal(world.state.tokens.length, 0);
});

test("the activation OTP works once and the replay is rejected", async () => {
  const world = createWorld({
    driver: { active: true, codeActivated: false, firstName: "Ana", lastName: "Marić" },
    credentials: {
      eid: "4711",
      activationCodeHash: await bcrypt.hash(OTP, COST),
      activationExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      activationUsedAt: null
    }
  });
  const routes = registerLoginRoutes(world);

  const first = await login(routes, { companyId: "alpha", eid: "4711", loginCode: OTP });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.mustChangeLoginCode, true);
  assert.ok(world.state.driver_credentials[DRIVER_ID].activationUsedAt);
  assert.equal(world.state.tokens[0].claims.mustChangeLoginCode, true);

  const replay = await login(routes, { companyId: "alpha", eid: "4711", loginCode: OTP });
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.body.code, "INVALID_LOGIN");
  assert.equal(world.state.tokens.length, 1);
});

test("the identify endpoint is gone and answers without touching driver data", async () => {
  const world = await activatedDriverWorld();
  const routes = registerLoginRoutes(world);
  const res = response();

  await routes.get("POST /api/public/drivers/identify")({ body: { companyId: "alpha", eid: "4711" } }, res);

  assert.equal(res.statusCode, 410);
  assert.equal(res.body.code, "DRIVER_IDENTIFY_DISABLED");
  assert.equal(JSON.stringify(res.body).includes("Ana"), false);
});

test("a login without any identifier is rejected by validation", async () => {
  const world = await activatedDriverWorld();
  const routes = registerLoginRoutes(world);

  const res = await login(routes, { companyId: "alpha", loginCode: PERSONAL_CODE });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_LOGIN_PAYLOAD");
});

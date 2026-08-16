/**
 * FAZA 1 Security Closeout — executable message archive + SOS resolve handlers.
 * Asserts real mutations and enumeration-safe public responses (not source regex).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { registerDriverRoutes } = require("../../server/driver-routes");

function createWorld() {
  const state = {
    companies: {
      alpha: {
        settings: {
          main: { status: "active" },
          sos: { sosActive: false }
        },
        drivers: {
          "drv-310": { groupId: "310", lineId: "310", firstName: "Home", lastName: "D", active: true },
          "drv-105": { groupId: "105", lineId: "105", firstName: "Foreign", lastName: "D", active: true }
        },
        messages: {
          "msg-310": {
            groupId: "310",
            recipientDriverId: "drv-310",
            broadcast: false,
            text: "assigned",
            dispArchivedByIds: []
          },
          "msg-105": {
            groupId: "105",
            recipientDriverId: "drv-105",
            broadcast: false,
            text: "foreign",
            dispArchivedByIds: []
          }
        },
        sos: {
          "sos-105": { driverId: "drv-105", groupId: "105", status: "active" },
          "sos-310": { driverId: "drv-310", groupId: "310", status: "active" }
        }
      }
    },
    audit: []
  };

  function resolvePath(companyId, collection, id) {
    const company = state.companies[companyId];
    if (!company[collection]) company[collection] = {};
    return { bag: company[collection], id, company };
  }

  function applyFieldValue(current, patch) {
    const next = { ...(current || {}) };
    for (const [key, value] of Object.entries(patch || {})) {
      if (value && value.__op === "arrayUnion") {
        const prev = Array.isArray(next[key]) ? next[key] : [];
        next[key] = [...new Set([...prev, ...value.values])];
      } else if (value && value.__op === "serverTimestamp") {
        next[key] = new Date("2026-08-09T00:00:00.000Z");
      } else {
        next[key] = value;
      }
    }
    return next;
  }

  function docRef(companyId, collection, id) {
    return {
      __companyId: companyId,
      __collection: collection,
      __id: id,
      async get() {
        const { bag } = resolvePath(companyId, collection, id);
        const data = bag[id];
        return {
          id,
          exists: data !== undefined,
          data: () => (data === undefined ? undefined : { ...data }),
          ref: docRef(companyId, collection, id)
        };
      },
      async update(patch) {
        const { bag } = resolvePath(companyId, collection, id);
        if (bag[id] === undefined) throw new Error("missing");
        bag[id] = applyFieldValue(bag[id], patch);
      },
      async set(value, opts = {}) {
        const { bag } = resolvePath(companyId, collection, id);
        bag[id] = opts.merge ? applyFieldValue(bag[id], value) : { ...value };
      }
    };
  }

  const db = () => ({
    collection: (name) => {
      assert.equal(name, "companies");
      return {
        doc: (companyId) => ({
          collection: (collection) => ({
            doc: (id) => docRef(companyId, collection, id)
          })
        })
      };
    },
    batch() {
      const ops = [];
      return {
        update(ref, patch) {
          ops.push({ type: "update", ref, patch });
        },
        set(ref, value, opts) {
          ops.push({ type: "set", ref, value, opts });
        },
        async commit() {
          for (const op of ops) {
            if (op.type === "update") await op.ref.update(op.patch);
            else await op.ref.set(op.value, op.opts || {});
          }
        }
      };
    }
  });

  const admin = () => ({
    firestore: {
      FieldValue: {
        serverTimestamp: () => ({ __op: "serverTimestamp" }),
        arrayUnion: (...values) => ({ __op: "arrayUnion", values })
      }
    }
  });

  return { state, db, admin };
}

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

function registerRoutes(world) {
  const routes = new Map();
  const app = {
    use() {},
    get(path, ...handlers) { routes.set(`GET ${path}`, chainHandlers(handlers)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, chainHandlers(handlers)); },
    put(path, ...handlers) { routes.set(`PUT ${path}`, chainHandlers(handlers)); }
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
    staffAuth: {
      requireCompanyStaff(req, res, next) {
        const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const staff = {
          "disp-310": {
            uid: "disp-310", role: "dispatcher", companyId: "alpha", groups: ["310"], active: true
          },
          "ca-alpha": {
            uid: "ca-alpha", role: "company_admin", companyId: "alpha", groups: [], active: true
          }
        }[token];
        if (!staff) {
          res.status(401).json({ success: false, error: "unauthorized" });
          return undefined;
        }
        req.staffUser = staff;
        return next();
      }
    }
  });
  return routes;
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function invoke(routes, methodPath, { token, params = {}, body } = {}) {
  const handler = routes.get(methodPath);
  assert.ok(handler, `missing route ${methodPath}`);
  const res = response();
  await handler({
    headers: { authorization: `Bearer ${token}` },
    params,
    body,
    staff: undefined,
    log: { error() {} }
  }, res);
  return res;
}

test("message archive: assigned-group succeeds and mutates", async () => {
  const world = createWorld();
  const routes = registerRoutes(world);
  const res = await invoke(routes, "PUT /api/staff/messages/:messageId/archive", {
    token: "disp-310",
    params: { messageId: "msg-310" }
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  const msg = world.state.companies.alpha.messages["msg-310"];
  assert.ok(msg.dispArchivedByIds.includes("disp-310"));
});

test("message archive: foreign-group does not mutate and matches nonexistent enumeration envelope", async () => {
  const world = createWorld();
  const routes = registerRoutes(world);
  const foreign = await invoke(routes, "PUT /api/staff/messages/:messageId/archive", {
    token: "disp-310",
    params: { messageId: "msg-105" }
  });
  const missing = await invoke(routes, "PUT /api/staff/messages/:messageId/archive", {
    token: "disp-310",
    params: { messageId: "msg-does-not-exist" }
  });
  assert.equal(foreign.statusCode, missing.statusCode);
  assert.deepEqual(foreign.body, missing.body);
  assert.equal(foreign.statusCode, 404);
  assert.equal(foreign.body.code, "MESSAGE_UNAVAILABLE");
  assert.equal(foreign.body.error, "Poruka nije dostupna.");
  assert.equal(foreign.body.groupId, undefined);
  assert.equal(foreign.body.driverId, undefined);
  assert.equal(world.state.companies.alpha.messages["msg-105"].dispArchivedByIds.length, 0);
  assert.equal(world.state.companies.alpha.messages["msg-105"].text, "foreign");
});

test("SOS resolve: assigned-group succeeds and clears settings", async () => {
  const world = createWorld();
  world.state.companies.alpha.settings.sos = {
    sosActive: true,
    sosDriverId: "drv-310",
    sosDriver: "Home D",
    sosBus: "B310",
    sosId: "sos-310",
    groupId: "310"
  };
  const routes = registerRoutes(world);
  const res = await invoke(routes, "PUT /api/staff/sos/resolve", { token: "disp-310" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(world.state.companies.alpha.settings.sos.sosActive, false);
  assert.equal(world.state.companies.alpha.sos["sos-310"].status, "resolved");
});

test("SOS resolve: foreign active SOS matches empty SOS envelope and does not mutate", async () => {
  const world = createWorld();
  world.state.companies.alpha.settings.sos = {
    sosActive: true,
    sosDriverId: "drv-105",
    sosDriver: "Foreign D",
    sosBus: "B105",
    sosId: "sos-105",
    groupId: "105"
  };
  const routes = registerRoutes(world);
  const foreign = await invoke(routes, "PUT /api/staff/sos/resolve", { token: "disp-310" });

  const emptyWorld = createWorld();
  emptyWorld.state.companies.alpha.settings.sos = { sosActive: false };
  const emptyRoutes = registerRoutes(emptyWorld);
  const empty = await invoke(emptyRoutes, "PUT /api/staff/sos/resolve", { token: "disp-310" });

  assert.equal(foreign.statusCode, empty.statusCode);
  assert.deepEqual(foreign.body, empty.body);
  assert.equal(foreign.statusCode, 409);
  assert.equal(foreign.body.code, "SOS_UNAVAILABLE");
  assert.equal(foreign.body.error, "Nema aktivnog SOS alarma.");
  assert.equal(foreign.body.groupId, undefined);
  assert.equal(world.state.companies.alpha.settings.sos.sosActive, true);
  assert.equal(world.state.companies.alpha.settings.sos.groupId, "105");
  assert.equal(world.state.companies.alpha.sos["sos-105"].status, "active");
});

test("D28: an SOS from a driver with no group is still resolvable", async () => {
  // Regression: dispatcherCanAccessGroup(groups, null) is false, so a group-less SOS
  // could not be cleared by ANY dispatcher — banner and siren stuck permanently.
  const world = createWorld();
  world.state.companies.alpha.drivers["drv-nogroup"] = {
    groupId: null, lineId: null, firstName: "No", lastName: "Group", active: true
  };
  world.state.companies.alpha.sos["sos-nogroup"] = { driverId: "drv-nogroup", groupId: null, status: "active" };
  world.state.companies.alpha.settings.sos = {
    sosActive: true,
    sosDriverId: "drv-nogroup",
    sosDriver: "No Group",
    sosBus: "B999",
    sosId: "sos-nogroup",
    groupId: null
  };
  const routes = registerRoutes(world);
  const res = await invoke(routes, "PUT /api/staff/sos/resolve", { token: "disp-310" });
  assert.equal(res.statusCode, 200, "an ungrouped alarm must be clearable");
  assert.equal(world.state.companies.alpha.settings.sos.sosActive, false);
  assert.equal(world.state.companies.alpha.sos["sos-nogroup"].status, "resolved");
  const entry = world.state.audit.find((row) => row.action === "staff_sos_resolved");
  assert.equal(entry.details.groupScope, "unassigned");
});

test("D28: an empty note still records a default audit reason", async () => {
  const world = createWorld();
  world.state.companies.alpha.settings.sos = {
    sosActive: true, sosDriverId: "drv-310", sosDriver: "Home D",
    sosBus: "B310", sosId: "sos-310", groupId: "310"
  };
  const routes = registerRoutes(world);
  const res = await invoke(routes, "PUT /api/staff/sos/resolve", { token: "disp-310", body: { note: "   " } });
  assert.equal(res.statusCode, 200);
  const entry = world.state.audit.find((row) => row.action === "staff_sos_resolved");
  assert.equal(entry.details.resolutionNote, "Reseno od strane dispecera");
  assert.equal(world.state.companies.alpha.sos["sos-310"].resolutionNote, "Reseno od strane dispecera");
});

test("D28: a dispatcher note is recorded verbatim in the SOS record and audit", async () => {
  const world = createWorld();
  world.state.companies.alpha.settings.sos = {
    sosActive: true, sosDriverId: "drv-310", sosDriver: "Home D",
    sosBus: "B310", sosId: "sos-310", groupId: "310"
  };
  const routes = registerRoutes(world);
  const res = await invoke(routes, "PUT /api/staff/sos/resolve", {
    token: "disp-310", body: { note: "Vozac kontaktiran, situacija bezbedna." }
  });
  assert.equal(res.statusCode, 200);
  const entry = world.state.audit.find((row) => row.action === "staff_sos_resolved");
  assert.equal(entry.details.resolutionNote, "Vozac kontaktiran, situacija bezbedna.");
  assert.equal(entry.details.groupScope, "group");
});

test("D28: an over-long note is rejected without touching the alarm", async () => {
  const world = createWorld();
  world.state.companies.alpha.settings.sos = {
    sosActive: true, sosDriverId: "drv-310", sosDriver: "Home D",
    sosBus: "B310", sosId: "sos-310", groupId: "310"
  };
  const routes = registerRoutes(world);
  const res = await invoke(routes, "PUT /api/staff/sos/resolve", { token: "disp-310", body: { note: "x".repeat(501) } });
  assert.equal(res.statusCode, 400);
  assert.equal(world.state.companies.alpha.settings.sos.sosActive, true);
});

test("D28: group scoping still blocks a foreign SOS after the ungrouped fix", async () => {
  const world = createWorld();
  world.state.companies.alpha.settings.sos = {
    sosActive: true, sosDriverId: "drv-105", sosDriver: "Foreign D",
    sosBus: "B105", sosId: "sos-105", groupId: "105"
  };
  const routes = registerRoutes(world);
  const res = await invoke(routes, "PUT /api/staff/sos/resolve", { token: "disp-310" });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "SOS_UNAVAILABLE");
  assert.equal(world.state.companies.alpha.settings.sos.sosActive, true);
});

/**
 * FAZA 2R-A — executable HTTP checks for staff monthly import routes
 * (auth/role/group/fingerprint/expiry/rate-limit), not regex-only.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { registerDriverRoutes } = require("../../server/driver-routes");
const { GroupMonthlyImportError } = require("../../server/group-monthly-plan-import");

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

const FP = crypto.createHash("sha256").update("phase2r-a-http").digest("hex");
const IMPORT_ID = "11111111-2222-4333-8444-555555555555";
const DRIVER_ID = "11111111-1111-4111-8111-111111111111";

function createImportDb(jobOverrides = {}) {
  const job = {
    actorId: "disp-1",
    fingerprint: FP,
    source: "dispatcher-staff-import",
    status: "prepared",
    groupId: "310",
    month: "2026-08",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    rows: [],
    summary: { rows: 0 },
    ...jobOverrides
  };
  const bags = { monthly_plan_imports: { [IMPORT_ID]: { ...job } } };
  return {
    __bags: bags,
    async getAll() { return []; },
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return ref.get(); },
        set(ref, value, opts) { return ref.set(value, opts); }
      };
      return fn(tx);
    },
    collection(name) {
      assert.equal(name, "companies");
      return {
        doc() {
          return {
            collection(sub) {
              if (!bags[sub]) bags[sub] = {};
              return {
                doc(id) {
                  return {
                    id,
                    async get() {
                      const data = bags[sub]?.[id];
                      return {
                        exists: data !== undefined,
                        data: () => (data === undefined ? undefined : { ...data })
                      };
                    },
                    async set(value, opts = {}) {
                      if (opts.merge && bags[sub][id]) {
                        bags[sub][id] = { ...bags[sub][id], ...value };
                      } else {
                        bags[sub][id] = { ...value };
                      }
                    }
                  };
                },
                where() {
                  return {
                    where() {
                      return {
                        async get() { return { docs: [] }; }
                      };
                    },
                    async get() { return { docs: [] }; }
                  };
                },
                async get() { return { docs: [], forEach() {} }; }
              };
            }
          };
        }
      };
    }
  };
}

function mountRoutes({
  db = createImportDb(),
  rateLimitImpl = () => (_req, _res, next) => next()
} = {}) {
  const routes = new Map();
  const app = {
    use() {},
    get(p, ...h) { routes.set(`GET ${p}`, chainHandlers(h)); },
    post(p, ...h) { routes.set(`POST ${p}`, chainHandlers(h)); },
    put(p, ...h) { routes.set(`PUT ${p}`, chainHandlers(h)); }
  };

  registerDriverRoutes(app, {
    admin: () => ({ firestore: { FieldValue: { serverTimestamp: () => new Date() } } }),
    db: () => db,
    hasFirebase: () => true,
    rateLimit: rateLimitImpl,
    clearRateLimit() {},
    getClientIp: () => "203.0.113.10",
    logAudit: async () => {},
    staffAuth: {
      requireCompanyStaff(req, res, next) {
        const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        const staff = {
          "ca-1": { uid: "ca-1", role: "company_admin", companyId: "alpha", groups: ["310"], active: true },
          "disp-1": { uid: "disp-1", role: "dispatcher", companyId: "alpha", groups: ["310"], active: true },
          "disp-foreign": { uid: "disp-foreign", role: "dispatcher", companyId: "alpha", groups: ["999"], active: true }
        }[token];
        if (!staff) {
          res.status(401).json({ success: false });
          return undefined;
        }
        req.staffUser = staff;
        return next();
      }
    }
  });

  async function invoke(methodPath, token, body = {}) {
    const handler = routes.get(methodPath);
    assert.ok(handler, methodPath);
    const res = response();
    await handler({
      __path: methodPath,
      headers: { authorization: `Bearer ${token}` },
      body,
      staff: undefined,
      log: { error() {} }
    }, res);
    return res;
  }

  return { invoke, routes };
}

test("preview/commit routes wire rateLimit(10, 60_000) in source", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(source, /monthly-plans\/import\/preview", rateLimit\(10, 60_000\)/);
  assert.match(source, /monthly-plans\/import\/commit", rateLimit\(10, 60_000\)/);
  assert.match(source, /MONTHLY_IMPORT_COMPENSATION_FAILED/);
  assert.match(source, /Automatski povrat nije uspeo/);
});

test("company admin cannot preview or commit staff monthly import", async () => {
  const { invoke } = mountRoutes();
  const previewCa = await invoke("POST /api/staff/monthly-plans/import/preview", "ca-1", {
    groupId: "310",
    month: "2026-08",
    sourceName: "x.xlsx",
    reason: "Dispatcher monthly plan import",
    rows: [{
      driverId: DRIVER_ID,
      date: "2026-08-03",
      type: "morning",
      expectedRevision: 0
    }]
  });
  assert.equal(previewCa.statusCode, 403);

  const commitCa = await invoke("PUT /api/staff/monthly-plans/import/commit", "ca-1", {
    importId: IMPORT_ID,
    fingerprint: FP
  });
  assert.equal(commitCa.statusCode, 403);
});

test("dispatcher foreign group is denied on preview and commit", async () => {
  const db = createImportDb({ groupId: "310" });
  const { invoke } = mountRoutes({ db });

  const previewForeign = await invoke("POST /api/staff/monthly-plans/import/preview", "disp-1", {
    groupId: "999",
    month: "2026-08",
    sourceName: "x.xlsx",
    reason: "Dispatcher monthly plan import",
    rows: [{
      driverId: DRIVER_ID,
      date: "2026-08-03",
      type: "morning",
      expectedRevision: 0
    }]
  });
  assert.equal(previewForeign.statusCode, 403);
  assert.equal(previewForeign.body.code, "GROUP_ACCESS_DENIED");

  const commitForeign = await invoke("PUT /api/staff/monthly-plans/import/commit", "disp-foreign", {
    importId: IMPORT_ID,
    fingerprint: FP
  });
  assert.equal(commitForeign.statusCode, 403);
  assert.equal(commitForeign.body.code, "GROUP_ACCESS_DENIED");
});

test("commit rejects fingerprint mismatch via executable handler path", async () => {
  const db = createImportDb({ fingerprint: FP });
  const { invoke } = mountRoutes({ db });
  const wrongFp = crypto.createHash("sha256").update("wrong").digest("hex");
  const res = await invoke("PUT /api/staff/monthly-plans/import/commit", "disp-1", {
    importId: IMPORT_ID,
    fingerprint: wrongFp
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "MONTHLY_IMPORT_MISMATCH");
});

test("commit rejects expired prepared job", async () => {
  const db = createImportDb({
    expiresAt: new Date(Date.now() - 60_000),
    status: "prepared"
  });
  const { invoke } = mountRoutes({ db });
  const res = await invoke("PUT /api/staff/monthly-plans/import/commit", "disp-1", {
    importId: IMPORT_ID,
    fingerprint: FP
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "MONTHLY_IMPORT_EXPIRED");
});

test("commit rejects failed terminal status as recovery-required when uncompensated", async () => {
  const db = createImportDb({ status: "failed", compensated: false });
  const { invoke } = mountRoutes({ db });
  const res = await invoke("PUT /api/staff/monthly-plans/import/commit", "disp-1", {
    importId: IMPORT_ID,
    fingerprint: FP
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  assert.equal(res.body.recoveryRequired, true);
});

test("compensation_failed / recovery_required jobs are not retryable over HTTP", async () => {
  const db = createImportDb({ status: "compensation_failed", recoveryRequired: true });
  const { invoke } = mountRoutes({ db });
  const res = await invoke("PUT /api/staff/monthly-plans/import/commit", "disp-1", {
    importId: IMPORT_ID,
    fingerprint: FP
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  assert.equal(res.body.recoveryRequired, true);
  void GroupMonthlyImportError;
});

test("rateLimit middleware is invoked on preview and commit (executable)", async () => {
  let previewHits = 0;
  let commitHits = 0;
  const rateLimitImpl = (_max, _window) => (req, res, next) => {
    const pathName = req.__path || "";
    if (pathName.includes("preview")) {
      previewHits += 1;
      if (previewHits > 1) {
        res.status(429).json({ success: false, code: "RATE_LIMITED" });
        return undefined;
      }
    }
    if (pathName.includes("commit")) {
      commitHits += 1;
      if (commitHits > 1) {
        res.status(429).json({ success: false, code: "RATE_LIMITED" });
        return undefined;
      }
    }
    return next();
  };

  const routes = new Map();
  const app = {
    use() {},
    get(p, ...h) { routes.set(`GET ${p}`, chainHandlers(h)); },
    post(p, ...h) { routes.set(`POST ${p}`, chainHandlers(h)); },
    put(p, ...h) { routes.set(`PUT ${p}`, chainHandlers(h)); }
  };
  registerDriverRoutes(app, {
    admin: () => ({ firestore: { FieldValue: { serverTimestamp: () => new Date() } } }),
    db: () => createImportDb(),
    hasFirebase: () => true,
    rateLimit: rateLimitImpl,
    clearRateLimit() {},
    getClientIp: () => "203.0.113.10",
    logAudit: async () => {},
    staffAuth: {
      requireCompanyStaff(req, res, next) {
        req.staffUser = { uid: "disp-1", role: "dispatcher", companyId: "alpha", groups: ["310"], active: true };
        req.staff = req.staffUser;
        return next();
      }
    }
  });

  async function invoke(methodPath, body) {
    const handler = routes.get(methodPath);
    const res = response();
    await handler({
      __path: methodPath,
      headers: { authorization: "Bearer disp-1" },
      body,
      log: { error() {} }
    }, res);
    return res;
  }

  // Preview will fail later (empty db for drivers) but rate limit must run first.
  const p1 = await invoke("POST /api/staff/monthly-plans/import/preview", {
    groupId: "310",
    month: "2026-08",
    sourceName: "x.xlsx",
    reason: "Dispatcher monthly plan import",
    rows: [{ driverId: DRIVER_ID, date: "2026-08-03", type: "morning", expectedRevision: 0 }]
  });
  assert.notEqual(p1.statusCode, 429);
  assert.equal(previewHits, 1);

  const p2 = await invoke("POST /api/staff/monthly-plans/import/preview", {
    groupId: "310",
    month: "2026-08",
    sourceName: "x.xlsx",
    reason: "Dispatcher monthly plan import",
    rows: [{ driverId: DRIVER_ID, date: "2026-08-03", type: "morning", expectedRevision: 0 }]
  });
  assert.equal(p2.statusCode, 429);
  assert.equal(p2.body.code, "RATE_LIMITED");

  const c1 = await invoke("PUT /api/staff/monthly-plans/import/commit", {
    importId: IMPORT_ID,
    fingerprint: FP
  });
  assert.notEqual(c1.statusCode, 429);
  assert.equal(commitHits, 1);

  const c2 = await invoke("PUT /api/staff/monthly-plans/import/commit", {
    importId: IMPORT_ID,
    fingerprint: FP
  });
  assert.equal(c2.statusCode, 429);
});

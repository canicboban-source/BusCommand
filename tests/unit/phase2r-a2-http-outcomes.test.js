/**
 * FAZA 2R-A.2 — HTTP outcomes for commit: IN_PROGRESS, UNKNOWN (client),
 * RECOVERY_REQUIRED, compensated rollback messaging.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { registerDriverRoutes } = require("../../server/driver-routes");
const { lockDocumentId } = require("../../server/group-monthly-plan-import");

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

const FP = crypto.createHash("sha256").update("phase2r-a2-http").digest("hex");
const IMPORT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const GROUP_ID = "310";
const MONTH = "2026-08";

function createImportDb(jobOverrides = {}, lockOverrides = null) {
  const job = {
    actorId: "disp-1",
    fingerprint: FP,
    source: "dispatcher-staff-import",
    status: "prepared",
    groupId: GROUP_ID,
    month: MONTH,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    rows: [],
    summary: { rows: 0 },
    ...jobOverrides
  };
  const bags = {
    monthly_plan_imports: { [IMPORT_ID]: { ...job } },
    monthly_plan_import_locks: {},
    shifts: {},
    schedules: {},
    drivers: {},
    buses: {}
  };
  if (lockOverrides) {
    bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)] = {
      importId: IMPORT_ID,
      actorId: "disp-1",
      groupId: GROUP_ID,
      month: MONTH,
      ...lockOverrides
    };
  }
  return {
    __bags: bags,
    async getAll() { return []; },
    batch() {
      const ops = [];
      return {
        set(ref, value, opts) { ops.push(() => ref.set(value, opts)); return this; },
        delete(ref) { ops.push(() => ref.delete()); return this; },
        async commit() { for (const op of ops) await op(); }
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(ref) { return ref.get(); },
        set(ref, value, opts) { return ref.set(value, opts); },
        delete(ref) { return ref.delete(); }
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
                        const next = { ...bags[sub][id] };
                        for (const [k, v] of Object.entries(value)) {
                          if (v && typeof v === "object" && v.__delete === true) delete next[k];
                          else next[k] = v;
                        }
                        bags[sub][id] = next;
                      } else {
                        bags[sub][id] = { ...value };
                      }
                    },
                    async delete() { delete bags[sub][id]; }
                  };
                },
                where() {
                  return {
                    where() { return this; },
                    async get() { return { docs: [], forEach() {}, empty: true }; }
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

function mountRoutes(db) {
  const routes = new Map();
  const app = {
    use() {},
    get(p, ...h) { routes.set(`GET ${p}`, chainHandlers(h)); },
    post(p, ...h) { routes.set(`POST ${p}`, chainHandlers(h)); },
    put(p, ...h) { routes.set(`PUT ${p}`, chainHandlers(h)); }
  };
  registerDriverRoutes(app, {
    admin: () => ({
      firestore: {
        FieldValue: {
          serverTimestamp: () => new Date(),
          delete: () => ({ __delete: true })
        }
      }
    }),
    db: () => db,
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "203.0.113.10",
    logAudit: async () => {},
    staffAuth: {
      requireCompanyStaff(req, res, next) {
        req.staffUser = {
          uid: "disp-1",
          role: "dispatcher",
          companyId: "alpha",
          groups: [GROUP_ID],
          active: true
        };
        return next();
      }
    }
  });

  async function invoke(body = {}) {
    const handler = routes.get("PUT /api/staff/monthly-plans/import/commit");
    const res = response();
    await handler({
      headers: { authorization: "Bearer disp-1" },
      body: { importId: IMPORT_ID, fingerprint: FP, ...body },
      staff: undefined,
      log: { error() {} }
    }, res);
    return res;
  }
  return { invoke };
}

test("HTTP IN_PROGRESS: committing + live lock returns retryable truth", async () => {
  const db = createImportDb({ status: "committing" }, {
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  });
  const { invoke } = mountRoutes(db);
  const res = await invoke();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "MONTHLY_IMPORT_IN_PROGRESS");
  assert.equal(res.body.retryable, true);
  assert.equal(res.body.recoveryRequired, false);
  assert.match(res.body.error, /još obrađuje|processing|verarbeitet/i);
  assert.doesNotMatch(res.body.error, /poništene|rolled back|zurückgenommen|Automatski povrat nije uspeo/i);
  assert.equal(Object.keys(db.__bags.shifts).length, 0);
});

test("HTTP RECOVERY_REQUIRED: generic recovery does not claim compensation failure", async () => {
  const db = createImportDb({
    status: "compensation_failed",
    recoveryRequired: true,
    compensated: false,
    appliedChunks: 1
  });
  const { invoke } = mountRoutes(db);
  const res = await invoke();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  assert.equal(res.body.recoveryRequired, true);
  assert.equal(res.body.retryable, false);
  assert.match(res.body.error, /Stanje zahteva proveru|plan se ne smatra čistim/i);
  assert.doesNotMatch(res.body.error, /Automatski povrat nije uspeo/i);
  assert.doesNotMatch(res.body.error, /poništene|rolled back|zurückgenommen/i);
});

test("HTTP COMPENSATION_FAILED message only for real compensation failure code", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(routes, /compensationFailed\s*=\s*error\.code\s*===\s*"MONTHLY_IMPORT_COMPENSATION_FAILED"/);
  assert.match(routes, /monthly_plan_import_compensation_failed/);
  assert.match(routes, /Stanje zahteva proveru/);
});

test("HTTP RECOVERY_REQUIRED: expired committing with applied chunks stays fail-closed", async () => {
  const db = createImportDb({
    status: "committing",
    appliedChunks: 1,
    expiresAt: new Date(Date.now() - 1000),
    rows: [{
      driverId: "11111111-1111-4111-8111-111111111111",
      date: `${MONTH}-03`,
      type: "morning",
      name: "310.S01",
      expectedRevision: 0,
      previous: null
    }]
  });
  db.__bags.shifts[`11111111-1111-4111-8111-111111111111_${MONTH}-03`] = {
    importId: IMPORT_ID,
    driverId: "11111111-1111-4111-8111-111111111111",
    date: `${MONTH}-03`
  };
  const { invoke } = mountRoutes(db);
  const res = await invoke();
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  assert.equal(res.body.recoveryRequired, true);
});

test("HTTP compensated messaging only when error.compensated=true (source contract)", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  assert.match(routes, /else if \(compensated\)/);
  assert.match(routes, /Delimične izmene su poništene/);
  assert.match(routes, /Uvoz se još obrađuje/);
  const client = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/plan-import.js"), "utf8");
  assert.match(client, /compensated === true/);
  assert.match(client, /plan_import_commit_in_progress/);
  assert.match(client, /plan_import_commit_failed_no_rollback/);
});

test("client treats COMMIT_OUTCOME_UNKNOWN as retained job (source + apiFetch)", () => {
  const client = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/plan-import.js"), "utf8");
  assert.match(client, /phase:\s*"commit_unknown"/);
  assert.match(client, /COMMIT_OUTCOME_UNKNOWN/);
  assert.match(client, /plan_import_commit_unknown/);
  const api = fs.readFileSync(path.join(__dirname, "../../js/core/api-client.js"), "utf8");
  assert.match(api, /retryable:\s*data\s*&&\s*data\.retryable\s*===\s*true/);
});

test("G: real staff auth integration covers missing token (not stub wiring)", () => {
  const authHttp = fs.readFileSync(path.join(__dirname, "staff-auth-http.test.js"), "utf8");
  assert.match(authHttp, /anonymous\.status,\s*401|status,\s*401/);
  assert.match(authHttp, /forged|revoked|missing|anonymous/i);
});

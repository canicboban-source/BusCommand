/**
 * FAZA 2R-A.3.1.1 — confirmation stale FP, read-before-write, full lock, UX cleanup, getAll.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { fingerprintShift } = require("../../server/driver-work-policy");
const {
  commitStaffMonthlyImport,
  prepareStaffMonthlyImport,
  setGetActiveServicePlanForTests,
  applyImportChunkTransaction,
  isLockConsistentForImport,
  txGetAll
} = require("../../server/staff-monthly-plan-import");
const {
  lockDocumentId,
  assertNoActiveGroupMonthlyImport
} = require("../../server/group-monthly-plan-import");
const { shiftDocumentId } = require("../../server/shift-assignment");
const { registerDriverRoutes } = require("../../server/driver-routes");

const COMPANY_ID = "a311-unit";
const GROUP_A = "310";
const GROUP_B = "311";
const MONTH = "2026-08";
const DRIVER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "disp-a311";
const DATE_A = `${MONTH}-06`;
const DATE_B = `${MONTH}-07`;

function fp(shift) {
  return fingerprintShift(shift);
}

function createDb() {
  const bags = {
    monthly_plan_imports: {},
    monthly_plan_import_locks: {},
    shifts: {},
    schedules: {},
    shift_confirmations: {},
    drivers: {
      [DRIVER]: { active: true, groupId: GROUP_A, name: "Confirm Driver" }
    },
    buses: {},
    users: { [ACTOR]: { role: "dispatcher", active: true, groups: [GROUP_A, GROUP_B] } },
    profile: { main: { timezone: "Europe/Vienna" } }
  };
  function ref(collection, id) {
    return {
      id,
      path: `${collection}/${id}`,
      async get() {
        const data = bags[collection]?.[id];
        return {
          exists: data !== undefined,
          id,
          ref: ref(collection, id),
          data: () => (data === undefined ? undefined : structuredClone(data))
        };
      },
      async set(value, opts = {}) {
        if (!bags[collection]) bags[collection] = {};
        if (opts.merge && bags[collection][id]) {
          const next = { ...bags[collection][id] };
          for (const [k, v] of Object.entries(value)) {
            if (v && typeof v === "object" && v.__delete === true) delete next[k];
            else next[k] = v;
          }
          bags[collection][id] = next;
        } else {
          bags[collection][id] = { ...value };
        }
      },
      async delete() { delete bags[collection][id]; }
    };
  }
  let txTail = Promise.resolve();
  const db = {
    __bags: bags,
    __txOps: [],
    __getAllCalls: [],
    collection(name) {
      assert.equal(name, "companies");
      return {
        doc(companyId) {
          assert.equal(companyId, COMPANY_ID);
          return {
            collection(collection) {
              if (!bags[collection]) bags[collection] = {};
              return {
                doc(id) { return ref(collection, id); },
                where() {
                  return {
                    where() { return this; },
                    limit() { return this; },
                    async get() {
                      const docs = Object.entries(bags[collection] || {}).map(([id, data]) => ({
                        id,
                        data: () => structuredClone(data),
                        ref: ref(collection, id)
                      }));
                      return { docs, empty: !docs.length, forEach(fn) { docs.forEach(fn); } };
                    }
                  };
                },
                async get() {
                  const docs = Object.entries(bags[collection] || {}).map(([id, data]) => ({
                    id,
                    data: () => structuredClone(data),
                    ref: ref(collection, id)
                  }));
                  return { docs, forEach(fn) { docs.forEach(fn); } };
                }
              };
            }
          };
        }
      };
    },
    async getAll(...refs) { return Promise.all(refs.map((r) => r.get())); },
    batch() {
      const ops = [];
      const api = {
        set(r, v, o) { ops.push(() => r.set(v, o || {})); return api; },
        delete(r) { ops.push(() => r.delete()); return api; },
        async commit() { for (const op of ops) await op(); }
      };
      return api;
    },
    async runTransaction(fn) {
      const run = txTail.then(async () => {
        const ops = [];
        const tx = {
          async get(docRef) {
            ops.push({ op: "get", path: docRef.path });
            return docRef.get();
          },
          async getAll(...refs) {
            ops.push({ op: "getAll", count: refs.length });
            db.__getAllCalls.push(refs.length);
            return Promise.all(refs.map((r) => {
              ops.push({ op: "get", path: r.path });
              return r.get();
            }));
          },
          set(docRef, value, opts) {
            ops.push({ op: "set", path: docRef.path });
            return docRef.set(value, opts || {});
          },
          delete(docRef) {
            ops.push({ op: "delete", path: docRef.path });
            return docRef.delete();
          }
        };
        try {
          const result = await fn(tx);
          db.__txOps = ops;
          return result;
        } catch (err) {
          db.__txOps = ops;
          throw err;
        }
      });
      txTail = run.catch(() => {});
      return run;
    }
  };
  const admin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => new Date(),
        delete: () => ({ __delete: true })
      }
    }
  };
  return { db, admin, bags };
}

function mountConfirm(db, admin) {
  const routes = new Map();
  const app = {
    use() {},
    get(p, ...h) { routes.set(`GET ${p}`, h); },
    post(p, ...h) { routes.set(`POST ${p}`, h); },
    put(p, ...h) { routes.set(`PUT ${p}`, h); }
  };
  registerDriverRoutes(app, {
    admin: () => admin,
    db: () => db,
    hasFirebase: () => true,
    rateLimit: () => (_r, _s, n) => n(),
    clearRateLimit() {},
    getClientIp: () => "127.0.0.1",
    logAudit: async () => {},
    staffAuth: {
      requireCompanyStaff(req, _res, next) {
        req.staffUser = {
          uid: ACTOR, role: "dispatcher", companyId: COMPANY_ID,
          groups: [GROUP_A, GROUP_B], active: true
        };
        return next();
      }
    }
  });
  async function invokeConfirm({ dates, targets }) {
    const handlers = routes.get("POST /api/driver/shift-confirmations");
    const handler = handlers[handlers.length - 1];
    const companyRef = db.collection("companies").doc(COMPANY_ID);
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; }
    };
    await handler({
      headers: {},
      body: { dates },
      driver: { uid: DRIVER, companyId: COMPANY_ID, role: "driver", mustChangeLoginCode: false },
      driverWorkPolicy: {
        companyRef,
        shift: { date: `${MONTH}-05`, groupId: GROUP_A },
        confirmationTargets: targets
      },
      log: { error() {}, warn() {} }
    }, res);
    return res;
  }
  return { invokeConfirm };
}

test("A.3.1.1: stale target vs live B (null shiftFingerprint) → CONFIRMATION_STALE", async () => {
  const { db, admin, bags } = createDb();
  const shiftA = {
    date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", groupId: GROUP_A, revision: 1
  };
  const shiftB = {
    date: DATE_A, type: "afternoon", start: "13:00", end: "21:00",
    routeCode: "310.S02", bus: "202", name: "310.S02", groupId: GROUP_A, revision: 2,
    shiftFingerprint: null,
    confirmedByDriver: false
  };
  bags.shifts[shiftDocumentId(DRIVER, DATE_A)] = { ...shiftB, driverId: DRIVER };
  const { invokeConfirm } = mountConfirm(db, admin);
  const res = await invokeConfirm({
    dates: [DATE_A],
    targets: [{ ...shiftA, fingerprint: fp(shiftA), revision: 1 }]
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "CONFIRMATION_STALE");
  assert.equal(bags.shift_confirmations[`${DRIVER}_${DATE_A}`], undefined);
  assert.notEqual(bags.shifts[shiftDocumentId(DRIVER, DATE_A)].confirmedByDriver, true);
});

test("A.3.1.1: missing live shift → SHIFT_MISSING, no phantom", async () => {
  const { db, admin, bags } = createDb();
  const target = {
    date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", fingerprint: "abc", revision: 1
  };
  const { invokeConfirm } = mountConfirm(db, admin);
  const res = await invokeConfirm({ dates: [DATE_A], targets: [target] });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "SHIFT_MISSING");
  assert.equal(bags.shifts[shiftDocumentId(DRIVER, DATE_A)], undefined);
  assert.equal(bags.shift_confirmations[`${DRIVER}_${DATE_A}`], undefined);
});

test("A.3.1.1: two scopes + safe-expired lock — no 500; reads before writes", async () => {
  const { db, admin, bags } = createDb();
  const shift1 = {
    driverId: DRIVER, date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", groupId: GROUP_A, revision: 1
  };
  const shift2 = {
    driverId: DRIVER, date: DATE_B, type: "morning", start: "05:00", end: "13:00",
    routeCode: "311.S01", bus: "202", name: "311.S01", groupId: GROUP_B, revision: 1
  };
  bags.shifts[shiftDocumentId(DRIVER, DATE_A)] = shift1;
  bags.shifts[shiftDocumentId(DRIVER, DATE_B)] = shift2;
  const oldImport = "old-safe-import";
  bags.monthly_plan_imports[oldImport] = {
    status: "completed", groupId: GROUP_A, month: MONTH
  };
  bags.monthly_plan_import_locks[lockDocumentId(GROUP_A, MONTH)] = {
    importId: oldImport,
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH,
    expiresAt: new Date(Date.now() - 60_000)
  };
  const { invokeConfirm } = mountConfirm(db, admin);
  const res = await invokeConfirm({
    dates: [DATE_A, DATE_B],
    targets: [
      { ...shift1, fingerprint: fp(shift1), revision: 1 },
      { ...shift2, fingerprint: fp(shift2), revision: 1 }
    ]
  });
  assert.notEqual(res.statusCode, 500, JSON.stringify(res.body));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const ops = db.__txOps || [];
  const firstWrite = ops.findIndex((o) => o.op === "set" || o.op === "delete");
  let lastRead = -1;
  ops.forEach((o, i) => {
    if (o.op === "get" || o.op === "getAll") lastRead = i;
  });
  assert.ok(firstWrite === -1 || lastRead < firstWrite);
});

test("A.3.1.1: import lock live → confirmation IN_PROGRESS", async () => {
  const { db, admin, bags } = createDb();
  const shift1 = {
    driverId: DRIVER, date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", groupId: GROUP_A, revision: 1
  };
  bags.shifts[shiftDocumentId(DRIVER, DATE_A)] = shift1;
  bags.monthly_plan_imports["live-import"] = {
    status: "committing", groupId: GROUP_A, month: MONTH
  };
  bags.monthly_plan_import_locks[lockDocumentId(GROUP_A, MONTH)] = {
    importId: "live-import",
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH,
    expiresAt: new Date(Date.now() + 60_000)
  };
  const { invokeConfirm } = mountConfirm(db, admin);
  const res = await invokeConfirm({
    dates: [DATE_A],
    targets: [{ ...shift1, fingerprint: fp(shift1), revision: 1 }]
  });
  assert.equal(res.statusCode, 409);
  assert.ok(
    res.body.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || res.body.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED"
  );
  assert.equal(bags.shift_confirmations[`${DRIVER}_${DATE_A}`], undefined);
});

test("A.3.1.1: completion missing lock groupId/month → RECOVERY, never completed", async () => {
  setGetActiveServicePlanForTests(async () => ({ duties: [{ code: "310.S01" }] }));
  const { db, admin, bags } = createDb();
  const preview = {
    groupId: GROUP_A,
    month: MONTH,
    sourceName: "a311.xlsx",
    reason: "Dispatcher monthly plan import",
    fingerprint: crypto.createHash("sha256").update("a311-completion").digest("hex"),
    summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
    rows: [{
      driverId: DRIVER,
      driverName: "Confirm Driver",
      date: DATE_A,
      type: "morning",
      name: "310.S01",
      bus: "101",
      routeCode: "310.S01",
      start: "05:00",
      end: "13:00",
      expectedRevision: 0,
      previous: null
    }]
  };
  bags.buses["bus-101"] = { number: "101", active: true, opsStatus: "active", groupId: GROUP_A };
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR, preview
  });
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_A],
    afterLockHook: async () => {
      const lockId = lockDocumentId(GROUP_A, MONTH);
      bags.monthly_plan_import_locks[lockId] = {
        importId: prepared.id,
        actorId: ACTOR,
        expiresAt: new Date(Date.now() + 60_000)
      };
    }
  }).then(() => null, (e) => e);
  assert.ok(err);
  assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  assert.notEqual(bags.monthly_plan_imports[prepared.id]?.status, "completed");
  setGetActiveServicePlanForTests(null);
});

test("A.3.1.1: isLockConsistentForImport rejects missing/mismatched scope", () => {
  const base = {
    importId: "imp-1",
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH
  };
  assert.equal(isLockConsistentForImport(base, "imp-1", ACTOR, GROUP_A, MONTH), true);
  assert.equal(isLockConsistentForImport({ ...base, groupId: undefined }, "imp-1", ACTOR, GROUP_A, MONTH), false);
  assert.equal(isLockConsistentForImport({ ...base, month: undefined }, "imp-1", ACTOR, GROUP_A, MONTH), false);
  assert.equal(isLockConsistentForImport({ ...base, groupId: GROUP_B }, "imp-1", ACTOR, GROUP_A, MONTH), false);
  assert.equal(isLockConsistentForImport({ ...base, actorId: undefined }, "imp-1", ACTOR, GROUP_A, MONTH), false);
});

test("A.3.1.1: txGetAll uses bulk getAll when present (bounded, no timing)", async () => {
  const refs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  let getAllCount = 0;
  let sequentialGets = 0;
  const txWithGetAll = {
    async getAll(...r) {
      getAllCount += 1;
      return r.map((ref) => ({ ref, exists: false, data: () => null }));
    },
    async get() {
      sequentialGets += 1;
      return { exists: false, data: () => null };
    }
  };
  const snaps = await txGetAll(txWithGetAll, refs);
  assert.equal(snaps.length, 3);
  assert.equal(getAllCount, 1);
  assert.equal(sequentialGets, 0);

  const txNoGetAll = {
    async get(ref) {
      sequentialGets += 1;
      return { ref, exists: false, data: () => null };
    }
  };
  sequentialGets = 0;
  const fallback = await txGetAll(txNoGetAll, refs);
  assert.equal(fallback.length, 3);
  assert.equal(sequentialGets, 3);
});

test("A.3.1.1: chunk apply uses getAll for shift reads", async () => {
  const { db, admin, bags } = createDb();
  const importId = "chunk-getall";
  const importRef = db.collection("companies").doc(COMPANY_ID)
    .collection("monthly_plan_imports").doc(importId);
  const lockRef = db.collection("companies").doc(COMPANY_ID)
    .collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_A, MONTH));
  const fingerprint = "fp-chunk";
  bags.monthly_plan_imports[importId] = {
    status: "committing",
    actorId: ACTOR,
    fingerprint,
    groupId: GROUP_A,
    month: MONTH,
    appliedChunks: 0
  };
  bags.monthly_plan_import_locks[lockDocumentId(GROUP_A, MONTH)] = {
    importId,
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH,
    expiresAt: new Date(Date.now() + 60_000)
  };
  const chunk = [
    {
      driverId: DRIVER, date: `${MONTH}-01`, type: "morning", name: "310.S01",
      bus: "101", routeCode: "310.S01", start: "05:00", end: "13:00",
      expectedRevision: 0, previous: null, driverName: "Confirm Driver"
    },
    {
      driverId: DRIVER, date: `${MONTH}-02`, type: "morning", name: "310.S01",
      bus: "101", routeCode: "310.S01", start: "05:00", end: "13:00",
      expectedRevision: 0, previous: null, driverName: "Confirm Driver"
    }
  ];
  await applyImportChunkTransaction({
    db,
    admin,
    companyRef: db.collection("companies").doc(COMPANY_ID),
    importRef,
    lockRef,
    importId,
    actorId: ACTOR,
    fingerprint,
    groupId: GROUP_A,
    month: MONTH,
    chunk,
    chunkIndex: 0,
    assignedAt: new Date()
  });
  assert.ok(db.__getAllCalls.some((n) => n === 2));
  assert.ok(bags.shifts[shiftDocumentId(DRIVER, `${MONTH}-01`)]);
  assert.ok(bags.shifts[shiftDocumentId(DRIVER, `${MONTH}-02`)]);
});

test("A.3.1.1: UX safe cleanup must not delete fresher claimed lock", async () => {
  const { db, bags } = createDb();
  const lockId = lockDocumentId(GROUP_A, MONTH);
  const oldImport = "old-expired";
  const freshImport = "fresh-claim";
  bags.monthly_plan_imports[oldImport] = { status: "completed", groupId: GROUP_A, month: MONTH };
  bags.monthly_plan_imports[freshImport] = { status: "committing", groupId: GROUP_A, month: MONTH };
  bags.monthly_plan_import_locks[lockId] = {
    importId: oldImport,
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH,
    expiresAt: new Date(Date.now() - 60_000)
  };
  const originalRun = db.runTransaction.bind(db);
  db.runTransaction = async (fn) => {
    bags.monthly_plan_import_locks[lockId] = {
      importId: freshImport,
      actorId: ACTOR,
      groupId: GROUP_A,
      month: MONTH,
      expiresAt: new Date(Date.now() + 120_000)
    };
    return originalRun(fn);
  };
  const result = await assertNoActiveGroupMonthlyImport({
    db, companyId: COMPANY_ID, groupId: GROUP_A, month: MONTH
  });
  // Concurrent claim must survive; UX may block (IN_PROGRESS) or pass without delete.
  assert.ok(bags.monthly_plan_import_locks[lockId]);
  assert.equal(bags.monthly_plan_import_locks[lockId].importId, freshImport);
  assert.ok(
    result.ok === true
      || result.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || result.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED"
  );
});

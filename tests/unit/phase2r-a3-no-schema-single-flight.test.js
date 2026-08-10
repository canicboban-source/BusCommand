/**
 * FAZA 2R-A.3 — no-schema single-flight + schema guard.
 * Fail-first against A.2 lease fields; pass after transactional claim SM.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport,
  setStaffImportWriteChunkSizeForTests,
  setGetActiveServicePlanForTests
} = require("../../server/staff-monthly-plan-import");
const {
  assertNoActiveGroupMonthlyImport,
  lockDocumentId,
  isSafeToAutoClearImportLock
} = require("../../server/group-monthly-plan-import");

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "company-a";
const GROUP_ID = "310";
const MONTH = "2026-08";
const ACTOR = "disp-1";

function createDb() {
  const bags = {
    monthly_plan_imports: {},
    monthly_plan_import_locks: {},
    shifts: {},
    schedules: {},
    drivers: {
      [DRIVER_ID]: {
        active: true,
        groupId: GROUP_ID,
        firstName: "Ana",
        lastName: "Driver",
        name: "Ana Driver"
      }
    },
    buses: {
      "bus-101": { number: "101", active: true, opsStatus: "ready", groupId: GROUP_ID }
    }
  };

  function ref(collection, id) {
    return {
      id,
      path: `${collection}/${id}`,
      async get() {
        const data = bags[collection][id];
        return {
          id,
          exists: data !== undefined,
          data: () => (data === undefined ? undefined : structuredClone(data)),
          ref: ref(collection, id)
        };
      },
      async set(value, opts = {}) {
        if (opts.merge && bags[collection][id]) {
          const next = { ...bags[collection][id] };
          for (const [k, v] of Object.entries(value)) {
            if (v && typeof v === "object" && v.__delete === true) delete next[k];
            else next[k] = v;
          }
          bags[collection][id] = next;
        } else {
          const next = {};
          for (const [k, v] of Object.entries(value)) {
            if (v && typeof v === "object" && v.__delete === true) continue;
            next[k] = v;
          }
          bags[collection][id] = next;
        }
      },
      async delete() {
        delete bags[collection][id];
      }
    };
  }

  let txTail = Promise.resolve();
  const db = {
    __bags: bags,
    collection(name) {
      assert.equal(name, "companies");
      return {
        doc(companyId) {
          assert.equal(companyId, COMPANY_ID);
          return {
            collection(collection) {
              return {
                doc(id) { return ref(collection, id); },
                where() {
                  return {
                    where() { return this; },
                    async get() {
                      const docs = Object.entries(bags[collection] || {}).map(([id, data]) => ({
                        id,
                        data: () => structuredClone(data),
                        ref: ref(collection, id)
                      }));
                      return { docs, forEach(fn) { docs.forEach(fn); }, empty: !docs.length };
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
    async getAll(...refs) {
      return Promise.all(refs.map((r) => r.get()));
    },
    batch() {
      const ops = [];
      const api = {
        set(docRef, value, opts) { ops.push(() => docRef.set(value, opts || {})); return api; },
        delete(docRef) { ops.push(() => docRef.delete()); return api; },
        async commit() { for (const op of ops) await op(); }
      };
      return api;
    },
    async runTransaction(fn) {
      const run = txTail.then(async () => {
        const tx = {
          async get(docRef) { return docRef.get(); },
          set(docRef, value, opts) { return docRef.set(value, opts || {}); },
          delete(docRef) { return docRef.delete(); }
        };
        return fn(tx);
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

function previewPayload(overrides = {}) {
  return {
    groupId: GROUP_ID,
    month: MONTH,
    sourceName: "a3.xlsx",
    reason: "Dispatcher monthly plan import",
    fingerprint: crypto.createHash("sha256").update("phase2r-a3").digest("hex"),
    summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
    rows: [{
      driverId: DRIVER_ID,
      driverName: "Ana Driver",
      date: `${MONTH}-03`,
      type: "morning",
      name: "310.S01",
      bus: "101",
      routeCode: "310.S01",
      start: "05:00",
      end: "13:00",
      expectedRevision: 0,
      previous: null
    }],
    ...overrides
  };
}

test.beforeEach(() => {
  setGetActiveServicePlanForTests(async () => ({ duties: [{ code: "310.S01" }] }));
  setStaffImportWriteChunkSizeForTests(0);
});
test.afterEach(() => {
  setGetActiveServicePlanForTests(null);
  setStaffImportWriteChunkSizeForTests(0);
});

test("schema guard: production source has no lease fields", () => {
  const files = [
    "server/staff-monthly-plan-import.js",
    "server/group-monthly-plan-import.js",
    "server/driver-routes.js",
    "js/dispatcher/plan-import.js",
    "js/core/api-client.js"
  ];
  const banned = [
    "attemptId",
    "leaseExpiresAt",
    "activeAttemptId",
    "wasCommitting",
    "ATTEMPT_LEASE_MS"
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
    for (const token of banned) {
      assert.equal(src.includes(token), false, `${rel} still contains ${token}`);
    }
  }
});

test("A: parallel commit — exactly one claims; second is IN_PROGRESS with zero mutations", async () => {
  const { db, admin, bags } = createDb();
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR, preview: previewPayload()
  });

  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let firstEntered = false;

  const first = commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterLockHook: async () => {
      firstEntered = true;
      await barrier;
    }
  });

  for (let i = 0; i < 50 && !firstEntered; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.equal(firstEntered, true);

  const secondErr = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);

  assert.ok(secondErr);
  assert.equal(secondErr.code, "MONTHLY_IMPORT_IN_PROGRESS");
  assert.equal(secondErr.retryable, true);
  assert.equal(Object.keys(bags.shifts).length, 0);
  assert.equal(Object.keys(bags.schedules).length, 0);
  assert.equal(bags.monthly_plan_imports[prepared.id].status, "committing");

  release();
  const firstResult = await first;
  assert.equal(firstResult.idempotent, false);
  assert.equal(bags.monthly_plan_imports[prepared.id].status, "completed");
  assert.equal(Object.keys(bags.shifts).length, 1);
});

test("B: committing + active lock — new request does not continue job", async () => {
  const { db, admin, bags } = createDb();
  const fingerprint = crypto.createHash("sha256").update("committing-active").digest("hex");
  const importId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const lockId = lockDocumentId(GROUP_ID, MONTH);
  bags.monthly_plan_imports[importId] = {
    id: importId,
    actorId: ACTOR,
    companyId: COMPANY_ID,
    groupId: GROUP_ID,
    month: MONTH,
    fingerprint,
    source: "dispatcher-staff-import",
    status: "committing",
    summary: { rows: 1 },
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    rows: previewPayload().rows
  };
  bags.monthly_plan_import_locks[lockId] = {
    importId,
    actorId: ACTOR,
    groupId: GROUP_ID,
    month: MONTH,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000)
  };

  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId, fingerprint, actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);

  assert.ok(err);
  assert.equal(err.code, "MONTHLY_IMPORT_IN_PROGRESS");
  assert.equal(Object.keys(bags.shifts).length, 0);
  assert.equal(bags.monthly_plan_imports[importId].status, "committing");
});

test("C: committing + expired/missing/mismatched lock → RECOVERY_REQUIRED, no takeover", async () => {
  const cases = [
    { name: "expired", lock: { expiresAt: new Date(Date.now() - 1000) } },
    { name: "missing", lock: null },
    { name: "mismatched", lock: {
      importId: "other-import",
      actorId: ACTOR,
      expiresAt: new Date(Date.now() + 60_000)
    } }
  ];

  for (const c of cases) {
    const { db, admin, bags } = createDb();
    const fingerprint = crypto.createHash("sha256").update(`rec-${c.name}`).digest("hex");
    const importId = crypto.randomUUID();
    const lockId = lockDocumentId(GROUP_ID, MONTH);
    bags.monthly_plan_imports[importId] = {
      id: importId,
      actorId: ACTOR,
      companyId: COMPANY_ID,
      groupId: GROUP_ID,
      month: MONTH,
      fingerprint,
      source: "dispatcher-staff-import",
      status: "committing",
      appliedChunks: 1,
      summary: { rows: 1 },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      rows: previewPayload().rows
    };
    bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
      driverId: DRIVER_ID,
      date: `${MONTH}-03`,
      importId,
      revision: 1
    };
    if (c.lock) {
      bags.monthly_plan_import_locks[lockId] = {
        groupId: GROUP_ID,
        month: MONTH,
        importId,
        actorId: ACTOR,
        ...c.lock
      };
    }

    const err = await commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: ACTOR,
      importId, fingerprint, actorGroups: [GROUP_ID]
    }).then(() => null, (e) => e);

    assert.ok(err, c.name);
    assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED", c.name);
    assert.equal(err.recoveryRequired, true, c.name);
    assert.equal(bags.monthly_plan_imports[importId].status, "committing", c.name);
    assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-03`]?.importId, importId, c.name);
  }
});

test("D: completed retry is idempotent without extra revision bump", async () => {
  const { db, admin, bags } = createDb();
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR, preview: previewPayload()
  });
  await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  });
  const rev = bags.shifts[`${DRIVER_ID}_${MONTH}-03`].revision;
  const again = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  });
  assert.equal(again.idempotent, true);
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-03`].revision, rev);
});

test("C allowlist still fail-closed for uncompensated/committing", () => {
  assert.equal(isSafeToAutoClearImportLock({ status: "completed" }), true);
  assert.equal(isSafeToAutoClearImportLock({ status: "failed", compensated: true }), true);
  assert.equal(isSafeToAutoClearImportLock({ status: "committing" }), false);
  assert.equal(isSafeToAutoClearImportLock({ status: "failed", compensated: false, appliedChunks: 1 }), false);
});

test("expired uncompensated lock stays recovery-required via assertNoActive", async () => {
  const { db, bags } = createDb();
  const importId = "imp-failed-partial";
  bags.monthly_plan_imports[importId] = {
    id: importId,
    status: "failed",
    compensated: false,
    appliedChunks: 1,
    groupId: GROUP_ID,
    month: MONTH
  };
  bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)] = {
    importId,
    expiresAt: new Date(Date.now() - 60_000)
  };
  const check = await assertNoActiveGroupMonthlyImport({
    db, companyId: COMPANY_ID, groupId: GROUP_ID, month: MONTH
  });
  assert.equal(check.ok, false);
  assert.equal(check.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
});

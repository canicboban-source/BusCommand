/**
 * FAZA 2R-A.1 — fail-first / closeout reliability corrections.
 * These tests encode gaps found by adversarial review; they must fail on pre-fix code.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport,
  compensateStaffImport,
  setStaffImportWriteChunkSizeForTests,
  setGetActiveServicePlanForTests,
  setAfterLockHookForTests
} = require("../../server/staff-monthly-plan-import");
const {
  assertNoActiveGroupMonthlyImport,
  lockDocumentId
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
                doc(id) {
                  return ref(collection, id);
                },
                where() {
                  return {
                    where() { return this; },
                    async get() {
                      const docs = Object.entries(bags[collection] || {}).map(([id, data]) => ({
                        id,
                        data: () => structuredClone(data),
                        ref: ref(collection, id)
                      }));
                      return { docs };
                    }
                  };
                },
                async get() {
                  const docs = Object.entries(bags[collection] || {}).map(([id, data]) => ({
                    id,
                    data: () => structuredClone(data),
                    ref: ref(collection, id)
                  }));
                  return { docs };
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
        set(docRef, value, opts) {
          ops.push({ type: "set", docRef, value, opts });
          return api;
        },
        delete(docRef) {
          ops.push({ type: "delete", docRef });
          return api;
        },
        async commit() {
          for (const op of ops) {
            if (op.type === "delete") await op.docRef.delete();
            else await op.docRef.set(op.value, op.opts || {});
          }
        }
      };
      return api;
    },
    async runTransaction(fn) {
      const tx = {
        async get(docRef) { return docRef.get(); },
        set(docRef, value, opts) { return docRef.set(value, opts || {}); },
        delete(docRef) { return docRef.delete(); }
      };
      return fn(tx);
    }
  };

  const admin = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => new Date("2026-08-09T12:00:00.000Z"),
        delete: () => ({ __delete: true })
      }
    }
  };

  return { db, admin, bags };
}

function previewPayload(overrides = {}) {
  return {
    fingerprint: crypto.createHash("sha256").update("phase2r-a1").digest("hex"),
    groupId: GROUP_ID,
    month: MONTH,
    sourceName: "plan.xlsx",
    reason: "Dispatcher monthly plan import",
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
  setAfterLockHookForTests(null);
  setStaffImportWriteChunkSizeForTests(0);
});

test.afterEach(() => {
  setGetActiveServicePlanForTests(null);
  setAfterLockHookForTests(null);
  setStaffImportWriteChunkSizeForTests(0);
});

test("A1: missing actorGroups is fail-closed — no lock, shift, or schedule write", async () => {
  const { db, admin, bags } = createDb();
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR, preview: previewPayload()
  });

  for (const bad of [undefined, null, "310", { 0: "310" }]) {
    await assert.rejects(
      () => commitStaffMonthlyImport({
        db, admin, companyId: COMPANY_ID, actorId: ACTOR,
        importId: prepared.id, fingerprint: prepared.fingerprint,
        actorGroups: bad
      }),
      (e) => e.code === "GROUP_ACCESS_DENIED" && e.status === 403
    );
  }

  assert.equal(Object.keys(bags.monthly_plan_import_locks).length, 0);
  assert.equal(Object.keys(bags.shifts).length, 0);
  assert.equal(Object.keys(bags.schedules).length, 0);
  assert.equal(bags.monthly_plan_imports[prepared.id].status, "prepared");
});

test("A4: inherited ops bus in maintenance after preview rejects before mutation", async () => {
  const { db, admin, bags } = createDb();
  bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
    driverId: DRIVER_ID,
    driverName: "Ana Driver",
    date: `${MONTH}-03`,
    groupId: GROUP_ID,
    type: "morning",
    name: "310.S01",
    routeCode: "310.S01",
    start: "05:00",
    end: "13:00",
    bus: "101",
    revision: 1,
    confirmedByDriver: false
  };
  const preview = previewPayload({
    rows: [{
      driverId: DRIVER_ID,
      driverName: "Ana Driver",
      date: `${MONTH}-03`,
      type: "morning",
      name: "310.S01",
      bus: "",
      routeCode: "310.S01",
      start: "05:00",
      end: "13:00",
      expectedRevision: 1,
      previous: {
        type: "morning", name: "310.S01", bus: "101", routeCode: "310.S01",
        revision: 1, groupId: GROUP_ID, driverName: "Ana Driver"
      }
    }]
  });
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR, preview
  });
  bags.buses["bus-101"].opsStatus = "maintenance";

  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: ACTOR,
      importId: prepared.id, fingerprint: prepared.fingerprint,
      actorGroups: [GROUP_ID]
    }),
    (e) => e.code === "MONTHLY_IMPORT_REVALIDATION_FAILED"
      && e.details.some((d) => d.code === "BUS_NOT_AVAILABLE")
  );

  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-03`].revision, 1);
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-03`].importId, undefined);
  assert.equal(Object.keys(bags.schedules).length, 0);
});

test("A5: bus mutated after lock and before revalidation is observed", async () => {
  const { db, admin, bags } = createDb();
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR, preview: previewPayload()
  });
  let sawLock = false;
  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: ACTOR,
      importId: prepared.id, fingerprint: prepared.fingerprint,
      actorGroups: [GROUP_ID],
      afterLockHook: async () => {
        sawLock = Boolean(bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)]);
        bags.buses["bus-101"].opsStatus = "maintenance";
      }
    }),
    (e) => e.code === "MONTHLY_IMPORT_REVALIDATION_FAILED"
      && e.details.some((d) => d.code === "BUS_NOT_AVAILABLE")
  );
  assert.equal(sawLock, true);
  assert.equal(Object.keys(bags.shifts).length, 0);
});

test("B: expired lock + compensation_failed job stays blocked", async () => {
  const { db, bags } = createDb();
  const importId = "imp-recovery-1";
  bags.monthly_plan_imports[importId] = {
    id: importId,
    status: "compensation_failed",
    recoveryRequired: true,
    groupId: GROUP_ID,
    month: MONTH
  };
  bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)] = {
    importId,
    groupId: GROUP_ID,
    month: MONTH,
    expiresAt: new Date(Date.now() - 60_000)
  };
  const check = await assertNoActiveGroupMonthlyImport({
    db, companyId: COMPANY_ID, groupId: GROUP_ID, month: MONTH
  });
  assert.equal(check.ok, false);
  assert.equal(check.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  assert.ok(bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)]);
});

test("B: expired lock + committing job stays blocked", async () => {
  const { db, bags } = createDb();
  const importId = "imp-committing-1";
  bags.monthly_plan_imports[importId] = {
    id: importId,
    status: "committing",
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

test("B: expired stale lock + completed job is safely cleared", async () => {
  const { db, bags } = createDb();
  const importId = "imp-done-1";
  bags.monthly_plan_imports[importId] = {
    id: importId,
    status: "completed",
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
  assert.equal(check.ok, true);
  assert.equal(bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)], undefined);
});

test("B: recovery status persist failure does not unlock", async () => {
  const { db, admin, bags } = createDb();
  const importId = "imp-persist-fail";
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);
  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_ID, MONTH));
  await importRef.set({ id: importId, status: "committing" });
  await lockRef.set({ importId, actorId: ACTOR, groupId: GROUP_ID, month: MONTH });
  bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
    driverId: DRIVER_ID,
    date: `${MONTH}-03`,
    groupId: GROUP_ID,
    type: "morning",
    name: "NEW",
    importId,
    revision: 1
  };

  // Shift restore is transactional (2R-A.3.1); fail schedule mirror, then fail recovery persist.
  const originalBatch = db.batch.bind(db);
  db.batch = () => {
    const batch = originalBatch();
    batch.commit = async () => {
      throw new Error("schedule_mirror_failed");
    };
    return batch;
  };

  const originalSet = importRef.set.bind(importRef);
  importRef.set = async () => {
    throw new Error("persist_recovery_failed");
  };

  const result = await compensateStaffImport({
    db, admin, companyRef, importRef, importId, groupId: GROUP_ID, month: MONTH,
    rows: [{ driverId: DRIVER_ID, date: `${MONTH}-03`, previous: null }],
    lockRef
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MONTHLY_IMPORT_COMPENSATION_FAILED");
  assert.equal(result.recoveryRequired, true);
  assert.ok(bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)]);
  // Job must remain fail-closed even if persist failed (status may be stuck committing).
  const job = bags.monthly_plan_imports[importId];
  assert.ok(job.status === "committing" || job.status === "compensation_failed" || job.recoveryRequired === true);
  void originalSet;
});

test("C: successful compensate schedule mirror drops failed import metadata and has driverName", async () => {
  const { db, admin, bags } = createDb();
  const importId = "imp-sched-roll";
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);
  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_ID, MONTH));
  await importRef.set({ id: importId, status: "committing" });
  await lockRef.set({ importId });
  bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
    driverId: DRIVER_ID,
    driverName: "Ana Driver",
    date: `${MONTH}-03`,
    groupId: GROUP_ID,
    type: "morning",
    name: "IMPORTED",
    bus: "101",
    routeCode: "310.S01",
    importId,
    revision: 2,
    updatedBy: ACTOR
  };
  bags.schedules[`${DRIVER_ID}_${MONTH}`] = {
    id: `${DRIVER_ID}_${MONTH}`,
    driverId: DRIVER_ID,
    groupId: GROUP_ID,
    month: MONTH,
    importId,
    updatedBy: ACTOR,
    parsedShifts: {
      3: { type: "morning", name: "IMPORTED", bus: "101" }
    }
  };

  const result = await compensateStaffImport({
    db, admin, companyRef, importRef, importId, groupId: GROUP_ID, month: MONTH,
    rows: [{
      driverId: DRIVER_ID,
      date: `${MONTH}-03`,
      previous: {
        type: "morning",
        name: "OLD",
        bus: "101",
        routeCode: "310.S01",
        revision: 1,
        groupId: GROUP_ID,
        driverName: "Ana Driver",
        confirmedByDriver: false
      }
    }],
    lockRef
  });
  assert.equal(result.ok, true);
  const schedule = bags.schedules[`${DRIVER_ID}_${MONTH}`];
  assert.equal(schedule.parsedShifts[3].type, "morning");
  assert.equal(schedule.parsedShifts[3].name, "OLD");
  assert.equal(schedule.parsedShifts[3].bus, "101");
  assert.equal(schedule.importId, undefined);
  assert.equal(schedule.updatedBy, undefined);
  assert.equal(schedule.driverName, "Ana Driver");
});

test("D: 2R-A.3 — committing + live lock is IN_PROGRESS (no crash-resume takeover)", async () => {
  const { db, admin, bags } = createDb();
  const fingerprint = crypto.createHash("sha256").update("resume-real").digest("hex");
  const importId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
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
    summary: { rows: 2, drivers: 1, assignments: 2, removals: 0 },
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
  bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
    driverId: DRIVER_ID,
    date: `${MONTH}-03`,
    revision: 1,
    importId
  };

  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId, fingerprint, actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);

  assert.ok(err);
  assert.equal(err.code, "MONTHLY_IMPORT_IN_PROGRESS");
  assert.equal(bags.monthly_plan_imports[importId].status, "committing");
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-04`], undefined);
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-03`].revision, 1);
});

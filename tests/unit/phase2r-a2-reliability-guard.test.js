/**
 * FAZA 2R-A.2 suite retained for regression coverage.
 * Lease/takeover cases removed in 2R-A.3 (no-schema single-flight).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  refreshScheduleMirrors,
  setGetActiveServicePlanForTests,
  setStaffImportWriteChunkSizeForTests
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
    buses: {}
  };
  function ref(collection, id) {
    return {
      id,
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
          bags[collection][id] = { ...value };
        }
      },
      async delete() { delete bags[collection][id]; }
    };
  }
  let txTail = Promise.resolve();
  const db = {
    __bags: bags,
    collection() {
      return {
        doc() {
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

test.beforeEach(() => {
  setGetActiveServicePlanForTests(async () => ({ duties: [{ code: "310.S01" }] }));
  setStaffImportWriteChunkSizeForTests(0);
});
test.afterEach(() => {
  setGetActiveServicePlanForTests(null);
});

test("C: lock allowlist — failed uncompensated / committing / recovery stay blocked", async () => {
  const cases = [
    { status: "completed", compensated: false, expectClear: true },
    { status: "failed", compensated: true, expectClear: true },
    { status: "prepared", appliedChunks: 0, expectClear: true },
    { status: "committing", expectClear: false },
    { status: "compensation_failed", recoveryRequired: true, expectClear: false },
    { status: "recovery_required", expectClear: false },
    { status: "failed", compensated: false, appliedChunks: 1, expectClear: false },
    { status: "expired", appliedChunks: 1, expectClear: false }
  ];

  for (const c of cases) {
    assert.equal(
      isSafeToAutoClearImportLock(c),
      c.expectClear,
      `allowlist mismatch for ${JSON.stringify(c)}`
    );
  }

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

test("E: clear-only import keeps schedule driverName from driver document", async () => {
  const { db, admin, bags } = createDb();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  bags.schedules[`${DRIVER_ID}_${MONTH}`] = {
    id: `${DRIVER_ID}_${MONTH}`,
    driverId: DRIVER_ID,
    groupId: GROUP_ID,
    month: MONTH,
    importId: "imp-clear",
    updatedBy: ACTOR,
    parsedShifts: { 3: { type: "morning", name: "OLD", bus: "101" } },
    driverName: ""
  };

  await refreshScheduleMirrors({
    db,
    admin,
    companyRef,
    groupId: GROUP_ID,
    month: MONTH,
    driverIds: [DRIVER_ID],
    source: "dispatcher-staff-import-rollback"
  });
  const schedule = bags.schedules[`${DRIVER_ID}_${MONTH}`];
  assert.deepEqual(schedule.parsedShifts, {});
  assert.equal(schedule.driverName, "Ana Driver");
  assert.equal(schedule.importId, undefined);
  assert.equal(schedule.updatedBy, undefined);
});

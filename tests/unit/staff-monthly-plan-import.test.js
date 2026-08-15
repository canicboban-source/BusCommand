/**
 * FAZA 2R-A — staff monthly import reliability (canonical shift, clear, compensation).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport,
  compensateStaffImport,
  buildCanonicalImportShift,
  resolveImportBus,
  setStaffImportWriteChunkSizeForTests,
  setGetActiveServicePlanForTests,
  MAX_JOB_BYTES,
  estimateJobBytes
} = require("../../server/staff-monthly-plan-import");
const { lockDocumentId } = require("../../server/group-monthly-plan-import");
const { currentRevision } = require("../../server/shift-assignment");

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "company-a";
const GROUP_ID = "310";
const MONTH = "2026-08";

test.beforeEach(() => {
  setGetActiveServicePlanForTests(async () => ({ duties: [{ code: "310.S01" }] }));
});
test.afterEach(() => {
  setGetActiveServicePlanForTests(null);
  setStaffImportWriteChunkSizeForTests(0);
});

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
      "bus-101": { number: "101", active: true, opsStatus: "active", groupId: GROUP_ID }
    },
    service_plans: {}
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
    fingerprint: crypto.createHash("sha256").update("phase2r-a").digest("hex"),
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

test("bus rule: explicit import bus wins; empty + same duty keeps ops bus; duty change clears bus", () => {
  const existing = {
    type: "morning",
    name: "310.S01",
    routeCode: "310.S01",
    start: "05:00",
    end: "13:00",
    bus: "4401",
    revision: 2,
    confirmedByDriver: true
  };
  assert.equal(resolveImportBus({ bus: "101", type: "morning", name: "310.S01", routeCode: "310.S01", start: "05:00", end: "13:00" }, existing), "101");
  assert.equal(resolveImportBus({ bus: "", type: "morning", name: "310.S01", routeCode: "310.S01", start: "05:00", end: "13:00" }, existing), "4401");
  assert.equal(resolveImportBus({ bus: "", type: "morning", name: "310.S02", routeCode: "310.S02", start: "05:00", end: "13:00" }, existing), "");

  const changedDuty = buildCanonicalImportShift({
    row: {
      driverId: DRIVER_ID,
      driverName: "Ana Driver",
      date: `${MONTH}-03`,
      type: "morning",
      name: "310.S02",
      routeCode: "310.S02",
      bus: "202",
      start: "06:00",
      end: "14:00",
      expectedRevision: 2
    },
    groupId: GROUP_ID,
    actorId: "disp-1",
    importId: "imp-x",
    assignedAt: "ts",
    existing
  });
  assert.equal(changedDuty.bus, "202");
  assert.equal(changedDuty.confirmedByDriver, false);
  assert.equal(changedDuty.revision, 3);
  assert.ok(changedDuty.priorSnapshot);
  assert.equal(changedDuty.priorSnapshot.empty, false);
});

test("clear uses revisioned tombstone not delete", () => {
  const existing = {
    type: "morning",
    name: "310.S01",
    bus: "101",
    revision: 4,
    confirmedByDriver: true
  };
  const cleared = buildCanonicalImportShift({
    row: {
      driverId: DRIVER_ID,
      driverName: "Ana Driver",
      date: `${MONTH}-03`,
      type: "clear",
      expectedRevision: 4
    },
    groupId: GROUP_ID,
    actorId: "disp-1",
    importId: "imp-clear",
    assignedAt: "ts",
    existing
  });
  assert.equal(cleared.type, "clear");
  assert.equal(cleared.revision, 5);
  assert.equal(cleared.importId, "imp-clear");
  assert.equal(cleared.confirmedByDriver, false);
  assert.equal(cleared.priorSnapshot.empty, false);
  assert.equal(cleared.priorSnapshot.bus, "101");
});

test("clear in early chunk + later conflict fully restores previous shift", async () => {
  setStaffImportWriteChunkSizeForTests(1);
  const { db, admin, bags } = createDb();
  bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
    driverId: DRIVER_ID,
    date: `${MONTH}-03`,
    groupId: GROUP_ID,
    type: "morning",
    name: "OLD",
    bus: "99",
    routeCode: "310.S01",
    revision: 2,
    confirmedByDriver: true,
    confirmedAt: "before",
    confirmationBoundRevision: 2,
    priorSnapshot: { empty: false, revision: 1, type: "off" },
    driverName: "Ana Driver"
  };

  const preview = previewPayload({
    summary: { rows: 2, drivers: 1, assignments: 1, removals: 1 },
    rows: [
      {
        driverId: DRIVER_ID,
        driverName: "Ana Driver",
        date: `${MONTH}-03`,
        type: "clear",
        expectedRevision: 2,
        previous: {
          type: "morning",
          name: "OLD",
          bus: "99",
          routeCode: "310.S01",
          start: null,
          end: null,
          revision: 2,
          groupId: GROUP_ID,
          driverName: "Ana Driver",
          confirmedByDriver: true,
          confirmedAt: "before",
          confirmationBoundRevision: 2,
          priorSnapshot: { empty: false, revision: 1, type: "off" }
        }
      },
      {
        driverId: DRIVER_ID,
        driverName: "Ana Driver",
        date: `${MONTH}-04`,
        type: "morning",
        name: "310.S01",
        routeCode: "310.S01",
        bus: "101",
        expectedRevision: 0,
        previous: null
      }
    ]
  });

  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview
  });

  bags.shifts[`${DRIVER_ID}_${MONTH}-04`] = {
    driverId: DRIVER_ID,
    date: `${MONTH}-04`,
    revision: 7,
    type: "off"
  };

  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: "disp-1",
      importId: prepared.id, fingerprint: prepared.fingerprint,
      actorGroups: [GROUP_ID]
    }),
    (error) => error.code === "MONTHLY_IMPORT_CONFLICT"
  );

  const restored = bags.shifts[`${DRIVER_ID}_${MONTH}-03`];
  assert.equal(restored.type, "morning");
  assert.equal(restored.name, "OLD");
  assert.equal(restored.bus, "99");
  assert.equal(restored.revision, 2);
  assert.equal(restored.confirmedByDriver, true);
  assert.equal(restored.confirmedAt, "before");
  assert.equal(restored.importId, undefined);
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-04`].importId, undefined);
  assert.equal(bags.monthly_plan_imports[prepared.id].status, "failed");
  assert.equal(bags.monthly_plan_imports[prepared.id].compensated, true);
  assert.equal(bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)], undefined);
  setStaffImportWriteChunkSizeForTests(0);
});

test("foreign concurrent shift without matching importId is never rewritten", async () => {
  const { db, admin, bags } = createDb();
  const importId = "import-foreign-1";
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);
  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_ID, MONTH));
  await importRef.set({ id: importId, status: "committing" });
  await lockRef.set({ importId, groupId: GROUP_ID, month: MONTH });
  bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
    driverId: DRIVER_ID,
    date: `${MONTH}-03`,
    type: "night",
    name: "FOREIGN",
    bus: "X",
    revision: 9,
    importId: "other-import"
  };

  const result = await compensateStaffImport({
    db, admin, companyRef, importRef, importId, groupId: GROUP_ID, month: MONTH,
    rows: [{
      driverId: DRIVER_ID,
      date: `${MONTH}-03`,
      previous: { type: "morning", name: "OLD", bus: "1", revision: 1, groupId: GROUP_ID }
    }],
    lockRef
  });
  assert.equal(result.ok, true);
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-03`].name, "FOREIGN");
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-03`].importId, "other-import");
});

test("compensation failure yields recovery status and keeps lock", async () => {
  const { db, admin, bags } = createDb();
  const importId = "import-comp-fail";
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);
  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_ID, MONTH));
  await importRef.set({ id: importId, status: "committing" });
  await lockRef.set({ importId, actorId: "disp-1", groupId: GROUP_ID, month: MONTH });
  bags.shifts[`${DRIVER_ID}_${MONTH}-03`] = {
    driverId: DRIVER_ID,
    date: `${MONTH}-03`,
    groupId: GROUP_ID,
    type: "morning",
    name: "NEW",
    importId,
    revision: 1
  };

  // Shift restore is transactional (2R-A.3.1); fail the post-restore schedule mirror batch.
  const originalBatch = db.batch.bind(db);
  db.batch = () => {
    const batch = originalBatch();
    batch.commit = async () => {
      throw new Error("schedule_mirror_failed");
    };
    return batch;
  };

  const result = await compensateStaffImport({
    db, admin, companyRef, importRef, importId, groupId: GROUP_ID, month: MONTH,
    rows: [{ driverId: DRIVER_ID, date: `${MONTH}-03`, previous: null }],
    lockRef
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "MONTHLY_IMPORT_COMPENSATION_FAILED");
  assert.equal(bags.monthly_plan_imports[importId].status, "compensation_failed");
  assert.equal(bags.monthly_plan_imports[importId].recoveryRequired, true);
  assert.ok(bags.monthly_plan_import_locks[lockDocumentId(GROUP_ID, MONTH)]);
});

test("failed/expired/compensation_failed jobs are not retryable; completed is idempotent", async () => {
  const { db, admin, bags } = createDb();
  const preview = previewPayload();
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview
  });
  await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1",
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  });
  const again = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1",
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  });
  assert.equal(again.idempotent, true);

  bags.monthly_plan_imports[prepared.id].status = "failed";
  bags.monthly_plan_imports[prepared.id].compensated = false;
  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: "disp-1",
      importId: prepared.id, fingerprint: prepared.fingerprint,
      actorGroups: [GROUP_ID]
    }),
    (e) => e.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED" && e.recoveryRequired === true
  );
});

test("oversized prepare returns 413 before job write", async () => {
  const { db, admin, bags } = createDb();
  const pad = "p".repeat(400);
  const hugeRows = Array.from({ length: 2200 }, (_, i) => ({
    driverId: DRIVER_ID,
    driverName: "Ana Driver",
    date: `${MONTH}-${String((i % 28) + 1).padStart(2, "0")}`,
    type: "morning",
    name: `DUTY-${i}-${pad}`,
    bus: "101",
    routeCode: `DUTY-${i}-${pad.slice(0, 64)}`,
    expectedRevision: 0,
    previous: {
      type: "off",
      name: pad,
      bus: "",
      routeCode: "",
      revision: 0,
      groupId: GROUP_ID,
      priorSnapshot: { empty: true, revision: 0, note: pad }
    }
  }));
  const preview = previewPayload({
    rows: hugeRows,
    summary: { rows: hugeRows.length, drivers: 1, assignments: hugeRows.length, removals: 0 }
  });
  assert.ok(estimateJobBytes(preview) > MAX_JOB_BYTES);
  await assert.rejects(
    () => prepareStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview
    }),
    (e) => e.code === "MONTHLY_IMPORT_TOO_LARGE" && e.status === 413
  );
  assert.equal(Object.keys(bags.monthly_plan_imports).length, 0);
  assert.equal(Object.keys(bags.monthly_plan_import_locks).length, 0);
});

test("commit writes canonical revision and schedule mirror without clear days", async () => {
  const { db, admin, bags } = createDb();
  const preview = previewPayload();
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview
  });
  await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1",
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  });
  const shift = bags.shifts[`${DRIVER_ID}_${MONTH}-03`];
  assert.equal(currentRevision(shift), 1);
  assert.equal(shift.confirmedByDriver, false);
  assert.equal(shift.importId, prepared.id);
  assert.ok(shift.priorSnapshot);
  const schedule = bags.schedules[`${DRIVER_ID}_${MONTH}`];
  assert.equal(schedule.parsedShifts[3].bus, "101");
  assert.equal(schedule.parsedShifts[3].type, "morning");
  assert.equal(schedule.driverName, "Ana Driver");
});

test("commit-time revalidation rejects inactive driver / missing duty / busy bus / stale revision", async () => {
  setGetActiveServicePlanForTests(async () => ({
    duties: [{ code: "310.S01" }]
  }));
  const { db, admin, bags } = createDb();
  const preview = previewPayload();
  const prepared = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview
  });

  bags.drivers[DRIVER_ID].active = false;
  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: "disp-1",
      importId: prepared.id, fingerprint: prepared.fingerprint,
      actorGroups: [GROUP_ID]
    }),
    (e) => e.code === "MONTHLY_IMPORT_REVALIDATION_FAILED"
      && e.details.some((d) => d.code === "DRIVER_INACTIVE")
  );

  bags.drivers[DRIVER_ID].active = true;
  bags.drivers[DRIVER_ID].groupId = "999";
  const prepared2 = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview: {
      ...preview,
      fingerprint: crypto.createHash("sha256").update("r2").digest("hex")
    }
  });
  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: "disp-1",
      importId: prepared2.id, fingerprint: prepared2.fingerprint,
      actorGroups: [GROUP_ID]
    }),
    (e) => e.details.some((d) => d.code === "DRIVER_OUTSIDE_GROUP")
  );

  bags.drivers[DRIVER_ID].groupId = GROUP_ID;
  setGetActiveServicePlanForTests(async () => ({ duties: [{ code: "OTHER" }] }));
  const prepared3 = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview: {
      ...preview,
      fingerprint: crypto.createHash("sha256").update("r3").digest("hex")
    }
  });
  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: "disp-1",
      importId: prepared3.id, fingerprint: prepared3.fingerprint,
      actorGroups: [GROUP_ID]
    }),
    (e) => e.details.some((d) => d.code === "DUTY_NOT_IN_ACTIVE_CATALOG")
  );

  setGetActiveServicePlanForTests(async () => ({ duties: [{ code: "310.S01" }] }));
  bags.buses["bus-101"].opsStatus = "maintenance";
  const prepared4 = await prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: "disp-1", preview: {
      ...preview,
      fingerprint: crypto.createHash("sha256").update("r4").digest("hex")
    }
  });
  await assert.rejects(
    () => commitStaffMonthlyImport({
      db, admin, companyId: COMPANY_ID, actorId: "disp-1",
      importId: prepared4.id, fingerprint: prepared4.fingerprint,
      actorGroups: [GROUP_ID]
    }),
    (e) => e.details.some((d) => d.code === "BUS_NOT_AVAILABLE")
  );
  assert.equal(Object.keys(bags.shifts).length, 0);
  setGetActiveServicePlanForTests(null);
});

test("new row rollback deletes imported shift", async () => {
  const { db, admin, bags } = createDb();
  const importId = "import-new-row";
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);
  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_ID, MONTH));
  await importRef.set({ id: importId, status: "committing" });
  await lockRef.set({ importId });
  bags.shifts[`${DRIVER_ID}_${MONTH}-05`] = {
    driverId: DRIVER_ID,
    date: `${MONTH}-05`,
    type: "morning",
    importId,
    revision: 1,
    groupId: GROUP_ID
  };
  await compensateStaffImport({
    db, admin, companyRef, importRef, importId, groupId: GROUP_ID, month: MONTH,
    rows: [{ driverId: DRIVER_ID, date: `${MONTH}-05`, previous: null }],
    lockRef
  });
  assert.equal(bags.shifts[`${DRIVER_ID}_${MONTH}-05`], undefined);
});

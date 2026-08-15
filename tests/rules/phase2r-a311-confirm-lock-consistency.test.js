/**
 * FAZA 2R-A.3.1.1 — real confirmation handler + full lock consistency (Firestore emulator).
 * Requires FIRESTORE_EMULATOR_HOST (npm run test:rules).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { fingerprintShift } = require("../../server/driver-work-policy");
const {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport,
  setGetActiveServicePlanForTests,
  setStaffImportWriteChunkSizeForTests,
  applyImportChunkTransaction
} = require("../../server/staff-monthly-plan-import");
const {
  lockDocumentId,
  assertNoActiveGroupMonthlyImport,
  GroupMonthlyImportError
} = require("../../server/group-monthly-plan-import");
const { shiftDocumentId } = require("../../server/shift-assignment");
const { registerDriverRoutes } = require("../../server/driver-routes");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-a311-confirm-lock";
const COMPANY_ID = "a311-company";
const GROUP_A = "310";
const GROUP_B = "311";
const MONTH = "2026-08";
const ACTOR = "disp-a311";
const DRIVER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DATE_A = `${MONTH}-06`;
const DATE_B = `${MONTH}-07`;

let db;
let adminApp;

test.before(() => {
  if (!EMULATOR) return;
  adminApp = admin.initializeApp({ projectId: PROJECT_ID }, "phase2r-a311");
  db = adminApp.firestore();
  setGetActiveServicePlanForTests(async () => ({
    duties: [{ code: "310.S01" }, { code: "311.S01" }, { code: "310.S02" }]
  }));
  setStaffImportWriteChunkSizeForTests(1);
});

test.after(async () => {
  setGetActiveServicePlanForTests(null);
  setStaffImportWriteChunkSizeForTests(null);
  if (adminApp) await adminApp.delete();
});

async function wipeCollection(col) {
  const snap = await col.limit(200).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size >= 200) await wipeCollection(col);
}

async function seedBase() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.set({ name: COMPANY_ID }, { merge: true });
  for (const name of [
    "shifts", "schedules", "shift_confirmations",
    "monthly_plan_imports", "monthly_plan_import_locks",
    "reports", "audit_log", "plan_edit_locks"
  ]) {
    await wipeCollection(companyRef.collection(name));
  }
  await companyRef.collection("drivers").doc(DRIVER).set({
    active: true, groupId: GROUP_A, firstName: "Confirm", lastName: "Driver", name: "Confirm Driver"
  });
  await companyRef.collection("buses").doc("bus-101").set({
    number: "101", active: true, opsStatus: "active", groupId: GROUP_A
  });
  await companyRef.collection("buses").doc("bus-202").set({
    number: "202", active: true, opsStatus: "active", groupId: GROUP_B
  });
  await companyRef.collection("users").doc(ACTOR).set({
    role: "dispatcher", active: true, groups: [GROUP_A, GROUP_B]
  });
  await companyRef.collection("profile").doc("main").set({ timezone: "Europe/Vienna" });
}

function fp(shift) {
  return fingerprintShift(shift);
}

function mountApp() {
  const routes = new Map();
  const expressApp = {
    use() {},
    get(p, ...h) { routes.set(`GET ${p}`, h); },
    post(p, ...h) { routes.set(`POST ${p}`, h); },
    put(p, ...h) { routes.set(`PUT ${p}`, h); }
  };
  registerDriverRoutes(expressApp, {
    admin: () => admin,
    db: () => db,
    hasFirebase: () => true,
    rateLimit: () => (_r, _s, next) => next(),
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
    assert.ok(handlers?.length);
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

test("G1 emulator: import lock first → real confirm handler IN_PROGRESS/RECOVERY", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const shiftA = {
    driverId: DRIVER, date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", groupId: GROUP_A, revision: 1
  };
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).set(shiftA);
  await companyRef.collection("monthly_plan_imports").doc("live-imp").set({
    status: "committing", groupId: GROUP_A, month: MONTH, actorId: ACTOR
  });
  await companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_A, MONTH)).set({
    importId: "live-imp",
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 120_000))
  });
  const { invokeConfirm } = mountApp();
  const res = await invokeConfirm({
    dates: [DATE_A],
    targets: [{ ...shiftA, fingerprint: fp(shiftA), revision: 1 }]
  });
  assert.equal(res.statusCode, 409);
  assert.ok(
    res.body.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || res.body.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED",
    res.body.code
  );
  const conf = await companyRef.collection("shift_confirmations").doc(`${DRIVER}_${DATE_A}`).get();
  assert.equal(conf.exists, false);
});

test("G2 emulator: confirm first → import does not leave false confirmation", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const shiftA = {
    driverId: DRIVER, date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", groupId: GROUP_A, revision: 1,
    shiftFingerprint: null,
    confirmedByDriver: false
  };
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).set(shiftA);
  const { invokeConfirm } = mountApp();
  const res = await invokeConfirm({
    dates: [DATE_A],
    targets: [{ ...shiftA, fingerprint: fp(shiftA), revision: 1 }]
  });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  const afterConfirm = await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).get();
  assert.equal(afterConfirm.data().confirmedByDriver, true);

  const prepared = await prepareStaffMonthlyImport({
    db,
    admin,
    companyId: COMPANY_ID,
    actorId: ACTOR,
    preview: {
      groupId: GROUP_A,
      month: MONTH,
      sourceName: "a311.xlsx",
      reason: "Dispatcher monthly plan import",
      fingerprint: crypto.createHash("sha256").update(`g2-${Date.now()}`).digest("hex"),
      summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
      rows: [{
        driverId: DRIVER,
        driverName: "Confirm Driver",
        date: DATE_A,
        type: "afternoon",
        name: "310.S02",
        bus: "101",
        routeCode: "310.S02",
        start: "13:00",
        end: "21:00",
        expectedRevision: afterConfirm.data().revision || 1,
        previous: null
      }]
    }
  });
  await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_A]
  });
  const afterImport = await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).get();
  assert.equal(afterImport.data().importId, prepared.id);
  assert.notEqual(afterImport.data().confirmedByDriver, true);
  assert.equal(afterImport.data().shiftFingerprint ?? null, null);
});

test("G3 emulator: stale target + live null shiftFingerprint → CONFIRMATION_STALE", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const shiftA = {
    date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", groupId: GROUP_A, revision: 1
  };
  const shiftB = {
    driverId: DRIVER, date: DATE_A, type: "afternoon", start: "13:00", end: "21:00",
    routeCode: "310.S02", bus: "202", name: "310.S02", groupId: GROUP_A, revision: 2,
    shiftFingerprint: null,
    confirmedByDriver: false
  };
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).set(shiftB);
  const { invokeConfirm } = mountApp();
  const res = await invokeConfirm({
    dates: [DATE_A],
    targets: [{ ...shiftA, fingerprint: fp(shiftA), revision: 1 }]
  });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "CONFIRMATION_STALE");
  const conf = await companyRef.collection("shift_confirmations").doc(`${DRIVER}_${DATE_A}`).get();
  assert.equal(conf.exists, false);
  const live = await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).get();
  assert.notEqual(live.data().confirmedByDriver, true);
});

test("G4 emulator: two scopes + safe expired lock → no HTTP 500", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const shift1 = {
    driverId: DRIVER, date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01", groupId: GROUP_A, revision: 1
  };
  const shift2 = {
    driverId: DRIVER, date: DATE_B, type: "morning", start: "05:00", end: "13:00",
    routeCode: "311.S01", bus: "202", name: "311.S01", groupId: GROUP_B, revision: 1
  };
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).set(shift1);
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_B)).set(shift2);
  await companyRef.collection("monthly_plan_imports").doc("old-safe").set({
    status: "completed", groupId: GROUP_A, month: MONTH
  });
  await companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_A, MONTH)).set({
    importId: "old-safe",
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60_000))
  });
  const { invokeConfirm } = mountApp();
  const res = await invokeConfirm({
    dates: [DATE_A, DATE_B],
    targets: [
      { ...shift1, fingerprint: fp(shift1), revision: 1 },
      { ...shift2, fingerprint: fp(shift2), revision: 1 }
    ]
  });
  assert.notEqual(res.statusCode, 500, JSON.stringify(res.body));
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
});

test("G5 emulator: missing live shift → SHIFT_MISSING, no phantom", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const target = {
    date: DATE_A, type: "morning", start: "05:00", end: "13:00",
    routeCode: "310.S01", bus: "101", name: "310.S01",
    fingerprint: fp({
      date: DATE_A, type: "morning", start: "05:00", end: "13:00",
      routeCode: "310.S01", bus: "101", name: "310.S01"
    }),
    revision: 1
  };
  const { invokeConfirm } = mountApp();
  const res = await invokeConfirm({ dates: [DATE_A], targets: [target] });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "SHIFT_MISSING");
  const phantom = await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER, DATE_A)).get();
  assert.equal(phantom.exists, false);
  const conf = await companyRef.collection("shift_confirmations").doc(`${DRIVER}_${DATE_A}`).get();
  assert.equal(conf.exists, false);
});

test("G6 emulator: completion wrong/missing groupId/month → RECOVERY", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepareStaffMonthlyImport({
    db,
    admin,
    companyId: COMPANY_ID,
    actorId: ACTOR,
    preview: {
      groupId: GROUP_A,
      month: MONTH,
      sourceName: "a311.xlsx",
      reason: "Dispatcher monthly plan import",
      fingerprint: crypto.createHash("sha256").update(`g6-${Date.now()}`).digest("hex"),
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
    }
  });
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_A],
    afterLockHook: async () => {
      await db.collection("companies").doc(COMPANY_ID)
        .collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_A, MONTH))
        .set({
          importId: prepared.id,
          actorId: ACTOR,
          expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 120_000))
        });
    }
  }).then(() => null, (e) => e);
  assert.ok(err instanceof GroupMonthlyImportError);
  assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  const job = await db.collection("companies").doc(COMPANY_ID)
    .collection("monthly_plan_imports").doc(prepared.id).get();
  assert.notEqual(job.data()?.status, "completed");
});

test("G7 emulator: chunk wrong/missing groupId/month → RECOVERY", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const importId = "chunk-bad-scope";
  const fingerprint = "fp-chunk-bad";
  const importRef = companyRef.collection("monthly_plan_imports").doc(importId);
  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_A, MONTH));
  await importRef.set({
    status: "committing",
    actorId: ACTOR,
    fingerprint,
    groupId: GROUP_A,
    month: MONTH,
    appliedChunks: 0
  });
  await lockRef.set({
    importId,
    actorId: ACTOR,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 120_000))
  });
  const err = await applyImportChunkTransaction({
    db,
    admin,
    companyRef,
    importRef,
    lockRef,
    importId,
    actorId: ACTOR,
    fingerprint,
    groupId: GROUP_A,
    month: MONTH,
    chunk: [{
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
    }],
    chunkIndex: 0,
    assignedAt: new Date()
  }).then(() => null, (e) => e);
  assert.ok(err instanceof GroupMonthlyImportError);
  assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
});

test("G8 emulator: concurrent safe-lock cleanup vs fresh claim → new lock kept", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const lockRef = companyRef.collection("monthly_plan_import_locks").doc(lockDocumentId(GROUP_A, MONTH));
  const oldImport = "old-expired-g8";
  const freshImport = "fresh-claim-g8";
  await companyRef.collection("monthly_plan_imports").doc(oldImport).set({
    status: "completed", groupId: GROUP_A, month: MONTH
  });
  await companyRef.collection("monthly_plan_imports").doc(freshImport).set({
    status: "committing", groupId: GROUP_A, month: MONTH, actorId: ACTOR
  });
  await lockRef.set({
    importId: oldImport,
    actorId: ACTOR,
    groupId: GROUP_A,
    month: MONTH,
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60_000))
  });

  // Race: observe expired via fast check path, then claim replaces lock before cleanup tx.
  const originalRun = db.runTransaction.bind(db);
  let swapped = false;
  db.runTransaction = async (fn) => {
    if (!swapped) {
      swapped = true;
      await lockRef.set({
        importId: freshImport,
        actorId: ACTOR,
        groupId: GROUP_A,
        month: MONTH,
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 120_000))
      });
    }
    return originalRun(fn);
  };
  try {
    await assertNoActiveGroupMonthlyImport({
      db, companyId: COMPANY_ID, groupId: GROUP_A, month: MONTH
    });
  } finally {
    db.runTransaction = originalRun;
  }
  const live = await lockRef.get();
  assert.equal(live.exists, true);
  assert.equal(live.data().importId, freshImport);
});

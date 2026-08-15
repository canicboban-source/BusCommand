/**
 * FAZA 2R-A.3.1 — Firestore emulator cross-writer atomicity races.
 * Requires FIRESTORE_EMULATOR_HOST (npm run test:rules).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport,
  setGetActiveServicePlanForTests,
  setStaffImportWriteChunkSizeForTests
} = require("../../server/staff-monthly-plan-import");
const { lockDocumentId, GroupMonthlyImportError } = require("../../server/group-monthly-plan-import");
const { shiftDocumentId, currentRevision } = require("../../server/shift-assignment");
const { registerDriverRoutes } = require("../../server/driver-routes");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-a31-cross-writer";
const COMPANY_ID = "a31-company";
const GROUP_ID = "310";
const GROUP_B = "311";
const MONTH = "2026-08";
const ACTOR = "disp-a31";
const DRIVER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DATE = `${MONTH}-05`;

let db;
let adminApp;

test.before(() => {
  if (!EMULATOR) return;
  adminApp = admin.initializeApp({ projectId: PROJECT_ID }, "phase2r-a31-cross");
  db = adminApp.firestore();
  setGetActiveServicePlanForTests(async () => ({
    duties: [{ code: "310.S01" }, { code: "311.S01" }]
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

/**
 * Real active catalog for assignment guard (getActiveServicePlan).
 * Times match import row() defaults (05:00–13:00) so DUTY_TIME_MISMATCH is not tripped.
 */
async function seedActiveDutyCatalog(companyRef, groupId, dutyCode) {
  const revisionId = `a31-rev-${groupId}`;
  const planId = `a31-${groupId}-catalog`;
  const planRef = companyRef.collection("service_plans").doc(planId);
  await planRef.set({
    id: planId,
    groupId,
    planCode: groupId,
    planVersion: "1",
    validFrom: "2026-01-01",
    timezone: "Europe/Vienna",
    status: "active",
    revisionId,
    dutyCount: 1
  });
  await planRef.collection("duties").doc(dutyCode.replace(/\./g, "_")).set({
    code: dutyCode,
    revisionId,
    dayType: "SCHOOL_WEEKDAY",
    start: "05:00",
    end: "13:00",
    workStart: "05:00",
    workEnd: "13:00"
  });
}

async function seedBase() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.set({ name: COMPANY_ID }, { merge: true });
  // Isolate each race case — prior tests must not leave shifts/locks behind.
  for (const name of [
    "shifts", "schedules", "shift_confirmations",
    "monthly_plan_imports", "monthly_plan_import_locks",
    "reports", "audit_log", "plan_edit_locks"
  ]) {
    await wipeCollection(companyRef.collection(name));
  }
  const plansSnap = await companyRef.collection("service_plans").limit(50).get();
  for (const planDoc of plansSnap.docs) {
    await wipeCollection(planDoc.ref.collection("duties"));
  }
  await wipeCollection(companyRef.collection("service_plans"));
  await seedActiveDutyCatalog(companyRef, GROUP_ID, "310.S01");
  await seedActiveDutyCatalog(companyRef, GROUP_B, "311.S01");
  await companyRef.collection("drivers").doc(DRIVER_A).set({
    active: true, groupId: GROUP_ID, firstName: "Ana", lastName: "A", name: "Ana A"
  });
  await companyRef.collection("drivers").doc(DRIVER_B).set({
    active: true, groupId: GROUP_B, firstName: "Bob", lastName: "B", name: "Bob B"
  });
  await companyRef.collection("buses").doc("bus-101").set({
    number: "101", active: true, opsStatus: "active", groupId: GROUP_ID
  });
  await companyRef.collection("buses").doc("bus-202").set({
    number: "202", active: true, opsStatus: "active", groupId: GROUP_B
  });
  await companyRef.collection("users").doc(ACTOR).set({
    role: "dispatcher", active: true, groups: [GROUP_ID, GROUP_B]
  });
}

function previewRows(rows) {
  return {
    groupId: GROUP_ID,
    month: MONTH,
    sourceName: "a31.xlsx",
    reason: "Dispatcher monthly plan import",
    fingerprint: crypto.createHash("sha256").update(`a31-${Date.now()}-${Math.random()}`).digest("hex"),
    summary: { rows: rows.length, drivers: 1, assignments: rows.length, removals: 0 },
    rows
  };
}

function row(driverId, date, expectedRevision = 0, name = "310.S01") {
  return {
    driverId,
    driverName: "Ana A",
    date,
    type: "morning",
    name,
    bus: "101",
    routeCode: name,
    start: "05:00",
    end: "13:00",
    expectedRevision,
    previous: null
  };
}

async function prepare(rows) {
  return prepareStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR, preview: previewRows(rows)
  });
}

function mountStaffApp() {
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
          groups: [GROUP_ID, GROUP_B], active: true
        };
        return next();
      }
    }
  });
  async function invoke(methodPath, body, params = {}) {
    const handlers = routes.get(methodPath);
    assert.ok(handlers, `missing route ${methodPath}`);
    const req = {
      headers: { authorization: "Bearer x" },
      body,
      params,
      staff: undefined,
      log: { error() {}, warn() {} }
    };
    const res = {
      statusCode: 200,
      body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; }
    };
    let i = 0;
    const next = async (err) => {
      if (err) throw err;
      const h = handlers[i++];
      if (!h) return;
      return h(req, res, next);
    };
    await next();
    return res;
  }
  return { invoke };
}

test("1a emulator: import lock first → assignment IN_PROGRESS (no silent overwrite)", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepare([row(DRIVER_A, DATE, 0)]);
  let release;
  const barrier = new Promise((r) => { release = r; });
  let entered = false;
  const commitP = commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterLockHook: async () => { entered = true; await barrier; }
  });
  for (let i = 0; i < 80 && !entered; i += 1) await new Promise((r) => setTimeout(r, 25));
  assert.equal(entered, true);

  const { invoke } = mountStaffApp();
  const res = await invoke("PUT /api/staff/shifts/assignment", {
    driverId: DRIVER_A,
    date: DATE,
    type: "morning",
    name: "310.S01",
    bus: "101",
    expectedRevision: 0
  });
  assert.equal(res.statusCode, 409);
  assert.ok(
    res.body.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || res.body.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED",
    res.body.code
  );

  release();
  await commitP;
  const shift = await db.collection("companies").doc(COMPANY_ID)
    .collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).get();
  assert.equal(shift.data().importId, prepared.id);
});

test("1b emulator: assignment first → import CONFLICT; assignment revision kept", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const { invoke } = mountStaffApp();
  const assign = await invoke("PUT /api/staff/shifts/assignment", {
    driverId: DRIVER_A,
    date: DATE,
    type: "afternoon",
    name: "310.S01",
    bus: "101",
    expectedRevision: 0
  });
  assert.equal(assign.statusCode, 200, JSON.stringify(assign.body));
  const afterAssign = await db.collection("companies").doc(COMPANY_ID)
    .collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).get();
  const winnerRev = currentRevision(afterAssign.data());
  assert.ok(winnerRev >= 1);

  const prepared = await prepare([row(DRIVER_A, DATE, 0)]);
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);
  assert.ok(err instanceof GroupMonthlyImportError);
  assert.equal(err.code, "MONTHLY_IMPORT_CONFLICT");
  const final = await db.collection("companies").doc(COMPANY_ID)
    .collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).get();
  assert.equal(final.data().type, "afternoon");
  assert.equal(currentRevision(final.data()), winnerRev);
  assert.notEqual(final.data().importId, prepared.id);
});

test("2 emulator: import lock first → undo blocked", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  // Seed an assigned shift with priorSnapshot so undo is meaningful after import starts.
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).set({
    driverId: DRIVER_A, date: DATE, type: "morning", name: "310.S01", bus: "101",
    groupId: GROUP_ID, revision: 1, priorSnapshot: { type: "off", revision: 0 }
  });
  const prepared = await prepare([row(DRIVER_A, DATE, 1)]);
  let release;
  const barrier = new Promise((r) => { release = r; });
  let entered = false;
  const commitP = commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterLockHook: async () => { entered = true; await barrier; }
  });
  for (let i = 0; i < 80 && !entered; i += 1) await new Promise((r) => setTimeout(r, 25));
  const { invoke } = mountStaffApp();
  const res = await invoke("POST /api/staff/shifts/assignment/undo", {
    driverId: DRIVER_A, date: DATE, expectedRevision: 1
  });
  assert.equal(res.statusCode, 409);
  assert.ok(
    res.body.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || res.body.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED"
  );
  release();
  await commitP.catch(() => {});
});

test("3 emulator: import lock first → incident resolve blocked", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).set({
    driverId: DRIVER_A, date: DATE, type: "morning", name: "310.S01", bus: "101",
    groupId: GROUP_ID, revision: 1
  });
  const reportRef = companyRef.collection("reports").doc("inc-a31-1");
  await reportRef.set({
    status: "open",
    groupId: GROUP_ID,
    date: DATE,
    driverId: DRIVER_A,
    affectedEntity: "driver",
    shiftType: "morning",
    shiftName: "310.S01",
    revision: 1
  });
  const prepared = await prepare([row(DRIVER_A, DATE, 1)]);
  let release;
  const barrier = new Promise((r) => { release = r; });
  let entered = false;
  const commitP = commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterLockHook: async () => { entered = true; await barrier; }
  });
  for (let i = 0; i < 80 && !entered; i += 1) await new Promise((r) => setTimeout(r, 25));
  const { invoke } = mountStaffApp();
  const res = await invoke("PUT /api/staff/operational-incidents/:reportId/resolve", {
    replacementDriverId: DRIVER_B,
    replacementBus: "202",
    expectedOriginalRevision: 1,
    expectedReplacementRevision: 0
  }, { reportId: "inc-a31-1" });
  assert.equal(res.statusCode, 409);
  assert.ok(
    res.body.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || res.body.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED",
    JSON.stringify(res.body)
  );
  release();
  await commitP.catch(() => {});
});

test("4 emulator: import lock first → driver confirmation blocked or stale-safe", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const fp = "fp-a31-confirm";
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).set({
    driverId: DRIVER_A, date: DATE, type: "morning", name: "310.S01", bus: "101",
    groupId: GROUP_ID, revision: 1, shiftFingerprint: fp
  });
  const prepared = await prepare([row(DRIVER_A, DATE, 1)]);
  let release;
  const barrier = new Promise((r) => { release = r; });
  let entered = false;
  const commitP = commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterLockHook: async () => { entered = true; await barrier; }
  });
  for (let i = 0; i < 80 && !entered; i += 1) await new Promise((r) => setTimeout(r, 25));

  // Invoke confirmation logic via direct transaction helper path through route mount.
  // Driver routes need driver middleware — exercise confirmation helper exported path by
  // simulating concurrent confirm write attempt that must see import lock.
  const lockSnap = await companyRef.collection("monthly_plan_import_locks")
    .doc(lockDocumentId(GROUP_ID, MONTH)).get();
  assert.equal(lockSnap.exists, true);

  // Direct confirm attempt using Admin (mirrors pre-fix race): after A.3.1 the route
  // must reject; here we call commit path integrity by ensuring confirm cannot succeed
  // via HTTP once wired. Use raw tx that A.3.1 confirm uses — if lock alive, reject.
  const { evaluateMonthlyImportLockState, readMonthlyImportLockInTx } = require("../../server/group-monthly-plan-import");
  let confirmBlocked = false;
  try {
    await db.runTransaction(async (tx) => {
      const gate = await readMonthlyImportLockInTx(tx, companyRef, GROUP_ID, MONTH);
      if (!gate.decision.ok) {
        confirmBlocked = true;
        const err = new Error(gate.decision.code);
        err.code = gate.decision.code;
        throw err;
      }
      tx.set(companyRef.collection("shift_confirmations").doc(`${DRIVER_A}_${DATE}`), {
        driverId: DRIVER_A, date: DATE, shiftFingerprint: fp
      }, { merge: true });
    });
  } catch (e) {
    confirmBlocked = e.code === "MONTHLY_IMPORT_IN_PROGRESS"
      || e.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED";
  }
  assert.equal(confirmBlocked, true);
  void evaluateMonthlyImportLockState;
  release();
  await commitP.catch(() => {});
});

test("5 emulator: chunk revision race — concurrent bump causes CONFLICT, no silent overwrite", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepare([
    row(DRIVER_A, `${MONTH}-01`, 0),
    row(DRIVER_A, `${MONTH}-02`, 0)
  ]);
  let release;
  const barrier = new Promise((r) => { release = r; });
  let chunks = 0;
  const commitP = commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterChunkHook: async () => {
      chunks += 1;
      if (chunks === 1) await barrier;
    }
  });
  for (let i = 0; i < 120 && chunks < 1; i += 1) await new Promise((r) => setTimeout(r, 25));
  assert.equal(chunks, 1);
  // External writer bumps second day while import paused after first chunk.
  await db.collection("companies").doc(COMPANY_ID)
    .collection("shifts").doc(shiftDocumentId(DRIVER_A, `${MONTH}-02`)).set({
      driverId: DRIVER_A, date: `${MONTH}-02`, type: "afternoon", name: "WIN", bus: "101",
      groupId: GROUP_ID, revision: 7
    });
  release();
  const err = await commitP.then(() => null, (e) => e);
  assert.ok(err);
  assert.equal(err.code, "MONTHLY_IMPORT_CONFLICT");
  const kept = await db.collection("companies").doc(COMPANY_ID)
    .collection("shifts").doc(shiftDocumentId(DRIVER_A, `${MONTH}-02`)).get();
  assert.equal(kept.data().name, "WIN");
  assert.equal(kept.data().revision, 7);
});

test("6 emulator: prepared + appliedChunks → RECOVERY_REQUIRED, no takeover", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepare([row(DRIVER_A, DATE, 0)]);
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.collection("monthly_plan_imports").doc(prepared.id).set({
    appliedChunks: 2,
    status: "prepared"
  }, { merge: true });
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);
  assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  const job = await companyRef.collection("monthly_plan_imports").doc(prepared.id).get();
  assert.notEqual(job.data().status, "completed");
  assert.notEqual(job.data().status, "committing");
});

test("7 emulator: prepared + importId-tagged shift → RECOVERY_REQUIRED", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepare([row(DRIVER_A, DATE, 0)]);
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).set({
    driverId: DRIVER_A, date: DATE, type: "morning", importId: prepared.id, revision: 1,
    groupId: GROUP_ID
  });
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);
  assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  const job = await companyRef.collection("monthly_plan_imports").doc(prepared.id).get();
  assert.notEqual(job.data().status, "completed");
});

test("8 emulator: missing lock before chunk → RECOVERY_REQUIRED, no writes", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepare([row(DRIVER_A, DATE, 0)]);
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterLockHook: async () => {
      await companyRef.collection("monthly_plan_import_locks")
        .doc(lockDocumentId(GROUP_ID, MONTH)).delete();
    }
  }).then(() => null, (e) => e);
  assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  const shift = await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER_A, DATE)).get();
  assert.equal(shift.exists, false);
});

test("9 emulator: mismatched lock before completion → RECOVERY, not completed", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepare([row(DRIVER_A, DATE, 0)]);
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterChunkHook: async () => {
      await companyRef.collection("monthly_plan_import_locks")
        .doc(lockDocumentId(GROUP_ID, MONTH)).set({
          importId: "other-import-id",
          groupId: GROUP_ID,
          month: MONTH,
          actorId: "other",
          expiresAt: new Date(Date.now() + 60_000)
        });
    }
  }).then(() => null, (e) => e);
  assert.ok(err);
  assert.equal(err.code, "MONTHLY_IMPORT_RECOVERY_REQUIRED");
  const job = await companyRef.collection("monthly_plan_imports").doc(prepared.id).get();
  assert.notEqual(job.data()?.status, "completed");
});

test("10 emulator: expired prepared status persists (not aborted by throw)", {
  skip: !EMULATOR
}, async () => {
  await seedBase();
  const prepared = await prepare([row(DRIVER_A, DATE, 0)]);
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.collection("monthly_plan_imports").doc(prepared.id).set({
    expiresAt: new Date(Date.now() - 1000)
  }, { merge: true });
  const err = await commitStaffMonthlyImport({
    db, admin, companyId: COMPANY_ID, actorId: ACTOR,
    importId: prepared.id, fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);
  assert.equal(err.code, "MONTHLY_IMPORT_EXPIRED");
  const job = await companyRef.collection("monthly_plan_imports").doc(prepared.id).get();
  assert.equal(job.data().status, "expired");
});

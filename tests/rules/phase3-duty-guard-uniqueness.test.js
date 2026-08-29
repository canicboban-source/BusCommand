/**
 * FAZA 3 & FAZA 9 — Executable Duty Guard Uniqueness, Atomicity & Concurrency (Firestore Emulator).
 * Requires FIRESTORE_EMULATOR_HOST (npm run test:rules).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { registerDriverRoutes } = require("../../server/driver-routes");
const { canonicalDutyGuardKey } = require("../../server/duty-instance-guard");
const { scanAndBackfillDutyGuards } = require("../../server/duty-instance-backfill");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-duty-guard-test";
const COMPANY_ID = "duty-guard-company";
const GROUP_ID = "310";
const GROUP_B = "311";
const ACTOR = "disp-duty-guard";
const DRIVER_A = "11111111-1111-4111-8111-111111111111";
const DRIVER_B = "22222222-2222-4222-8222-222222222222";
const DRIVER_C = "33333333-3333-4333-8333-333333333333";
const DATE = "2026-08-15";
const DUTY_CODE = "310.605";

let db;
let adminApp;

test.before(() => {
  if (!EMULATOR) return;
  adminApp = admin.initializeApp({ projectId: PROJECT_ID }, "phase3-duty-guard");
  db = adminApp.firestore();
});

test.after(async () => {
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

async function seedActiveDutyCatalog(companyRef, groupId, dutyCode, times = { start: "06:00", end: "14:00" }) {
  const revisionId = `duty-rev-${groupId}`;
  const planId = `plan-${groupId}-catalog`;
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
    start: times.start,
    end: times.end,
    workStart: times.start,
    workEnd: times.end
  });
}

async function seedBase() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.set({ name: COMPANY_ID }, { merge: true });
  for (const name of [
    "shifts", "schedules", "buses", "drivers", "users",
    "ops_active_duties", "ops_active_incidents", "monthly_plan_imports",
    "monthly_plan_import_locks", "plan_edit_locks", "audit_log", "reports"
  ]) {
    await wipeCollection(companyRef.collection(name));
  }
  const plansSnap = await companyRef.collection("service_plans").limit(50).get();
  for (const planDoc of plansSnap.docs) {
    await wipeCollection(planDoc.ref.collection("duties"));
  }
  await wipeCollection(companyRef.collection("service_plans"));
  await seedActiveDutyCatalog(companyRef, GROUP_ID, DUTY_CODE);
  await seedActiveDutyCatalog(companyRef, GROUP_B, "311.S01");
  await companyRef.collection("drivers").doc(DRIVER_A).set({
    active: true, groupId: GROUP_ID, firstName: "Dušan", lastName: "Popović", name: "Dušan Popović"
  });
  await companyRef.collection("drivers").doc(DRIVER_B).set({
    active: true, groupId: GROUP_ID, firstName: "Aleksandar", lastName: "Nikolić", name: "Aleksandar Nikolić"
  });
  await companyRef.collection("drivers").doc(DRIVER_C).set({
    active: true, groupId: GROUP_ID, firstName: "Nemanja", lastName: "Petrović", name: "Nemanja Petrović"
  });
  await companyRef.collection("buses").doc("bus-101").set({
    number: "101", active: true, opsStatus: "active", groupId: GROUP_ID, lineIds: [GROUP_ID]
  });
  await companyRef.collection("users").doc(ACTOR).set({
    active: true, role: "dispatcher", groups: [GROUP_ID, GROUP_B], name: "Dispatcher Test"
  });
}

function mountStaffApp() {
  const routes = new Map();
  const expressApp = {
    use() {},
    get(p, ...h) { routes.set(`GET ${p}`, h); },
    post(p, ...h) { routes.set(`POST ${p}`, h); },
    put(p, ...h) { routes.set(`PUT ${p}`, h); },
    delete(p, ...h) { routes.set(`DELETE ${p}`, h); }
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
        req.staff = {
          uid: ACTOR, role: "dispatcher", companyId: COMPANY_ID,
          groups: [GROUP_ID, GROUP_B], active: true
        };
        req.staffUser = req.staff;
        return next();
      }
    }
  });
  async function invoke(methodPath, body = {}, params = {}) {
    const handlers = routes.get(methodPath);
    assert.ok(handlers, `missing route ${methodPath}`);
    const req = {
      headers: { authorization: "Bearer x" },
      body,
      query: {},
      params,
      staff: { uid: ACTOR, role: "dispatcher", companyId: COMPANY_ID, groups: [GROUP_ID, GROUP_B], active: true },
      staffUser: { uid: ACTOR, role: "dispatcher", companyId: COMPANY_ID, groups: [GROUP_ID, GROUP_B], active: true },
      log: { warn() {}, error() {}, info() {} }
    };
    let statusCode = 200;
    let bodyOut = null;
    const res = {
      status(c) { statusCode = c; return res; },
      json(b) { bodyOut = b; return res; },
      send(b) { bodyOut = b; return res; }
    };
    for (const h of handlers) {
      let nextCalled = false;
      await h(req, res, () => { nextCalled = true; });
      if (!nextCalled) break;
    }
    return { status: statusCode, statusCode, body: bodyOut };
  }
  return { invoke };
}

test("FAZA 3 / 9: Canonical Duty Instance Guard Uniqueness Suite", async (t) => {
  if (!EMULATOR) {
    t.skip("Requires FIRESTORE_EMULATOR_HOST");
    return;
  }

  const { invoke } = mountStaffApp();

  await t.test("1. Sequential assignment of same duty without bus: 1st driver succeeds, 2nd and 3rd receive DUTY_ALREADY_ASSIGNED", async () => {
    await seedBase();

    // 1. Assign Duty 310.605 to Dušan (DRIVER_A)
    const res1 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res1.status, 200, "1st assignment must succeed");
    assert.equal(res1.body.success, true);

    // Verify canonical guard document exists and belongs to Dušan
    const guardKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    const guardSnap = await db.collection("companies").doc(COMPANY_ID).collection("ops_active_duties").doc(guardKey).get();
    assert.equal(guardSnap.exists, true, "Guard doc must exist");
    assert.equal(guardSnap.data().ownerDriverId, DRIVER_A);
    assert.equal(guardSnap.data().dutyCode, DUTY_CODE);

    // 2. Assign Duty 310.605 to Aleksandar (DRIVER_B) -> MUST FAIL with 409 DUTY_ALREADY_ASSIGNED
    const res2 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_B,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res2.status, 409, "2nd assignment must return 409");
    assert.equal(res2.body.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(res2.body.conflict.existingDriverId, DRIVER_A);
    assert.equal(res2.body.conflict.existingDriverName, "Dušan Popović");

    // 3. Assign Duty 310.605 to Nemanja (DRIVER_C) -> MUST FAIL with 409 DUTY_ALREADY_ASSIGNED
    const res3 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_C,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res3.status, 409, "3rd assignment must return 409");
    assert.equal(res3.body.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(res3.body.conflict.existingDriverId, DRIVER_A);
  });

  await t.test("2. True concurrent assignment race for same duty across 25 iterations: exactly 1 winner, 1 loser 409", async () => {
    const guardKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    for (let iter = 1; iter <= 25; iter++) {
      await seedBase();

      const [resA, resB] = await Promise.all([
        invoke("PUT /api/staff/shifts/assignment", {
          driverId: DRIVER_A,
          date: DATE,
          type: "morning",
          name: DUTY_CODE,
          routeCode: DUTY_CODE,
          bus: "",
          expectedRevision: 0
        }),
        invoke("PUT /api/staff/shifts/assignment", {
          driverId: DRIVER_B,
          date: DATE,
          type: "morning",
          name: DUTY_CODE,
          routeCode: DUTY_CODE,
          bus: "",
          expectedRevision: 0
        })
      ]);

      const statuses = [resA.status, resB.status].sort();
      assert.deepEqual(statuses, [200, 409], `Iteration ${iter}: Concurrent requests must result in exactly one 200 and one 409`);

      const winnerRes = resA.status === 200 ? resA : resB;
      const loserRes = resA.status === 409 ? resA : resB;
      assert.equal(loserRes.body.code, "DUTY_ALREADY_ASSIGNED", `Iteration ${iter}: Loser must receive DUTY_ALREADY_ASSIGNED`);

      // Exactly one guard exists
      const guardSnap = await db.collection("companies").doc(COMPANY_ID).collection("ops_active_duties").doc(guardKey).get();
      assert.equal(guardSnap.exists, true, `Iteration ${iter}: Guard doc must exist`);
      assert.ok(guardSnap.data().ownerDriverId === DRIVER_A || guardSnap.data().ownerDriverId === DRIVER_B);

      // Verify winner is owner
      const winnerDriverId = winnerRes === resA ? DRIVER_A : DRIVER_B;
      assert.equal(guardSnap.data().ownerDriverId, winnerDriverId, `Iteration ${iter}: Guard owner must match winner`);
    }
  });

  await t.test("2b. Undo conflict: when duty was reclaimed by another driver, undo is rejected with 409 DUTY_ALREADY_ASSIGNED", async () => {
    await seedBase();

    // 1. Driver A assigns duty
    const resA1 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(resA1.status, 200);

    // 2. Driver A clears shift
    const resA2 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "clear",
      expectedRevision: resA1.body.shift.revision
    });
    assert.equal(resA2.status, 200);

    // 3. Driver B takes duty
    const resB1 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_B,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(resB1.status, 200);

    // 4. Driver A attempts to undo (restoring duty 310.605) -> must fail with 409 DUTY_ALREADY_ASSIGNED
    const resUndo = await invoke("POST /api/staff/shifts/assignment/undo", {
      driverId: DRIVER_A,
      date: DATE,
      expectedRevision: resA2.body.shift.revision
    });
    assert.equal(resUndo.status, 409, "Undo must return 409 conflict");
    assert.equal(resUndo.body.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(resUndo.body.conflict.existingDriverId, DRIVER_B);

    // Driver B remains sole owner of duty guard
    const guardKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    const guardSnap = await db.collection("companies").doc(COMPANY_ID).collection("ops_active_duties").doc(guardKey).get();
    assert.equal(guardSnap.exists, true);
    assert.equal(guardSnap.data().ownerDriverId, DRIVER_B);
  });

  await t.test("3. Idempotent retry for the same driver with unchanged duty succeeds", async () => {
    await seedBase();

    const res1 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res1.status, 200);

    const resRetry = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: res1.body.shift.revision
    });
    assert.equal(resRetry.status, 200, "Idempotent / same-driver edit must succeed");
    assert.equal(resRetry.body.success, true);
  });

  await t.test("4. Shift clear releases the canonical duty guard", async () => {
    await seedBase();

    const res1 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res1.status, 200);

    const guardKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    let guardSnap = await db.collection("companies").doc(COMPANY_ID).collection("ops_active_duties").doc(guardKey).get();
    assert.equal(guardSnap.exists, true);

    const resClear = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "clear",
      expectedRevision: res1.body.shift.revision
    });
    assert.equal(resClear.status, 200);

    guardSnap = await db.collection("companies").doc(COMPANY_ID).collection("ops_active_duties").doc(guardKey).get();
    assert.equal(guardSnap.exists, false, "Guard must be deleted after shift clear");

    const res2 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_B,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res2.status, 200, "Driver B can claim released duty");
  });

  await t.test("5. Legacy backfill scans operational window, detects duplicates, and writes clean guards", async () => {
    await seedBase();
    const companyRef = db.collection("companies").doc(COMPANY_ID);

    await companyRef.collection("shifts").doc(`${DRIVER_A}_${DATE}`).set({
      driverId: DRIVER_A,
      driverName: "Dušan Popović",
      groupId: GROUP_ID,
      date: DATE,
      type: "morning",
      routeCode: DUTY_CODE,
      name: DUTY_CODE,
      revision: 1
    });
    await companyRef.collection("shifts").doc(`${DRIVER_B}_${DATE}`).set({
      driverId: DRIVER_B,
      driverName: "Aleksandar Nikolić",
      groupId: GROUP_ID,
      date: DATE,
      type: "morning",
      routeCode: DUTY_CODE,
      name: DUTY_CODE,
      revision: 1
    });

    const OTHER_DATE = "2026-08-16";
    await companyRef.collection("shifts").doc(`${DRIVER_C}_${OTHER_DATE}`).set({
      driverId: DRIVER_C,
      driverName: "Nemanja Petrović",
      groupId: GROUP_ID,
      date: OTHER_DATE,
      type: "morning",
      routeCode: DUTY_CODE,
      name: DUTY_CODE,
      revision: 1
    });

    const dryRunResult = await scanAndBackfillDutyGuards({
      db,
      admin,
      companyId: COMPANY_ID,
      dryRun: true
    });
    assert.equal(dryRunResult.conflictsCount, 1, "Must find 1 duplicate conflict");
    assert.equal(dryRunResult.conflicts[0].driverCount, 2);
    assert.equal(dryRunResult.cleanGuardsCount, 1, "Must identify 1 clean duty");
    assert.equal(dryRunResult.guardsWritten, 0, "Dry run must write 0 guards");

    const applyResult = await scanAndBackfillDutyGuards({
      db,
      admin,
      companyId: COMPANY_ID,
      dryRun: false
    });
    assert.equal(applyResult.guardsWritten, 1, "Apply must write only clean guards");

    const cleanKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: OTHER_DATE, dutyCode: DUTY_CODE });
    const cleanSnap = await companyRef.collection("ops_active_duties").doc(cleanKey).get();
    assert.equal(cleanSnap.exists, true);
    assert.equal(cleanSnap.data().ownerDriverId, DRIVER_C);

    const conflictKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    const conflictSnap = await companyRef.collection("ops_active_duties").doc(conflictKey).get();
    assert.equal(conflictSnap.exists, false, "Conflicting guard must NOT be written automatically");
  });

  await t.test("6. Active-Duty Change: driver atomically transitions between active duties releasing old guard and claiming new guard", async () => {
    await seedBase();
    const companyRef = db.collection("companies").doc(COMPANY_ID);
    const DUTY_CODE_2 = "310.606";
    await seedActiveDutyCatalog(companyRef, GROUP_ID, DUTY_CODE_2, { start: "07:00", end: "15:00" });

    // 1. Assign Duty 1 (310.605) to Dušan
    const res1 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res1.status, 200);

    const guardKey1 = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    const guardKey2 = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE_2 });

    let snap1 = await companyRef.collection("ops_active_duties").doc(guardKey1).get();
    let snap2 = await companyRef.collection("ops_active_duties").doc(guardKey2).get();
    assert.equal(snap1.exists, true);
    assert.equal(snap2.exists, false);

    // 2. Change Dušan's duty from 310.605 to 310.606
    const res2 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE_2,
      routeCode: DUTY_CODE_2,
      bus: "",
      expectedRevision: res1.body.shift.revision
    });
    assert.equal(res2.status, 200);

    snap1 = await companyRef.collection("ops_active_duties").doc(guardKey1).get();
    snap2 = await companyRef.collection("ops_active_duties").doc(guardKey2).get();
    assert.equal(snap1.exists, false, "Old guard 310.605 must be released");
    assert.equal(snap2.exists, true, "New guard 310.606 must be claimed");
    assert.equal(snap2.data().ownerDriverId, DRIVER_A);

    // 3. Aleksandar can now claim released Duty 1 (310.605)
    const res3 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_B,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(res3.status, 200, "Released duty 310.605 can be claimed by Aleksandar");
    snap1 = await companyRef.collection("ops_active_duties").doc(guardKey1).get();
    assert.equal(snap1.exists, true);
    assert.equal(snap1.data().ownerDriverId, DRIVER_B);
  });

  await t.test("7. Incident Replacement & Driver Available-Again: replacement transfers duty guard; available-again does not duplicate or steal back duty from replacement", async () => {
    await seedBase();
    const companyRef = db.collection("companies").doc(COMPANY_ID);

    // 1. Assign Duty 310.605 to Driver A
    const res1 = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "101",
      expectedRevision: 0
    });
    assert.equal(res1.status, 200);

    // 2. Open operational incident for Driver A
    const reportRef = companyRef.collection("reports").doc("inc-test-1");
    await reportRef.set({
      id: "inc-test-1",
      status: "open",
      revision: 1,
      type: "coverage:disruption",
      affectedEntity: "driver",
      driverId: DRIVER_A,
      driver: "Dušan Popović",
      groupId: GROUP_ID,
      date: DATE,
      severity: "sev_critical",
      shiftType: "morning",
      shiftName: DUTY_CODE,
      bus: "101",
      reason: "Vozač se razboleo",
      description: "Zamena potrebna",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3. Resolve incident via replacement Driver B
    const resRep = await invoke("PUT /api/staff/operational-incidents/:reportId/resolve", {
      replacementDriverId: DRIVER_B,
      replacementBus: "101",
      resolutionType: "replacement",
      expectedOriginalRevision: 1,
      expectedReplacementRevision: 0,
      expectedProblemRevision: 1
    }, { reportId: "inc-test-1" });
    assert.equal(resRep.status, 200);

    // Guard must now be owned by Driver B
    const guardKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    const guardSnap = await companyRef.collection("ops_active_duties").doc(guardKey).get();
    assert.equal(guardSnap.exists, true);
    assert.equal(guardSnap.data().ownerDriverId, DRIVER_B, "Guard must be transferred to replacement Driver B");

    // 4. Driver C attempts to claim same duty -> MUST FAIL with 409
    const resC = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_C,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "",
      expectedRevision: 0
    });
    assert.equal(resC.status, 409);
    assert.equal(resC.body.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(resC.body.conflict.existingDriverId, DRIVER_B);

    // 5. Driver A marks available again -> incident is resolved, but duty remains with Driver B
    const reportRef2 = companyRef.collection("reports").doc("inc-test-2");
    await reportRef2.set({
      id: "inc-test-2",
      status: "open",
      revision: 1,
      type: "coverage:disruption",
      affectedEntity: "driver",
      driverId: DRIVER_A,
      driver: "Dušan Popović",
      groupId: GROUP_ID,
      date: DATE,
      severity: "sev_critical",
      shiftType: "morning",
      shiftName: DUTY_CODE,
      bus: "101",
      reason: "Vozač se vratio",
      description: "Dostupan ponovo",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const resAvail = await invoke("PUT /api/staff/operational-incidents/:reportId/resolve", {
      resolutionType: "available_again",
      expectedProblemRevision: 1
    }, { reportId: "inc-test-2" });
    assert.equal(resAvail.status, 200);

    // Guard still belongs to replacement Driver B (not stolen back)
    const guardSnapAfter = await companyRef.collection("ops_active_duties").doc(guardKey).get();
    assert.equal(guardSnapAfter.data().ownerDriverId, DRIVER_B, "Available-again must NOT steal back duty from replacement Driver B");
  });

  await t.test("8. Incident Replacement Collision: replacement with a third driver's duty is rejected with 409 DUTY_ALREADY_ASSIGNED, leaves incident open and original owner intact", async () => {
    await seedBase();
    const companyRef = db.collection("companies").doc(COMPANY_ID);

    // 1. Driver A is assigned Duty 310.605
    const resA = await invoke("PUT /api/staff/shifts/assignment", {
      driverId: DRIVER_A,
      date: DATE,
      type: "morning",
      name: DUTY_CODE,
      routeCode: DUTY_CODE,
      bus: "101",
      expectedRevision: 0
    });
    assert.equal(resA.status, 200);

    // 2. Incident is opened for Driver A
    const reportRef = companyRef.collection("reports").doc("inc-test-collision");
    await reportRef.set({
      id: "inc-test-collision",
      status: "open",
      revision: 1,
      type: "coverage:disruption",
      affectedEntity: "driver",
      driverId: DRIVER_A,
      driver: "Dušan Popović",
      groupId: GROUP_ID,
      date: DATE,
      severity: "sev_critical",
      shiftType: "morning",
      shiftName: DUTY_CODE,
      bus: "101",
      reason: "Vozač se razboleo",
      description: "Zamena potrebna",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // 3. Simulating a foreign collision: Driver C holds the guard document for 310.605
    const guardKey = canonicalDutyGuardKey({ groupId: GROUP_ID, serviceDate: DATE, dutyCode: DUTY_CODE });
    await companyRef.collection("ops_active_duties").doc(guardKey).set({
      schemaVersion: "v1",
      companyId: COMPANY_ID,
      groupId: GROUP_ID,
      serviceDate: DATE,
      dutyCode: DUTY_CODE,
      shiftType: "morning",
      ownerDriverId: DRIVER_C,
      ownerShiftDocumentId: `${DRIVER_C}_${DATE}`,
      assignedBus: "",
      claimedBy: "foreign-staff"
    });

    // 4. Attempt to resolve incident on Driver A via replacement Driver B -> MUST FAIL with 409
    const resRep = await invoke("PUT /api/staff/operational-incidents/:reportId/resolve", {
      replacementDriverId: DRIVER_B,
      replacementBus: "101",
      resolutionType: "replacement",
      expectedOriginalRevision: 1,
      expectedReplacementRevision: 0,
      expectedProblemRevision: 1
    }, { reportId: "inc-test-collision" });

    assert.equal(resRep.status, 409, "Must reject with 409 Conflict");
    assert.equal(resRep.body.code, "DUTY_ALREADY_ASSIGNED");
    assert.equal(resRep.body.conflict.existingDriverId, DRIVER_C);

    // 5. Invariants after atomic rejection:
    // a. Incident remains open
    const reportSnap = await reportRef.get();
    assert.equal(reportSnap.data().status, "open", "Incident must NOT be marked resolved");

    // b. Replacement Driver B receives no shift
    const bShiftSnap = await companyRef.collection("shifts").doc(`${DRIVER_B}_${DATE}`).get();
    assert.equal(bShiftSnap.exists, false, "Replacement driver must not receive partial shift mutation");

    // c. Guard remains owned by Driver C (the valid current holder)
    const guardSnap = await companyRef.collection("ops_active_duties").doc(guardKey).get();
    assert.equal(guardSnap.data().ownerDriverId, DRIVER_C, "Guard ownership must remain unchanged");
  });
});

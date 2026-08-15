/**
 * FAZA 3 D24.1 — executable assignment resource + race proofs (Firestore emulator).
 * Requires FIRESTORE_EMULATOR_HOST (npm run test:rules).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { shiftDocumentId, scheduleDocumentId } = require("../../server/shift-assignment");
const { registerDriverRoutes } = require("../../server/driver-routes");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-d241-assign";
const COMPANY_ID = "d241-company";
const GROUP_ID = "310";
const GROUP_B = "311";
const ACTOR = "disp-d241";
const DRIVER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DRIVER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DATE = "2026-08-15";

let db;
let adminApp;

test.before(() => {
  if (!EMULATOR) return;
  adminApp = admin.initializeApp({ projectId: PROJECT_ID }, "phase3-d241-assign");
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

async function seedActiveDutyCatalog(companyRef, groupId, dutyCode, times = { start: "05:00", end: "13:00" }) {
  const revisionId = `d241-rev-${groupId}`;
  const planId = `d241-${groupId}-catalog`;
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
    "monthly_plan_imports", "monthly_plan_import_locks", "plan_edit_locks", "audit_log"
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
  await companyRef.collection("buses").doc("bus-ready").set({
    number: "101", active: true, opsStatus: "active", groupId: GROUP_ID, groupIds: [GROUP_ID]
  });
  await companyRef.collection("buses").doc("bus-inactive").set({
    number: "102", active: false, opsStatus: "active", groupId: GROUP_ID, groupIds: [GROUP_ID]
  });
  await companyRef.collection("buses").doc("bus-out").set({
    number: "103", active: true, opsStatus: "out", groupId: GROUP_ID, groupIds: [GROUP_ID]
  });
  await companyRef.collection("buses").doc("bus-foreign").set({
    number: "202", active: true, opsStatus: "active", groupId: GROUP_B, groupIds: [GROUP_B]
  });
  await companyRef.collection("users").doc(ACTOR).set({
    role: "dispatcher", active: true, groups: [GROUP_ID, GROUP_B]
  });
  return companyRef;
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
  async function invoke(methodPath, body) {
    const handlers = routes.get(methodPath);
    assert.ok(handlers, `missing route ${methodPath}`);
    const req = {
      headers: { authorization: "Bearer x" },
      body,
      params: {},
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

function assignBody(overrides = {}) {
  return {
    driverId: DRIVER_A,
    date: DATE,
    type: "morning",
    name: "310.S01",
    routeCode: "310.S01",
    bus: "101",
    start: "05:00",
    end: "13:00",
    expectedRevision: 0,
    ...overrides
  };
}

async function shiftCount(companyRef) {
  return (await companyRef.collection("shifts").get()).size;
}

test("D24.1 HTTP: bus missing → 409 BUS_NOT_FOUND, zero writes", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({ bus: "99999" }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "BUS_NOT_FOUND");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: inactive → BUS_INACTIVE, zero writes", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({ bus: "102" }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "BUS_INACTIVE");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: not-ready → BUS_NOT_AVAILABLE, zero writes", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({ bus: "103" }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "BUS_NOT_AVAILABLE");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: outside group → BUS_OUTSIDE_GROUP, zero writes", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({ bus: "202" }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "BUS_OUTSIDE_GROUP");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: overlapping same/cross-group → BUS_DOUBLE_BOOKED, zero writes", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  await companyRef.collection("buses").doc("bus-shared").set({
    number: "555", active: true, opsStatus: "active", groupId: GROUP_ID, groupIds: [GROUP_ID, GROUP_B]
  });
  await companyRef.collection("shifts").doc(shiftDocumentId(DRIVER_B, DATE)).set({
    driverId: DRIVER_B,
    date: DATE,
    type: "morning",
    bus: "555",
    groupId: GROUP_B,
    start: "05:00",
    end: "13:00",
    revision: 1
  });
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({
    bus: "555",
    driverId: DRIVER_A
  }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "BUS_DOUBLE_BOOKED");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: stale bus opsStatus race → zero writes (409)", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  // Flip bus to out after seed; tx must see live state.
  await companyRef.collection("buses").doc("bus-ready").update({ opsStatus: "out" });
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({ bus: "101" }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "BUS_NOT_AVAILABLE");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: duty missing → stable 409 DUTY_NOT_IN_ACTIVE_CATALOG", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({
    name: "310.NOPE",
    routeCode: "310.NOPE"
  }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "DUTY_NOT_IN_ACTIVE_CATALOG");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: duty time mismatch → 409 DUTY_TIME_MISMATCH", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({
    start: "06:00",
    end: "14:00"
  }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "DUTY_TIME_MISMATCH");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1 HTTP: stale revision → REVISION_CONFLICT, zero overwrite", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const shiftId = shiftDocumentId(DRIVER_A, DATE);
  await companyRef.collection("shifts").doc(shiftId).set({
    driverId: DRIVER_A,
    date: DATE,
    type: "morning",
    bus: "101",
    groupId: GROUP_ID,
    name: "310.S01",
    start: "05:00",
    end: "13:00",
    revision: 3
  });
  const { invoke } = mountStaffApp();
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({
    expectedRevision: 1,
    bus: "101"
  }));
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "REVISION_CONFLICT");
  const kept = (await companyRef.collection("shifts").doc(shiftId).get()).data();
  assert.equal(kept.revision, 3);
});

test("D24.1 HTTP: valid assignment → canonical shift + schedule, one revision", { skip: !EMULATOR }, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody());
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  const shiftId = shiftDocumentId(DRIVER_A, DATE);
  const shiftSnap = await companyRef.collection("shifts").doc(shiftId).get();
  assert.equal(shiftSnap.exists, true);
  assert.equal(shiftSnap.data().revision, 1);
  assert.equal(shiftSnap.data().bus, "101");
  const scheduleIds = scheduleDocumentId(DRIVER_A, "Ana A", "2026-08");
  const scheduleSnap = await companyRef.collection("schedules").doc(scheduleIds.canonical).get();
  assert.equal(scheduleSnap.exists, true);
  assert.ok(scheduleSnap.data().parsedShifts?.["15"] || scheduleSnap.data().parsedShifts?.[15]);
});

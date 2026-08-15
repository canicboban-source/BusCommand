/**
 * FAZA 3 D24.1.1 / D24.1.1.1 — staff fail-closed, group drift, null-key migration,
 * dirty reads, group-delete race, bus concurrency, enumeration-safe scope errors.
 *
 * Duration note (test-only): in-tx hooks that mutate docs after read force Firestore
 * transaction contention/retry; individual cases may take ~60–75s. Production
 * semantics are unchanged — this is a CI cost of real concurrency proofs.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const admin = require("firebase-admin");
const { shiftDocumentId } = require("../../server/shift-assignment");
const {
  registerDriverRoutes,
  setAssignmentMutationHookForTests
} = require("../../server/driver-routes");
const {
  createManualCompanyDriver,
  setCreateDriverMutationHookForTests
} = require("../../server/company-admin-driver-ops");
const {
  buildMigrationPlan,
  migrateCompany,
  profileHasCredentialFields
} = require("../../server/driver-credential-migration");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-d2411";
/** Same project as migrateCompany ALLOWED_PROJECT_ID — Rules + Admin share this namespace. */
const MIG_PROJECT_ID = "buscommand-preview";
const COMPANY_ID = "d2411-co";
const GROUP_ID = "310";
const GROUP_B = "311";
const ACTOR = "disp-d2411";
const DRIVER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DATE = "2026-08-20";
const RULES = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");

let env;
let migEnv;
let adminApp;
let migAdminApp;
let db;
let migDb;

function claims(role, companyId) {
  return { role, companyId, mustChangeLoginCode: false, auth_time: 1 };
}

function tenantDoc(fdb, companyId, collection, id) {
  return fdb.collection("companies").doc(companyId).collection(collection).doc(id);
}

test.before(async () => {
  if (!EMULATOR) return;
  env = await initializeTestEnvironment({ projectId: `${PROJECT_ID}-rules`, firestore: { rules: RULES } });
  migEnv = await initializeTestEnvironment({ projectId: MIG_PROJECT_ID, firestore: { rules: RULES } });
  adminApp = admin.initializeApp({ projectId: `${PROJECT_ID}-admin` }, "phase3-d2411-admin");
  migAdminApp = admin.initializeApp({ projectId: MIG_PROJECT_ID }, "phase3-d24111-mig");
  db = adminApp.firestore();
  migDb = migAdminApp.firestore();
});

test.after(async () => {
  setAssignmentMutationHookForTests(null);
  setCreateDriverMutationHookForTests(null);
  if (env) await env.cleanup();
  if (migEnv) await migEnv.cleanup();
  if (adminApp) await adminApp.delete();
  if (migAdminApp) await migAdminApp.delete();
});

async function wipeCollection(col) {
  const snap = await col.limit(200).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size >= 200) await wipeCollection(col);
}

async function seedActiveDutyCatalog(companyRef, groupId, dutyCode) {
  const revisionId = `d2411-rev-${groupId}`;
  const planId = `d2411-${groupId}`;
  const planRef = companyRef.collection("service_plans").doc(planId);
  await planRef.set({
    id: planId, groupId, planCode: groupId, planVersion: "1",
    validFrom: "2026-01-01", timezone: "Europe/Vienna", status: "active", revisionId, dutyCount: 1
  });
  await planRef.collection("duties").doc(dutyCode.replace(/\./g, "_")).set({
    code: dutyCode, revisionId, start: "05:00", end: "13:00", workStart: "05:00", workEnd: "13:00"
  });
}

async function seedBase() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.set({ name: COMPANY_ID }, { merge: true });
  for (const name of [
    "shifts", "schedules", "buses", "drivers", "users",
    "monthly_plan_imports", "monthly_plan_import_locks", "plan_edit_locks", "groups", "settings"
  ]) {
    await wipeCollection(companyRef.collection(name));
  }
  const plansSnap = await companyRef.collection("service_plans").limit(50).get();
  for (const planDoc of plansSnap.docs) await wipeCollection(planDoc.ref.collection("duties"));
  await wipeCollection(companyRef.collection("service_plans"));
  await seedActiveDutyCatalog(companyRef, GROUP_ID, "310.S01");
  await companyRef.collection("settings").doc("main").set({ status: "active", maxDrivers: 50 });
  await companyRef.collection("groups").doc(GROUP_ID).set({ lineId: GROUP_ID, active: true });
  await companyRef.collection("groups").doc(GROUP_B).set({ lineId: GROUP_B, active: true });
  await companyRef.collection("drivers").doc(DRIVER_A).set({
    active: true, groupId: GROUP_ID, firstName: "Ana", lastName: "A", name: "Ana A"
  });
  await companyRef.collection("buses").doc("bus-ready").set({
    number: "101", active: true, opsStatus: "active", groupId: GROUP_ID, groupIds: [GROUP_ID]
  });
  await companyRef.collection("users").doc(ACTOR).set({
    role: "dispatcher", active: true, groups: [GROUP_ID]
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
          groups: [GROUP_ID], active: true
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

test("D24.1.1 HTTP: staff deleted during mutation window → STAFF_SESSION_INVALID, zero writes", {
  skip: !EMULATOR
}, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  setAssignmentMutationHookForTests(async () => {
    await companyRef.collection("users").doc(ACTOR).delete();
  });
  try {
    const before = await shiftCount(companyRef);
    const res = await invoke("PUT /api/staff/shifts/assignment", assignBody());
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "STAFF_SESSION_INVALID");
    assert.equal(await shiftCount(companyRef), before);
  } finally {
    setAssignmentMutationHookForTests(null);
  }
});

test("D24.1.1 HTTP: staff deactivated during mutation → STAFF_SESSION_INVALID, zero writes", {
  skip: !EMULATOR
}, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  setAssignmentMutationHookForTests(async () => {
    await companyRef.collection("users").doc(ACTOR).update({ active: false });
  });
  try {
    const before = await shiftCount(companyRef);
    const res = await invoke("PUT /api/staff/shifts/assignment", assignBody());
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "STAFF_SESSION_INVALID");
    assert.equal(await shiftCount(companyRef), before);
  } finally {
    setAssignmentMutationHookForTests(null);
  }
});

test("D24.1.1 HTTP: staff role changed during mutation → STAFF_SESSION_INVALID, zero writes", {
  skip: !EMULATOR
}, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  setAssignmentMutationHookForTests(async () => {
    await companyRef.collection("users").doc(ACTOR).update({ role: "company_admin" });
  });
  try {
    const before = await shiftCount(companyRef);
    const res = await invoke("PUT /api/staff/shifts/assignment", assignBody());
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, "STAFF_SESSION_INVALID");
    assert.equal(await shiftCount(companyRef), before);
  } finally {
    setAssignmentMutationHookForTests(null);
  }
});

test("D24.1.1 HTTP: driver group changed after day-lock → DRIVER_SCOPE_CHANGED, zero writes", {
  skip: !EMULATOR
}, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  setAssignmentMutationHookForTests(async () => {
    await companyRef.collection("drivers").doc(DRIVER_A).update({ groupId: GROUP_B, lineId: GROUP_B });
  });
  try {
    const before = await shiftCount(companyRef);
    const schedulesBefore = (await companyRef.collection("schedules").get()).size;
    const res = await invoke("PUT /api/staff/shifts/assignment", assignBody());
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "DRIVER_SCOPE_CHANGED");
    assert.equal(await shiftCount(companyRef), before);
    assert.equal((await companyRef.collection("schedules").get()).size, schedulesBefore);
    // D24.1.1.1 — enumeration-safe: Dispo must not learn the foreign group id.
    const raw = JSON.stringify(res.body);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body, "liveGroupId"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body, "lockedGroupId"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(res.body, "groupId"), false);
    assert.doesNotMatch(raw, /311/);
    assert.doesNotMatch(raw, /liveGroupId|lockedGroupId/);
    assert.deepEqual(Object.keys(res.body).sort(), ["code", "error", "success"]);
  } finally {
    setAssignmentMutationHookForTests(null);
  }
});

test("D24.1.1 HTTP: inactive driver cannot receive new assignment", {
  skip: !EMULATOR
}, async () => {
  const companyRef = await seedBase();
  await companyRef.collection("drivers").doc(DRIVER_A).update({ active: false });
  const { invoke } = mountStaffApp();
  const before = await shiftCount(companyRef);
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody());
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "DRIVER_INACTIVE");
  assert.equal(await shiftCount(companyRef), before);
});

test("D24.1.1 HTTP: clear remains allowed for inactive driver with existing shift", {
  skip: !EMULATOR
}, async () => {
  const companyRef = await seedBase();
  const shiftId = shiftDocumentId(DRIVER_A, DATE);
  await companyRef.collection("shifts").doc(shiftId).set({
    driverId: DRIVER_A, date: DATE, type: "morning", bus: "101",
    groupId: GROUP_ID, name: "310.S01", start: "05:00", end: "13:00", revision: 1
  });
  await companyRef.collection("drivers").doc(DRIVER_A).update({ active: false });
  const { invoke } = mountStaffApp();
  const res = await invoke("PUT /api/staff/shifts/assignment", assignBody({
    type: "clear",
    bus: "",
    name: "",
    routeCode: "",
    expectedRevision: 1
  }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.deleted, true);
});

test("D24.1.1 HTTP: real bus concurrency — flip opsStatus after tx read → zero writes", {
  skip: !EMULATOR
}, async () => {
  const companyRef = await seedBase();
  const { invoke } = mountStaffApp();
  setAssignmentMutationHookForTests(async () => {
    await companyRef.collection("buses").doc("bus-ready").update({ opsStatus: "out" });
  });
  try {
    const before = await shiftCount(companyRef);
    const res = await invoke("PUT /api/staff/shifts/assignment", assignBody());
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "BUS_NOT_AVAILABLE");
    assert.equal(await shiftCount(companyRef), before);
  } finally {
    setAssignmentMutationHookForTests(null);
  }
});

test("D24.1.1 create: group deletion during mutation window → group-not-found, no orphans", {
  skip: !EMULATOR
}, async () => {
  const companyId = "d2411-group-race";
  const companyRef = db.collection("companies").doc(companyId);
  await wipeCollection(companyRef.collection("drivers"));
  await wipeCollection(companyRef.collection("driver_credentials"));
  await companyRef.set({ name: companyId });
  await companyRef.collection("settings").doc("main").set({ status: "active", maxDrivers: 20 });
  await companyRef.collection("groups").doc("310").set({ lineId: "310", active: true });
  const bcrypt = require("bcrypt");
  const crypto = require("crypto");

  // After in-tx group read, delete the group so commit retries → group-not-found.
  setCreateDriverMutationHookForTests(async () => {
    await companyRef.collection("groups").doc("310").delete();
  });
  try {
    await assert.rejects(
      () => createManualCompanyDriver({
        db,
        FieldValue: admin.firestore.FieldValue,
        bcryptHash: (v, r) => bcrypt.hash(v, r),
        randomUUID: () => crypto.randomUUID(),
        companyId,
        body: {
          firstName: "G", lastName: "R", phone: "+1", email: "g@r.local",
          eid: "EID-GROUP-RACE", companyCode: "12345", groupId: "310", knownGroupIds: ["310"]
        },
        actorUid: "ca-1"
      }),
      (err) => err.code === "group-not-found"
    );
  } finally {
    setCreateDriverMutationHookForTests(null);
  }
  assert.equal((await companyRef.collection("drivers").get()).size, 0);
  assert.equal((await companyRef.collection("driver_credentials").get()).size, 0);
});

test("D24.1.1.1 Rules+migrateCompany: dirty-null blocked → real apply → clean readable; idempotent", {
  skip: !EMULATOR
}, async () => {
  const companyId = "alpha-null-mig";
  const driverId = "null-dirty";
  const companyRef = migDb.collection("companies").doc(companyId);
  await companyRef.set({ name: companyId });
  await companyRef.collection("settings").doc("main").set({ status: "active" });
  await companyRef.collection("users").doc("dispatcher-a").set({
    role: "dispatcher", companyId, groups: ["310"], active: true
  });
  await companyRef.collection("users").doc("admin-a").set({
    role: "company_admin", companyId, active: true
  });
  await companyRef.collection("drivers").doc(driverId).set({
    firstName: "Null",
    lastName: "Dirty",
    groupId: "310",
    lineId: "310",
    eid: null,
    loginCodeHash: null
  });
  await companyRef.collection("driver_sessions").doc(driverId).set({
    notificationsUntil: new Date("2100-01-01T00:00:00.000Z"),
    sessionEndsAt: new Date("2100-01-01T00:00:00.000Z")
  });

  const plan = buildMigrationPlan({ eid: null, loginCodeHash: null, firstName: "X" });
  assert.ok(plan);
  assert.ok(plan.removeFields.includes("eid"));
  assert.deepEqual(plan.credentials, {});
  assert.equal(profileHasCredentialFields({ eid: null }), true);

  const dispatcher = migEnv.authenticatedContext("dispatcher-a", claims("dispatcher", companyId)).firestore();
  const driver = migEnv.authenticatedContext(driverId, claims("driver", companyId)).firestore();
  const sa = migEnv.authenticatedContext("super", { role: "superadmin", mustChangeLoginCode: false, auth_time: 1 }).firestore();
  const ca = migEnv.authenticatedContext("admin-a", claims("company_admin", companyId)).firestore();

  await assertFails(tenantDoc(dispatcher, companyId, "drivers", driverId).get());
  await assertFails(tenantDoc(driver, companyId, "drivers", driverId).get());
  await assertFails(tenantDoc(sa, companyId, "drivers", driverId).get());
  await assertSucceeds(tenantDoc(ca, companyId, "drivers", driverId).get());

  // Real production migrateCompany on the same emulator project (not live apply).
  const applied = await migrateCompany({
    db: migDb,
    fieldValue: admin.firestore.FieldValue,
    projectId: MIG_PROJECT_ID,
    companyId,
    dryRun: false
  });
  assert.equal(applied.candidates, 1);
  assert.equal(applied.migrated, 1);

  const profileSnap = await companyRef.collection("drivers").doc(driverId).get();
  const profile = profileSnap.data() || {};
  assert.equal(Object.prototype.hasOwnProperty.call(profile, "eid"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profile, "loginCodeHash"), false);
  const credSnap = await companyRef.collection("driver_credentials").doc(driverId).get();
  if (credSnap.exists) {
    const cred = credSnap.data() || {};
    assert.equal(cred.eid, undefined);
    assert.equal(cred.loginCodeHash, undefined);
    assert.notEqual(cred.eid, null);
    assert.notEqual(cred.loginCodeHash, null);
  }

  await assertSucceeds(tenantDoc(dispatcher, companyId, "drivers", driverId).get());
  await assertSucceeds(tenantDoc(driver, companyId, "drivers", driverId).get());
  await assertSucceeds(tenantDoc(sa, companyId, "drivers", driverId).get());

  const again = await migrateCompany({
    db: migDb,
    fieldValue: admin.firestore.FieldValue,
    projectId: MIG_PROJECT_ID,
    companyId,
    dryRun: false
  });
  assert.deepEqual(again, { dryRun: false, candidates: 0, migrated: 0 });
});

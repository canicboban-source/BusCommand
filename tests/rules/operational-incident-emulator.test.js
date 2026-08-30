/**
 * Operational Incidents Real Firestore Emulator Concurrency & Integrity Suite.
 * Requires FIRESTORE_EMULATOR_HOST (run via `npm run test:rules`).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const admin = require("firebase-admin");
const {
  initializeTestEnvironment,
  assertFails
} = require("@firebase/rules-unit-testing");
const { registerDriverRoutes } = require("../../server/driver-routes");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-incident-emulator";
const COMPANY_ID = "inc-comp-1";
const GROUP_310 = "310";
const GROUP_320 = "320";
const ACTOR_UID = "disp-inc-1";
const DRIVER_LUKA = "11111111-2222-4333-8444-555555555555";
const DRIVER_MARKO = "22222222-3333-4444-8555-666666666666";

let adminApp;
let db;
let server;
let serverPort;
let testEnv;

function todayDateStr(timeZone = "Europe/Vienna", date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

async function wipeCollection(col) {
  const snap = await col.limit(200).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size >= 200) await wipeCollection(col);
}

async function seedCompany() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.set({ name: COMPANY_ID });
  await companyRef.collection("settings").doc("main").set({
    status: "active",
    licenseStatus: "active",
    licenseType: "pro"
  });
  await companyRef.collection("profile").doc("main").set({
    timezone: "Europe/Vienna"
  });
  await companyRef.collection("users").doc(ACTOR_UID).set({
    role: "dispatcher",
    active: true,
    groups: [GROUP_310, GROUP_320],
    sessionsValidAfterEpoch: 0
  });
  await companyRef.collection("drivers").doc(DRIVER_LUKA).set({
    active: true,
    groupId: GROUP_310,
    firstName: "Luka",
    lastName: "Kovacevic",
    name: "Luka Kovacevic"
  });
  await companyRef.collection("drivers").doc(DRIVER_MARKO).set({
    active: true,
    groupId: GROUP_310,
    firstName: "Marko",
    lastName: "Jovanovic",
    name: "Marko Jovanovic"
  });
  await companyRef.collection("buses").doc("bus-101").set({
    number: "101",
    active: true,
    opsStatus: "active",
    groupId: GROUP_310,
    groupIds: [GROUP_310]
  });
  return companyRef;
}

test.before(async () => {
  if (!EMULATOR) return;
  adminApp = admin.initializeApp({ projectId: PROJECT_ID }, "incident-emulator-app");
  db = adminApp.firestore();

  const rulesContent = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: rulesContent }
  });

  const app = express();
  app.use(express.json());

  registerDriverRoutes(app, {
    admin: () => admin,
    db: () => db,
    hasFirebase: () => true,
    rateLimit: () => (_r, _s, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "127.0.0.1",
    logAudit: async (companyId, actorId, action, details) => {
      await db.collection("companies").doc(companyId).collection("audit_log").add({
        action,
        actorId,
        companyId,
        category: "operations",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: details || {}
      });
    },
    staffAuth: {
      requireCompanyStaff(req, _res, next) {
        const groups = req.headers["x-test-groups"]
          ? JSON.parse(req.headers["x-test-groups"])
          : [GROUP_310, GROUP_320];
        const role = req.headers["x-test-role"] || "dispatcher";
        const companyId = req.headers["x-test-company"] || COMPANY_ID;
        const uid = req.headers["x-test-uid"] || ACTOR_UID;
        req.staffUser = {
          uid,
          role,
          companyId,
          groups,
          active: true
        };
        req.staff = req.staffUser;
        return next();
      }
    },
    now: () => new Date()
  });

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  serverPort = server.address().port;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (testEnv) await testEnv.cleanup();
  if (adminApp) await adminApp.delete();
});

async function apiRequest(path, { method = "GET", headers = {}, body } = {}) {
  const res = await fetch(`http://127.0.0.1:${serverPort}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore non-JSON */ }
  return { status: res.status, json, text };
}

test.beforeEach(async () => {
  if (!EMULATOR) return;
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  for (const name of ["reports", "ops_active_incidents", "audit_log", "shifts", "schedules"]) {
    await wipeCollection(companyRef.collection(name));
  }
  await seedCompany();
});

test("1. Real Firestore Emulator Concurrency: overlapping identical creations produce exactly 1 report, 1 guard, 1 audit", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const payload = {
    affectedEntity: "driver",
    driverId: DRIVER_LUKA,
    date: today,
    reason: "Sick leave",
    description: "Concurrent emulator test",
    shiftType: "morning",
    shiftName: "310.S01",
    bus: "101"
  };

  // Issue two genuinely overlapping requests over real HTTP to the real Firestore emulator
  const [res1, res2] = await Promise.all([
    apiRequest("/api/staff/operational-incidents", { method: "POST", body: payload }),
    apiRequest("/api/staff/operational-incidents", { method: "POST", body: payload })
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.deepEqual(statuses, [200, 201], "One request creates (201) and one returns existing report as duplicate (200)");

  const createdRes = res1.status === 201 ? res1 : res2;
  const dupRes = res1.status === 200 ? res1 : res2;

  assert.equal(createdRes.json?.success, true);
  assert.equal(dupRes.json?.success, true);
  assert.equal(dupRes.json?.duplicate, true);
  assert.equal(dupRes.json?.report?.id, createdRes.json?.report?.id, "Duplicate response returns the same report ID");

  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const reportsSnap = await companyRef.collection("reports").get();
  assert.equal(reportsSnap.size, 1, "Exactly one document exists in reports collection");

  const guardsSnap = await companyRef.collection("ops_active_incidents").get();
  assert.equal(guardsSnap.size, 1, "Exactly one active guard exists");

  const guardDoc = guardsSnap.docs[0];
  assert.match(guardDoc.id, /^v1_[a-f0-9]{64}$/, "Active guard document ID must use versioned hash format v1_<hash>");
  assert.equal(guardDoc.data().reportId, createdRes.json?.report?.id);
  assert.equal(guardDoc.data().incidentType, "coverage:disruption");
  assert.equal(guardDoc.data().groupId, GROUP_310);
  assert.equal(guardDoc.data().scopeKind, "day");
  assert.equal(guardDoc.data().scopeId, "day");

  const auditSnap = await companyRef.collection("audit_log").where("action", "==", "operational_incident_created").get();
  assert.equal(auditSnap.size, 1, "Exactly one creation audit entry produced");
  assert.equal(auditSnap.docs[0].data().details?.reportId, createdRes.json?.report?.id);
  assert.equal(auditSnap.docs[0].data().details?.groupId, GROUP_310);
});

test("2. Resolve then recreate produces a new historical UUID report without overwriting resolved report", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const payload = {
    affectedEntity: "driver",
    driverId: DRIVER_LUKA,
    date: today,
    reason: "Sick leave",
    description: "Initial incident",
    shiftType: "morning",
    shiftName: "310.S01",
    bus: "101"
  };

  // 1. Create first incident
  const c1 = await apiRequest("/api/staff/operational-incidents", { method: "POST", body: payload });
  assert.equal(c1.status, 201);
  const rId1 = c1.json?.report?.id;

  // 2. Resolve via available_again
  const res1 = await apiRequest(`/api/staff/operational-incidents/${rId1}/resolve`, {
    method: "PUT",
    body: { type: "available_again" }
  });
  assert.equal(res1.status, 200);
  assert.equal(res1.json?.report?.status, "resolved");

  // Verify active guard was cleaned up
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const guardsSnap1 = await companyRef.collection("ops_active_incidents").get();
  assert.equal(guardsSnap1.size, 0, "Active guard deleted after resolution");

  // 3. Recreate incident later for same driver and date
  const c2 = await apiRequest("/api/staff/operational-incidents", { method: "POST", body: payload });
  assert.equal(c2.status, 201);
  const rId2 = c2.json?.report?.id;
  assert.notEqual(rId1, rId2, "Recreation generates fresh UUID report ID");

  const reportsSnap = await companyRef.collection("reports").get();
  assert.equal(reportsSnap.size, 2, "Both historical reports exist in Firestore");
  assert.equal(reportsSnap.docs.find((d) => d.id === rId1).data().status, "resolved");
  assert.equal(reportsSnap.docs.find((d) => d.id === rId2).data().status, "open");
});

test("3. Exact-scope duplicate resolution: resolving group 310 leaves group 320 active", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const companyRef = db.collection("companies").doc(COMPANY_ID);

  // Seed two reports for Luka on the same day: one in group 310, one in group 320
  const rep310Ref = companyRef.collection("reports").doc("rep-310-luka");
  const rep320Ref = companyRef.collection("reports").doc("rep-320-luka");

  await rep310Ref.set({
    id: "rep-310-luka",
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day"
  });

  await rep320Ref.set({
    id: "rep-320-luka",
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_320,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day"
  });

  // Resolve group 310 incident with dispatcher who has access to both [310, 320]
  const res = await apiRequest("/api/staff/operational-incidents/rep-310-luka/resolve", {
    method: "PUT",
    body: { type: "available_again" }
  });
  assert.equal(res.status, 200);

  const snap310 = await rep310Ref.get();
  const snap320 = await rep320Ref.get();

  assert.equal(snap310.data().status, "resolved", "Group 310 report must be resolved");
  assert.equal(snap320.data().status, "open", "Group 320 report must REMAIN OPEN and active");
});

test("4. Resolution audit includes complete required fields and idempotency", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const companyRef = db.collection("companies").doc(COMPANY_ID);

  // Seed primary + exact duplicate in group 310
  const primaryId = "rep-audit-primary";
  const dupId = "rep-audit-dup";

  await companyRef.collection("reports").doc(primaryId).set({
    id: primaryId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day"
  });

  await companyRef.collection("reports").doc(dupId).set({
    id: dupId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day"
  });

  const res = await apiRequest(`/api/staff/operational-incidents/${primaryId}/resolve`, {
    method: "PUT",
    body: { type: "available_again" }
  });
  assert.equal(res.status, 200);

  const audits = await companyRef.collection("audit_log")
    .where("action", "==", "operational_incident_resolved").get();
  assert.equal(audits.size, 1);

  const auditData = audits.docs[0].data();
  assert.equal(auditData.actorId, ACTOR_UID);
  assert.equal(auditData.companyId, COMPANY_ID);
  assert.equal(auditData.details?.reportId, primaryId);
  assert.deepEqual(auditData.details?.secondaryReportIds, [dupId]);
  assert.equal(auditData.details?.driverId, DRIVER_LUKA);
  assert.equal(auditData.details?.groupId, GROUP_310);
  assert.equal(auditData.details?.scopeKind, "day");
  assert.equal(auditData.details?.scopeId, "day");
  assert.equal(auditData.details?.incidentType, "coverage:disruption");
  assert.equal(auditData.details?.resolutionType, "available_again");

  // Retry resolution: must be idempotent with 0 new audit records
  const retry = await apiRequest(`/api/staff/operational-incidents/${primaryId}/resolve`, {
    method: "PUT",
    body: { type: "available_again" }
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.json?.idempotent, true);

  const auditsAfterRetry = await companyRef.collection("audit_log")
    .where("action", "==", "operational_incident_resolved").get();
  assert.equal(auditsAfterRetry.size, 1, "Idempotent retry creates zero additional audit rows");
});

test("5. Security rules: browser/client access to ops_active_incidents is denied for all roles", {
  skip: !EMULATOR
}, async () => {
  const clients = [
    testEnv.authenticatedContext("sa-1", { role: "superadmin", mustChangeLoginCode: false, auth_time: 1 }).firestore(),
    testEnv.authenticatedContext("ca-1", { role: "company_admin", companyId: COMPANY_ID, mustChangeLoginCode: false, auth_time: 1 }).firestore(),
    testEnv.authenticatedContext("disp-1", { role: "dispatcher", companyId: COMPANY_ID, mustChangeLoginCode: false, auth_time: 1 }).firestore(),
    testEnv.authenticatedContext(DRIVER_LUKA, { role: "driver", companyId: COMPANY_ID, mustChangeLoginCode: false, auth_time: 1 }).firestore()
  ];

  const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require("firebase/firestore");

  for (const clientDb of clients) {
    const targetRef = doc(clientDb, "companies", COMPANY_ID, "ops_active_incidents", "test-guard-doc");
    await assertFails(getDoc(targetRef));
    await assertFails(setDoc(targetRef, { tampered: true }));
    await assertFails(updateDoc(targetRef, { tampered: true }));
    await assertFails(deleteDoc(targetRef));
  }
});

test("6. Different explicit scopes remain separate and do not collide", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const companyRef = db.collection("companies").doc(COMPANY_ID);

  // Seed shift for assignment scope
  const shiftId = `${DRIVER_LUKA}_${today}`;
  await companyRef.collection("shifts").doc(shiftId).set({
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "morning",
    name: "310.S01",
    bus: "101",
    revision: 1
  });

  // 1. Create day-scoped incident for Luka
  const resDay = await apiRequest("/api/staff/operational-incidents", {
    method: "POST",
    body: {
      affectedEntity: "driver",
      driverId: DRIVER_LUKA,
      date: today,
      reason: "Driver unavailable",
      scopeKind: "day",
      scopeId: "day"
    }
  });
  assert.equal(resDay.status, 201);

  // 2. Create assignment-scoped incident for Luka
  const resAssignment = await apiRequest("/api/staff/operational-incidents", {
    method: "POST",
    body: {
      affectedEntity: "driver",
      driverId: DRIVER_LUKA,
      date: today,
      reason: "Driver shift issue",
      scopeKind: "assignment",
      scopeId: shiftId
    }
  });
  assert.equal(resAssignment.status, 201);
  assert.notEqual(resDay.json?.report?.id, resAssignment.json?.report?.id, "Day scope and assignment scope must produce distinct reports");

  const guards = await companyRef.collection("ops_active_incidents").get();
  assert.equal(guards.size, 2, "Separate active guards exist for different explicit scopes");
});

test("7. Primary and legacy duplicates resolve together and all relevant guards are removed", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const companyRef = db.collection("companies").doc(COMPANY_ID);

  const primaryId = "rep-p-1";
  const dupId = "rep-dup-exact";
  const guardKey1 = "v1_guard_primary_111";
  const guardKey2 = "v1_guard_dup_222";

  await companyRef.collection("reports").doc(primaryId).set({
    id: primaryId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day",
    guardKey: guardKey1
  });

  await companyRef.collection("reports").doc(dupId).set({
    id: dupId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day",
    guardKey: guardKey2
  });

  await companyRef.collection("ops_active_incidents").doc(guardKey1).set({
    reportId: primaryId,
    status: "open"
  });
  await companyRef.collection("ops_active_incidents").doc(guardKey2).set({
    reportId: dupId,
    status: "open"
  });

  const res = await apiRequest(`/api/staff/operational-incidents/${primaryId}/resolve`, {
    method: "PUT",
    body: { type: "available_again" }
  });
  assert.equal(res.status, 200);

  const pSnap = await companyRef.collection("reports").doc(primaryId).get();
  const dSnap = await companyRef.collection("reports").doc(dupId).get();
  assert.equal(pSnap.data().status, "resolved");
  assert.equal(dSnap.data().status, "resolved");

  const g1 = await companyRef.collection("ops_active_incidents").doc(guardKey1).get();
  const g2 = await companyRef.collection("ops_active_incidents").doc(guardKey2).get();
  assert.equal(g1.exists, false, "Primary guard deleted");
  assert.equal(g2.exists, false, "Duplicate guard deleted");
});

test("8. Ambiguous / different-scope legacy reports remain untouched", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const companyRef = db.collection("companies").doc(COMPANY_ID);

  const primaryId = "rep-main";
  const diffScopeId = "rep-diff-scope";

  await companyRef.collection("reports").doc(primaryId).set({
    id: primaryId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day"
  });

  // Legacy report with different scopeKind (assignment) on same driver/date
  await companyRef.collection("reports").doc(diffScopeId).set({
    id: diffScopeId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "assignment",
    scopeId: "legacy-assignment-scope"
  });

  const res = await apiRequest(`/api/staff/operational-incidents/${primaryId}/resolve`, {
    method: "PUT",
    body: { type: "available_again" }
  });
  assert.equal(res.status, 200);

  const pSnap = await companyRef.collection("reports").doc(primaryId).get();
  const diffSnap = await companyRef.collection("reports").doc(diffScopeId).get();

  assert.equal(pSnap.data().status, "resolved");
  assert.equal(diffSnap.data().status, "open", "Different-scope legacy report must remain open");
});

test("9. Overlapping resolution race: simultaneous resolutions produce 1 audit, compute transactional revisions, and isolate guards", {
  skip: !EMULATOR
}, async () => {
  const today = todayDateStr();
  const companyRef = db.collection("companies").doc(COMPANY_ID);

  const primaryId = "rep-race-primary";
  const dupId = "rep-race-dup";
  const diffGroupId = "rep-race-diff-group";
  const primaryGuardKey = "v1_guard_race_primary_111";
  const dupGuardKey = "v1_guard_race_dup_222";
  const foreignGuardKey = "v1_guard_race_foreign_333";

  // 1. Primary in group 310 (rev 0)
  await companyRef.collection("reports").doc(primaryId).set({
    id: primaryId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day",
    guardKey: primaryGuardKey
  });

  // 2. Exact duplicate in group 310 (rev 2 to test dynamic revision computation)
  await companyRef.collection("reports").doc(dupId).set({
    id: dupId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_310,
    type: "coverage:disruption",
    status: "open",
    revision: 2,
    scopeKind: "day",
    scopeId: "day",
    guardKey: dupGuardKey
  });

  // 3. Different group (320) report on same driver/date
  await companyRef.collection("reports").doc(diffGroupId).set({
    id: diffGroupId,
    driverId: DRIVER_LUKA,
    date: today,
    groupId: GROUP_320,
    type: "coverage:disruption",
    status: "open",
    revision: 0,
    scopeKind: "day",
    scopeId: "day"
  });

  // 4. Guards
  await companyRef.collection("ops_active_incidents").doc(primaryGuardKey).set({
    reportId: primaryId,
    status: "open"
  });
  await companyRef.collection("ops_active_incidents").doc(dupGuardKey).set({
    reportId: dupId,
    status: "open"
  });
  await companyRef.collection("ops_active_incidents").doc(foreignGuardKey).set({
    reportId: "rep-unrelated-other",
    status: "open"
  });

  // Launch 2 simultaneous resolution requests for primaryId over real HTTP
  const [res1, res2] = await Promise.all([
    apiRequest(`/api/staff/operational-incidents/${primaryId}/resolve`, {
      method: "PUT",
      body: { type: "available_again" }
    }),
    apiRequest(`/api/staff/operational-incidents/${primaryId}/resolve`, {
      method: "PUT",
      body: { type: "available_again" }
    })
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  // Exactly one resolution audit entry produced
  const audits = await companyRef.collection("audit_log")
    .where("action", "==", "operational_incident_resolved").get();
  assert.equal(audits.size, 1, "Exactly one resolution audit row committed despite simultaneous requests");

  // Primary resolved with revision 1 (0 + 1)
  const pSnap = await companyRef.collection("reports").doc(primaryId).get();
  assert.equal(pSnap.data().status, "resolved");
  assert.equal(pSnap.data().revision, 1);

  // Secondary resolved with revision 3 (2 + 1), computed from transactional snapshot
  const dSnap = await companyRef.collection("reports").doc(dupId).get();
  assert.equal(dSnap.data().status, "resolved");
  assert.equal(dSnap.data().revision, 3);

  // Different group incident remains open
  const diffSnap = await companyRef.collection("reports").doc(diffGroupId).get();
  assert.equal(diffSnap.data().status, "open");
  assert.equal(diffSnap.data().revision, 0);

  // Relevant guards deleted, foreign guard untouched
  const g1 = await companyRef.collection("ops_active_incidents").doc(primaryGuardKey).get();
  const g2 = await companyRef.collection("ops_active_incidents").doc(dupGuardKey).get();
  const g3 = await companyRef.collection("ops_active_incidents").doc(foreignGuardKey).get();
  assert.equal(g1.exists, false, "Primary guard deleted");
  assert.equal(g2.exists, false, "Duplicate guard deleted");
  assert.equal(g3.exists, true, "Foreign guard remains untouched");
});

test("todayDateStr respects operational timezone across UTC midnight boundaries", () => {
  const simulatedUtcMidnightBoundary = new Date("2026-08-29T22:16:26Z");
  assert.equal(todayDateStr("Europe/Vienna", simulatedUtcMidnightBoundary), "2026-08-30");
  assert.equal(todayDateStr("UTC", simulatedUtcMidnightBoundary), "2026-08-29");
});

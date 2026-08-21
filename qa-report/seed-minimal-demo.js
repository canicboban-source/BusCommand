process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-buscommand-scale" });
const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;

async function main() {
  const companyId = "qa-scale-a";
  const companyRef = db.collection("companies").doc(companyId);
  await companyRef.set({ name: "QA Scale Co", slug: companyId, companyId, status: "active", createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await companyRef.collection("settings").doc("main").set({ status: "active" }, { merge: true });
  await companyRef.collection("groups").doc("310").set({ id: "310", name: "Line 310", description: "", color: "#3D7EF5", active: true }, { merge: true });

  let user;
  try {
    user = await auth.createUser({ email: "dispo.smoke@qa-scale.local", password: "Qa-Scale-Test-9", displayName: "QA Smoke Dispatcher" });
  } catch (e) {
    if (e.code === "auth/email-already-exists") user = await auth.getUserByEmail("dispo.smoke@qa-scale.local");
    else throw e;
  }
  await auth.setCustomUserClaims(user.uid, { role: "dispatcher", companyId, name: "QA Smoke Dispatcher", mustChangeLoginCode: false, groups: ["310"] });
  await companyRef.collection("users").doc(user.uid).set({
    id: user.uid, email: "dispo.smoke@qa-scale.local", name: "QA Smoke Dispatcher", role: "dispatcher",
    companyId, groups: ["310"], active: true, sessionsValidAfterEpoch: 0, createdAt: FieldValue.serverTimestamp()
  }, { merge: true });

  const driverId = "11111111-1111-4111-8111-111111111111";
  await companyRef.collection("drivers").doc(driverId).set({
    firstName: "Smoke", lastName: "Driver", name: "Smoke Driver", phone: "+38160000000",
    email: "smoke.driver@qa-scale.local", postalCode: "11000", groupId: "310", lineId: "310",
    knownGroupIds: ["310"], companyId, active: true, codeActivated: true,
    licenseExpiry: "2027-12-31", cpcExpiry: "", medicalExpiry: "2027-06-30",
    createdAt: FieldValue.serverTimestamp(), personalCodeSetAt: FieldValue.serverTimestamp(), personalCodeSetBy: "seed"
  }, { merge: true });

  await companyRef.collection("buses").doc("bus-smoke-1").set({
    number: "smoke-1", groupId: "310", lineId: "310", groupIds: ["310"], companyId,
    active: true, plate: "", garage: "Depot A", opsStatus: "active", revision: 0,
    createdAt: FieldValue.serverTimestamp(), createdBy: "seed"
  }, { merge: true });

  const planId = "310-310-2026-08-2026-08-01";
  const planRef = companyRef.collection("service_plans").doc(planId);
  const revisionId = `${Date.now()}-seed`;
  const duty = {
    code: "310.S01", dayType: "ALL_DAYS", workStart: "05:00", firstTripStart: "05:20",
    lastTripEnd: "12:40", workEnd: "13:00", endDayOffset: 0,
    startLocation: "Depot A", endLocation: "Depot A",
    activities: [{ dutyCode: "310.S01", sequence: 1, type: "FAHRT", start: "05:20", end: "12:40", line: "310", course: "1", from: "Depot A", to: "Depot A" }]
  };
  await planRef.set({
    id: planId, groupId: "310", templateVersion: "BUSCOMMAND-DIENSTPLAN-1",
    planCode: "310", planVersion: "2026-08", validFrom: "2026-08-01", timezone: "Europe/Belgrade",
    status: "active", revisionId, sourceHash: "seed", sourceFileName: "seed.json",
    sourceContentType: "application/json", sourceByteSize: 10,
    dutyCount: 1, activityCount: 1, overnightDutyCount: 0,
    stagedAt: FieldValue.serverTimestamp(), stagedBy: "seed",
    publishedAt: FieldValue.serverTimestamp(), publishedBy: "seed"
  }, { merge: true });
  await planRef.collection("duties").doc("310.S01").set({ ...duty, revisionId, activityCount: 1 });

  console.log(JSON.stringify({ companyId, driverId, dispatcherUid: user.uid }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

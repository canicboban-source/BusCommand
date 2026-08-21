/**
 * P1-A live regression seed: two active drivers with the identical
 * displayed name "Marko Jovanović", distinct authoritative driver IDs,
 * inside the qa-scale-a company / group 310, written directly to the
 * Firestore emulator with the exact authoritative document shape.
 */
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
  // Authoritative operational timezone source (P1-A): company profile.
  await companyRef.collection("profile").doc("main").set({ country: "RS", timezone: "Europe/Belgrade" }, { merge: true });
  await companyRef.collection("groups").doc("310").set({ id: "310", name: "Line 310", description: "", color: "#3D7EF5", active: true }, { merge: true });

  const planRef = companyRef.collection("service_plans").doc("plan-310-radar-seed");
  const dutyPlan = { code: "310.S01", type: "morning", label: "310.S01", shortName: "S01", start: "05:00", end: "13:00", workStart: "05:00", workEnd: "13:00", activities: [], revisionId: "seed-radar-1" };
  await planRef.set({
    id: "plan-310-radar-seed",
    groupId: "310",
    templateVersion: "v1",
    planCode: "310",
    planVersion: "1",
    validFrom: "2026-01-01",
    timezone: "Europe/Belgrade",
    status: "active",
    revisionId: "seed-radar-1",
    dutyCount: 1,
    activityCount: 0,
    overnightDutyCount: 0,
    publishedAt: FieldValue.serverTimestamp(),
    publishedBy: "seed",
    activatedAt: FieldValue.serverTimestamp(),
    activatedBy: "seed"
  }, { merge: true });
  await planRef.collection("duties").doc("310.S01").set(dutyPlan, { merge: true });

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

  const driverA = "aaaaaaaa-0000-4000-8000-00000000000a";
  const driverB = "bbbbbbbb-0000-4000-8000-00000000000b";
  for (const [id, suffix] of [[driverA, "a"], [driverB, "b"]]) {
    await companyRef.collection("drivers").doc(id).set({
      firstName: "Marko", lastName: "Jovanović", name: "Marko Jovanović",
      phone: `+38160000000${suffix}`, email: `marko.${suffix}@qa-scale.local`, postalCode: "11000",
      groupId: "310", lineId: "310", knownGroupIds: ["310"], companyId, active: true, codeActivated: true,
      licenseExpiry: "2027-12-31", cpcExpiry: "", medicalExpiry: "2027-06-30",
      createdAt: FieldValue.serverTimestamp(), personalCodeSetAt: FieldValue.serverTimestamp(), personalCodeSetBy: "seed"
    }, { merge: true });
  }

  for (const [id, suffix] of [[driverA, "a"], [driverB, "b"]]) {
    await companyRef.collection("buses").doc(`bus-radar-${suffix}`).set({
      number: `radar-${suffix}`, groupId: "310", lineId: "310", groupIds: ["310"], companyId,
      active: true, plate: "", garage: "Depot A", opsStatus: "active", revision: 0,
      createdAt: FieldValue.serverTimestamp(), createdBy: "seed"
    }, { merge: true });
  }

  require("fs").writeFileSync(
    __dirname + "/p1a-radar-live-seed-output.json",
    JSON.stringify({ companyId, driverA, driverB, dispatcherUid: user.uid }, null, 2)
  );
  console.log("WROTE p1a-radar-live-seed-output.json");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

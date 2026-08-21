process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-buscommand-scale" });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function main() {
  const companyId = "qa-scale-a";
  const companyRef = db.collection("companies").doc(companyId);
  const groupId = "310";
  const planId = "310-310-2026-08-2026-08-01";
  const planRef = companyRef.collection("service_plans").doc(planId);
  const revisionId = `p1b-${Date.now()}`;
  const duty = {
    code: "310.S01", dayType: "ALL_DAYS", workStart: "05:00", firstTripStart: "05:20",
    lastTripEnd: "12:40", workEnd: "13:00", endDayOffset: 0,
    startLocation: "Depot A", endLocation: "Depot A",
    activities: [{ dutyCode: "310.S01", sequence: 1, type: "FAHRT", start: "05:20", end: "12:40", line: "310", course: "1", from: "Depot A", to: "Depot A" }]
  };
  await planRef.set({
    id: planId, groupId, templateVersion: "BUSCOMMAND-DIENSTPLAN-1",
    planCode: "310", planVersion: "2026-08", validFrom: "2026-08-01", timezone: "Europe/Belgrade",
    status: "active", revisionId, sourceHash: "p1b", sourceFileName: "p1b.json",
    sourceContentType: "application/json", sourceByteSize: 10,
    dutyCount: 1, activityCount: 1, overnightDutyCount: 0,
    stagedAt: FieldValue.serverTimestamp(), stagedBy: "p1b",
    publishedAt: FieldValue.serverTimestamp(), publishedBy: "p1b"
  }, { merge: true });
  await planRef.collection("duties").doc("310.S01").set({ ...duty, revisionId, activityCount: 1 }, { merge: true });
  console.log("WROTE active duty catalog");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

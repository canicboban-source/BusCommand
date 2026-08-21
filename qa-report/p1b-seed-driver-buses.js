process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-buscommand-scale" });
const db = admin.firestore();

async function main() {
  const companyRef = db.collection("companies").doc("qa-scale-a");
  await companyRef.collection("drivers").doc("aaaaaaaa-0000-4000-8000-00000000000a").set({ bus: "radar-a" }, { merge: true });
  await companyRef.collection("drivers").doc("bbbbbbbb-0000-4000-8000-00000000000b").set({ bus: "radar-b" }, { merge: true });
  console.log("WROTE driver bus defaults");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

/**
 * D24.2 honest fail-first: reproduce the pre-D24.2 CSV/import race.
 *
 * Legacy pattern (removed from production): uniqueness reads OUTSIDE a transaction,
 * then parallel batch writes with different new driver IDs for the same EID.
 * Both can commit → duplicate identity.
 *
 * Exit 1 = race reproduced (expected fail-first).
 * Exit 0 is NOT used — this script must stay red when the race is real.
 */
import admin from "firebase-admin";
import bcrypt from "bcrypt";
import crypto from "crypto";

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
if (!EMULATOR) {
  console.error("FAIL_FIRST_SKIP: FIRESTORE_EMULATOR_HOST not set");
  process.exit(2);
}

const PROJECT_ID = "buscommand-d242-failfirst";
const COMPANY_ID = "d242-ff-import-race";

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

async function seed() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.set({ name: COMPANY_ID });
  await companyRef.collection("settings").doc("main").set({
    status: "active",
    licenseStatus: "active",
    licenseType: "pro",
    maxDrivers: 20
  });
  await companyRef.collection("groups").doc("310").set({ lineId: "310", active: true });
  for (const col of ["drivers", "driver_credentials", "ops"]) {
    const snap = await companyRef.collection(col).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return companyRef;
}

/** Legacy import write: check then batch — not atomic with concurrent writers. */
async function legacyImportCreate(companyRef, eid, email) {
  const profileCol = companyRef.collection("drivers");
  const credentialCol = companyRef.collection("driver_credentials");

  // Non-transactional uniqueness (the pre-D24.2 import hole).
  const existing = await credentialCol.get();
  const eids = new Set(existing.docs.map((d) => String(d.data().eid || "").toLowerCase()));
  if (eids.has(eid.toLowerCase())) {
    const err = new Error("EID_EXISTS");
    err.code = "EID_EXISTS";
    throw err;
  }

  // Overlap window for the sibling request.
  await new Promise((r) => setTimeout(r, 120));

  const driverId = crypto.randomUUID();
  const batch = db.batch();
  const createdAt = FieldValue.serverTimestamp();
  batch.set(profileCol.doc(driverId), {
    firstName: "Race",
    lastName: "Import",
    email,
    groupId: "310",
    companyId: COMPANY_ID,
    active: true,
    createdAt
  });
  batch.set(credentialCol.doc(driverId), {
    eid,
    loginCodeHash: await bcrypt.hash("12345", 4),
    createdAt
  });
  await batch.commit();
  return driverId;
}

const companyRef = await seed();
const eid = "EID-FAIL-FIRST-IMPORT";
const settled = await Promise.allSettled([
  legacyImportCreate(companyRef, eid, "ff1@d242.local"),
  legacyImportCreate(companyRef, eid, "ff2@d242.local")
]);
const ok = settled.filter((r) => r.status === "fulfilled");
const profiles = await companyRef.collection("drivers").get();
const creds = await companyRef.collection("driver_credentials").get();
const eids = creds.docs.map((d) => d.data().eid);

const report = {
  proof: "D24.2 fail-first parallel import same EID without guard tx",
  fulfilled: ok.length,
  rejected: settled.length - ok.length,
  profileCount: profiles.size,
  credentialCount: creds.size,
  eids,
  raceDuplicated: profiles.size >= 2 && creds.size >= 2
};

console.log(JSON.stringify(report, null, 2));

if (report.raceDuplicated) {
  console.error("FAIL_FIRST_EXPECTED: import race duplicated EID without guard tx (EXIT 1)");
  process.exit(1);
}

console.error("FAIL_FIRST_UNEXPECTED: race did not reproduce");
process.exit(3);

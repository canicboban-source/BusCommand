#!/usr/bin/env node
/**
 * Seed buses + ensure timezone for live ops/incident testing on bc-test / group 320.
 * Requires firebase-admin-key.json in project root. Never commit secrets.
 *
 * Usage: node scripts/seed-group-320-ops.js
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const KEY = path.join(ROOT, "firebase-admin-key.json");
const COMPANY_ID = "bc-test";
const GROUP_ID = "320";
const BUSES = ["32001", "32002", "32003"];

if (!fs.existsSync(KEY)) {
  console.error("Missing firebase-admin-key.json");
  process.exit(1);
}

const admin = require("firebase-admin");
const serviceAccount = require(KEY);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function main() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  if (!(await companyRef.get()).exists) {
    throw new Error(`Company ${COMPANY_ID} missing`);
  }

  await companyRef.collection("profile").doc("main").set({
    timezone: "Europe/Vienna",
    country: "AT",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const groupRef = companyRef.collection("groups").doc(GROUP_ID);
  if (!(await groupRef.get()).exists) {
    throw new Error(`Group ${GROUP_ID} missing`);
  }

  // Keep dispatcher Firestore groups aligned with claims (310+320).
  const packPath = path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    "Desktop",
    "BusCommand-Test-Nalozi",
    "test-nalozi.json"
  );
  if (fs.existsSync(packPath)) {
    const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
    const dispEmail = String(pack.accounts?.dispatcher?.email || "").trim().toLowerCase();
    if (dispEmail) {
      const users = await companyRef.collection("users").where("email", "==", dispEmail).limit(1).get();
      if (!users.empty) {
        await users.docs[0].ref.set({
          groups: ["310", "320"],
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`synced dispatcher groups for ${dispEmail}`);
      }
    }
  }

  for (const number of BUSES) {
    const existing = await companyRef.collection("buses").where("number", "==", number).limit(1).get();
    if (!existing.empty) {
      const ref = existing.docs[0].ref;
      const data = existing.docs[0].data() || {};
      const groupIds = Array.isArray(data.groupIds) ? [...data.groupIds] : [];
      if (!groupIds.includes(GROUP_ID)) groupIds.push(GROUP_ID);
      await ref.set({
        number,
        active: true,
        groupIds,
        groupId: data.groupId || GROUP_ID,
        lineId: data.lineId || GROUP_ID,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`updated bus ${number}`);
      continue;
    }
    await companyRef.collection("buses").doc().set({
      number,
      active: true,
      groupIds: [GROUP_ID],
      groupId: GROUP_ID,
      lineId: GROUP_ID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`created bus ${number}`);
  }

  console.log("OK — timezone Europe/Vienna + buses for group 320");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

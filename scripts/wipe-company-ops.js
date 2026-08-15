#!/usr/bin/env node
/**
 * Wipe operational Firestore data for a soft-pilot company so CA can start from zero.
 * Keeps: company doc, Auth users, company users/*, settings/main feature flags.
 *
 * Usage:
 *   node scripts/wipe-company-ops.js --company bc-test --yes
 */
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
const SERVICE_ACCOUNT_PATH = path.join(ROOT, "firebase-admin-key.json");

const TOP_LEVEL_COLLECTIONS = [
  "drivers",
  "driver_credentials",
  "groups",
  "buses",
  "routes",
  "shifts",
  "schedules",
  "messages",
  "reports",
  "vacations",
  "lost_items",
  "service_plans",
  "audit_log",
  "confirmation_outbox"
];

function parseArgs(argv) {
  const companyIdx = argv.indexOf("--company");
  return {
    companyId: companyIdx >= 0 && argv[companyIdx + 1] ? String(argv[companyIdx + 1]).trim() : "bc-test",
    yes: argv.includes("--yes")
  };
}

function ensureAdmin() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error("Nedostaje firebase-admin-key.json");
    process.exit(1);
  }
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });
  }
  return admin;
}

async function deleteQueryBatch(db, query, batchSize = 400) {
  const snap = await query.limit(batchSize).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function deleteCollection(db, ref) {
  let total = 0;
  for (;;) {
    const removed = await deleteQueryBatch(db, ref);
    total += removed;
    if (removed === 0) break;
  }
  return total;
}

async function wipeServicePlans(db, companyRef) {
  const plans = await companyRef.collection("service_plans").get();
  let total = 0;
  for (const planDoc of plans.docs) {
    total += await deleteCollection(db, planDoc.ref.collection("duties"));
    await planDoc.ref.delete();
    total += 1;
  }
  return total;
}

async function clearDispatcherGroupAssignments(admin, db, companyRef) {
  const users = await companyRef.collection("users").get();
  let updated = 0;
  for (const doc of users.docs) {
    const data = doc.data() || {};
    if (data.role !== "dispatcher" && data.role !== "company_admin") continue;
    if (data.role === "dispatcher") {
      await doc.ref.set({
        groups: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  const { companyId, yes } = parseArgs(process.argv.slice(2));
  if (!yes) {
    console.error("Refusing to wipe without --yes");
    console.error(`Example: node scripts/wipe-company-ops.js --company ${companyId} --yes`);
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(companyId)) {
    console.error("Invalid company id");
    process.exit(1);
  }

  const admin = ensureAdmin();
  const db = admin.firestore();
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    console.error(`Company ${companyId} does not exist.`);
    process.exit(1);
  }

  console.log(`\nWiping operational data for ${companyId}…`);
  const counts = {};

  for (const name of TOP_LEVEL_COLLECTIONS) {
    if (name === "service_plans") {
      counts[name] = await wipeServicePlans(db, companyRef);
      continue;
    }
    counts[name] = await deleteCollection(db, companyRef.collection(name));
  }

  await companyRef.collection("settings").doc("sos").delete().catch(() => {});
  await companyRef.collection("branding").doc("main").set({
    name: "",
    primaryColor: "#2563EB",
    logo: null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  counts.dispatcher_group_clear = await clearDispatcherGroupAssignments(admin, db, companyRef);

  console.log("Deleted / reset:");
  Object.entries(counts).forEach(([key, value]) => console.log(`  ${key}: ${value}`));
  console.log("\nKept: company doc, Auth users, users/*, settings/main");
  console.log("Next: CA logs in, creates groups, imports drivers + Fahrplan from zero.");
  console.log("Hard-refresh the browser (or clear site data) so local cache is empty.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

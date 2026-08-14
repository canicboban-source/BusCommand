#!/usr/bin/env node
// ============================================================
// BusCommand — Postavi Firebase custom claims
// Upotreba:
//   node scripts/set-claims.js <uid> superadmin
//   node scripts/set-claims.js <uid> dispatcher acme "Hans Müller"
//   node scripts/set-claims.js <uid> company_admin acme "Ana Kovač"
// ============================================================

const path = require("path");
const fs   = require("fs");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "..", "firebase-admin-key.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("\n❌ firebase-admin-key.json nije pronađen.\n");
  process.exit(1);
}

const admin = require("firebase-admin");
const serviceAccount = require(SERVICE_ACCOUNT_PATH);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const uid       = process.argv[2];
const role      = process.argv[3];
const companyId = process.argv[4] || null;
const name      = process.argv[5] || null;

const validRoles = ["superadmin", "company_admin", "dispatcher", "driver"];

if (!uid || !role || !validRoles.includes(role)) {
  console.error("Upotreba:");
  console.error("  node scripts/set-claims.js <uid> superadmin");
  console.error("  node scripts/set-claims.js <uid> dispatcher <companyId> [ime]");
  console.error("  node scripts/set-claims.js <uid> company_admin <companyId> [ime]");
  process.exit(1);
}

if (role !== "superadmin" && !companyId) {
  console.error("companyId je obavezan za ulogu:", role);
  process.exit(1);
}

async function run() {
  const claims = { role };
  if (companyId) claims.companyId = companyId;
  if (name) claims.name = name;

  await admin.auth().setCustomUserClaims(uid, claims);

  console.log("");
  console.log("✅ Custom claims postavljeni:");
  console.log("   UID:  ", uid);
  console.log("   Role: ", role);
  if (companyId) console.log("   Firma:", companyId);
  if (name)      console.log("   Ime:  ", name);
  console.log("");
  console.log("   Korisnik mora da se odjavi i ponovo prijavi da vidi nove claims.");
  console.log("");
}

run().catch(err => {
  console.error("Greška:", err.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Create a temporary Super Admin for Preview testing.
 *
 * Requires: firebase-admin-key.json in project root (gitignored).
 * Usage:
 *   node scripts/create-test-superadmin.js
 *   node scripts/create-test-superadmin.js sa.test@buscommand.local 'YourTempPass123!'
 *
 * Prints credentials once. Change or delete the user after testing.
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "..", "firebase-admin-key.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("\nfirebase-admin-key.json nije pronađen u root-u projekta.");
  console.error("Firebase Console → Project settings → Service accounts → Generate new private key");
  console.error("Sačuvaj kao: firebase-admin-key.json (već je u .gitignore)\n");
  process.exit(1);
}

const admin = require("firebase-admin");
const serviceAccount = require(SERVICE_ACCOUNT_PATH);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const email = String(process.argv[2] || "sa.test@buscommand.local").trim().toLowerCase();
const password = String(process.argv[3] || `BcSa-${crypto.randomBytes(6).toString("base64url")}!`);
const displayName = "Test Super Admin";

async function main() {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password, displayName, emailVerified: true });
    console.log("Postojeći korisnik ažuriran (nova lozinka).");
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    user = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true
    });
    console.log("Novi korisnik kreiran.");
  }

  await admin.auth().setCustomUserClaims(user.uid, {
    role: "superadmin",
    name: displayName,
    mustChangeLoginCode: false
  });

  console.log("");
  console.log("=== Test Super Admin (Preview) ===");
  console.log("Email:   ", email);
  console.log("Password:", password);
  console.log("UID:     ", user.uid);
  console.log("Claims:  ", { role: "superadmin" });
  console.log("");
  console.log("Login: https://buscommand-preview.onrender.com/staff.html");
  console.log("       logo 5× → email + lozinka (ne PIN)");
  console.log("Posle testa: obriši nalog u Firebase Auth ili promeni lozinku.");
  console.log("");
}

main().catch((err) => {
  console.error("Greška:", err.message);
  process.exit(1);
});

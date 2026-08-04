#!/usr/bin/env node
// ============================================================
// BusCommand — Kreiranje prve firme u Firestore (produkcija)
// Upotreba: node scripts/setup-company.js <companyId> <naziv>
//           npm run setup -- demo-firma "Demo Firma GmbH"
// ============================================================

const path = require("path");
const fs   = require("fs");
const bcrypt = require("bcrypt");

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "..", "firebase-admin-key.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("\n❌ firebase-admin-key.json nije pronađen.");
  console.error("   Vidi SETUP-FIREBASE.md — korak 6.\n");
  process.exit(1);
}

const admin = require("firebase-admin");
const serviceAccount = require(SERVICE_ACCOUNT_PATH);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const companyId = (process.argv[2] || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
const name      = process.argv[3] || companyId;

if (!companyId) {
  console.error("Upotreba: node scripts/setup-company.js <companyId> <naziv>");
  console.error("Primjer:  node scripts/setup-company.js acme \"Acme Transit\"");
  process.exit(1);
}

async function setup() {
  const ref = db.collection("companies").doc(companyId);
  const exists = (await ref.get()).exists;

  if (exists) {
    console.error(`Firma "${companyId}" već postoji u Firestore.`);
    process.exit(1);
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);

  await ref.collection("profile").doc("main").set({
    name,
    slug: companyId,
    country: "AT",
    contactEmail: `admin@${companyId}.com`,
    timezone: "Europe/Vienna",
    defaultLanguage: "de",
    status: "active",
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await ref.collection("branding").doc("main").set({
    name,
    primaryColor: "#3b82f6",
    logo: null,
    appTitle: name + " Fleet"
  });

  await ref.collection("settings").doc("main").set({
    plan: "trial",
    status: "active",
    maxDrivers: 50,
    maxDispatchers: 5,
    trialEndsAt: admin.firestore.Timestamp.fromDate(trialEnd),
    features: {
      liveMap: true,
      liveGps: false,
      pdfSchedules: true,
      excelImport: true,
      sosAlarm: true,
      multiLanguage: true,
      reports: true,
      supportSession: false,
      shiftConfirmationScheduler: false
    }
  });

  await ref.collection("settings").doc("sos").set({
    sosActive: false, sosDriver: "", sosBus: ""
  });

  // Demo vozač za test
  const pinHash = await bcrypt.hash("1234", 12);
  await ref.collection("drivers").doc("drv-1").set({
    id: "drv-1",
    name: "Test Vozač",
    pin: pinHash,
    bus: "101",
    groupId: "default",
    companyId,
    active: true
  });

  console.log("");
  console.log("✅ Firma kreirana:", companyId);
  console.log("   Naziv:", name);
  console.log("   Trial do:", trialEnd.toISOString().slice(0, 10));
  console.log("");
  console.log("   Otvori: http://localhost:8766/?mode=production&company=" + companyId);
  console.log("   Test vozač: Test Vozač / PIN 1234");
  console.log("");
  console.log("   Sledeći korak: kreiraj Firebase Auth korisnika (dispečer/admin)");
  console.log("   i postavi custom claims: { role, companyId }");
  console.log("");
}

setup().catch(err => {
  console.error("Greška:", err.message);
  process.exit(1);
});

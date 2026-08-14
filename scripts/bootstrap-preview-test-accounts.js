#!/usr/bin/env node
/**
 * Bootstrap Preview soft-pilot tenant + accounts (SA, CA, dispatcher).
 *
 * Soft-pilot defaults (P9):
 *   - supportSession OFF
 *   - shiftConfirmationScheduler OFF
 *   - does not configure real SMS / live GPS
 *
 * Requires: firebase-admin-key.json in project root (gitignored).
 *
 * Usage:
 *   node scripts/bootstrap-preview-test-accounts.js
 *   node scripts/bootstrap-preview-test-accounts.js --out "C:/Users/cane/Desktop/BusCommand-Test-Nalozi"
 *   node scripts/bootstrap-preview-test-accounts.js --enable-support-session
 *   node scripts/bootstrap-preview-test-accounts.js --seed-group
 *
 * Idempotent for Auth users (updates password + claims). Company is created if missing.
 * Credential pack is written OUTSIDE the repo — never commit it.
 */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const SERVICE_ACCOUNT_PATH = path.join(ROOT, "firebase-admin-key.json");

function parseArgs(argv) {
  const outIdx = argv.indexOf("--out");
  const outDir = outIdx >= 0 && argv[outIdx + 1]
    ? path.resolve(argv[outIdx + 1])
    : path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "Desktop", "BusCommand-Test-Nalozi");
  return {
    outDir,
    enableSupportSession: argv.includes("--enable-support-session"),
    seedGroup: argv.includes("--seed-group")
  };
}

function randomPass(prefix) {
  return `${prefix}-${crypto.randomBytes(5).toString("base64url")}!`;
}

function ensureAdmin() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error("\nNedostaje firebase-admin-key.json u root-u projekta.");
    console.error("Firebase Console → Project settings → Service accounts → Generate new private key");
    console.error(`Sačuvaj kao:\n  ${SERVICE_ACCOUNT_PATH}\n`);
    process.exit(1);
  }
  const admin = require("firebase-admin");
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin;
}

async function upsertAuthUser(admin, { email, password, displayName, claims }) {
  let user;
  let created = false;
  try {
    user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, {
      password,
      displayName,
      emailVerified: true,
      disabled: false
    });
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    user = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: true
    });
    created = true;
  }
  await admin.auth().setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, email, created, claims };
}

async function ensureCompany(admin, db, companyId, companyName, { enableSupportSession, seedGroup }) {
  const { createCompanyAtomic } = require("../server/provisioning");
  const companyRef = db.collection("companies").doc(companyId);
  const exists = (await companyRef.get()).exists;
  if (!exists) {
    await createCompanyAtomic({
      db,
      admin,
      companyId,
      name: companyName,
      country: "AT",
      contactEmail: `admin@${companyId}.test`,
      actorId: "bootstrap-script"
    });
  }

  const settingsRef = companyRef.collection("settings").doc("main");
  const settingsSnap = await settingsRef.get();
  const features = {
    ...(settingsSnap.data()?.features || {}),
    supportSession: enableSupportSession === true,
    shiftConfirmationScheduler: false,
    liveGps: false
  };
  await settingsRef.set({
    features,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  let groupId = null;
  if (seedGroup === true) {
    groupId = "310";
    await companyRef.collection("groups").doc(groupId).set({
      id: groupId,
      name: "Linie 310",
      description: "Test grupa (bootstrap --seed-group)",
      color: "#3b82f6",
      active: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  return {
    companyId,
    companyName,
    groupId,
    created: !exists,
    supportSession: features.supportSession === true,
    shiftConfirmationScheduler: false
  };
}

async function ensureStaffDoc(admin, db, companyId, user) {
  const ref = db.collection("companies").doc(companyId).collection("users").doc(user.uid);
  await ref.set({
    id: user.uid,
    email: user.email,
    name: user.claims.name,
    role: user.claims.role,
    companyId,
    groups: user.claims.groups || [],
    active: true,
    sessionsValidAfterEpoch: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

function writePack(outDir, pack) {
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "test-nalozi.json");
  const mdPath = path.join(outDir, "TEST-NALOZI.md");
  const txtPath = path.join(outDir, "test-nalozi.txt");

  fs.writeFileSync(jsonPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

  const md = `# BusCommand Preview — soft-pilot test nalozi

**Generisano:** ${pack.generatedAt}
**Firebase projekat:** ${pack.projectId}
**Live:** ${pack.urls.staff}
**Režim:** soft pilot (P9)

> Privatan fajl. Ne commituj. Ne šalji u javni chat ako nije potrebno.

## Soft-pilot ograničenja

- SMS: \`none\` u produkciji (nema realnog SMS-a)
- Live GPS: OFF
- \`supportSession\`: **${pack.company.supportSession ? "ON" : "OFF"}**
- \`shiftConfirmationScheduler\`: **OFF**
- Scheduler cron: ne uključuj bez \`CONFIRMATION_JOB_SECRET\` na Render web+cron

## Firma

| Polje | Vrednost |
|-------|----------|
| companyId | \`${pack.company.companyId}\` |
| Naziv | ${pack.company.companyName} |
| Grupa | ${pack.company.groupId || "(prazno — CA kreira)"} |
| supportSession | **${pack.company.supportSession ? "ON" : "OFF"}** |
| shiftConfirmationScheduler | **OFF** |

## Nalozi

| Uloga | Email | Lozinka |
|-------|-------|---------|
| Super Admin | \`${pack.accounts.superadmin.email}\` | \`${pack.accounts.superadmin.password}\` |
| Company Admin | \`${pack.accounts.company_admin.email}\` | \`${pack.accounts.company_admin.password}\` |
| Dispečer | \`${pack.accounts.dispatcher.email}\` | \`${pack.accounts.dispatcher.password}\` |

## Kako se ulogovati

1. Otvori ${pack.urls.staff}
2. **SA:** klik na logo **5×** → email + lozinka (ne PIN)
3. **CA / Dispo:** tab Disponent / Firma → email + lozinka
4. **Vozač:** CA import CSV → aktivacija OTP (SMS stub/none — vidi runbook)

## L7 support session (opciono)

Pokreni bootstrap sa \`--enable-support-session\` samo za kontrolisani L7 test, pa vrati flag na \`false\`.
`;

  fs.writeFileSync(mdPath, md, "utf8");

  const txt = [
    "BusCommand Preview — soft-pilot test nalozi",
    `Generisano: ${pack.generatedAt}`,
    "",
    `companyId: ${pack.company.companyId}`,
    `supportSession: ${pack.company.supportSession}`,
    "shiftConfirmationScheduler: false",
    "",
    `SA:  ${pack.accounts.superadmin.email} / ${pack.accounts.superadmin.password}`,
    `CA:  ${pack.accounts.company_admin.email} / ${pack.accounts.company_admin.password}`,
    `Dispo: ${pack.accounts.dispatcher.email} / ${pack.accounts.dispatcher.password}`,
    "",
    pack.urls.staff,
    ""
  ].join("\n");
  fs.writeFileSync(txtPath, txt, "utf8");

  return { jsonPath, mdPath, txtPath };
}

async function main() {
  const { outDir, enableSupportSession, seedGroup } = parseArgs(process.argv.slice(2));
  const admin = ensureAdmin();
  const db = admin.firestore();
  const projectId = serviceAccountProjectId();

  const companyId = "bc-test";
  const companyName = "BusCommand Test GmbH";

  const passwords = {
    superadmin: randomPass("SaTest"),
    company_admin: randomPass("CaTest"),
    dispatcher: randomPass("DispTest")
  };

  const company = await ensureCompany(admin, db, companyId, companyName, { enableSupportSession, seedGroup });
  const dispatcherGroups = company.groupId ? [company.groupId] : [];

  const sa = await upsertAuthUser(admin, {
    email: "sa.test@buscommand.local",
    password: passwords.superadmin,
    displayName: "Test Super Admin",
    claims: { role: "superadmin", name: "Test Super Admin", mustChangeLoginCode: false }
  });

  const ca = await upsertAuthUser(admin, {
    email: "ca.test@bc-test.local",
    password: passwords.company_admin,
    displayName: "Test Company Admin",
    claims: {
      role: "company_admin",
      companyId,
      name: "Test Company Admin",
      mustChangeLoginCode: false
    }
  });
  await ensureStaffDoc(admin, db, companyId, ca);

  const disp = await upsertAuthUser(admin, {
    email: "disp.test@bc-test.local",
    password: passwords.dispatcher,
    displayName: "Test Dispatcher",
    claims: {
      role: "dispatcher",
      companyId,
      groups: dispatcherGroups,
      name: "Test Dispatcher",
      mustChangeLoginCode: false
    }
  });
  await ensureStaffDoc(admin, db, companyId, disp);

  const pack = {
    generatedAt: new Date().toISOString(),
    projectId,
    pilotMode: "soft",
    urls: {
      staff: "https://buscommand.com/staff.html",
      driver: "https://buscommand.com/driver.html"
    },
    company,
    accounts: {
      superadmin: { ...sa, password: passwords.superadmin },
      company_admin: { ...ca, password: passwords.company_admin },
      dispatcher: { ...disp, password: passwords.dispatcher }
    },
    notes: [
      "Local demo PINs do NOT work on live Preview.",
      "Soft pilot: supportSession and shiftConfirmationScheduler default OFF.",
      "Use --enable-support-session only for controlled L7 smoke.",
      "Delete or rotate these accounts after testing.",
      "Never commit Desktop credential pack."
    ]
  };

  const written = writePack(outDir, pack);

  console.log("");
  console.log("OK — soft-pilot test nalozi kreirani.");
  console.log("Firma:", company.companyId, company.created ? "(nova)" : "(postojeća)");
  console.log("Flags: supportSession=", company.supportSession, "scheduler=false");
  console.log("SA:   ", sa.email, passwords.superadmin);
  console.log("CA:   ", ca.email, passwords.company_admin);
  console.log("Dispo:", disp.email, passwords.dispatcher);
  console.log("");
  console.log("Spakovano (van repo):");
  console.log(" ", written.mdPath);
  console.log(" ", written.txtPath);
  console.log(" ", written.jsonPath);
  console.log("");
}

function serviceAccountProjectId() {
  try {
    return require(SERVICE_ACCOUNT_PATH).project_id || "buscommand-preview";
  } catch {
    return "buscommand-preview";
  }
}

main().catch((err) => {
  console.error("Greška:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});

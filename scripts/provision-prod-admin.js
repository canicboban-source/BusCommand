#!/usr/bin/env node
/**
 * BusCommand — kreira produkcijske admin naloge u Firebase Auth + Firestore.
 * Upotreba:
 *   node scripts/provision-prod-admin.js
 *   node scripts/provision-prod-admin.js --company buscommand
 *
 * Zahteva: firebase-admin-key.json u root-u ILI env FIREBASE_SERVICE_ACCOUNT_JSON
 * Rezultat: NOTES-ACCESS.local.md (gitignored)
 */

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const ROOT = path.join(__dirname, "..");
const SERVICE_ACCOUNT_PATH = path.join(ROOT, "firebase-admin-key.json");
const NOTES_PATH = path.join(ROOT, "NOTES-ACCESS.local.md");

function loadServiceAccount(keyPath) {
  const filePath = keyPath || SERVICE_ACCOUNT_PATH;
  if (fs.existsSync(filePath)) {
    return require(filePath);
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || !String(raw).trim()) return null;
  return JSON.parse(raw);
}

function genPassword() {
  return "BC!" + crypto.randomBytes(20).toString("base64url") + "9#";
}

function parseArgs() {
  const args = process.argv.slice(2);
  let companyId = "buscommand";
  let keyPath = null;
  let secretsPath = path.join(ROOT, "NOTES-secrets.local.json");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--company" && args[i + 1]) {
      companyId = args[i + 1].toLowerCase().replace(/[^a-z0-9-]/g, "");
      i++;
    } else if (args[i] === "--key" && args[i + 1]) {
      keyPath = args[i + 1];
      i++;
    } else if (args[i] === "--secrets" && args[i + 1]) {
      secretsPath = args[i + 1];
      i++;
    }
  }
  return { companyId, keyPath, secretsPath };
}

function loadAccounts(secretsPath, companyId) {
  if (fs.existsSync(secretsPath)) {
    const raw = JSON.parse(fs.readFileSync(secretsPath, "utf8"));
    const cid = raw.companyId || companyId;
    return {
      companyId: cid,
      superadmin: {
        email: raw.superadmin.email,
        name: raw.superadmin.name,
        password: raw.superadmin.password,
        role: "superadmin",
        claims: { role: "superadmin", name: raw.superadmin.name }
      },
      companyAdmin: {
        email: raw.companyAdmin.email,
        name: raw.companyAdmin.name,
        password: raw.companyAdmin.password,
        role: "company_admin",
        claims: { role: "company_admin", companyId: cid, name: raw.companyAdmin.name }
      },
      dispatcher: {
        email: raw.dispatcher.email,
        name: raw.dispatcher.name,
        password: raw.dispatcher.password,
        role: "dispatcher",
        claims: {
          role: "dispatcher",
          companyId: cid,
          name: raw.dispatcher.name,
          groups: raw.dispatcher.groups || ["101"]
        },
        groups: raw.dispatcher.groups || ["101"]
      }
    };
  }

  return {
    companyId,
    superadmin: {
      email: "cane.owner@buscommand.com",
      name: "Cane BusCommand Owner",
      password: genPassword(),
      role: "superadmin",
      claims: { role: "superadmin", name: "Cane BusCommand Owner" }
    },
    companyAdmin: {
      email: "cane.admin@buscommand.com",
      name: "Cane Company Admin",
      password: genPassword(),
      role: "company_admin",
      claims: { role: "company_admin", companyId, name: "Cane Company Admin" }
    },
    dispatcher: {
      email: "cane.dispo@buscommand.com",
      name: "Cane Dispatcher",
      password: genPassword(),
      role: "dispatcher",
      claims: {
        role: "dispatcher",
        companyId,
        name: "Cane Dispatcher",
        groups: ["101"]
      },
      groups: ["101"]
    }
  };
}

async function ensureCompany(db, admin, companyId, name) {
  const ref = db.collection("companies").doc(companyId);
  if ((await ref.get()).exists) {
    console.log("  Firma postoji:", companyId);
    return;
  }

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 365);

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
    name: "BusCommand",
    primaryColor: "#3D7EF5",
    logo: null,
    appTitle: "BusCommand"
  });

  await ref.collection("settings").doc("main").set({
    plan: "trial",
    status: "active",
    maxDrivers: 100,
    maxDispatchers: 20,
    trialEndsAt: admin.firestore.Timestamp.fromDate(trialEnd),
    features: {
      liveMap: true,
      pdfSchedules: true,
      excelImport: true,
      sosAlarm: true,
      multiLanguage: true,
      reports: true
    }
  });

  await ref.collection("settings").doc("sos").set({
    sosActive: false,
    sosDriver: "",
    sosBus: ""
  });

  await ref.collection("groups").doc("101").set({
    id: "101",
    name: "Line 101",
    color: "#3D7EF5",
    active: true,
    companyId
  });

  const pinHash = await bcrypt.hash("1234", 12);
  await ref.collection("drivers").doc("drv-1").set({
    id: "drv-1",
    name: "Alex Driver",
    pin: pinHash,
    bus: "101",
    groupId: "101",
    lineId: "101",
    companyId,
    active: true
  });

  console.log("  Firma kreirana:", companyId);
}

async function upsertAuthUser(admin, { email, password, displayName, claims }) {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(user.uid, { password, displayName });
    console.log("  Auth korisnik ažuriran:", email);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw err;
    user = await admin.auth().createUser({ email, password, displayName });
    console.log("  Auth korisnik kreiran:", email);
  }
  await admin.auth().setCustomUserClaims(user.uid, claims);
  return user;
}

async function writeFirestoreUser(db, admin, companyId, uid, doc) {
  await db.collection("companies").doc(companyId)
    .collection("users").doc(uid).set({
      ...doc,
      id: uid,
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function writeCompanyAdmin(db, admin, companyId, uid, doc) {
  await db.collection("companies").doc(companyId)
    .collection("company_admins").doc(uid).set({
      ...doc,
      id: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}

async function main() {
  const { companyId: argCompanyId, keyPath, secretsPath } = parseArgs();
  const serviceAccount = loadServiceAccount(keyPath);
  if (!serviceAccount) {
    console.error("\n❌ Nema Firebase Admin ključa.");
    console.error("   Stavi firebase-admin-key.json u root ili postavi FIREBASE_SERVICE_ACCOUNT_JSON.");
    console.error("   Ili: node scripts/provision-prod-admin.js --key C:\\path\\to\\firebase-admin-key.json\n");
    process.exit(1);
  }

  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const db = admin.firestore();
  const loaded = loadAccounts(secretsPath, argCompanyId);
  const companyId = loaded.companyId;
  const companyName = "BusCommand";
  const accounts = {
    superadmin: loaded.superadmin,
    companyAdmin: loaded.companyAdmin,
    dispatcher: loaded.dispatcher
  };

  console.log("\nBusCommand — provision produkcijskih naloga\n");
  await ensureCompany(db, admin, companyId, companyName);

  const saUser = await upsertAuthUser(admin, accounts.superadmin);
  const caUser = await upsertAuthUser(admin, accounts.companyAdmin);
  await writeCompanyAdmin(db, admin, companyId, caUser.uid, {
    email: accounts.companyAdmin.email,
    name: accounts.companyAdmin.name,
    companyId,
    role: "company_admin"
  });

  const dispUser = await upsertAuthUser(admin, accounts.dispatcher);
  await writeFirestoreUser(db, admin, companyId, dispUser.uid, {
    email: accounts.dispatcher.email,
    name: accounts.dispatcher.name,
    role: "dispatcher",
    companyId,
    groups: accounts.dispatcher.groups,
    passwordChanged: true
  });

  const notes = `# BusCommand — pristupni podaci (LOKALNO — ne commituj)

Generisano: ${new Date().toISOString()}
Firebase projekat: ${serviceAccount.project_id || "(nepoznat)"}
Firma (companyId): \`${companyId}\`

---

## Super Admin (ceo sistem)

| Polje | Vrednost |
|-------|----------|
| **Email** | \`${accounts.superadmin.email}\` |
| **Lozinka** | \`${accounts.superadmin.password}\` |
| **Ime** | ${accounts.superadmin.name} |
| **UID** | \`${saUser.uid}\` |

**Login:** https://buscommand.com/?mode=production&company=${companyId}  
Klikni logo **5×** → unesi email i lozinku u Super Admin modal.

---

## Company Admin (firma ${companyId})

| Polje | Vrednost |
|-------|----------|
| **Email** | \`${accounts.companyAdmin.email}\` |
| **Lozinka** | \`${accounts.companyAdmin.password}\` |
| **Ime** | ${accounts.companyAdmin.name} |
| **UID** | \`${caUser.uid}\` |

**Login:** Disponent / Firma tab → email + lozinka.

---

## Dispečer (Linija 101)

| Polje | Vrednost |
|-------|----------|
| **Email** | \`${accounts.dispatcher.email}\` |
| **Lozinka** | \`${accounts.dispatcher.password}\` |
| **Ime** | ${accounts.dispatcher.name} |
| **Grupe** | 101 |
| **UID** | \`${dispUser.uid}\` |

**Login:** Disponent / Firma tab → email + lozinka.

---

## Test vozač (PIN)

| Polje | Vrednost |
|-------|----------|
| **Ime** | Alex Driver |
| **PIN** | 1234 |
| **companyId** | ${companyId} |

**Login:** Fahrer tab (produkcija + Firebase na serveru).

---

## Render / produkcija — OBAVEZNO

Live trenutno: \`GET /api/config\` → \`firebase: false\` dok ne postaviš:

\`\`\`env
FIREBASE_SERVICE_ACCOUNT_JSON=<ceo JSON iz firebase-admin-key.json, jedna linija>
CORS_ORIGINS=https://buscommand.com,https://www.buscommand.com
NODE_ENV=production
\`\`\`

Posle redeploy-a proveri:
\`\`\`powershell
Invoke-RestMethod https://buscommand.com/api/config
\`\`\`
Očekuj: \`"firebase": true\`, \`"mode": "production"\`.

---

## Napomena

- Korisnik mora **logout/login** posle promene claims.
- Demo mod i dalje: https://buscommand.com/?mode=demo
- Ovaj fajl je u .gitignore — drži ga sigurno.
`;

  fs.writeFileSync(NOTES_PATH, notes, "utf8");

  console.log("");
  console.log("✅ Gotovo.");
  console.log("   Podaci sačuvani u:", NOTES_PATH);
  console.log("");
  console.log("   Super Admin:  ", accounts.superadmin.email);
  console.log("   Company Admin:", accounts.companyAdmin.email);
  console.log("   Dispečer:     ", accounts.dispatcher.email);
  console.log("");
  console.log("   Lozinke su u NOTES fajlu — otvori ga lokalno.");
  console.log("");
}

main().catch((err) => {
  console.error("Greška:", err.message);
  process.exit(1);
});

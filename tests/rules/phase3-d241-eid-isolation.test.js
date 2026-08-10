/**
 * FAZA 3 D24.1 — EID isolation: Rules fail-closed + CA create/list ops (emulator).
 * Requires FIRESTORE_EMULATOR_HOST (npm run test:rules).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const admin = require("firebase-admin");
const {
  createManualCompanyDriver,
  listCompanyDriversForAdmin,
  profileHasCredentialFields
} = require("../../server/company-admin-driver-ops");
const {
  buildMigrationPlan,
  CREDENTIAL_FIELDS,
  migrateCompany
} = require("../../server/driver-credential-migration");
const { sanitizeDetails } = require("../../server/audit-log");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-d241-eid";
const RULES = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");

let env;
let adminApp;
let db;

function claims(role, companyId) {
  return { role, companyId, mustChangeLoginCode: false, auth_time: 1 };
}

function tenantDoc(fdb, companyId, collection, id) {
  return fdb.collection("companies").doc(companyId).collection(collection).doc(id);
}

test.before(async () => {
  if (!EMULATOR) return;
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES }
  });
  adminApp = admin.initializeApp({ projectId: `${PROJECT_ID}-admin` }, "phase3-d241-eid-admin");
  db = adminApp.firestore();
});

test.after(async () => {
  if (env) await env.cleanup();
  if (adminApp) await adminApp.delete();
});

async function seedTenant() {
  await env.withSecurityRulesDisabled(async (context) => {
    const fdb = context.firestore();
    await fdb.collection("companies").doc("alpha").set({ name: "Alpha" });
    await tenantDoc(fdb, "alpha", "settings", "main").set({
      status: "active", licenseType: "standard", maxDrivers: 50
    });
    await tenantDoc(fdb, "alpha", "groups", "310").set({
      lineId: "310", name: "Line 310", active: true
    });
    await tenantDoc(fdb, "alpha", "users", "dispatcher-a").set({
      role: "dispatcher", companyId: "alpha", groups: ["310"], active: true
    });
    await tenantDoc(fdb, "alpha", "users", "admin-a").set({
      role: "company_admin", companyId: "alpha", active: true
    });
    await tenantDoc(fdb, "alpha", "drivers", "clean-driver").set({
      firstName: "Clean", lastName: "Driver", groupId: "310", lineId: "310", knownGroupIds: ["310"]
    });
    await tenantDoc(fdb, "alpha", "drivers", "dirty-driver").set({
      firstName: "Dirty",
      lastName: "Driver",
      groupId: "310",
      lineId: "310",
      knownGroupIds: ["310"],
      eid: "SENTINEL-EID-NEVER-FOR-DISPO"
    });
    await tenantDoc(fdb, "alpha", "driver_credentials", "dirty-driver").set({
      eid: "SENTINEL-EID-NEVER-FOR-DISPO",
      loginCodeHash: "hash"
    });
  });
}

test("D24.1 Rules: Dispo cannot read profile with sentinel EID; clean profile readable; CA can read dirty", {
  skip: !EMULATOR
}, async () => {
  await seedTenant();
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();

  const clean = await assertSucceeds(tenantDoc(dispatcher, "alpha", "drivers", "clean-driver").get());
  assert.equal(clean.data().eid, undefined);

  await assertFails(tenantDoc(dispatcher, "alpha", "drivers", "dirty-driver").get());

  const caDirty = await assertSucceeds(tenantDoc(companyAdmin, "alpha", "drivers", "dirty-driver").get());
  assert.equal(caDirty.data().eid, "SENTINEL-EID-NEVER-FOR-DISPO");
});

test("D24.1 migration plan strips legacy credential fields without live apply requirement", () => {
  const plan = buildMigrationPlan({
    firstName: "Ana",
    eid: "LEGACY-EID",
    loginCodeHash: "h1",
    pin: "12345"
  });
  assert.ok(plan);
  assert.equal(plan.credentials.eid, "LEGACY-EID");
  assert.ok(plan.removeFields.includes("eid"));
  assert.ok(plan.removeFields.includes("pin"));
  assert.ok(CREDENTIAL_FIELDS.includes("eid"));
});

test("D24.1 createManualCompanyDriver: profile has no EID/PIN/hash; credentials hold EID; audit sanitize drops eid", {
  skip: !EMULATOR
}, async () => {
  const companyId = "d241-create";
  const companyRef = db.collection("companies").doc(companyId);
  await companyRef.set({ name: companyId });
  await companyRef.collection("settings").doc("main").set({
    status: "active", licenseType: "standard", maxDrivers: 10
  });
  await companyRef.collection("groups").doc("310").set({ lineId: "310", name: "L310", active: true });

  const bcrypt = require("bcrypt");
  const crypto = require("crypto");
  const created = await createManualCompanyDriver({
    db,
    FieldValue: admin.firestore.FieldValue,
    bcryptHash: (v, r) => bcrypt.hash(v, r),
    randomUUID: () => crypto.randomUUID(),
    companyId,
    body: {
      firstName: "Novi",
      lastName: "Vozac",
      phone: "+43699111",
      email: "novi@d241.local",
      eid: "EID-D241-OK",
      companyCode: "12345",
      groupId: "310",
      knownGroupIds: ["310"]
    },
    actorUid: "admin-a",
    assertGroupsExist: async () => {}
  });

  assert.equal(created.driver.eid, "EID-D241-OK");
  const profile = (await companyRef.collection("drivers").doc(created.driverId).get()).data();
  const creds = (await companyRef.collection("driver_credentials").doc(created.driverId).get()).data();
  assert.equal(profile.eid, undefined);
  assert.equal(profile.pin, undefined);
  assert.equal(profile.loginCodeHash, undefined);
  assert.equal(profile.passwordHash, undefined);
  assert.equal(creds.eid, "EID-D241-OK");
  assert.ok(creds.loginCodeHash);
  assert.equal(profileHasCredentialFields(profile), false);

  const listed = await listCompanyDriversForAdmin({ db, companyId });
  const row = listed.drivers.find((d) => d.id === created.driverId);
  assert.equal(row.eid, "EID-D241-OK");
  // Prove GET path does not backfill eid onto profile
  const profileAfterList = (await companyRef.collection("drivers").doc(created.driverId).get()).data();
  assert.equal(profileAfterList.eid, undefined);

  const sanitized = sanitizeDetails({
    driverId: created.driverId,
    eid: "EID-D241-OK",
    pin: "12345",
    otp: "999999",
    loginCodeHash: "x"
  });
  assert.equal(sanitized.eid, undefined);
  assert.equal(sanitized.pin, undefined);
  assert.equal(sanitized.otp, undefined);
  assert.equal(sanitized.loginCodeHash, undefined);
});

test("D24.1 create: duplicate EID sequential → EID_EXISTS (server authoritative)", {
  skip: !EMULATOR
}, async () => {
  const companyId = "d241-dup";
  const companyRef = db.collection("companies").doc(companyId);
  await companyRef.set({ name: companyId });
  await companyRef.collection("settings").doc("main").set({
    status: "active", maxDrivers: 20
  });
  await companyRef.collection("groups").doc("310").set({ lineId: "310", active: true });
  const bcrypt = require("bcrypt");
  const crypto = require("crypto");
  const args = {
    db,
    FieldValue: admin.firestore.FieldValue,
    bcryptHash: (v, r) => bcrypt.hash(v, r),
    randomUUID: () => crypto.randomUUID(),
    companyId,
    body: {
      firstName: "A", lastName: "B", phone: "+1", email: "a@d241.local",
      eid: "EID-DUP", companyCode: "12345", groupId: "310", knownGroupIds: ["310"]
    },
    actorUid: "admin-a",
    assertGroupsExist: async () => {}
  };
  await createManualCompanyDriver(args);
  await assert.rejects(() => createManualCompanyDriver(args), (err) => err.code === "EID_EXISTS");
});

test("D24.1 migration dry-run proves legacy eid removal plan (no live apply)", async () => {
  const fakeStore = new Map([
    ["companies/alpha/drivers/legacy-1", {
      firstName: "Leg", eid: "LEGACY-SENTINEL", loginCodeHash: "h"
    }]
  ]);
  const ref = (p) => ({
    path: p,
    collection(name) { return collection(`${p}/${name}`); },
    doc(id) { return ref(`${p}/${id}`); }
  });
  const collection = (p) => ({
    doc(id) { return ref(`${p}/${id}`); },
    async get() {
      const prefix = `${p}/`;
      const docs = [...fakeStore.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .map(([key, value]) => ({ id: key.slice(prefix.length), ref: ref(key), data: () => ({ ...value }) }));
      return { docs };
    }
  });
  const fakeDb = {
    collection(name) { return collection(name); },
    async runTransaction(cb) {
      return cb({
        async get(documentRef) {
          const value = fakeStore.get(documentRef.path);
          return { exists: Boolean(value), data: () => ({ ...value }) };
        },
        set(documentRef, data, options) {
          fakeStore.set(
            documentRef.path,
            options?.merge ? { ...(fakeStore.get(documentRef.path) || {}), ...data } : { ...data }
          );
        },
        update(documentRef, data) {
          const next = { ...(fakeStore.get(documentRef.path) || {}) };
          for (const [key, value] of Object.entries(data)) {
            if (value === "__DELETE__") delete next[key];
            else next[key] = value;
          }
          fakeStore.set(documentRef.path, next);
        }
      });
    }
  };
  const dry = await migrateCompany({
    db: fakeDb,
    fieldValue: { delete: () => "__DELETE__" },
    projectId: "buscommand-preview",
    companyId: "alpha",
    dryRun: true
  });
  assert.equal(dry.candidates, 1);
  assert.equal(fakeStore.has("companies/alpha/driver_credentials/legacy-1"), false);
  assert.equal(fakeStore.get("companies/alpha/drivers/legacy-1").eid, "LEGACY-SENTINEL");
});

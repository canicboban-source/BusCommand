/**
 * FAZA 3 D24.2 — concurrency-safe driver identity uniqueness (tenant guard).
 *
 * Real Firestore emulator parallelism (not mock-only). Proofs A–H.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const admin = require("firebase-admin");
const {
  createManualCompanyDriver,
  commitImportedDriversWithIdentityGuard,
  setCreateDriverMutationHookForTests
} = require("../../server/company-admin-driver-ops");
const {
  GUARD_DOC_ID,
  driverIdentityGuardRef
} = require("../../server/driver-identity-guard");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-d242";
const RULES = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");
const RUN = `${Date.now().toString(36)}`;

let env;
let adminApp;
let db;

function claims(role, companyId) {
  return { role, companyId, mustChangeLoginCode: false, auth_time: 1 };
}

async function wipeCol(col) {
  const snap = await col.limit(200).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size >= 200) await wipeCol(col);
}

async function seedCompany(companyId, { maxDrivers = 20, groupId = "310" } = {}) {
  const companyRef = db.collection("companies").doc(companyId);
  await wipeCol(companyRef.collection("drivers"));
  await wipeCol(companyRef.collection("driver_credentials"));
  await wipeCol(companyRef.collection("ops"));
  await companyRef.set({ name: companyId });
  await companyRef.collection("settings").doc("main").set({
    status: "active",
    licenseStatus: "active",
    licenseType: "pro",
    maxDrivers
  });
  await companyRef.collection("groups").doc(groupId).set({
    lineId: groupId,
    name: `L${groupId}`,
    active: true
  });
  return companyRef;
}

function manualArgs(companyId, bodyOverrides = {}) {
  return {
    db,
    FieldValue: admin.firestore.FieldValue,
    bcryptHash: (v, r) => bcrypt.hash(v, Math.min(Number(r) || 4, 4)),
    randomUUID: () => crypto.randomUUID(),
    companyId,
    body: {
      firstName: "Ana",
      lastName: "Test",
      phone: "+43664000001",
      email: `ana-${crypto.randomUUID().slice(0, 8)}@d242.local`,
      eid: "EID-DEFAULT",
      companyCode: "12345",
      groupId: "310",
      knownGroupIds: ["310"],
      ...bodyOverrides
    },
    actorUid: "ca-d242"
  };
}

function importPrepared(companyId, groupId, { eid, driverId }) {
  const id = driverId || crypto.randomUUID();
  const createdAt = admin.firestore.FieldValue.serverTimestamp();
  return {
    driverId: id,
    profile: {
      firstName: "Import",
      lastName: "Row",
      name: "Import Row",
      phone: "+43664000099",
      email: `imp-${id.slice(0, 8)}@d242.local`,
      groupId,
      lineId: groupId,
      knownGroupIds: [groupId],
      companyId,
      active: true,
      codeActivated: false,
      createdAt
    },
    credentials: {
      eid,
      activationCodeHash: bcrypt.hashSync("111111", 4),
      activationExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      activationUsedAt: null,
      createdAt
    }
  };
}

test.before(async () => {
  if (!EMULATOR) return;
  // Same project for Admin SDK + Rules clients so guard docs are visible to both.
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES }
  });
  try {
    adminApp = admin.app("phase3-d242-admin");
  } catch {
    adminApp = admin.initializeApp({ projectId: PROJECT_ID }, "phase3-d242-admin");
  }
  db = adminApp.firestore();
});

test.after(async () => {
  setCreateDriverMutationHookForTests(null);
  if (env) await env.cleanup();
  if (adminApp) await adminApp.delete();
});

test("D24.2 A — parallel manual create same EID → one success, one EID_EXISTS", {
  skip: !EMULATOR,
  timeout: 120000
}, async () => {
  const companyId = `d242-a-eid-${RUN}`;
  await seedCompany(companyId);
  const eid = `EID-PARALLEL-A-${RUN}`;
  const p1 = createManualCompanyDriver(manualArgs(companyId, {
    eid,
    email: "a1@d242.local",
    companyCode: "11111"
  }));
  const p2 = createManualCompanyDriver(manualArgs(companyId, {
    eid,
    email: "a2@d242.local",
    companyCode: "22222"
  }));
  const settled = await Promise.allSettled([p1, p2]);
  const ok = settled.filter((r) => r.status === "fulfilled");
  const bad = settled.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1, `expected 1 success, got ${JSON.stringify(settled)}`);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason.code, "EID_EXISTS");
  const profiles = await db.collection("companies").doc(companyId).collection("drivers").get();
  assert.equal(profiles.size, 1);
  const creds = await db.collection("companies").doc(companyId).collection("driver_credentials").get();
  assert.equal(creds.size, 1);
  const guard = await driverIdentityGuardRef(db.collection("companies").doc(companyId)).get();
  assert.equal(guard.exists, true);
  assert.ok(Number(guard.data().revision) >= 1);
  const payload = { success: false, code: bad[0].reason.code, error: String(bad[0].reason.message || "") };
  assert.equal(JSON.stringify(payload).includes(eid), false);
});

test("D24.2.1-A B — legacy CSV company_code ignored: credentials have no companyCodeHash", {
  skip: !EMULATOR,
  timeout: 120000
}, async () => {
  const companyId = `d242-b-legacy-${RUN}`;
  const groupId = "310";
  await seedCompany(companyId);
  const { parseDriverCsv } = require("../../server/driver-csv");
  const csv = `eid,first_name,last_name,phone,email,company_code\nLEGACY-${RUN},Ana,Test,+43664000111,legacy-${RUN}@d242.local,SECRET-NEVER-STORE\n`;
  const parsed = parseDriverCsv(csv);
  assert.equal(parsed.legacyCompanyCodeIgnored, true);
  assert.equal(parsed[0].company_code, "");
  const prepared = importPrepared(companyId, groupId, { eid: parsed[0].eid });
  // Simulate production credentialPayload with null companyCodeHash
  delete prepared.credentials.companyCodeHash;
  await commitImportedDriversWithIdentityGuard({
    db,
    FieldValue: admin.firestore.FieldValue,
    companyId,
    groupId,
    prepared: [prepared]
  });
  const creds = await db.collection("companies").doc(companyId).collection("driver_credentials").get();
  assert.equal(creds.size, 1);
  const data = creds.docs[0].data();
  assert.equal(data.companyCodeHash, undefined);
  assert.equal(data.eid, parsed[0].eid);
  const blob = JSON.stringify(data);
  assert.equal(blob.includes("SECRET-NEVER-STORE"), false);
  const profiles = await db.collection("companies").doc(companyId).collection("drivers").get();
  assert.equal(JSON.stringify(profiles.docs[0].data()).includes("SECRET-NEVER-STORE"), false);
});

test("D24.2 C — manual vs CSV/import same EID → one success, one EID_EXISTS", {
  skip: !EMULATOR,
  timeout: 120000
}, async () => {
  const companyId = `d242-c-cross-${RUN}`;
  const groupId = "310";
  await seedCompany(companyId);
  const eid = `EID-CROSS-C-${RUN}`;
  const manual = createManualCompanyDriver(manualArgs(companyId, {
    eid,
    email: "cross-m@d242.local",
    companyCode: "33333"
  }));
  const imported = commitImportedDriversWithIdentityGuard({
    db,
    FieldValue: admin.firestore.FieldValue,
    companyId,
    groupId,
    prepared: [importPrepared(companyId, groupId, { eid })]
  });
  const settled = await Promise.allSettled([manual, imported]);
  const ok = settled.filter((r) => r.status === "fulfilled");
  const bad = settled.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason.code, "EID_EXISTS");
  const profiles = await db.collection("companies").doc(companyId).collection("drivers").get();
  assert.equal(profiles.size, 1);
});

test("D24.2 D — parallel create for last maxDrivers seat → one success, one DRIVER_LIMIT_REACHED", {
  skip: !EMULATOR,
  timeout: 120000
}, async () => {
  const companyId = `d242-d-limit-${RUN}`;
  await seedCompany(companyId, { maxDrivers: 1 });
  const settled = await Promise.allSettled([
    createManualCompanyDriver(manualArgs(companyId, {
      eid: `EID-LIM-1-${RUN}`,
      email: "lim1@d242.local",
      companyCode: "55551"
    })),
    createManualCompanyDriver(manualArgs(companyId, {
      eid: `EID-LIM-2-${RUN}`,
      email: "lim2@d242.local",
      companyCode: "55552"
    }))
  ]);
  const ok = settled.filter((r) => r.status === "fulfilled");
  const bad = settled.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1);
  assert.equal(bad.length, 1);
  assert.equal(bad[0].reason.code, "DRIVER_LIMIT_REACHED");
  const profiles = await db.collection("companies").doc(companyId).collection("drivers").get();
  assert.equal(profiles.size, 1);
});

test("D24.2 E — distinct drivers sequential + retry-safe (no duplicate counters)", {
  skip: !EMULATOR,
  timeout: 120000
}, async () => {
  const companyId = `d242-e-seq-${RUN}`;
  const companyRef = await seedCompany(companyId, { maxDrivers: 5 });
  const a = await createManualCompanyDriver(manualArgs(companyId, {
    eid: `EID-E-1-${RUN}`,
    email: "e1@d242.local",
    companyCode: "66661"
  }));
  const b = await createManualCompanyDriver(manualArgs(companyId, {
    eid: `EID-E-2-${RUN}`,
    email: "e2@d242.local",
    companyCode: "66662"
  }));
  assert.notEqual(a.driverId, b.driverId);
  await assert.rejects(
    () => createManualCompanyDriver(manualArgs(companyId, {
      eid: `EID-E-1-${RUN}`,
      email: "e1-retry@d242.local",
      companyCode: "66663"
    })),
    (err) => err.code === "EID_EXISTS"
  );
  const profiles = await companyRef.collection("drivers").get();
  assert.equal(profiles.size, 2);
  const guard = await driverIdentityGuardRef(companyRef).get();
  assert.equal(Number(guard.data().revision), 2);
});

test("D24.2 F — group-delete race → group-not-found, zero orphan writes", {
  skip: !EMULATOR,
  timeout: 120000
}, async () => {
  const companyId = `d242-f-group-${RUN}`;
  const companyRef = await seedCompany(companyId);
  setCreateDriverMutationHookForTests(async ({ companyRef: ref, knownGroupIds }) => {
    for (const gid of knownGroupIds) {
      await ref.collection("groups").doc(gid).delete();
    }
  });
  try {
    await assert.rejects(
      () => createManualCompanyDriver(manualArgs(companyId, {
        eid: `EID-F-ORPHAN-${RUN}`,
        email: "f@d242.local",
        companyCode: "77777"
      })),
      (err) => err.code === "group-not-found"
    );
  } finally {
    setCreateDriverMutationHookForTests(null);
  }
  const profiles = await companyRef.collection("drivers").get();
  const creds = await companyRef.collection("driver_credentials").get();
  assert.equal(profiles.size, 0);
  assert.equal(creds.size, 0);
  const guard = await driverIdentityGuardRef(companyRef).get();
  assert.equal(guard.exists, false);
});

test("D24.2 G — browser cannot read/list/write guard document", {
  skip: !EMULATOR,
  timeout: 60000
}, async () => {
  const companyId = `d242-g-rules-${RUN}`;
  const companyRef = await seedCompany(companyId);
  await createManualCompanyDriver(manualArgs(companyId, {
    eid: `EID-G-RULES-${RUN}`,
    email: "g@d242.local",
    companyCode: "88881"
  }));
  await companyRef.collection("users").doc("ca-g").set({
    role: "company_admin",
    active: true,
    sessionsValidAfterEpoch: 0
  });
  await companyRef.collection("users").doc("disp-g").set({
    role: "dispatcher",
    active: true,
    groups: ["310"],
    sessionsValidAfterEpoch: 0
  });
  const ca = env.authenticatedContext("ca-g", claims("company_admin", companyId)).firestore();
  const dispo = env.authenticatedContext("disp-g", claims("dispatcher", companyId)).firestore();
  const sa = env.authenticatedContext("sa-g", claims("superadmin", "platform")).firestore();
  const caGuard = ca.collection("companies").doc(companyId).collection("ops").doc(GUARD_DOC_ID);
  const dispoGuard = dispo.collection("companies").doc(companyId).collection("ops").doc(GUARD_DOC_ID);
  const saGuard = sa.collection("companies").doc(companyId).collection("ops").doc(GUARD_DOC_ID);
  await assertFails(caGuard.get());
  await assertFails(caGuard.set({ revision: 99 }));
  await assertFails(caGuard.update({ revision: 1 }));
  await assertFails(caGuard.delete());
  await assertFails(dispoGuard.get());
  await assertFails(dispoGuard.set({ revision: 1 }));
  await assertFails(saGuard.get());
  await assertFails(saGuard.set({ revision: 1 }));
  // List is also denied (ops has no browser read path after D24.2 SA exclusion).
  await assertFails(ca.collection("companies").doc(companyId).collection("ops").get());
  // Admin SDK still owns the doc
  const adminGuard = await driverIdentityGuardRef(companyRef).get();
  assert.equal(adminGuard.exists, true);
  // Control: CA can still read own-tenant groups (authz not expanded onto ops).
  await assertSucceeds(
    ca.collection("companies").doc(companyId).collection("groups").doc("310").get()
  );
});

test("D24.2 H — conflict errors do not leak EID, legacy code, or foreign driverId; guard fields only", {
  skip: !EMULATOR,
  timeout: 60000
}, async () => {
  const companyId = `d242-h-leak-${RUN}`;
  await seedCompany(companyId);
  const secretEid = `SECRET-EID-H-${RUN}`;
  const first = await createManualCompanyDriver(manualArgs(companyId, {
    eid: secretEid,
    email: "h1@d242.local",
    companyCode: "10101"
  }));
  let eidErr;
  try {
    await createManualCompanyDriver(manualArgs(companyId, {
      eid: secretEid,
      email: "h2@d242.local",
      companyCode: "10102"
    }));
  } catch (err) {
    eidErr = err;
  }
  assert.equal(eidErr.code, "EID_EXISTS");
  const eidBlob = JSON.stringify({
    code: eidErr.code,
    message: eidErr.message,
    ...eidErr
  });
  assert.equal(eidBlob.includes(secretEid), false);
  assert.equal(eidBlob.includes(first.driverId), false);

  const guard = await driverIdentityGuardRef(db.collection("companies").doc(companyId)).get();
  assert.equal(guard.exists, true);
  const guardKeys = Object.keys(guard.data() || {}).sort();
  assert.deepEqual(guardKeys, ["revision", "updatedAt"]);
});

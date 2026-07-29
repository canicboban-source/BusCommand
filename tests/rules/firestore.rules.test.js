const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Timestamp } = require("firebase-admin/firestore");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");

const PROJECT_ID = "buscommand-preview";
let env;

function claims(role, companyId, extra = {}) {
  // Firebase ID tokens always contain auth_time. The rules intentionally compare
  // it with sessionsValidAfterEpoch so "sign out all devices" also invalidates an
  // already-issued token. The rules emulator does not synthesize this standard
  // claim for authenticatedContext(), therefore the fixture must provide it.
  return { role, companyId, mustChangeLoginCode: false, auth_time: 1, ...extra };
}

function doc(db, companyId, collection, id) {
  return db.collection("companies").doc(companyId).collection(collection).doc(id);
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8")
    }
  });

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const companyId of ["alpha", "beta"]) {
      await db.collection("companies").doc(companyId).set({ name: companyId });
      await doc(db, companyId, "settings", "main").set({ status: "active" });
      await doc(db, companyId, "profile", "main").set({ name: `${companyId} Transit` });
    }
    await doc(db, "alpha", "drivers", "driver-a").set({ firstName: "Ana", lastName: "Alpha" });
    await doc(db, "alpha", "drivers", "driver-b").set({ firstName: "Ben", lastName: "Alpha" });
    await doc(db, "beta", "drivers", "driver-c").set({ firstName: "Cora", lastName: "Beta" });
    await doc(db, "alpha", "driver_sessions", "driver-a").set({
      notificationsUntil: Timestamp.fromDate(new Date("2100-01-01T00:00:00.000Z"))
    });
    await doc(db, "alpha", "driver_credentials", "driver-a").set({ eid: "private", loginCodeHash: "private" });
    await doc(db, "alpha", "messages", "for-a").set({ recipientDriverId: "driver-a", broadcast: false, text: "Private A" });
    await doc(db, "alpha", "messages", "for-b").set({ recipientDriverId: "driver-b", broadcast: false, text: "Private B" });
    await doc(db, "alpha", "messages", "broadcast").set({ recipientDriverId: null, broadcast: true, text: "All drivers" });
    for (const [companyId, uid, role] of [
      ["alpha", "admin-a", "company_admin"],
      ["alpha", "company_admin-a", "company_admin"],
      ["alpha", "dispatcher-a", "dispatcher"],
      ["alpha", "company_admin-safe", "company_admin"],
      ["alpha", "dispatcher-safe", "dispatcher"],
      ["beta", "dispatcher-b", "dispatcher"]
    ]) {
      await doc(db, companyId, "users", uid).set({
        id: uid, role, companyId, active: true, groups: companyId === "alpha" ? ["310"] : ["105"]
      });
    }
  });
});

test.after(async () => {
  await env.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const companyId of ["alpha", "beta"]) {
      await db.collection("companies").doc(companyId).set({ name: companyId });
      await doc(db, companyId, "settings", "main").set({ status: "active" });
      await doc(db, companyId, "profile", "main").set({ name: `${companyId} Transit` });
    }
    await doc(db, "alpha", "drivers", "driver-a").set({ firstName: "Ana", lastName: "Alpha" });
    await doc(db, "alpha", "drivers", "driver-b").set({ firstName: "Ben", lastName: "Alpha" });
    await doc(db, "beta", "drivers", "driver-c").set({ firstName: "Cora", lastName: "Beta" });
    await doc(db, "alpha", "driver_sessions", "driver-a").set({
      notificationsUntil: Timestamp.fromDate(new Date("2100-01-01T00:00:00.000Z"))
    });
    await doc(db, "alpha", "driver_credentials", "driver-a").set({ eid: "private", loginCodeHash: "private" });
    await doc(db, "alpha", "messages", "for-a").set({ recipientDriverId: "driver-a", broadcast: false, text: "Private A" });
    await doc(db, "alpha", "messages", "for-b").set({ recipientDriverId: "driver-b", broadcast: false, text: "Private B" });
    await doc(db, "alpha", "messages", "broadcast").set({ recipientDriverId: null, broadcast: true, text: "All drivers" });
    for (const [companyId, uid, role] of [
      ["alpha", "admin-a", "company_admin"],
      ["alpha", "company_admin-a", "company_admin"],
      ["alpha", "dispatcher-a", "dispatcher"],
      ["alpha", "company_admin-safe", "company_admin"],
      ["alpha", "dispatcher-safe", "dispatcher"],
      ["beta", "dispatcher-b", "dispatcher"]
    ]) {
      await doc(db, companyId, "users", uid).set({
        id: uid, role, companyId, active: true, groups: companyId === "alpha" ? ["310"] : ["105"]
      });
    }
  });
});

test("unauthenticated clients cannot read company data", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(doc(db, "alpha", "profile", "main").get());
});

test("mustChangeLoginCode blocks every role from Firestore", async () => {
  const pendingDriver = env.authenticatedContext("driver-a", claims("driver", "alpha", { mustChangeLoginCode: true })).firestore();
  const pendingAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha", { mustChangeLoginCode: true })).firestore();
  const pendingSuper = env.authenticatedContext("super", { role: "superadmin", mustChangeLoginCode: true }).firestore();
  await assertFails(doc(pendingDriver, "alpha", "drivers", "driver-a").get());
  await assertFails(doc(pendingAdmin, "alpha", "profile", "main").get());
  await assertFails(doc(pendingSuper, "alpha", "profile", "main").get());
});

test("driver reads only their own driver profile", async () => {
  const db = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  await assertSucceeds(doc(db, "alpha", "drivers", "driver-a").get());
  await assertFails(doc(db, "alpha", "drivers", "driver-b").get());
  await assertFails(doc(db, "beta", "drivers", "driver-c").get());
});

test("driver master profile writes are server-only for every browser role", async () => {
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  await assertFails(doc(dispatcher, "alpha", "drivers", "driver-new").set({ firstName: "Blocked" }));
  await assertFails(doc(dispatcher, "alpha", "drivers", "driver-a").update({ active: false }));
  await assertFails(doc(companyAdmin, "alpha", "drivers", "driver-new").set({ firstName: "Blocked" }));
  await assertFails(doc(companyAdmin, "alpha", "drivers", "driver-a").update({ active: false }));
});

test("driver reads own and broadcast messages, never another driver's private message", async () => {
  const db = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  const messages = db.collection("companies").doc("alpha").collection("messages");
  await assertSucceeds(messages.where("recipientDriverId", "==", "driver-a").get());
  await assertSucceeds(messages.where("broadcast", "==", true).get());
  await assertFails(doc(db, "alpha", "messages", "for-b").get());
  await assertFails(messages.get());
});

for (const role of ["dispatcher", "company_admin"]) {
  test(`${role} accesses only its own company`, async () => {
    const db = env.authenticatedContext(`${role}-a`, claims(role, "alpha")).firestore();
    await assertSucceeds(doc(db, "alpha", "profile", "main").get());
    await assertSucceeds(doc(db, "alpha", "drivers", "driver-a").get());
    await assertFails(doc(db, "beta", "profile", "main").get());
    await assertFails(doc(db, "beta", "drivers", "driver-c").set({ firstName: "Blocked" }));
  });
}

test("company claims cannot cross tenant boundaries", async () => {
  const alphaDriver = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  const betaDispatcher = env.authenticatedContext("dispatcher-b", claims("dispatcher", "beta")).firestore();
  await assertFails(doc(alphaDriver, "beta", "profile", "main").get());
  await assertFails(doc(betaDispatcher, "alpha", "messages", "broadcast").get());
});

test("driver cannot update another driver's private message", async () => {
  const db = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  await assertFails(doc(db, "alpha", "messages", "for-b").update({ read: true }));
});

test("staff cannot rewrite or delete sent messages directly", async () => {
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  await assertFails(doc(dispatcher, "alpha", "messages", "for-a").update({ text: "Forged" }));
  await assertFails(doc(companyAdmin, "alpha", "messages", "for-a").delete());
});

test("vacation and legacy company-admin writes are server-only", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "vacations", "vac-1").set({
      driverId: "driver-a", status: "pending"
    });
    await doc(context.firestore(), "alpha", "company_admins", "legacy-admin").set({
      role: "company_admin"
    });
  });
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  await assertFails(doc(dispatcher, "alpha", "vacations", "vac-1").update({ status: "approved" }));
  await assertFails(doc(companyAdmin, "alpha", "vacations", "vac-2").set({ status: "pending" }));
  await assertFails(doc(companyAdmin, "alpha", "company_admins", "legacy-admin").update({ active: false }));
});

test("driver credentials are inaccessible to every client role", async () => {
  const contexts = [
    env.unauthenticatedContext(),
    env.authenticatedContext("driver-a", claims("driver", "alpha")),
    env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")),
    env.authenticatedContext("admin-a", claims("company_admin", "alpha")),
    env.authenticatedContext("super", { role: "superadmin", mustChangeLoginCode: false })
  ];
  for (const context of contexts) {
    const credential = doc(context.firestore(), "alpha", "driver_credentials", "driver-a");
    await assertFails(credential.get());
    await assertFails(credential.set({ eid: "blocked" }));
  }
});

test("company group mutations are server-only while company members may read them", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "groups", "310").set({
      lineId: "310", name: "Line 310", color: "#3D7EF5", active: true
    });
  });
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  await assertSucceeds(doc(companyAdmin, "alpha", "groups", "310").get());
  await assertSucceeds(doc(dispatcher, "alpha", "groups", "310").get());
  await assertFails(doc(companyAdmin, "alpha", "groups", "105").set({ lineId: "105", name: "Blocked" }));
  await assertFails(doc(companyAdmin, "alpha", "groups", "310").delete());
  await assertFails(doc(dispatcher, "alpha", "groups", "310").update({ name: "Blocked" }));
});

test("company profile, branding and license settings are readable but server-only", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "branding", "main").set({
      name: "Alpha Transit", primaryColor: "#3D7EF5"
    });
  });
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  for (const [collection, id, patch] of [
    ["profile", "main", { timezone: "UTC" }],
    ["branding", "main", { name: "Uncontrolled" }],
    ["settings", "main", { maxDrivers: 999999 }]
  ]) {
    await assertSucceeds(doc(companyAdmin, "alpha", collection, id).get());
    await assertFails(doc(companyAdmin, "alpha", collection, id).update(patch));
  }
});

test("reports are group-scoped for dispatchers, identity-scoped for drivers and always server-written", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await doc(db, "alpha", "reports", "report-310").set({
      driverId: "driver-a", groupId: "310", status: "active", type: "delay:10"
    });
    await doc(db, "alpha", "reports", "report-105").set({
      driverId: "driver-b", groupId: "105", status: "active", type: "delay:10"
    });
  });
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  const driverA = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  await assertSucceeds(doc(dispatcher, "alpha", "reports", "report-310").get());
  await assertFails(doc(dispatcher, "alpha", "reports", "report-105").get());
  await assertSucceeds(doc(driverA, "alpha", "reports", "report-310").get());
  await assertFails(doc(driverA, "alpha", "reports", "report-105").get());
  await assertFails(doc(dispatcher, "alpha", "reports", "report-310").update({ status: "resolved" }));
  await assertFails(doc(driverA, "alpha", "reports", "report-new").set({ groupId: "310", driverId: "driver-a" }));
});

test("dispatcher lifecycle fields are server-only while users may update only their own safe profile fields", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "users", "dispatcher-a").set({
      id: "dispatcher-a", role: "dispatcher", companyId: "alpha", name: "Dispatcher", language: "en", groups: ["310"], active: true
    });
  });
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  await assertSucceeds(doc(companyAdmin, "alpha", "users", "dispatcher-a").get());
  await assertFails(doc(companyAdmin, "alpha", "users", "dispatcher-new").set({ role: "dispatcher", active: true }));
  await assertFails(doc(companyAdmin, "alpha", "users", "dispatcher-a").update({ active: false }));
  await assertFails(doc(companyAdmin, "alpha", "users", "dispatcher-a").delete());
  await assertSucceeds(doc(dispatcher, "alpha", "users", "dispatcher-a").update({ language: "de" }));
  await assertFails(doc(dispatcher, "alpha", "users", "dispatcher-a").update({ groups: ["999"] }));
});

test("deactivated driver cannot read operational company data with an existing token", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "drivers", "driver-a").update({ active: false });
  });
  const db = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  await assertFails(doc(db, "alpha", "drivers", "driver-a").get());
  await assertFails(doc(db, "alpha", "messages", "broadcast").get());
});

test("deactivated dispatcher cannot use Firestore with an existing token", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "users", "dispatcher-a").update({ active: false });
  });
  const db = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  await assertFails(doc(db, "alpha", "profile", "main").get());
  await assertFails(doc(db, "alpha", "drivers", "driver-a").get());
});

test("staff reads only the safe driver profile document", async () => {
  for (const role of ["dispatcher", "company_admin"]) {
    const db = env.authenticatedContext(`${role}-safe`, claims(role, "alpha")).firestore();
    const snapshot = await assertSucceeds(doc(db, "alpha", "drivers", "driver-a").get());
    assert.deepEqual(Object.keys(snapshot.data()).sort(), ["firstName", "lastName"]);
  }
});

test("rules suite is pinned to the preview project", () => {
  assert.equal(PROJECT_ID, "buscommand-preview");
});

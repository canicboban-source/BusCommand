const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
    await seedTenantFixtures(context.firestore());
  });
});

async function seedTenantFixtures(db) {
  for (const companyId of ["alpha", "beta"]) {
    await db.collection("companies").doc(companyId).set({ name: companyId });
    await doc(db, companyId, "settings", "main").set({ status: "active" });
    await doc(db, companyId, "profile", "main").set({ name: `${companyId} Transit` });
  }
  await doc(db, "alpha", "drivers", "driver-a").set({
    firstName: "Ana", lastName: "Alpha", groupId: "310", lineId: "310", knownGroupIds: ["310", "105"]
  });
  await doc(db, "alpha", "drivers", "driver-b").set({
    firstName: "Ben", lastName: "Alpha", groupId: "105", lineId: "105", knownGroupIds: ["105", "310"]
  });
  await doc(db, "beta", "drivers", "driver-c").set({
    firstName: "Cora", lastName: "Beta", groupId: "105", lineId: "105"
  });
  await doc(db, "alpha", "driver_sessions", "driver-a").set({
    notificationsUntil: new Date("2100-01-01T00:00:00.000Z")
  });
  await doc(db, "alpha", "driver_credentials", "driver-a").set({ eid: "private", loginCodeHash: "private" });
  await doc(db, "alpha", "messages", "for-a").set({
    recipientDriverId: "driver-a", broadcast: false, text: "Private A", groupId: "310"
  });
  await doc(db, "alpha", "messages", "for-b").set({
    recipientDriverId: "driver-b", broadcast: false, text: "Private B", groupId: "105"
  });
  await doc(db, "alpha", "messages", "broadcast").set({
    recipientDriverId: null, broadcast: true, text: "All drivers"
  });
  await doc(db, "alpha", "groups", "310").set({ lineId: "310", name: "Line 310", active: true });
  await doc(db, "alpha", "groups", "105").set({ lineId: "105", name: "Line 105", active: true });
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
}

test.after(async () => {
  await env.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await seedTenantFixtures(context.firestore());
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

test("revoking staff sessions blocks a token issued before the cutoff", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    // "Sign out all devices" writes this cutoff; the ID token stays parseable
    // until it expires, so the rules must compare it with auth_time.
    await doc(context.firestore(), "alpha", "users", "dispatcher-a").set({
      id: "dispatcher-a", role: "dispatcher", companyId: "alpha", active: true,
      groups: ["310"], sessionsValidAfterEpoch: 5_000
    });
  });

  const beforeCutoff = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha", { auth_time: 4_999 })).firestore();
  const atCutoff = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha", { auth_time: 5_000 })).firestore();
  const afterCutoff = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha", { auth_time: 5_001 })).firestore();

  await assertFails(doc(beforeCutoff, "alpha", "profile", "main").get());
  await assertFails(doc(atCutoff, "alpha", "profile", "main").get());
  await assertSucceeds(doc(afterCutoff, "alpha", "profile", "main").get());
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

test("company group mutations are server-only; Dispo reads only assigned groups", async () => {
  const companyAdmin = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  await assertSucceeds(doc(companyAdmin, "alpha", "groups", "310").get());
  await assertSucceeds(doc(companyAdmin, "alpha", "groups", "105").get());
  await assertSucceeds(doc(dispatcher, "alpha", "groups", "310").get());
  await assertFails(doc(dispatcher, "alpha", "groups", "105").get());
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

test("staff reads only the safe driver profile document fields from fixtures", async () => {
  for (const role of ["dispatcher", "company_admin"]) {
    const db = env.authenticatedContext(`${role}-safe`, claims(role, "alpha")).firestore();
    const snapshot = await assertSucceeds(doc(db, "alpha", "drivers", "driver-a").get());
    assert.deepEqual(Object.keys(snapshot.data()).sort(), [
      "firstName", "groupId", "knownGroupIds", "lastName", "lineId"
    ]);
  }
});

test("FAZA1: knownGroupIds does not grant Dispo read of foreign-home drivers", async () => {
  const dispatcher = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  // driver-b home=105 but knownGroupIds includes 310 — must still deny
  await assertSucceeds(doc(dispatcher, "alpha", "drivers", "driver-a").get());
  await assertFails(doc(dispatcher, "alpha", "drivers", "driver-b").get());
  await assertFails(
    dispatcher.collection("companies").doc("alpha").collection("drivers")
      .where("knownGroupIds", "array-contains", "310").get()
  );
});

test("FAZA1: CA retains own-tenant reads across groups; Dispo own-group only", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await doc(db, "alpha", "shifts", "shift-310").set({
      driverId: "driver-a", groupId: "310", date: "2026-08-01"
    });
    await doc(db, "alpha", "shifts", "shift-105").set({
      driverId: "driver-b", groupId: "105", date: "2026-08-01"
    });
    await doc(db, "alpha", "schedules", "sched-310").set({
      driverId: "driver-a", groupId: "310", date: "2026-08-01"
    });
    await doc(db, "alpha", "schedules", "sched-105").set({
      driverId: "driver-b", groupId: "105", date: "2026-08-01"
    });
    await doc(db, "alpha", "buses", "bus-310").set({
      number: "B310", groupId: "310", groupIds: ["310"]
    });
    await doc(db, "alpha", "buses", "bus-105").set({
      number: "B105", groupId: "105", groupIds: ["105"]
    });
    await doc(db, "alpha", "routes", "route-310").set({ number: "310", groupId: "310" });
    await doc(db, "alpha", "routes", "route-105").set({ number: "105", groupId: "105" });
    await doc(db, "alpha", "vacations", "vac-310").set({
      driverId: "driver-a", groupId: "310", status: "pending"
    });
    await doc(db, "alpha", "vacations", "vac-105").set({
      driverId: "driver-b", groupId: "105", status: "pending"
    });
    await doc(db, "alpha", "lost_items", "lost-310").set({
      driverId: "driver-a", groupId: "310", status: "in_depot"
    });
    await doc(db, "alpha", "lost_items", "lost-105").set({
      driverId: "driver-b", groupId: "105", status: "in_depot"
    });
    await doc(db, "alpha", "sos", "sos-310").set({
      driverId: "driver-a", groupId: "310", status: "active"
    });
    await doc(db, "alpha", "sos", "sos-105").set({
      driverId: "driver-b", groupId: "105", status: "active"
    });
    await doc(db, "alpha", "service_plans", "plan-310").set({
      groupId: "310", status: "active", version: 1
    });
    await doc(db, "alpha", "service_plans", "plan-105").set({
      groupId: "105", status: "active", version: 1
    });
    await db.collection("companies").doc("alpha").collection("service_plans")
      .doc("plan-310").collection("duties").doc("d1").set({ code: "A1", start: "05:00" });
    await db.collection("companies").doc("alpha").collection("service_plans")
      .doc("plan-105").collection("duties").doc("d2").set({ code: "B1", start: "06:00" });
    await doc(db, "alpha", "shift_confirmations", "conf-a").set({
      driverId: "driver-a", date: "2026-08-01"
    });
    await doc(db, "alpha", "shift_confirmations", "conf-b").set({
      driverId: "driver-b", date: "2026-08-01"
    });
    await doc(db, "alpha", "confirmation_outbox", "out-a").set({
      driverId: "driver-a", targetDate: "2026-08-01"
    });
    await doc(db, "alpha", "confirmation_outbox", "out-b").set({
      driverId: "driver-b", targetDate: "2026-08-01"
    });
    await doc(db, "alpha", "driver_sessions", "driver-b").set({
      notificationsUntil: new Date("2100-01-01T00:00:00.000Z")
    });
    await doc(db, "alpha", "reports", "report-310").set({
      driverId: "driver-a", groupId: "310", status: "active", type: "delay:10"
    });
    await doc(db, "alpha", "reports", "report-105").set({
      driverId: "driver-b", groupId: "105", status: "active", type: "delay:10"
    });
  });

  const ca = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  const dispo = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();

  for (const [collection, ownId, foreignId] of [
    ["drivers", "driver-a", "driver-b"],
    ["shifts", "shift-310", "shift-105"],
    ["schedules", "sched-310", "sched-105"],
    ["messages", "for-a", "for-b"],
    ["buses", "bus-310", "bus-105"],
    ["routes", "route-310", "route-105"],
    ["vacations", "vac-310", "vac-105"],
    ["lost_items", "lost-310", "lost-105"],
    ["sos", "sos-310", "sos-105"],
    ["service_plans", "plan-310", "plan-105"],
    ["shift_confirmations", "conf-a", "conf-b"],
    ["confirmation_outbox", "out-a", "out-b"],
    ["reports", "report-310", "report-105"]
  ]) {
    await assertSucceeds(doc(ca, "alpha", collection, ownId).get());
    await assertSucceeds(doc(ca, "alpha", collection, foreignId).get());
    await assertSucceeds(doc(dispo, "alpha", collection, ownId).get());
    await assertFails(doc(dispo, "alpha", collection, foreignId).get());
  }

  await assertSucceeds(doc(dispo, "alpha", "driver_sessions", "driver-a").get());
  await assertFails(doc(dispo, "alpha", "driver_sessions", "driver-b").get());
  await assertSucceeds(
    doc(dispo, "alpha", "service_plans", "plan-310").collection("duties").doc("d1").get()
  );
  await assertFails(
    doc(dispo, "alpha", "service_plans", "plan-105").collection("duties").doc("d2").get()
  );
  await assertSucceeds(
    doc(ca, "alpha", "service_plans", "plan-105").collection("duties").doc("d2").get()
  );
});

test("FAZA1: driver reads only own vacations/lost items and home-group buses/routes", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await doc(db, "alpha", "vacations", "vac-a").set({
      driverId: "driver-a", groupId: "310", status: "pending"
    });
    await doc(db, "alpha", "vacations", "vac-b").set({
      driverId: "driver-b", groupId: "105", status: "pending"
    });
    await doc(db, "alpha", "lost_items", "lost-a").set({
      driverId: "driver-a", groupId: "310", status: "in_depot"
    });
    await doc(db, "alpha", "lost_items", "lost-b").set({
      driverId: "driver-b", groupId: "105", status: "in_depot"
    });
    await doc(db, "alpha", "buses", "bus-310").set({
      number: "B310", groupId: "310", groupIds: ["310"]
    });
    await doc(db, "alpha", "buses", "bus-105").set({
      number: "B105", groupId: "105", groupIds: ["105"]
    });
    await doc(db, "alpha", "routes", "route-310").set({ number: "310", groupId: "310" });
    await doc(db, "alpha", "routes", "route-105").set({ number: "105", groupId: "105" });
    await doc(db, "alpha", "sos", "sos-b").set({
      driverId: "driver-b", groupId: "105", status: "active"
    });
  });
  const driver = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  await assertSucceeds(doc(driver, "alpha", "vacations", "vac-a").get());
  await assertFails(doc(driver, "alpha", "vacations", "vac-b").get());
  await assertSucceeds(doc(driver, "alpha", "lost_items", "lost-a").get());
  await assertFails(doc(driver, "alpha", "lost_items", "lost-b").get());
  await assertSucceeds(doc(driver, "alpha", "buses", "bus-310").get());
  await assertFails(doc(driver, "alpha", "buses", "bus-105").get());
  await assertSucceeds(doc(driver, "alpha", "routes", "route-310").get());
  await assertFails(doc(driver, "alpha", "routes", "route-105").get());
  await assertFails(doc(driver, "alpha", "sos", "sos-b").get());
  await assertSucceeds(doc(driver, "alpha", "groups", "310").get());
  await assertFails(doc(driver, "alpha", "groups", "105").get());
});

test("FAZA1: Dispo cannot read foreign-group SOS settings while inactive remains readable", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "settings", "sos").set({
      sosActive: true,
      sosDriverId: "driver-b",
      sosDriver: "Ben Alpha",
      sosBus: "B105",
      groupId: "105"
    });
  });
  const dispo = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  const ca = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
  await assertFails(doc(dispo, "alpha", "settings", "sos").get());
  await assertSucceeds(doc(ca, "alpha", "settings", "sos").get());

  await env.withSecurityRulesDisabled(async (context) => {
    await doc(context.firestore(), "alpha", "settings", "sos").set({
      sosActive: false, sosDriverId: null, sosDriver: "", sosBus: "", groupId: null
    });
  });
  await assertSucceeds(doc(dispo, "alpha", "settings", "sos").get());
});

test("rules suite is pinned to the preview project", () => {
  assert.equal(PROJECT_ID, "buscommand-preview");
});

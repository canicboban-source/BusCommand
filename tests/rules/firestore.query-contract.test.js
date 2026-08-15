/**
 * FAZA 1 Security Closeout — production query shapes from js/core/firebase-service.js.
 * Doc.get() alone is insufficient; these assertFails/Succeeds on real list queries.
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

// Distinct project id so this suite does not race clearFirestore() against firestore.rules.test.js
const PROJECT_ID = "buscommand-qcontract";
let env;

function claims(role, companyId, extra = {}) {
  return { role, companyId, mustChangeLoginCode: false, auth_time: 1, ...extra };
}

function col(db, companyId, name) {
  return db.collection("companies").doc(companyId).collection(name);
}

async function seed(db) {
  for (const companyId of ["alpha", "beta"]) {
    await db.collection("companies").doc(companyId).set({ name: companyId });
    await col(db, companyId, "settings").doc("main").set({ status: "active" });
    await col(db, companyId, "profile").doc("main").set({ name: `${companyId} Transit` });
  }
  await col(db, "alpha", "users").doc("admin-a").set({
    id: "admin-a", role: "company_admin", companyId: "alpha", active: true, groups: []
  });
  await col(db, "alpha", "users").doc("dispatcher-a").set({
    id: "dispatcher-a", role: "dispatcher", companyId: "alpha", active: true, groups: ["310"]
  });
  await col(db, "beta", "users").doc("dispatcher-b").set({
    id: "dispatcher-b", role: "dispatcher", companyId: "beta", active: true, groups: ["105"]
  });
  await col(db, "alpha", "drivers").doc("driver-a").set({
    firstName: "Ana", lastName: "A", groupId: "310", lineId: "310", knownGroupIds: ["310", "105"]
  });
  await col(db, "alpha", "drivers").doc("driver-b").set({
    firstName: "Ben", lastName: "B", groupId: "105", lineId: "105", knownGroupIds: ["105", "310"]
  });
  await col(db, "beta", "drivers").doc("driver-c").set({
    firstName: "Cora", lastName: "C", groupId: "105", lineId: "105"
  });
  await col(db, "alpha", "driver_sessions").doc("driver-a").set({
    notificationsUntil: new Date("2100-01-01T00:00:00.000Z"),
    sessionEndsAt: new Date("2100-01-01T00:00:00.000Z")
  });

  const ops = [
    ["shifts", "s-310", { driverId: "driver-a", groupId: "310", date: "2026-08-01" }],
    ["shifts", "s-105", { driverId: "driver-b", groupId: "105", date: "2026-08-01" }],
    ["schedules", "sc-310", { driverId: "driver-a", groupId: "310", date: "2026-08-01" }],
    ["schedules", "sc-105", { driverId: "driver-b", groupId: "105", date: "2026-08-01" }],
    ["messages", "m-310", { recipientDriverId: "driver-a", groupId: "310", broadcast: false, text: "A" }],
    ["messages", "m-105", { recipientDriverId: "driver-b", groupId: "105", broadcast: false, text: "B" }],
    ["buses", "bus-310", { number: "B310", groupId: "310", groupIds: ["310"] }],
    ["buses", "bus-105", { number: "B105", groupId: "105", groupIds: ["105"] }],
    ["buses", "bus-multi", { number: "BM", groupId: "310", groupIds: ["310", "105"] }],
    // groupIds-only bus: proves Rules hasAny branch without primary groupId
    ["buses", "bus-gids-only", { number: "BG", groupIds: ["310"] }],
    ["routes", "r-310", { number: "310", groupId: "310" }],
    ["routes", "r-105", { number: "105", groupId: "105" }],
    ["reports", "rep-310", { driverId: "driver-a", groupId: "310", status: "active", type: "delay:10" }],
    ["reports", "rep-105", { driverId: "driver-b", groupId: "105", status: "active", type: "delay:10" }],
    ["vacations", "v-310", { driverId: "driver-a", groupId: "310", status: "pending" }],
    ["vacations", "v-105", { driverId: "driver-b", groupId: "105", status: "pending" }],
    ["lost_items", "l-310", { driverId: "driver-a", groupId: "310", status: "in_depot" }],
    ["lost_items", "l-105", { driverId: "driver-b", groupId: "105", status: "in_depot" }],
    ["sos", "sos-310", { driverId: "driver-a", groupId: "310", status: "active" }],
    ["sos", "sos-105", { driverId: "driver-b", groupId: "105", status: "active" }],
    ["service_plans", "p-310", { groupId: "310", status: "active", version: 1 }],
    ["service_plans", "p-105", { groupId: "105", status: "active", version: 1 }]
  ];
  for (const [collection, id, data] of ops) {
    await col(db, "alpha", collection).doc(id).set(data);
  }
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8")
    }
  });
});

test.after(async () => {
  await env.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await seed(context.firestore());
  });
});

const GROUP_SCOPED = [
  "drivers", "shifts", "schedules", "messages", "buses", "routes",
  "reports", "vacations", "lost_items", "sos", "service_plans"
];

for (const collection of GROUP_SCOPED) {
  test(`query-contract: Dispo assigned groupId== query succeeds for ${collection}`, async () => {
    const db = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
    const snap = await assertSucceeds(col(db, "alpha", collection).where("groupId", "==", "310").get());
    assert.ok(snap.size >= 1);
  });

  test(`query-contract: Dispo foreign groupId== query fails for ${collection}`, async () => {
    const db = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
    await assertFails(col(db, "alpha", collection).where("groupId", "==", "105").get());
  });

  test(`query-contract: Dispo unfiltered collection query fails for ${collection}`, async () => {
    const db = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
    await assertFails(col(db, "alpha", collection).get());
  });

  test(`query-contract: CA own-tenant collection query succeeds for ${collection}`, async () => {
    const db = env.authenticatedContext("admin-a", claims("company_admin", "alpha")).firestore();
    const snap = await assertSucceeds(col(db, "alpha", collection).get());
    assert.ok(snap.size >= 1);
  });

  test(`query-contract: cross-tenant Dispo query fails for ${collection}`, async () => {
    const db = env.authenticatedContext("dispatcher-b", claims("dispatcher", "beta")).firestore();
    await assertFails(col(db, "alpha", collection).where("groupId", "==", "310").get());
    await assertFails(col(db, "alpha", collection).get());
  });
}

test("query-contract: knownGroupIds array-contains still fails for Dispo", async () => {
  const db = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  await assertFails(col(db, "alpha", "drivers").where("knownGroupIds", "array-contains", "310").get());
});

test("query-contract: buses groupIds membership (get + foreign array-contains deny)", async () => {
  const db = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  // Production client query shape (firebase-service): groupId == assigned
  const byGroupId = await assertSucceeds(
    col(db, "alpha", "buses").where("groupId", "==", "310").get()
  );
  assert.ok(byGroupId.size >= 1);
  // Rules groupIds.hasAny branch via document get (list array-contains + get()-based
  // membership is not query-provable in Firestore Rules — client does not use that shape).
  await assertSucceeds(col(db, "alpha", "buses").doc("bus-multi").get());
  await assertSucceeds(col(db, "alpha", "buses").doc("bus-gids-only").get());
  await assertFails(col(db, "alpha", "buses").doc("bus-105").get());
  await assertFails(col(db, "alpha", "buses").where("groupIds", "array-contains", "105").get());
});

test("query-contract: driver own queries succeed; foreign fail", async () => {
  const db = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  await assertSucceeds(col(db, "alpha", "drivers").doc("driver-a").get());
  await assertFails(col(db, "alpha", "drivers").doc("driver-b").get());

  await assertSucceeds(col(db, "alpha", "vacations").where("driverId", "==", "driver-a").get());
  await assertFails(col(db, "alpha", "vacations").where("driverId", "==", "driver-b").get());
  await assertFails(col(db, "alpha", "vacations").get());

  await assertSucceeds(col(db, "alpha", "lost_items").where("driverId", "==", "driver-a").get());
  await assertFails(col(db, "alpha", "lost_items").where("driverId", "==", "driver-b").get());

  await assertSucceeds(col(db, "alpha", "reports").where("driverId", "==", "driver-a").get());
  await assertFails(col(db, "alpha", "reports").where("driverId", "==", "driver-b").get());

  await assertSucceeds(col(db, "alpha", "shifts").where("driverId", "==", "driver-a").get());
  await assertFails(col(db, "alpha", "shifts").where("driverId", "==", "driver-b").get());

  await assertSucceeds(col(db, "alpha", "schedules").where("driverId", "==", "driver-a").get());
  await assertFails(col(db, "alpha", "schedules").where("driverId", "==", "driver-b").get());

  await assertSucceeds(col(db, "alpha", "buses").where("groupId", "==", "310").get());
  await assertFails(col(db, "alpha", "buses").where("groupId", "==", "105").get());
  await assertFails(col(db, "alpha", "buses").get());

  await assertSucceeds(col(db, "alpha", "routes").where("groupId", "==", "310").get());
  await assertFails(col(db, "alpha", "routes").where("groupId", "==", "105").get());

  await assertSucceeds(col(db, "alpha", "messages").where("recipientDriverId", "==", "driver-a").get());
  await assertFails(col(db, "alpha", "messages").doc("m-105").get());
  await assertFails(col(db, "alpha", "messages").get());
});

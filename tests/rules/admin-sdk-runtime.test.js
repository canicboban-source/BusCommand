const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

/**
 * The `uuid` override changes a transitive dependency of the Google client
 * libraries that the Admin SDK is built on. Loading the module is not proof that
 * it still works, so this suite drives real Firestore traffic through the Admin
 * SDK against the emulator: sentinels, timestamps, transactions, batched writes
 * and aggregation queries.
 *
 * `npm run test:rules` starts the Firestore emulator and exports
 * FIRESTORE_EMULATOR_HOST. Without it the suite skips instead of ever touching a
 * real project.
 */
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-admin-runtime";

let app;
let db;

test.before(() => {
  if (!EMULATOR) return;
  app = admin.initializeApp({ projectId: PROJECT_ID }, "admin-sdk-runtime");
  db = app.firestore();
});

test.after(async () => {
  if (app) await app.delete();
});

test("Admin SDK writes and reads server sentinels and timestamps", { skip: !EMULATOR }, async () => {
  const ref = db.collection("companies").doc("alpha").collection("shifts").doc("drv-1_2026-08-01");
  const scheduled = new Date("2026-08-01T04:30:00.000Z");

  await ref.set({
    driverId: "drv-1",
    groupId: "31099",
    startsAt: admin.firestore.Timestamp.fromDate(scheduled),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    tags: admin.firestore.FieldValue.arrayUnion("imported")
  });

  const snapshot = await ref.get();
  assert.equal(snapshot.exists, true);
  const data = snapshot.data();
  assert.equal(data.driverId, "drv-1");
  assert.equal(data.startsAt.toDate().toISOString(), scheduled.toISOString());
  assert.ok(data.updatedAt.toMillis() > 0, "serverTimestamp must resolve to a real time");
  assert.deepEqual(data.tags, ["imported"]);
});

test("Admin SDK transactions read and write consistently", { skip: !EMULATOR }, async () => {
  const ref = db.collection("companies").doc("alpha").collection("monthly_plan_imports").doc("imp-1");
  await ref.set({ status: "previewed", assigned: 0 });

  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    assert.equal(current.data().status, "previewed");
    transaction.set(ref, {
      status: "committed",
      assigned: current.data().assigned + 5,
      committedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });

  const after = await ref.get();
  assert.equal(after.data().status, "committed");
  assert.equal(after.data().assigned, 5);
});

test("Admin SDK batched writes apply deletes and field deletions together", { skip: !EMULATOR }, async () => {
  const collection = db.collection("companies").doc("alpha").collection("driver_credentials");
  await collection.doc("drv-1").set({ eid: "1001", activationCodeHash: "pending" });
  await collection.doc("drv-2").set({ eid: "1002" });

  const batch = db.batch();
  batch.set(collection.doc("drv-1"), {
    activationCodeHash: admin.firestore.FieldValue.delete()
  }, { merge: true });
  batch.delete(collection.doc("drv-2"));
  await batch.commit();

  const [first, second] = await Promise.all([
    collection.doc("drv-1").get(),
    collection.doc("drv-2").get()
  ]);
  assert.equal(first.data().eid, "1001");
  assert.equal("activationCodeHash" in first.data(), false);
  assert.equal(second.exists, false);
});

test("Admin SDK aggregation and filtered queries return expected counts", { skip: !EMULATOR }, async () => {
  const users = db.collection("companies").doc("beta").collection("users");
  await Promise.all([
    users.doc("ca-1").set({ role: "company_admin", active: true }),
    users.doc("disp-1").set({ role: "dispatcher", active: true }),
    users.doc("disp-2").set({ role: "dispatcher", active: false })
  ]);

  const total = await users.count().get();
  assert.equal(total.data().count, 3);

  const dispatchers = await users.where("role", "==", "dispatcher").count().get();
  assert.equal(dispatchers.data().count, 2);

  const ids = await users.select().get();
  assert.deepEqual(ids.docs.map((doc) => doc.id).sort(), ["ca-1", "disp-1", "disp-2"]);
});

test("uuid resolves to a patched version for every Admin SDK dependent", { skip: !EMULATOR }, () => {
  const { v4 } = require("uuid");
  const [major, minor, patch] = require("uuid/package.json").version.split(".").map(Number);
  const patched = major > 11 || (major === 11 && (minor > 1 || (minor === 1 && patch >= 1)));
  assert.ok(patched, "uuid must be >= 11.1.1 (GHSA-w5hq-g745-h8pq)");
  assert.match(v4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

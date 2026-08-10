/**
 * FAZA 2R-A.3 — real Firestore emulator concurrency for prepared→committing claim.
 * Requires FIRESTORE_EMULATOR_HOST (provided by `npm run test:rules`).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport,
  setGetActiveServicePlanForTests
} = require("../../server/staff-monthly-plan-import");
const { lockDocumentId } = require("../../server/group-monthly-plan-import");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-a3-concurrency";
const COMPANY_ID = "a3-company";
const GROUP_ID = "310";
const MONTH = "2026-08";
const ACTOR = "disp-a3";
const DRIVER_ID = "11111111-1111-4111-8111-111111111111";

let app;
let db;

test.before(() => {
  if (!EMULATOR) return;
  app = admin.initializeApp({ projectId: PROJECT_ID }, "phase2r-a3-concurrency");
  db = app.firestore();
  setGetActiveServicePlanForTests(async () => ({ duties: [{ code: "310.S01" }] }));
});

test.after(async () => {
  setGetActiveServicePlanForTests(null);
  if (app) await app.delete();
});

async function seedDriverAndBus() {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  await companyRef.set({ name: COMPANY_ID }, { merge: true });
  await companyRef.collection("drivers").doc(DRIVER_ID).set({
    active: true,
    groupId: GROUP_ID,
    firstName: "Ana",
    lastName: "Driver",
    name: "Ana Driver"
  });
  await companyRef.collection("buses").doc("bus-101").set({
    number: "101",
    active: true,
    opsStatus: "ready",
    groupId: GROUP_ID
  });
}

test("emulator: two parallel commits — one claims, other IN_PROGRESS, zero dual writes", {
  skip: !EMULATOR
}, async () => {
  await seedDriverAndBus();
  const preview = {
    groupId: GROUP_ID,
    month: MONTH,
    sourceName: "a3-emulator.xlsx",
    reason: "Dispatcher monthly plan import",
    fingerprint: crypto.createHash("sha256").update(`a3-conc-${Date.now()}`).digest("hex"),
    summary: { rows: 1, drivers: 1, assignments: 1, removals: 0 },
    rows: [{
      driverId: DRIVER_ID,
      driverName: "Ana Driver",
      date: `${MONTH}-03`,
      type: "morning",
      name: "310.S01",
      bus: "101",
      routeCode: "310.S01",
      start: "05:00",
      end: "13:00",
      expectedRevision: 0,
      previous: null
    }]
  };

  const prepared = await prepareStaffMonthlyImport({
    db,
    admin,
    companyId: COMPANY_ID,
    actorId: ACTOR,
    preview
  });

  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  let firstEntered = false;

  const first = commitStaffMonthlyImport({
    db,
    admin,
    companyId: COMPANY_ID,
    actorId: ACTOR,
    importId: prepared.id,
    fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID],
    afterLockHook: async () => {
      firstEntered = true;
      await barrier;
    }
  });

  for (let i = 0; i < 100 && !firstEntered; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.equal(firstEntered, true, "first claim must enter afterLockHook");

  const secondErr = await commitStaffMonthlyImport({
    db,
    admin,
    companyId: COMPANY_ID,
    actorId: ACTOR,
    importId: prepared.id,
    fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  }).then(() => null, (e) => e);

  assert.ok(secondErr, "second commit must fail");
  assert.equal(secondErr.code, "MONTHLY_IMPORT_IN_PROGRESS");
  assert.equal(secondErr.retryable, true);

  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const shiftSnap = await companyRef.collection("shifts")
    .doc(`${DRIVER_ID}_${MONTH}-03`).get();
  assert.equal(shiftSnap.exists, false, "second must not write shifts while first is mid-flight");

  const jobMid = await companyRef.collection("monthly_plan_imports").doc(prepared.id).get();
  assert.equal(jobMid.data().status, "committing");
  const lockMid = await companyRef.collection("monthly_plan_import_locks")
    .doc(lockDocumentId(GROUP_ID, MONTH)).get();
  assert.equal(lockMid.exists, true);
  assert.equal(lockMid.data().importId, prepared.id);

  release();
  const firstResult = await first;
  assert.equal(firstResult.idempotent, false);

  const jobDone = await companyRef.collection("monthly_plan_imports").doc(prepared.id).get();
  assert.equal(jobDone.data().status, "completed");
  const shiftDone = await companyRef.collection("shifts")
    .doc(`${DRIVER_ID}_${MONTH}-03`).get();
  assert.equal(shiftDone.exists, true);
  assert.equal(shiftDone.data().importId, prepared.id);
  assert.equal(shiftDone.data().revision, 1);

  const again = await commitStaffMonthlyImport({
    db,
    admin,
    companyId: COMPANY_ID,
    actorId: ACTOR,
    importId: prepared.id,
    fingerprint: prepared.fingerprint,
    actorGroups: [GROUP_ID]
  });
  assert.equal(again.idempotent, true);
  const revAfter = (await companyRef.collection("shifts")
    .doc(`${DRIVER_ID}_${MONTH}-03`).get()).data().revision;
  assert.equal(revAfter, 1);
});

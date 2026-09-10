const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { activateServicePlan } = require("../../server/service-plans");

test("independent Firestore clients cannot leave two active catalogs", { timeout: 120000 }, async t => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) return t.skip("Requires local Firestore emulator");
  assert.match(host, /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/, "emulator must be local");
  const suffix = crypto.randomBytes(8).toString("hex");
  const projectId = process.env.GCLOUD_PROJECT || "buscommand-preview";
  const firstApp = admin.initializeApp({ projectId }, `catalog-first-${suffix}`);
  const secondApp = admin.initializeApp({ projectId }, `catalog-second-${suffix}`);
  const db = firstApp.firestore();
  const secondDb = secondApp.firestore();
  const companyId = `test-catalog-${suffix}`;
  const otherCompanyId = `test-catalog-other-${suffix}`;
  const company = db.collection("companies").doc(companyId);
  const other = db.collection("companies").doc(otherCompanyId);
  try {
    await other.collection("service_plans").doc("sentinel").set({ groupId: "group-a", status: "active" });
    for (const withActive of [false, true]) {
      const groupId = withActive ? "group-b" : "group-a";
      const plans = company.collection("service_plans");
      await company.collection("groups").doc(groupId).set({ name: "Concurrency test" });
      const ids = [`${groupId}-first`, `${groupId}-second`];
      for (const id of ids) await plans.doc(id).set({ groupId, status: "staged", revisionId: id });
      if (withActive) await plans.doc(`${groupId}-old`).set({ groupId, status: "active" });
      const results = await Promise.all(ids.map((planId, index) => activateServicePlan({
        db: index ? secondDb : db, admin, companyId, groupId, actorId: `test-ca-${index}`, planId
      })));
      assert.equal(results.every(result => result.status === "active"), true);
      const snapshot = await plans.where("groupId", "==", groupId).get();
      const active = snapshot.docs.filter(doc => doc.data().status === "active");
      assert.equal(active.length, 1);
      const winner = active[0].id;
      const loser = ids.find(id => id !== winner);
      assert.equal((await plans.doc(loser).get()).data().supersededBy, winner);
      const repeated = await activateServicePlan({ db: secondDb, admin, companyId, groupId, actorId: "test-ca", planId: winner });
      assert.equal(repeated.alreadyActive, true);
      await assert.rejects(activateServicePlan({ db, admin, companyId, groupId, actorId: "test-ca", planId: "sentinel" }), error => error.code === "plan-not-found");
    }
    assert.deepEqual((await other.collection("service_plans").doc("sentinel").get()).data(), { groupId: "group-a", status: "active" });
  } finally {
    try {
      await db.recursiveDelete(company);
      await db.recursiveDelete(other);
    } finally {
      await Promise.all([firstApp.delete(), secondApp.delete()]);
    }
  }
});

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  activateServicePlan,
  getActiveServicePlan,
  getServicePlanVersion,
  listServicePlanHistory,
  publishServicePlan,
  servicePlanId
} = require("../../server/service-plans");

function validPlan(version = "66") {
  return {
    templateVersion: "BUSCOMMAND-DIENSTPLAN-1",
    planCode: "310",
    planVersion: version,
    validFrom: version === "66" ? "2026-02-09" : "2026-03-01",
    timezone: "Europe/Vienna",
    duties: [{
      code: "310.S01", dayType: "SCHOOL_WEEKDAY", workStart: "04:02",
      firstTripStart: "04:33", lastTripEnd: "14:00", workEnd: "14:35",
      activities: [
        { dutyCode: "310.S01", sequence: 1, type: "ARBEIT", start: "04:02", end: "04:17" },
        { dutyCode: "310.S01", sequence: 2, type: "DEPOT", start: "04:17", end: "04:33" },
        { dutyCode: "310.S01", sequence: 3, type: "FAHRT", start: "04:33", end: "14:00" },
        { dutyCode: "310.S01", sequence: 4, type: "DEPOT", start: "14:00", end: "14:25" },
        { dutyCode: "310.S01", sequence: 5, type: "ARBEIT", start: "14:25", end: "14:35" }
      ]
    }]
  };
}

function createDb() {
  const plans = new Map();
  const duties = new Map();
  const groups = new Set(["group-a", "group-b"]);
  let revision = 0;
  const metrics = { retries: 0 };

  function planRef(id) {
    return {
      kind: "plan", id,
      async get() {
        return { exists: plans.has(id), id, ref: planRef(id), data: () => plans.get(id) };
      },
      collection(name) {
        assert.equal(name, "duties");
        return {
          doc(dutyId) { return { kind: "duty", planId: id, id: dutyId }; },
          where(field, operator, value) {
            assert.equal(field, "revisionId");
            assert.equal(operator, "==");
            return {
              async get() {
                const rows = [...(duties.get(id) || new Map()).entries()]
                  .filter(([, data]) => data.revisionId === value)
                  .map(([dutyId, data]) => ({ id: dutyId, data: () => ({ ...data }) }));
                return { docs: rows };
              }
            };
          }
        };
      }
    };
  }

  const plansRef = {
    doc: planRef,
    where(field, operator, value) {
      assert.equal(operator, "==");
      return {
        async get() {
          const docs = [...plans.entries()]
            .filter(([, data]) => data[field] === value)
            .map(([id, data]) => ({ id, ref: planRef(id), data: () => ({ ...data }) }));
          return { docs };
        }
      };
    }
  };

  return {
    plans,
    duties,
    metrics,
    async runTransaction(callback) {
      // Optimistic DB double: invalidate a read when a concurrent commit wins.
      // Deliberately conservative (whole-store revision), not an emulator.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        let readRevision = null;
        let writesStarted = false;
        const batch = this.batch();
        const result = await callback({
          get: async ref => {
            assert.equal(writesStarted, false, "transaction reads must precede writes");
            if (readRevision === null) readRevision = revision;
            return ref.get();
          },
          set: (...args) => { writesStarted = true; batch.set(...args); }
        });
        if (readRevision !== null && readRevision !== revision) {
          metrics.retries += 1;
          continue;
        }
        await batch.commit();
        return result;
      }
      throw new Error("transaction retries exhausted");
    },
    collection(name) {
      assert.equal(name, "companies");
      return {
        doc(companyId) {
          assert.equal(companyId, "alpha");
          return {
            collection(name) {
              if (name === "service_plans") return plansRef;
              assert.equal(name, "groups");
              return { doc(groupId) { return { async get() { return { exists: groups.has(groupId) }; } }; } };
            }
          };
        }
      };
    },
    batch() {
      const operations = [];
      return {
        set(ref, data, options) { operations.push({ ref, data, options }); },
        async commit() {
          if (operations.length) revision += 1;
          operations.forEach(({ ref, data, options }) => {
            if (ref.kind === "plan") {
              plans.set(ref.id, options?.merge ? { ...(plans.get(ref.id) || {}), ...data } : { ...data });
            } else {
              if (!duties.has(ref.planId)) duties.set(ref.planId, new Map());
              duties.get(ref.planId).set(ref.id, { ...data });
            }
          });
        }
      };
    }
  };
}

const admin = { firestore: { FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" } } };

async function stageAndActivate(db, version, actor = "admin-1", groupId = "group-a") {
  const staged = await publishServicePlan({
    db, admin, companyId: "alpha", groupId, actorId: actor, plan: validPlan(version),
    source: { fileName: `plan-${version}.xlsx`, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", byteSize: 1200 }
  });
  const activated = await activateServicePlan({
    db, admin, companyId: "alpha", groupId, actorId: actor, planId: staged.planId
  });
  return { staged, activated };
}

test("publish stages an immutable revision with source hash and does not go live", async () => {
  const db = createDb();
  const staged = await publishServicePlan({
    db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan: validPlan("66"),
    source: { fileName: "dienst.xlsx", byteSize: 2048 }
  });
  assert.equal(staged.status, "staged");
  assert.equal(db.plans.get(staged.planId).status, "staged");
  assert.equal(db.plans.get(staged.planId).sourceHash, staged.sourceHash);
  assert.match(staged.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(db.plans.get(staged.planId).sourceFileName, "dienst.xlsx");
  assert.equal(db.duties.get(staged.planId).size, 1);
  assert.equal(await getActiveServicePlan({ db, companyId: "alpha", groupId: "group-a" }), null);
});

test("activate flips the live pointer and supersedes the prior active version", async () => {
  const db = createDb();
  const first = await stageAndActivate(db, "66");
  const second = await stageAndActivate(db, "67", "admin-2");
  assert.equal(db.plans.get(first.staged.planId).status, "superseded");
  assert.equal(db.plans.get(first.staged.planId).supersededBy, second.staged.planId);
  assert.equal(db.plans.get(second.staged.planId).status, "active");
  assert.equal(second.activated.previousActivePlanId, first.staged.planId);

  const active = await getActiveServicePlan({ db, companyId: "alpha", groupId: "group-a" });
  assert.equal(active.planVersion, "67");
  assert.equal(active.duties[0].workStart, "04:02");
});

test("rollback re-activates a superseded version with audit trail", async () => {
  const db = createDb();
  const first = await stageAndActivate(db, "66");
  const second = await stageAndActivate(db, "67");
  const rolled = await activateServicePlan({
    db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-3", planId: first.staged.planId
  });
  assert.equal(rolled.previousActivePlanId, second.staged.planId);
  assert.equal(db.plans.get(first.staged.planId).status, "active");
  assert.equal(db.plans.get(second.staged.planId).status, "superseded");
  assert.equal(db.plans.get(first.staged.planId).rolledBackFrom, second.staged.planId);
});

test("service plan history keeps immutable metadata and loads an archived duty detail", async () => {
  const db = createDb();
  const first = await stageAndActivate(db, "66");
  const second = await stageAndActivate(db, "67", "admin-2");
  const history = await listServicePlanHistory({ db, companyId: "alpha", groupId: "group-a" });
  assert.equal(history.length, 2);
  assert.equal(history.find(plan => plan.id === first.staged.planId).status, "superseded");
  assert.equal(history.find(plan => plan.id === second.staged.planId).status, "active");
  assert.ok(history.find(plan => plan.id === second.staged.planId).sourceHash);
  const archived = await getServicePlanVersion({ db, companyId: "alpha", groupId: "group-a", planId: first.staged.planId });
  assert.equal(archived.planVersion, "66");
  assert.equal(archived.duties[0].activities.length, 5);
  assert.equal(await getServicePlanVersion({ db, companyId: "alpha", groupId: "group-b", planId: first.staged.planId }), null);
});

test("an already staged version cannot overwrite audit history", async () => {
  const db = createDb();
  await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan: validPlan("66") });
  await assert.rejects(
    publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-2", plan: validPlan("66") }),
    error => error.code === "version-exists"
  );
  assert.equal(db.plans.size, 1);
});

test("service plan IDs are stable and contain no Firestore path separators", () => {
  const plan = validPlan();
  assert.equal(servicePlanId("group-a", plan), servicePlanId("group-a", plan));
  assert.equal(servicePlanId("group-a", plan).includes("/"), false);
});

test("the same plan can be published independently to multiple company groups", async () => {
  const db = createDb();
  const groupA = await stageAndActivate(db, "66", "admin-1", "group-a");
  const groupB = await stageAndActivate(db, "66", "admin-1", "group-b");

  assert.notEqual(groupA.staged.planId, groupB.staged.planId);
  assert.equal(db.plans.get(groupA.staged.planId).status, "active");
  assert.equal(db.plans.get(groupB.staged.planId).status, "active");
  assert.equal((await getActiveServicePlan({ db, companyId: "alpha", groupId: "group-a" })).groupId, "group-a");
  assert.equal((await getActiveServicePlan({ db, companyId: "alpha", groupId: "group-b" })).groupId, "group-b");
});

test("publishing rejects a group that does not belong to the company", async () => {
  const db = createDb();
  await assert.rejects(
    publishServicePlan({ db, admin, companyId: "alpha", groupId: "missing", actorId: "admin-1", plan: validPlan() }),
    error => error.code === "group-not-found"
  );
  assert.equal(db.plans.size, 0);
});

for (const withActive of [false, true]) {
  test(`parallel activation leaves one active version (prior active: ${withActive})`, async () => {
    const db = createDb();
    if (withActive) await stageAndActivate(db, "65");
    const staged = [];
    for (const version of ["66", "67"]) {
      staged.push(await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "ca", plan: validPlan(version) }));
    }
    const results = await Promise.all(staged.map(({ planId }) => activateServicePlan({
      db, admin, companyId: "alpha", groupId: "group-a", actorId: "ca", planId
    })));
    assert.equal(results.every(result => result.status === "active"), true);
    const active = [...db.plans.entries()].filter(([, plan]) => plan.status === "active");
    assert.equal(active.length, 1, "parallel requests must not leave two active catalogs");
    const winner = active[0][0];
    const loser = staged.find(plan => plan.planId !== winner).planId;
    assert.equal(db.plans.get(loser).status, "superseded");
    assert.equal(db.plans.get(loser).supersededBy, winner);
    assert.equal(db.plans.get(winner).rolledBackFrom, loser);
    assert.ok(db.metrics.retries > 0, "test must exercise a retried conflicting transaction");
  });
}

test("activation rejects wrong group, missing version and invalid status without writes", async () => {
  const db = createDb();
  const staged = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "ca", plan: validPlan() });
  const input = { db, admin, companyId: "alpha", groupId: "group-a", actorId: "ca", planId: staged.planId };
  for (const [changes, code] of [
    [{ groupId: "missing" }, "group-not-found"],
    [{ groupId: "group-b" }, "plan-not-found"],
    [{ planId: "missing-version" }, "plan-not-found"]
  ]) await assert.rejects(activateServicePlan({ ...input, ...changes }), error => error.code === code);
  db.plans.get(staged.planId).status = "invalid";
  const before = JSON.stringify([...db.plans]);
  await assert.rejects(activateServicePlan(input), error => error.code === "invalid-status");
  assert.equal(JSON.stringify([...db.plans]), before);
});

test("repeat activation is idempotent and commit failure cannot report success", async () => {
  const db = createDb();
  const { staged } = await stageAndActivate(db, "66");
  const input = { db, admin, companyId: "alpha", groupId: "group-a", actorId: "other-ca", planId: staged.planId };
  const before = JSON.stringify([...db.plans]);
  assert.equal((await activateServicePlan(input)).alreadyActive, true);
  assert.equal(JSON.stringify([...db.plans]), before);
  const pending = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "ca", plan: validPlan("67") });
  const beforeFailure = JSON.stringify([...db.plans]);
  db.runTransaction = async callback => {
    await callback({ get: ref => ref.get(), set() {} });
    throw new Error("commit unavailable");
  };
  await assert.rejects(activateServicePlan({ ...input, planId: pending.planId }), /commit unavailable/);
  assert.equal(JSON.stringify([...db.plans]), beforeFailure);
});

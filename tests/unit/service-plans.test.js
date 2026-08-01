const assert = require("node:assert/strict");
const test = require("node:test");

const { getActiveServicePlan, getServicePlanVersion, listServicePlanHistory, publishServicePlan, servicePlanId } = require("../../server/service-plans");

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

test("service plan publish stores the validated revision and supersedes the prior version", async () => {
  const db = createDb();
  const first = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan: validPlan("66") });
  assert.equal(first.planId, "group-a-310-66-2026-02-09");
  assert.equal(db.plans.get(first.planId).groupId, "group-a");
  assert.equal(db.plans.get(first.planId).status, "active");
  assert.equal(db.duties.get(first.planId).size, 1);

  const second = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan: validPlan("67") });
  assert.equal(db.plans.get(first.planId).status, "superseded");
  assert.equal(db.plans.get(first.planId).supersededBy, second.planId);
  assert.equal(db.plans.get(second.planId).status, "active");

  const active = await getActiveServicePlan({ db, companyId: "alpha", groupId: "group-a" });
  assert.equal(active.planVersion, "67");
  assert.equal(active.duties[0].workStart, "04:02");
  assert.equal(active.duties[0].firstTripStart, "04:33");
  assert.equal(active.duties[0].lastTripEnd, "14:00");
  assert.equal(active.duties[0].workEnd, "14:35");
});

test("service plan history keeps immutable metadata and loads an archived duty detail", async () => {
  const db = createDb();
  const first = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan: validPlan("66") });
  const second = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-2", plan: validPlan("67") });
  const history = await listServicePlanHistory({ db, companyId: "alpha", groupId: "group-a" });
  assert.equal(history.length, 2);
  assert.equal(history.find(plan => plan.id === first.planId).status, "superseded");
  assert.equal(history.find(plan => plan.id === second.planId).status, "active");
  const archived = await getServicePlanVersion({ db, companyId: "alpha", groupId: "group-a", planId: first.planId });
  assert.equal(archived.planVersion, "66");
  assert.equal(archived.duties[0].activities.length, 5);
  assert.equal(await getServicePlanVersion({ db, companyId: "alpha", groupId: "group-b", planId: first.planId }), null);
});

test("an already published version cannot overwrite audit history", async () => {
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
  const plan = validPlan("66");
  const groupA = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan });
  const groupB = await publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-b", actorId: "admin-1", plan });

  assert.notEqual(groupA.planId, groupB.planId);
  assert.equal(db.plans.get(groupA.planId).status, "active");
  assert.equal(db.plans.get(groupB.planId).status, "active");
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

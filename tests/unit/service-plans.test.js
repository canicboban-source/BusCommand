const assert = require("node:assert/strict");
const fs = require("node:fs");
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
  const audits = new Map();
  const groups = new Set(["group-a", "group-b"]);
  const groupDocs = new Map([...groups].map(id => [id, { id }]));
  let auditSequence = 0;
  let transactionRuns = 0;
  let transactionTail = Promise.resolve();

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
        kind: "query",
        field,
        value,
        async get() {
          const docs = [...plans.entries()]
            .filter(([, data]) => data[field] === value)
            .map(([id, data]) => ({ id, ref: planRef(id), data: () => ({ ...data }) }));
          return { docs };
        }
      };
    }
  };

  function auditRef(id = `audit-${++auditSequence}`) {
    return { kind: "audit", id };
  }

  function applyOperations(operations) {
    operations.forEach(({ type, ref }) => {
      if (type === "create" && ref.kind === "plan" && plans.has(ref.id)) {
        const error = new Error("already-exists");
        error.code = 6;
        throw error;
      }
    });
    operations.forEach(({ ref, data, options }) => {
      if (ref.kind === "plan") {
        plans.set(ref.id, options?.merge ? { ...(plans.get(ref.id) || {}), ...data } : { ...data });
      } else if (ref.kind === "group") {
        groupDocs.set(ref.id, options?.merge ? { ...(groupDocs.get(ref.id) || {}), ...data } : { ...data });
      } else if (ref.kind === "audit") {
        audits.set(ref.id, { ...data });
      } else {
        if (!duties.has(ref.planId)) duties.set(ref.planId, new Map());
        duties.get(ref.planId).set(ref.id, { ...data });
      }
    });
  }

  return {
    plans,
    duties,
    audits,
    groupDocs,
    get transactionRuns() { return transactionRuns; },
    collection(name) {
      assert.equal(name, "companies");
      return {
        doc(companyId) {
          assert.equal(companyId, "alpha");
          return {
            collection(name) {
              if (name === "service_plans") return plansRef;
              if (name === "groups") {
                return { doc(groupId) { return { kind: "group", id: groupId, async get() { return { exists: groups.has(groupId), data: () => groupDocs.get(groupId) }; } }; } };
              }
              assert.equal(name, "audit_log");
              return { doc: auditRef };
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
          applyOperations(operations);
        }
      };
    },
    runTransaction(updateFunction) {
      const run = transactionTail.then(async () => {
        transactionRuns += 1;
        const operations = [];
        const transaction = {
          async get(ref) {
            if (ref.kind === "query") return ref.get();
            return ref.get();
          },
          set(ref, data, options) { operations.push({ type: "set", ref, data, options }); },
          create(ref, data) { operations.push({ type: "create", ref, data }); }
        };
        const result = await updateFunction(transaction);
        applyOperations(operations);
        return result;
      });
      transactionTail = run.catch(() => undefined);
      return run;
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

test("service plan metadata duties supersession and tenant audit commit atomically", async () => {
  const db = createDb();
  const result = await publishServicePlan({
    db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1",
    actorRole: "company_admin", actorName: "QA Admin", plan: validPlan("66")
  });
  assert.equal(db.transactionRuns, 1);
  assert.equal(db.audits.size, 1);
  const audit = [...db.audits.values()][0];
  assert.equal(audit.action, "service_plan_published");
  assert.equal(audit.actorId, "admin-1");
  assert.equal(audit.actorRole, "company_admin");
  assert.equal(audit.details.planId, result.planId);
  assert.equal(audit.details.groupId, "group-a");
  assert.equal(audit.details.dutyCount, 1);
  assert.equal(db.groupDocs.get("group-a").activeServicePlanId, result.planId);
});

test("concurrent duplicate publications preserve immutable history", async () => {
  const db = createDb();
  const input = { db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan: validPlan("66") };
  const results = await Promise.allSettled([publishServicePlan(input), publishServicePlan(input)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const rejected = results.find(result => result.status === "rejected");
  assert.equal(rejected.reason.code, "version-exists");
  assert.equal(db.plans.size, 1);
  assert.equal(db.audits.size, 1);
});

test("concurrent versions leave exactly one active plan for a group", async () => {
  const db = createDb();
  await Promise.all([
    publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-1", plan: validPlan("66") }),
    publishServicePlan({ db, admin, companyId: "alpha", groupId: "group-a", actorId: "admin-2", plan: validPlan("67") })
  ]);
  const active = [...db.plans.values()].filter(plan => plan.groupId === "group-a" && plan.status === "active");
  assert.equal(active.length, 1);
  assert.equal(db.audits.size, 2);
});

test("Company Admin publish route delegates the tenant audit to the atomic service-plan transaction", () => {
  const api = fs.readFileSync(require.resolve("../../api-server.js"), "utf8").replace(/\r\n/g, "\n");
  const start = api.indexOf('app.put(\n  "/api/company-admin/service-plans/publish"');
  const end = api.indexOf('app.get(\n  "/api/company-admin/service-plans/history"', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const route = api.slice(start, end);
  assert.match(route, /publishServicePlan\([\s\S]*?actorId: req\.staffUser\.uid/);
  assert.match(route, /actorRole: req\.staffUser\.role/);
  assert.match(route, /actorName: req\.staffUser\.name \|\| null/);
  assert.doesNotMatch(route, /_logAuditEvent/);
});

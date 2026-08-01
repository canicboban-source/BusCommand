const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  createRequireSuperAdmin,
  createSuperAdminOverviewHandler,
  getSuperAdminOverview
} = require("../../server/superadmin-overview");

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function countSnapshot(count) {
  return { data: () => ({ count }) };
}

function fakeDatabase(companies) {
  const reads = [];
  const docs = Object.entries(companies).map(([id, counts]) => ({
    id,
    ref: {
      collection(name) {
        reads.push(`companies/${id}/${name}`);
        if (name === "users") {
          return {
            where(field, op, value) {
              assert.equal(field, "role");
              assert.equal(op, "==");
              assert.equal(value, "dispatcher");
              reads.push(`companies/${id}/users?role=dispatcher`);
              return {
                count: () => ({
                  get: async () => countSnapshot(counts.dispatchers || 0)
                })
              };
            }
          };
        }
        if (!Object.hasOwn(counts, name)) throw new Error(`forbidden collection: ${name}`);
        return { count: () => ({ get: async () => countSnapshot(counts[name]) }) };
      }
    }
  }));
  return {
    reads,
    collection(name) {
      reads.push(name);
      assert.equal(name, "companies");
      return {
        count: () => ({ get: async () => countSnapshot(docs.length) }),
        select: () => ({ get: async () => ({ docs }) })
      };
    }
  };
}

test("overview rejects unauthenticated and non-superadmin roles", async () => {
  for (const role of ["company_admin", "dispatcher", "driver"]) {
    let nextCalled = false;
    const middleware = createRequireSuperAdmin({
      hasFirebase: () => true,
      admin: () => ({ auth: () => ({ verifyIdToken: async () => ({ uid: "user", role }) }) })
    });
    const res = response();
    await middleware({ headers: { authorization: "Bearer role-token" } }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403, role);
    assert.equal(nextCalled, false, role);
  }
  const middleware = createRequireSuperAdmin({ hasFirebase: () => false, admin: () => ({}) });
  const res = response();
  await middleware({ headers: {} }, res, () => assert.fail("unauthenticated request reached handler"));
  assert.equal(res.statusCode, 401);

  let superadminReachedHandler = false;
  const superadminMiddleware = createRequireSuperAdmin({
    hasFirebase: () => true,
    admin: () => ({ auth: () => ({ verifyIdToken: async () => ({ uid: "root", role: "superadmin" }) }) })
  });
  await superadminMiddleware(
    { headers: { authorization: "Bearer superadmin-token" } },
    response(),
    () => { superadminReachedHandler = true; }
  );
  assert.equal(superadminReachedHandler, true);
});

test("overview aggregation sums tenants and preserves zero-count companies", async () => {
  const database = fakeDatabase({
    alpha: { drivers: 1, dispatchers: 2 },
    empty: { drivers: 0, dispatchers: 0 }
  });
  const stats = await getSuperAdminOverview(database);
  assert.deepEqual(stats, { companies: 2, drivers: 1, dispatchers: 2 });
  assert.equal(database.reads.some((item) => item.includes("driver_credentials")), false);
  assert.deepEqual(database.reads.sort(), [
    "companies",
    "companies/alpha/drivers",
    "companies/alpha/users",
    "companies/alpha/users?role=dispatcher",
    "companies/empty/drivers",
    "companies/empty/users",
    "companies/empty/users?role=dispatcher"
  ].sort());
});

test("superadmin response contains numeric counters only and supports Preview shape", async () => {
  const database = fakeDatabase({ preview: { drivers: 1, dispatchers: 1 } });
  const handler = createSuperAdminOverviewHandler({ db: () => database });
  const res = response();
  await handler({}, res);
  assert.deepEqual(res.body, { success: true, stats: { companies: 1, drivers: 1, dispatchers: 1 } });
  const serialized = JSON.stringify(res.body).toLowerCase();
  for (const forbidden of ["eid", "email", "phone", "code", "hash", "name", "driver_credentials"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("production client clears stale counters and reloads company admins from server", () => {
  const client = fs.readFileSync(path.join(__dirname, "../../js/admin/superadmin.js"), "utf8");
  const translations = fs.readFileSync(path.join(__dirname, "../../translations.js"), "utf8");
  const production = client.match(/async function renderSuperAdminDashboardProduction[\s\S]*?\n\}/)[0];
  assert.match(production, /ApiClient\.getSuperAdminOverview\(\)/);
  assert.match(production, /ApiClient\.getCompanyAdmins\(\)/);
  assert.match(production, /window\.state\.companyAdmins\s*=/);
  assert.match(production, /element\.textContent = "—"/);
  assert.match(production, /superadmin_stats_error/);
  assert.doesNotMatch(production, /localStorage|_renderSuperAdminDashboardDemo/);
  assert.equal((translations.match(/superadmin_stats_error:/g) || []).length, 3);
});

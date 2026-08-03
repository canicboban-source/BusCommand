const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createStaffAuth, parseCompanyParam } = require("../../server/staff-auth");

/**
 * These tests exercise the middleware over real HTTP so an authorization
 * regression fails here instead of being masked by a source-text assertion.
 */

function fakeAdmin({ tokens, verifyCalls }) {
  return {
    auth: () => ({
      async verifyIdToken(token, checkRevoked) {
        verifyCalls.push({ token, checkRevoked });
        const claims = tokens.get(token);
        if (!claims) {
          const error = new Error("auth/argument-error");
          error.code = "auth/argument-error";
          throw error;
        }
        if (claims.revoked) {
          const error = new Error("auth/id-token-revoked");
          error.code = "auth/id-token-revoked";
          throw error;
        }
        return claims;
      }
    })
  };
}

function fakeDb(profiles) {
  return {
    collection: (companies) => {
      assert.equal(companies, "companies");
      return {
        doc: (companyId) => ({
          collection: (users) => {
            assert.equal(users, "users");
            return {
              doc: (uid) => ({
                async get() {
                  const key = `${companyId}/${uid}`;
                  if (profiles.failFor === key) throw new Error("firestore unavailable");
                  const data = profiles.get(key);
                  return { exists: Boolean(data), data: () => data };
                }
              })
            };
          }
        })
      };
    }
  };
}

async function startServer({ hasFirebase = true, tokens, profiles } = {}) {
  const verifyCalls = [];
  const auth = createStaffAuth({
    hasFirebase: () => hasFirebase,
    admin: () => fakeAdmin({ tokens, verifyCalls }),
    db: () => fakeDb(profiles)
  });

  const app = express();
  app.use(express.json());

  app.get("/staff/echo", auth.requireCompanyStaff, (req, res) => {
    res.json({ success: true, role: req.staffUser.role, groups: req.staffUser.groups });
  });

  app.post("/admin/echo", auth.requireCompanyAdmin, (req, res) => {
    const companyId = auth.requireOwnCompany(req, res);
    if (!companyId) return undefined;
    return res.json({ success: true, companyId });
  });

  app.post("/provision/echo", auth.requireUserProvisioner, (req, res) => {
    res.json({ success: true, role: req.adminUser.role });
  });

  app.get("/license/:companyId", auth.requireCompanyMemberParam, (req, res) => {
    res.json({ success: true, companyId: req.tenantId, role: req.companyMember.role });
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const { port } = server.address();

  return {
    verifyCalls,
    async request(path, { token, method = "GET", body } = {}) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      return { status: response.status, body: await response.json() };
    },
    async close() {
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

function fixture() {
  const tokens = new Map([
    ["ca-alpha", { uid: "ca-1", role: "company_admin", companyId: "alpha", name: "CA" }],
    ["disp-alpha", { uid: "disp-1", role: "dispatcher", companyId: "alpha", groups: ["999"] }],
    ["disp-inactive", { uid: "disp-2", role: "dispatcher", companyId: "alpha" }],
    ["disp-ghost", { uid: "disp-ghost", role: "dispatcher", companyId: "alpha" }],
    ["disp-beta", { uid: "disp-3", role: "dispatcher", companyId: "beta" }],
    ["driver-alpha", { uid: "drv-1", role: "driver", companyId: "alpha" }],
    ["sa", { uid: "sa-1", role: "superadmin" }],
    ["ca-revoked", { uid: "ca-1", role: "company_admin", companyId: "alpha", revoked: true }],
    ["claims-only", { uid: "ca-9", role: "company_admin" }],
    ["role-drift", { uid: "disp-4", role: "company_admin", companyId: "alpha" }]
  ]);
  const profiles = new Map([
    ["alpha/ca-1", { role: "company_admin", active: true, name: "Alpha Admin" }],
    // Claims still carry the stale group 999; the profile is authoritative.
    ["alpha/disp-1", { role: "dispatcher", active: true, groups: ["310"] }],
    ["alpha/disp-2", { role: "dispatcher", active: false, groups: ["310"] }],
    ["alpha/disp-4", { role: "dispatcher", active: true, groups: ["310"] }],
    ["beta/disp-3", { role: "dispatcher", active: true, groups: ["105"] }]
  ]);
  return { tokens, profiles };
}

test("staff API rejects requests without a bearer token", async () => {
  const server = await startServer(fixture());
  try {
    const response = await server.request("/staff/echo");
    assert.equal(response.status, 401);
    assert.equal(response.body.success, false);
  } finally {
    await server.close();
  }
});

test("staff API rejects unknown and revoked tokens with checkRevoked enabled", async () => {
  const server = await startServer(fixture());
  try {
    assert.equal((await server.request("/staff/echo", { token: "forged" })).status, 401);
    assert.equal((await server.request("/staff/echo", { token: "ca-revoked" })).status, 401);
    assert.ok(server.verifyCalls.length >= 2);
    for (const call of server.verifyCalls) assert.equal(call.checkRevoked, true);
  } finally {
    await server.close();
  }
});

test("driver and superadmin tokens cannot reach staff routes", async () => {
  const server = await startServer(fixture());
  try {
    assert.equal((await server.request("/staff/echo", { token: "driver-alpha" })).status, 403);
    assert.equal((await server.request("/staff/echo", { token: "sa" })).status, 403);
  } finally {
    await server.close();
  }
});

test("staff route resolves dispatcher groups from the tenant profile, not from claims", async () => {
  const server = await startServer(fixture());
  try {
    const response = await server.request("/staff/echo", { token: "disp-alpha" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.groups, ["310"]);
  } finally {
    await server.close();
  }
});

test("deactivated, missing and role-drifted profiles are refused even with a valid token", async () => {
  const server = await startServer(fixture());
  try {
    for (const token of ["disp-inactive", "disp-ghost", "role-drift"]) {
      const response = await server.request("/staff/echo", { token });
      assert.equal(response.status, 403, `token ${token} must be refused`);
      assert.equal(response.body.error, "Nalog nije aktivan.");
    }
  } finally {
    await server.close();
  }
});

test("staff token without a companyId claim cannot reach tenant data", async () => {
  const server = await startServer(fixture());
  try {
    const response = await server.request("/staff/echo", { token: "claims-only" });
    assert.equal(response.status, 403);
  } finally {
    await server.close();
  }
});

test("company admin routes refuse dispatchers and accept the tenant owner", async () => {
  const server = await startServer(fixture());
  try {
    const refused = await server.request("/admin/echo", {
      token: "disp-alpha", method: "POST", body: { companyId: "alpha" }
    });
    assert.equal(refused.status, 403);

    const accepted = await server.request("/admin/echo", {
      token: "ca-alpha", method: "POST", body: { companyId: "ALPHA" }
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.companyId, "alpha");
  } finally {
    await server.close();
  }
});

test("cross-tenant and malformed company ids are refused before any handler work", async () => {
  const server = await startServer(fixture());
  try {
    const crossTenant = await server.request("/admin/echo", {
      token: "ca-alpha", method: "POST", body: { companyId: "beta" }
    });
    assert.equal(crossTenant.status, 403);
    assert.equal(crossTenant.body.error, "Pristup drugoj firmi nije dozvoljen.");

    const malformed = await server.request("/admin/echo", {
      token: "ca-alpha", method: "POST", body: { companyId: "../alpha" }
    });
    assert.equal(malformed.status, 400);

    const missing = await server.request("/admin/echo", {
      token: "ca-alpha", method: "POST", body: {}
    });
    assert.equal(missing.status, 400);
  } finally {
    await server.close();
  }
});

test("provisioning gate accepts superadmin and company admin, refuses dispatcher", async () => {
  const server = await startServer(fixture());
  try {
    assert.equal((await server.request("/provision/echo", { token: "sa", method: "POST" })).status, 200);
    assert.equal((await server.request("/provision/echo", { token: "ca-alpha", method: "POST" })).status, 200);
    assert.equal((await server.request("/provision/echo", { token: "disp-alpha", method: "POST" })).status, 403);
  } finally {
    await server.close();
  }
});

test("tenant metadata routes are members-only and never leak company existence", async () => {
  const server = await startServer(fixture());
  try {
    const anonymous = await server.request("/license/alpha");
    assert.equal(anonymous.status, 401);

    const foreign = await server.request("/license/alpha", { token: "disp-beta" });
    assert.equal(foreign.status, 403);

    const driver = await server.request("/license/alpha", { token: "driver-alpha" });
    assert.equal(driver.status, 200);

    const superadmin = await server.request("/license/alpha", { token: "sa" });
    assert.equal(superadmin.status, 200);

    const normalized = await server.request("/license/ALPHA", { token: "ca-alpha" });
    assert.equal(normalized.status, 200);
    assert.equal(normalized.body.companyId, "alpha");

    // An unknown tenant answers exactly like a foreign one, so the route cannot
    // be used to enumerate company ids.
    const unknown = await server.request("/license/unknown-tenant", { token: "ca-alpha" });
    assert.equal(unknown.status, 403);
  } finally {
    await server.close();
  }
});

test("profile lookup failures fail closed instead of granting access", async () => {
  const data = fixture();
  data.profiles.failFor = "alpha/ca-1";
  const server = await startServer(data);
  try {
    const response = await server.request("/staff/echo", { token: "ca-alpha" });
    assert.equal(response.status, 503);
    assert.equal(response.body.success, false);
  } finally {
    await server.close();
  }
});

test("staff routes report unconfigured Firebase instead of authorizing", async () => {
  const server = await startServer({ ...fixture(), hasFirebase: false });
  try {
    const response = await server.request("/staff/echo", { token: "ca-alpha" });
    assert.equal(response.status, 503);
  } finally {
    await server.close();
  }
});

test("company id parsing normalizes case and rejects traversal or oversized ids", () => {
  assert.deepEqual(parseCompanyParam(" Alpha "), { ok: true, id: "alpha" });
  assert.equal(parseCompanyParam("alpha/../beta").ok, false);
  assert.equal(parseCompanyParam("-alpha").ok, false);
  assert.equal(parseCompanyParam("a".repeat(65)).ok, false);
  assert.equal(parseCompanyParam(undefined).ok, false);
});

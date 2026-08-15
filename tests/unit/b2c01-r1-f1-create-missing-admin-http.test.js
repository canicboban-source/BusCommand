const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createRequireSuperAdmin } = require("../../server/superadmin-overview");
const { createStaffAuth, parseCompanyParam } = require("../../server/staff-auth");
const { validateBody, createMissingAdminBody } = require("../../server/validation");
const {
  ProvisioningError,
  provisionCompanyAdminMissingOnly
} = require("../../server/provisioning");

/**
 * B2C-01-R1-F1 — HTTP contract for create-missing-admin (no live Firestore/Auth).
 */

function fakeAdminVerify({ tokens, verifyCalls }) {
  return {
    auth: () => ({
      async verifyIdToken(token, checkRevoked) {
        verifyCalls.push({ token, checkRevoked });
        const claims = tokens.get(token);
        if (!claims) {
          const err = new Error("auth/argument-error");
          err.code = "auth/argument-error";
          throw err;
        }
        if (claims.revoked) {
          const err = new Error("auth/id-token-revoked");
          err.code = "auth/id-token-revoked";
          throw err;
        }
        return claims;
      }
    })
  };
}

function fakeProvisionDb() {
  const store = new Map([
    ["companies/alpha", { name: "Alpha" }],
    ["companies/alpha/settings/main", { status: "active", licenseType: "pro" }]
  ]);
  function ref(path) {
    return {
      path,
      collection(name) { return collection(`${path}/${name}`); },
      async get() { return { exists: store.has(path), data: () => store.get(path) }; }
    };
  }
  function collection(path) {
    return {
      doc(id) { return ref(`${path}/${id}`); },
      where(field, operator, expected) {
        assert.equal(operator, "==");
        return {
          _isQuery: true,
          async get() {
            const prefix = `${path}/`;
            const docs = [...store.entries()]
              .filter(([p, v]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/") && v[field] === expected)
              .map(([p, v]) => ({ id: p.slice(prefix.length), data: () => v }));
            return { docs, empty: docs.length === 0, size: docs.length };
          }
        };
      }
    };
  }
  return {
    store,
    collection,
    async runTransaction(callback) {
      const staged = [];
      const tx = {
        async get(target) {
          if (target && target._isQuery) return target.get();
          return { exists: store.has(target.path), data: () => store.get(target.path) };
        },
        set(documentRef, value) { staged.push([documentRef.path, value]); }
      };
      await callback(tx);
      for (const [path, value] of staged) store.set(path, value);
    }
  };
}

function fakeAuthSdk() {
  const users = new Map();
  let n = 0;
  return {
    auth: () => ({
      async createUser({ email, password, displayName }) {
        n += 1;
        const uid = `http-uid-${n}`;
        users.set(uid, { uid, email, displayName, password });
        return { uid };
      },
      async setCustomUserClaims() {},
      async deleteUser(uid) { users.delete(uid); },
      async getUser(uid) {
        if (!users.has(uid)) {
          const err = new Error("user-not-found");
          err.code = "auth/user-not-found";
          throw err;
        }
        return users.get(uid);
      }
    }),
    firestore: { FieldValue: { serverTimestamp: () => "ts" } },
    users
  };
}

async function startApp({ tokens, provisionImpl } = {}) {
  const verifyCalls = [];
  const adminSdk = fakeAuthSdk();
  const db = fakeProvisionDb();
  const requireSuperAdmin = createRequireSuperAdmin({
    hasFirebase: () => true,
    admin: () => fakeAdminVerify({ tokens, verifyCalls })
  });
  const staff = createStaffAuth({
    hasFirebase: () => true,
    admin: () => fakeAdminVerify({ tokens, verifyCalls }),
    db: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => ({
            doc: () => ({
              async get() { return { exists: true, data: () => ({ active: true, role: "company_admin" }) }; }
            })
          })
        })
      })
    })
  });

  const app = express();
  app.use(express.json());

  app.post(
    "/api/admin/company/:companyId/create-missing-admin",
    requireSuperAdmin,
    validateBody(createMissingAdminBody),
    async (req, res) => {
      const parsed = parseCompanyParam(req.params.companyId);
      if (!parsed.ok) return res.status(400).json({ success: false, error: parsed.error });
      const { name, email, password, companyId: bodyCompanyId } = req.validatedBody;
      if (bodyCompanyId && String(bodyCompanyId).trim() !== parsed.id) {
        return res.status(400).json({
          success: false,
          error: "companyId u telu zahteva mora odgovarati putanji.",
          code: "COMPANY_ID_MISMATCH"
        });
      }
      try {
        const result = await (provisionImpl || provisionCompanyAdminMissingOnly)({
          db,
          admin: adminSdk,
          email,
          password,
          name,
          companyId: parsed.id,
          actorId: req.adminUser.uid
        });
        return res.status(201).json({ success: true, uid: result.uid, email: result.email });
      } catch (err) {
        if (err.code === "ca-exists") {
          return res.status(409).json({ success: false, error: err.message, code: "CA_EXISTS" });
        }
        if (err.code === "company-not-found") {
          return res.status(404).json({ success: false, error: err.message, code: "COMPANY_NOT_FOUND" });
        }
        if (err.code === "license-suspended") {
          return res.status(403).json({ success: false, error: err.message, code: "LICENSE_SUSPENDED" });
        }
        if (err.code === "compensation-failed") {
          return res.status(500).json({ success: false, error: err.message, code: "COMPENSATION_FAILED" });
        }
        return res.status(500).json({ success: false, error: "Greška pri kreiranju company admina." });
      }
    }
  );

  app.post("/api/admin/create-user", staff.requireUserProvisioner, async (req, res) => {
    return res.status(201).json({ success: true, via: "create-user" });
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const { port } = server.address();
  return {
    db,
    adminSdk,
    verifyCalls,
    async request(path, { token, method = "POST", body } = {}) {
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

const SA_TOKEN = "sa-token";
const CA_TOKEN = "ca-token";
const DISP_TOKEN = "disp-token";

test("create-missing-admin: SA missing → 201 + slot + user", async () => {
  const tokens = new Map([
    [SA_TOKEN, { uid: "sa-1", role: "superadmin", auth_time: Math.floor(Date.now() / 1000) }]
  ]);
  const srv = await startApp({ tokens });
  try {
    const res = await srv.request("/api/admin/company/alpha/create-missing-admin", {
      token: SA_TOKEN,
      body: { name: "CA One", email: "ca1@example.test", password: "Abcdef1" }
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.uid);
    assert.equal(srv.db.store.get("companies/alpha/ops/company_admin_slot").uid, res.body.uid);
    assert.equal(srv.db.store.get(`companies/alpha/users/${res.body.uid}`).role, "company_admin");
    assert.equal(Object.prototype.hasOwnProperty.call(res.body, "password"), false);
  } finally {
    await srv.close();
  }
});

test("create-missing-admin: body/path companyId mismatch → 400", async () => {
  const tokens = new Map([
    [SA_TOKEN, { uid: "sa-1", role: "superadmin", auth_time: Math.floor(Date.now() / 1000) }]
  ]);
  const srv = await startApp({ tokens });
  try {
    const res = await srv.request("/api/admin/company/alpha/create-missing-admin", {
      token: SA_TOKEN,
      body: {
        name: "CA",
        email: "ca@example.test",
        password: "Abcdef1",
        companyId: "other-tenant"
      }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, "COMPANY_ID_MISMATCH");
  } finally {
    await srv.close();
  }
});

test("create-missing-admin: non-SA roles denied", async () => {
  const tokens = new Map([
    [CA_TOKEN, { uid: "ca-1", role: "company_admin", companyId: "alpha", auth_time: Math.floor(Date.now() / 1000) }],
    [DISP_TOKEN, { uid: "d-1", role: "dispatcher", companyId: "alpha", auth_time: Math.floor(Date.now() / 1000) }],
    [SA_TOKEN, { uid: "sa-1", role: "superadmin", auth_time: Math.floor(Date.now() / 1000) }]
  ]);
  const srv = await startApp({ tokens });
  try {
    for (const token of [CA_TOKEN, DISP_TOKEN, undefined]) {
      const res = await srv.request("/api/admin/company/alpha/create-missing-admin", {
        token,
        body: { name: "CA", email: "x@example.test", password: "Abcdef1" }
      });
      assert.ok(res.status === 401 || res.status === 403, `status=${res.status}`);
    }
  } finally {
    await srv.close();
  }
});

test("create-missing-admin: active CA → 409 CA_EXISTS", async () => {
  const tokens = new Map([
    [SA_TOKEN, { uid: "sa-1", role: "superadmin", auth_time: Math.floor(Date.now() / 1000) }]
  ]);
  const srv = await startApp({
    tokens,
    provisionImpl: async () => {
      throw new ProvisioningError("ca-exists", "Company admin već postoji za ovu firmu.");
    }
  });
  try {
    const res = await srv.request("/api/admin/company/alpha/create-missing-admin", {
      token: SA_TOKEN,
      body: { name: "CA", email: "x@example.test", password: "Abcdef1" }
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, "CA_EXISTS");
  } finally {
    await srv.close();
  }
});

test("create-missing-admin: compensation-failed is truthful (not CA_EXISTS)", async () => {
  const tokens = new Map([
    [SA_TOKEN, { uid: "sa-1", role: "superadmin", auth_time: Math.floor(Date.now() / 1000) }]
  ]);
  const srv = await startApp({
    tokens,
    provisionImpl: async () => {
      throw new ProvisioningError("compensation-failed", "Provisioning cleanup nije uspio.");
    }
  });
  try {
    const res = await srv.request("/api/admin/company/alpha/create-missing-admin", {
      token: SA_TOKEN,
      body: { name: "CA", email: "x@example.test", password: "Abcdef1" }
    });
    assert.equal(res.status, 500);
    assert.equal(res.body.code, "COMPENSATION_FAILED");
  } finally {
    await srv.close();
  }
});

test("source: create-user company_admin delegates to guarded provisioner", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "../../server/provisioning.js"), "utf8");
  assert.match(src, /if \(role === "company_admin"\)[\s\S]*provisionCompanyAdminMissingOnly/);
  assert.match(src, /ops\/company_admin_slot|COMPANY_ADMIN_SLOT_DOC/);
  const api = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");
  assert.match(api, /\/api\/admin\/company\/:companyId\/create-missing-admin/);
  assert.match(api, /requireSuperAdmin/);
});

/**
 * FAZA 3 D24.1.1 — CA create via real production route registration.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const { createStaffAuth } = require("../../server/staff-auth");
const { registerCompanyAdminDriverRoutes } = require("../../server/register-company-admin-drivers");
const { companyDriverCreateBody, validateBody } = require("../../server/validation");

const ROOT = path.join(__dirname, "..", "..");
const API = fs.readFileSync(path.join(ROOT, "api-server.js"), "utf8");

test("D24.1.1 source: api-server mounts registerCompanyAdminDriverRoutes", () => {
  assert.match(API, /registerCompanyAdminDriverRoutes/);
  assert.doesNotMatch(API, /batch\.update\([^\n]*eid/);
});

function memoryDb() {
  const store = new Map();
  const ref = (p) => ({
    path: p,
    collection(name) { return col(`${p}/${name}`); },
    doc(id) { return ref(`${p}/${id}`); }
  });
  const col = (p) => ({
    _isCollection: true,
    doc(id) { return ref(`${p}/${id}`); },
    async get() {
      const prefix = `${p}/`;
      const docs = [...store.entries()]
        .filter(([k]) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
        .map(([k, v]) => ({ id: k.slice(prefix.length), ref: ref(k), data: () => ({ ...v }), exists: true }));
      return { docs, size: docs.length, empty: !docs.length };
    }
  });
  return {
    store,
    collection(name) { return col(name); },
    async runTransaction(fn) {
      const tx = {
        async get(target) {
          if (target && target._isCollection) return target.get();
          const value = store.get(target.path);
          return { exists: Boolean(value), data: () => ({ ...(value || {}) }), ref: target };
        },
        set(documentRef, data) {
          store.set(documentRef.path, { ...data });
        }
      };
      return fn(tx);
    }
  };
}

test("D24.1.1 HTTP: production create route refuses dispatcher / cross-tenant; CA succeeds", async () => {
  const tokens = new Map([
    ["disp", { uid: "disp-1", role: "dispatcher", companyId: "alpha" }],
    ["ca-alpha", { uid: "ca-1", role: "company_admin", companyId: "alpha" }]
  ]);
  const profiles = new Map([
    ["alpha/disp-1", { role: "dispatcher", companyId: "alpha", active: true, groups: ["310"] }],
    ["alpha/ca-1", { role: "company_admin", companyId: "alpha", active: true }]
  ]);
  const mem = memoryDb();
  mem.store.set("companies/alpha/settings/main", { status: "active", maxDrivers: 50 });
  mem.store.set("companies/alpha/groups/310", { lineId: "310", active: true });

  const auth = createStaffAuth({
    hasFirebase: () => true,
    admin: () => ({
      auth: () => ({
        async verifyIdToken(token) {
          const claims = tokens.get(token);
          if (!claims) {
            const error = new Error("auth/argument-error");
            error.code = "auth/argument-error";
            throw error;
          }
          return claims;
        }
      })
    }),
    db: () => ({
      collection: () => ({
        doc: (companyId) => ({
          collection: (name) => ({
            doc: (uid) => ({
              async get() {
                if (name === "settings") {
                  return { exists: true, data: () => ({ status: "active" }) };
                }
                const data = profiles.get(`${companyId}/${uid}`);
                return { exists: Boolean(data), data: () => data };
              }
            })
          })
        })
      })
    })
  });

  const app = express();
  app.use(express.json());
  registerCompanyAdminDriverRoutes(app, {
    rateLimit: () => (_r, _s, next) => next(),
    requireCompanyAdmin: auth.requireCompanyAdmin,
    requireOwnCompany: auth.requireOwnCompany,
    validateBody,
    companyDriverCreateBody,
    db: mem,
    FieldValue: { serverTimestamp: () => "TS" },
    bcryptHash: (v, r) => bcrypt.hash(v, r),
    randomUUID: () => crypto.randomUUID(),
    logAudit: async () => {}
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const port = server.address().port;
  const body = {
    companyId: "alpha",
    firstName: "Novi",
    lastName: "Vozac",
    phone: "+43699111",
    email: "novi@d2411.local",
    eid: "EID-D2411",
    companyCode: "12345",
    groupId: "310",
    knownGroupIds: ["310"]
  };

  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/company-admin/drivers`, {
      method: "POST",
      headers: { authorization: "Bearer disp", "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    assert.equal(denied.status, 403);

    const cross = await fetch(`http://127.0.0.1:${port}/api/company-admin/drivers`, {
      method: "POST",
      headers: { authorization: "Bearer ca-alpha", "content-type": "application/json" },
      body: JSON.stringify({ ...body, companyId: "beta" })
    });
    assert.equal(cross.status, 403);

    const ok = await fetch(`http://127.0.0.1:${port}/api/company-admin/drivers`, {
      method: "POST",
      headers: { authorization: "Bearer ca-alpha", "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    assert.equal(ok.status, 201);
    const json = await ok.json();
    assert.equal(json.success, true);
    assert.equal(json.driver.eid, "EID-D2411");
    const profilePath = [...mem.store.keys()].find((k) => k.includes("/drivers/") && !k.includes("credentials"));
    assert.ok(profilePath);
    assert.equal(mem.store.get(profilePath).eid, undefined);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

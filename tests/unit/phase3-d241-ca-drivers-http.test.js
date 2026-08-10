/**
 * FAZA 3 D24.1 — CA driver create auth gate + ops contract (executable).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const { createStaffAuth } = require("../../server/staff-auth");

const ROOT = path.join(__dirname, "..", "..");
const API = fs.readFileSync(path.join(ROOT, "api-server.js"), "utf8");
const OPS = fs.readFileSync(path.join(ROOT, "server", "company-admin-driver-ops.js"), "utf8");
const RULES = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");

test("D24.1 source: POST create uses requireCompanyAdmin + createManualCompanyDriver; GET never backfills eid", () => {
  assert.match(API, /registerCompanyAdminDriverRoutes/);
  assert.doesNotMatch(API, /batch\.update\([^\n]*eid/);
  const registerSrc = fs.readFileSync(
    path.join(ROOT, "server", "register-company-admin-drivers.js"),
    "utf8"
  );
  assert.match(registerSrc, /requireCompanyAdmin/);
  assert.match(registerSrc, /createManualCompanyDriver/);
  assert.match(registerSrc, /listCompanyDriversForAdmin/);
  assert.match(OPS, /Never backfills eid/i);
  assert.doesNotMatch(OPS, /batch\.update/);
});

test("D24.1 source: Rules fail-closed for Dispo when profile exposes credentials", () => {
  assert.match(RULES, /driverProfileExposesCredentials/);
  assert.match(RULES, /!driverProfileExposesCredentials\(\)/);
  assert.match(RULES, /"eid"/);
  assert.match(RULES, /"loginCodeHash"/);
});

test("D24.1 HTTP: company-admin drivers create refuses dispatcher and foreign company", async () => {
  const tokens = new Map([
    ["disp", { uid: "disp-1", role: "dispatcher", companyId: "alpha" }],
    ["ca-alpha", { uid: "ca-1", role: "company_admin", companyId: "alpha" }],
    ["ca-beta", { uid: "ca-2", role: "company_admin", companyId: "beta" }]
  ]);
  const profiles = new Map([
    ["alpha/disp-1", { role: "dispatcher", companyId: "alpha", active: true, groups: ["310"] }],
    ["alpha/ca-1", { role: "company_admin", companyId: "alpha", active: true }],
    ["beta/ca-2", { role: "company_admin", companyId: "beta", active: true }]
  ]);
  const verifyCalls = [];
  const auth = createStaffAuth({
    hasFirebase: () => true,
    admin: () => ({
      auth: () => ({
        async verifyIdToken(token, checkRevoked) {
          verifyCalls.push({ token, checkRevoked });
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
      collection: (companies) => {
        assert.equal(companies, "companies");
        return {
          doc: (companyId) => ({
            collection: (name) => {
              if (name === "settings") {
                return {
                  doc: () => ({
                    async get() {
                      return { exists: true, data: () => ({ status: "active" }) };
                    }
                  })
                };
              }
              return {
                doc: (uid) => ({
                  async get() {
                    const data = profiles.get(`${companyId}/${uid}`);
                    return { exists: Boolean(data), data: () => data };
                  }
                })
              };
            }
          })
        };
      }
    })
  });

  const created = [];
  const app = express();
  app.use(express.json());
  app.post("/api/company-admin/drivers", auth.requireCompanyAdmin, (req, res) => {
    const companyId = auth.requireOwnCompany(req, res);
    if (!companyId) return undefined;
    created.push({ companyId, uid: req.staffUser.uid });
    return res.status(201).json({ success: true, companyId });
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const port = server.address().port;

  async function invoke(token, companyId) {
    const res = await fetch(`http://127.0.0.1:${port}/api/company-admin/drivers?companyId=${encodeURIComponent(companyId)}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ eid: "X" })
    });
    return { status: res.status, body: await res.json() };
  }

  try {
    const deniedDisp = await invoke("disp", "alpha");
    assert.equal(deniedDisp.status, 403);
    assert.equal(created.length, 0);

    const deniedCross = await invoke("ca-alpha", "beta");
    assert.equal(deniedCross.status, 403);
    assert.equal(created.length, 0);

    const ok = await invoke("ca-alpha", "alpha");
    assert.equal(ok.status, 201);
    assert.equal(created.length, 1);
    assert.equal(created[0].companyId, "alpha");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

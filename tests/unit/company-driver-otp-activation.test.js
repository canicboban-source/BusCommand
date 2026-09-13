"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const { createStaffAuth } = require("../../server/staff-auth");
const { registerCompanyAdminDriverRoutes } = require("../../server/register-company-admin-drivers");
const {
  companyDriverCreateBody,
  companyDriverResetActivationBody,
  validateBody
} = require("../../server/validation");
const { verifyDriverLogin, COST } = require("../../server/driver-routes");

const ROOT = path.join(__dirname, "..", "..");
const API = fs.readFileSync(path.join(ROOT, "api-server.js"), "utf8");
const CLIENT = fs.readFileSync(path.join(ROOT, "js", "admin", "company-admin-drivers.js"), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "staff.html"), "utf8");

const UUID = "11111111-1111-4111-8111-111111111111";

function memoryDb() {
  const store = new Map();
  const ref = (p) => ({
    path: p,
    collection(name) { return col(`${p}/${name}`); },
    doc(id) { return ref(`${p}/${id}`); }
  });
  const apply = (documentRef, data, merge) => {
    const cur = merge ? { ...(store.get(documentRef.path) || {}) } : {};
    const next = merge ? cur : { ...data };
    if (merge) {
      for (const [k, v] of Object.entries(data)) {
        if (v && v.__delete) delete next[k];
        else next[k] = v;
      }
    }
    store.set(documentRef.path, merge ? next : { ...data });
  };
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
        set(documentRef, data) { apply(documentRef, data, false); },
        update(documentRef, data) { apply(documentRef, data, true); }
      };
      return fn(tx);
    }
  };
}

function mount(mem, extra = {}) {
  const tokens = new Map([
    ["disp", { uid: "disp-1", role: "dispatcher", companyId: "alpha" }],
    ["ca-alpha", { uid: "ca-1", role: "company_admin", companyId: "alpha" }],
    ["ca-beta", { uid: "ca-2", role: "company_admin", companyId: "beta" }],
    ["drv", { uid: UUID, role: "driver", companyId: "alpha" }]
  ]);
  const profiles = new Map([
    ["alpha/disp-1", { role: "dispatcher", companyId: "alpha", active: true, groups: ["310"] }],
    ["alpha/ca-1", { role: "company_admin", companyId: "alpha", active: true }],
    ["beta/ca-2", { role: "company_admin", companyId: "beta", active: true }]
  ]);
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
  const audits = [];
  const smsInbox = [];
  const revoked = [];
  const app = express();
  app.use(express.json());
  registerCompanyAdminDriverRoutes(app, {
    rateLimit: () => (_r, _s, next) => next(),
    requireCompanyAdmin: auth.requireCompanyAdmin,
    requireOwnCompany: auth.requireOwnCompany,
    validateBody,
    companyDriverCreateBody,
    companyDriverResetActivationBody,
    db: mem,
    FieldValue: { serverTimestamp: () => "TS", delete: () => ({ __delete: true }) },
    bcryptHash: (v, r) => bcrypt.hash(v, r),
    randomUUID: extra.randomUUID || (() => UUID),
    logAudit: async (...args) => { audits.push(args); },
    smsProvider: extra.smsProvider || {
      mode: "stub",
      sendActivationSms: async (payload) => {
        smsInbox.push(payload);
        return { status: "stub_queued", reason: null, providerMessageId: "stub-1" };
      }
    },
    revokeRefreshTokens: extra.revokeRefreshTokens || (async (id) => { revoked.push(id); }),
    generateActivationOtp: extra.generateActivationOtp
  });
  return { app, audits, smsInbox, revoked };
}

const validBody = {
  companyId: "alpha",
  firstName: "Novi",
  lastName: "Vozac",
  phone: "+436991234567",
  email: "novi@otp.local",
  eid: "EID-OTP",
  groupId: "310",
  knownGroupIds: ["310"]
};

test("manual create schema accepts body without PIN and rejects credential fields", () => {
  assert.equal(companyDriverCreateBody.safeParse(validBody).success, true);
  for (const extra of [
    { companyCode: "12345" },
    { company_code: "12345" },
    { pin: "12345" },
    { initialPin: "12345" },
    { password: "secret" },
    { loginCode: "12345" },
    { activationCode: "482913" },
    { otp: "482913" }
  ]) {
    assert.equal(companyDriverCreateBody.safeParse({ ...validBody, ...extra }).success, false);
  }
  assert.equal(companyDriverResetActivationBody.safeParse({ companyId: "alpha" }).success, true);
  assert.equal(companyDriverResetActivationBody.safeParse({ companyId: "alpha", pin: "12345" }).success, false);
  assert.equal(companyDriverResetActivationBody.safeParse({ companyId: "alpha", otp: "482913" }).success, false);
});

test("CA create writes OTP credentials, SMS gets OTP internally, response and audit stay secret-free", async () => {
  const mem = memoryDb();
  mem.store.set("companies/alpha/settings/main", { status: "active", maxDrivers: 50 });
  mem.store.set("companies/alpha/groups/310", { lineId: "310", active: true });
  const { app, audits, smsInbox } = mount(mem, { generateActivationOtp: () => "482913" });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/company-admin/drivers`, {
      method: "POST",
      headers: { authorization: "Bearer ca-alpha", "content-type": "application/json" },
      body: JSON.stringify(validBody)
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.codeActivated, false);
    assert.equal(json.activation.smsStatus, "stub_queued");
    assert.equal(json.activation.otpTtlHours, 24);
    const blob = JSON.stringify({ json, audits });
    assert.doesNotMatch(blob, /482913/);
    assert.doesNotMatch(blob, /activationCodeHash|loginCodeHash|companyCodeHash/);
    assert.equal(smsInbox[0].otp, "482913");
    const creds = [...mem.store.entries()].find(([k]) => k.includes("driver_credentials"));
    assert.ok(creds);
    assert.match(creds[1].activationCodeHash, /^\$2[aby]\$/);
    assert.equal(creds[1].loginCodeHash, undefined);
    assert.equal(creds[1].companyCodeHash, undefined);
    assert.equal(creds[1].eid, "EID-OTP");
    const profile = [...mem.store.entries()].find(([k]) => k.includes("/drivers/") && !k.includes("credentials"));
    assert.equal(profile[1].codeActivated, false);
    assert.equal(profile[1].eid, undefined);
    assert.equal(audits[0][2], "driver_manual_created");
    assert.equal(audits[0][3].smsStatus, "stub_queued");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("reset-activation is CA-only, revokes tokens, rotates OTP, and keeps last hash", async () => {
  const mem = memoryDb();
  mem.store.set("companies/alpha/settings/main", { status: "active", maxDrivers: 50 });
  mem.store.set("companies/alpha/groups/310", { lineId: "310", active: true });
  const oldPinHash = await bcrypt.hash("13579", COST);
  mem.store.set(`companies/alpha/drivers/${UUID}`, {
    firstName: "Ana", lastName: "Test", phone: "+436991234567", email: "ana@otp.local",
    groupId: "310", companyId: "alpha", active: true, codeActivated: true
  });
  mem.store.set(`companies/alpha/driver_credentials/${UUID}`, {
    eid: "EID-OTP",
    loginCodeHash: oldPinHash,
    activationUsedAt: "used"
  });
  let n = 0;
  const { app, audits, revoked, smsInbox } = mount(mem, {
    generateActivationOtp: () => String(++n).padStart(6, "0")
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/company-admin/drivers/${UUID}/reset-activation`;
  const headers = { authorization: "Bearer ca-alpha", "content-type": "application/json" };
  const body = JSON.stringify({ companyId: "alpha" });
  try {
    const denied = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer disp", "content-type": "application/json" },
      body
    });
    assert.equal(denied.status, 403);
    const cross = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer ca-beta", "content-type": "application/json" },
      body: JSON.stringify({ companyId: "alpha" })
    });
    assert.equal(cross.status, 403);
    const [first, second] = await Promise.all([
      fetch(url, { method: "POST", headers, body }),
      fetch(url, { method: "POST", headers, body })
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    const json = await second.json();
    assert.equal(json.codeActivated, false);
    assert.doesNotMatch(JSON.stringify(json), /000001|000002|13579|activationCodeHash/);
    const creds = mem.store.get(`companies/alpha/driver_credentials/${UUID}`);
    const profile = mem.store.get(`companies/alpha/drivers/${UUID}`);
    assert.equal(profile.codeActivated, false);
    assert.equal(creds.loginCodeHash, undefined);
    const matchFirst = await bcrypt.compare("000001", creds.activationCodeHash);
    const matchSecond = await bcrypt.compare("000002", creds.activationCodeHash);
    assert.equal(Number(matchFirst) + Number(matchSecond), 1);
    const liveOtp = matchFirst ? "000001" : "000002";
    const staleOtp = matchFirst ? "000002" : "000001";
    assert.equal(await verifyDriverLogin(profile, creds, "13579"), false);
    assert.equal(await verifyDriverLogin(profile, creds, staleOtp), false);
    assert.equal(await verifyDriverLogin(profile, creds, liveOtp), true);
    const hashKeys = Object.keys(creds).filter((key) => /hash$/i.test(key));
    assert.deepEqual(hashKeys, ["activationCodeHash"]);
    assert.equal(creds.loginCodeHash, undefined);
    assert.equal(creds.companyCodeHash, undefined);
    const pinHash = await bcrypt.hash("24680", COST);
    creds.loginCodeHash = pinHash;
    delete creds.activationCodeHash;
    creds.activationUsedAt = "activated";
    profile.codeActivated = true;
    assert.equal(await verifyDriverLogin(profile, creds, liveOtp), false);
    assert.equal(await verifyDriverLogin(profile, creds, staleOtp), false);
    assert.equal(await verifyDriverLogin(profile, creds, "24680"), true);
    assert.equal(creds.activationCodeHash, undefined);
    assert.equal(typeof creds.loginCodeHash, "string");
    assert.ok(revoked.includes(UUID));
    assert.equal(audits.at(-1)[2], "driver_activation_reset_requested");
    assert.equal(smsInbox.length >= 1, true);
    const secretBlob = JSON.stringify({
      first: await first.json().catch(() => ({})),
      second: json,
      audits,
      logs: { firstStatus: first.status, secondStatus: second.status }
    });
    assert.doesNotMatch(secretBlob, /000001|000002|13579|24680|activationCodeHash|loginCodeHash/);
    assert.doesNotMatch(JSON.stringify(audits), /000001|000002|13579|activationCodeHash/);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("SMS provider failure keeps the pending account and does not claim SMS sent", async () => {
  const mem = memoryDb();
  mem.store.set("companies/alpha/settings/main", { status: "active", maxDrivers: 50 });
  mem.store.set("companies/alpha/groups/310", { lineId: "310", active: true });
  const { app, audits } = mount(mem, {
    generateActivationOtp: () => "482913",
    smsProvider: {
      mode: "seven",
      sendActivationSms: async () => {
        throw new Error("provider down");
      }
    }
  });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/company-admin/drivers`, {
      method: "POST",
      headers: { authorization: "Bearer ca-alpha", "content-type": "application/json" },
      body: JSON.stringify(validBody)
    });
    assert.equal(res.status, 201);
    const json = await res.json();
    assert.equal(json.codeActivated, false);
    assert.equal(json.activation.smsStatus, "error");
    assert.notEqual(json.activation.smsStatus, "sent");
    assert.doesNotMatch(JSON.stringify({ json, audits }), /482913|Activation SMS sent/);
    const profile = [...mem.store.entries()].find(([k]) => k.includes("/drivers/") && !k.includes("credentials"));
    assert.equal(profile[1].codeActivated, false);
    assert.equal(audits[0][3].smsStatus, "error");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("personal-code route is fail-closed 410 and UI has no PIN inputs", () => {
  assert.match(API, /DIRECT_PIN_SET_REMOVED/);
  assert.match(API, /status\(410\)/);
  assert.doesNotMatch(CLIENT, /ca-driver-add-pin|ca-driver-edit-pin|setCompanyDriverPersonalCode|pin: draft\.pin/);
  assert.doesNotMatch(HTML, /id="ca-driver-add-pin"|id="ca-driver-edit-pin"/);
  assert.match(HTML, /id="ca-driver-reset-activation"/);
  assert.match(CLIENT, /requestCompanyDriverActivationReset/);
  assert.match(CLIENT, /resetActivationPending/);
  assert.match(CLIENT, /stripDriverSecrets/);
  assert.match(CLIENT, /ca_drivers_add_pin_invalid/);
  assert.match(CLIENT, /status === "sent" \|\| status === "stub_queued"/);
});

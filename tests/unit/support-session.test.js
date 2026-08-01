const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SUPPORT_TTL_MS,
  SUPPORT_CATEGORIES,
  SUPPORT_SESSION_ACTIVE,
  REASON_MIN,
  startSupportSessionBody,
  claimSupportSession,
  isFeatureEnabled,
  isActiveSupportMarker,
  publicSessionView,
  newSupportSessionId
} = require("../../server/support-session");
const { categoryFor } = require("../../server/audit-log");

test("support session constants match approved L7 decisions", () => {
  assert.equal(SUPPORT_TTL_MS, 60 * 60 * 1000);
  assert.deepEqual([...SUPPORT_CATEGORIES], ["incident", "onboarding", "billing"]);
  assert.equal(REASON_MIN, 20);
  assert.equal(isFeatureEnabled({ features: {} }), false);
  assert.equal(isFeatureEnabled({ features: { supportSession: false } }), false);
  assert.equal(isFeatureEnabled({ features: { supportSession: true } }), true);
});

test("start schema requires category and reason length", () => {
  assert.equal(startSupportSessionBody.safeParse({
    category: "incident",
    reason: "too short"
  }).success, false);
  assert.equal(startSupportSessionBody.safeParse({
    category: "billing",
    reason: "Customer cannot publish Dienstplan after group rename."
  }).success, true);
  assert.equal(startSupportSessionBody.safeParse({
    category: "other",
    reason: "Customer cannot publish Dienstplan after group rename."
  }).success, false);
});

test("public session view never invents secrets fields", () => {
  const view = publicSessionView({
    status: "active",
    category: "incident",
    reason: "Need help reviewing schedule conflict for line 310.",
    scope: "read_only",
    startedAt: new Date("2026-07-24T10:00:00Z"),
    expiresAt: new Date("2026-07-24T11:00:00Z"),
    startedByUid: "sa-1",
    password: "secret",
    loginCodeHash: "nope"
  }, "sup_abc");
  assert.equal(view.id, "sup_abc");
  assert.equal(view.scope, "read_only");
  assert.equal(view.password, undefined);
  assert.equal(view.loginCodeHash, undefined);
  assert.match(newSupportSessionId(), /^sup_/);
});


test("support-session claim is a tenant-scoped transaction lock", async () => {
  const documents = new Map();
  const companyRef = {
    collection(name) {
      return {
        doc(id) {
          return { path: `companies/alpha/${name}/${id}` };
        }
      };
    }
  };
  const database = {
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          return {
            exists: documents.has(ref.path),
            data: () => documents.get(ref.path)
          };
        },
        set(ref, value, options) {
          writes.push([ref.path, value, options]);
        }
      };
      await callback(transaction);
      for (const [path, value, options] of writes) {
        documents.set(path, options?.merge
          ? { ...(documents.get(path) || {}), ...value }
          : value);
      }
    }
  };
  const now = new Date("2026-08-01T10:00:00Z");
  const expiresAt = new Date("2026-08-01T11:00:00Z");
  const input = {
    database,
    companyRef,
    sessionId: "sup_first",
    sessionDoc: { status: "active", expiresAt },
    supportDoc: { active: true, sessionId: "sup_first", expiresAt },
    now
  };

  await claimSupportSession(input);
  assert.equal(isActiveSupportMarker(documents.get("companies/alpha/settings/support"), now), true);
  await assert.rejects(
    () => claimSupportSession({
      ...input,
      sessionId: "sup_second",
      sessionDoc: { status: "active", expiresAt },
      supportDoc: { active: true, sessionId: "sup_second", expiresAt }
    }),
    error => error.code === SUPPORT_SESSION_ACTIVE
  );
  assert.equal(documents.has("companies/alpha/support_sessions/sup_second"), false);
});

test("support session audit actions map to access category", () => {
  assert.equal(categoryFor("support_session_started"), "access");
  assert.equal(categoryFor("support_session_ended"), "access");
  assert.equal(categoryFor("support_session_expired"), "access");
});

test("routes, rules, provisioning flag and UI hooks are wired", () => {
  const api = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  const provisioning = fs.readFileSync(path.join(__dirname, "../../server/provisioning.js"), "utf8");
  const sa = fs.readFileSync(path.join(__dirname, "../../js/admin/superadmin.js"), "utf8");
  const ca = fs.readFileSync(path.join(__dirname, "../../js/admin/company-admin.js"), "utf8");
  const client = fs.readFileSync(path.join(__dirname, "../../js/core/api-client.js"), "utf8");

  assert.match(api, /\/api\/admin\/companies\/:companyId\/support-sessions/);
  assert.match(api, /\/api\/company-admin\/support-session\/end/);
  assert.match(rules, /support_sessions\/\{sessionId\}[\s\S]*?allow create, update, delete: if false/);
  assert.match(provisioning, /supportSession:\s*false/);
  assert.match(sa, /superadminStartSupport/);
  assert.doesNotMatch(sa, /driver_credentials/);
  assert.match(ca, /ca_support_active/);
  assert.match(client, /startSupportSession/);
});

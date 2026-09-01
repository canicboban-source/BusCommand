const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");

const PROJECT_ID = "buscommand-bc1";
let env;

function claims(role, companyId, extra = {}) {
  return { role, companyId, mustChangeLoginCode: false, auth_time: 1, ...extra };
}

function doc(db, companyId, collection, id) {
  return db.collection("companies").doc(companyId).collection(collection).doc(id);
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8")
    }
  });
});

test.after(async () => {
  await env.cleanup();
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    
    await db.collection("companies").doc("alpha").set({ name: "alpha" });
    await db.collection("companies").doc("beta").set({ name: "beta" });
    await doc(db, "alpha", "settings", "main").set({ status: "active" });
    await doc(db, "beta", "settings", "main").set({ status: "active" });
    
    // Seed active users to satisfy isCompanyMember
    await doc(db, "alpha", "users", "company_admin-a").set({ active: true, sessionsValidAfterEpoch: 0 });
    await doc(db, "alpha", "users", "dispatcher-a").set({ active: true, sessionsValidAfterEpoch: 0 });
    await doc(db, "alpha", "drivers", "driver-a").set({ active: true });
    
    // Seed the sentinel secret document
    await doc(db, "alpha", "settings", "email_smtp").set({
      pass: "BC_SMTP_SECRET_SENTINEL"
    });
  });
});

test("1. unauthenticated -> DENY", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(doc(db, "alpha", "settings", "email_smtp").get());
});

test("2. Driver same tenant -> DENY", async () => {
  const db = env.authenticatedContext("driver-a", claims("driver", "alpha")).firestore();
  await assertFails(doc(db, "alpha", "settings", "email_smtp").get());
});

test("3. Dispatcher same tenant -> DENY", async () => {
  const db = env.authenticatedContext("dispatcher-a", claims("dispatcher", "alpha")).firestore();
  await assertFails(doc(db, "alpha", "settings", "email_smtp").get());
});

test("4. Company Admin same tenant -> DENY", async () => {
  const db = env.authenticatedContext("company_admin-a", claims("company_admin", "alpha")).firestore();
  await assertFails(doc(db, "alpha", "settings", "email_smtp").get());
});

test("5. Super Admin browser -> DENY", async () => {
  const db = env.authenticatedContext("sa", claims("superadmin", "alpha")).firestore();
  await assertFails(doc(db, "alpha", "settings", "email_smtp").get());
});

test("6. cross-tenant user -> DENY", async () => {
  const db = env.authenticatedContext("ca-beta", claims("company_admin", "beta")).firestore();
  await assertFails(doc(db, "alpha", "settings", "email_smtp").get());
});

test("7. Admin SDK/server -> AVAILABLE", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await assertSucceeds(doc(db, "alpha", "settings", "email_smtp").get());
  });
});

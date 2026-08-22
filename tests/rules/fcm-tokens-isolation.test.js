/**
 * Firestore Security Rules test: fcm_tokens and fcm_token_owners isolation.
 * Server-owned collections: inaccessible to all browser/client SDK sessions.
 */
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails
} = require("@firebase/rules-unit-testing");
const admin = require("firebase-admin");

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = "buscommand-fcm-rules-test";
const RULES = fs.readFileSync(path.join(__dirname, "..", "..", "firestore.rules"), "utf8");

let env;
let adminApp;

function claims(role, companyId) {
  return { role, companyId, mustChangeLoginCode: false, auth_time: 1 };
}

test.before(async () => {
  if (!EMULATOR) return;
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: RULES }
  });
  adminApp = admin.initializeApp({ projectId: `${PROJECT_ID}-admin` }, "fcm-rules-admin");
});

test.after(async () => {
  if (env) await env.cleanup();
  if (adminApp) await adminApp.delete();
});

async function seedDriver(companyId = "alpha", driverId = "drv-1") {
  await env.withSecurityRulesDisabled(async (context) => {
    const fdb = context.firestore();
    await fdb.collection("companies").doc(companyId).set({ name: "Alpha Transport" });
    await fdb.collection("companies").doc(companyId).collection("drivers").doc(driverId).set({
      id: driverId,
      name: "Driver One",
      groupId: "101",
      active: true
    });
    await fdb.collection("companies").doc(companyId).collection("drivers").doc(driverId).collection("fcm_tokens").doc("tok-1").set({
      token: "fcm-sample-token-1234567890",
      status: "active",
      createdAt: new Date().toISOString()
    });
    await fdb.collection("fcm_token_owners").doc("tok-1").set({
      companyId,
      driverId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
}

test("fcm_tokens isolation rules", async (t) => {
  if (!EMULATOR) {
    t.skip("FIRESTORE_EMULATOR_HOST not set");
    return;
  }

  await seedDriver("alpha", "drv-1");

  await t.test("driver client cannot read own fcm_tokens directly", async () => {
    const driverCtx = env.authenticatedContext("drv-1", claims("driver", "alpha"));
    const fdb = driverCtx.firestore();
    const tokenDoc = fdb.collection("companies").doc("alpha").collection("drivers").doc("drv-1").collection("fcm_tokens").doc("tok-1");
    await assertFails(tokenDoc.get());
  });

  await t.test("driver client cannot write to fcm_tokens directly", async () => {
    const driverCtx = env.authenticatedContext("drv-1", claims("driver", "alpha"));
    const fdb = driverCtx.firestore();
    const tokenDoc = fdb.collection("companies").doc("alpha").collection("drivers").doc("drv-1").collection("fcm_tokens").doc("tok-new");
    await assertFails(tokenDoc.set({ token: "injected-token", status: "active" }));
  });

  await t.test("dispatcher client cannot read or write fcm_tokens directly", async () => {
    const dispoCtx = env.authenticatedContext("dispo-1", claims("dispatcher", "alpha"));
    const fdb = dispoCtx.firestore();
    const tokenDoc = fdb.collection("companies").doc("alpha").collection("drivers").doc("drv-1").collection("fcm_tokens").doc("tok-1");
    await assertFails(tokenDoc.get());
    await assertFails(tokenDoc.delete());
  });

  await t.test("company admin client cannot read or write fcm_tokens directly", async () => {
    const caCtx = env.authenticatedContext("ca-1", claims("company-admin", "alpha"));
    const fdb = caCtx.firestore();
    const tokenDoc = fdb.collection("companies").doc("alpha").collection("drivers").doc("drv-1").collection("fcm_tokens").doc("tok-1");
    await assertFails(tokenDoc.get());
    await assertFails(tokenDoc.set({ status: "disabled" }, { merge: true }));
  });

  await t.test("unauthenticated client cannot access fcm_tokens", async () => {
    const unauthCtx = env.unauthenticatedContext();
    const fdb = unauthCtx.firestore();
    const tokenDoc = fdb.collection("companies").doc("alpha").collection("drivers").doc("drv-1").collection("fcm_tokens").doc("tok-1");
    await assertFails(tokenDoc.get());
  });

  await t.test("cross-company access is denied", async () => {
    const otherDriverCtx = env.authenticatedContext("drv-beta", claims("driver", "beta"));
    const fdb = otherDriverCtx.firestore();
    const tokenDoc = fdb.collection("companies").doc("alpha").collection("drivers").doc("drv-1").collection("fcm_tokens").doc("tok-1");
    await assertFails(tokenDoc.get());
  });

  await t.test("fcm_token_owners client read/write denied for all roles", async () => {
    const driverCtx = env.authenticatedContext("drv-1", claims("driver", "alpha"));
    const dispoCtx = env.authenticatedContext("dispo-1", claims("dispatcher", "alpha"));
    const caCtx = env.authenticatedContext("ca-1", claims("company-admin", "alpha"));
    const unauthCtx = env.unauthenticatedContext();

    await assertFails(driverCtx.firestore().collection("fcm_token_owners").doc("tok-1").get());
    await assertFails(driverCtx.firestore().collection("fcm_token_owners").doc("tok-1").set({ driverId: "drv-1" }));
    await assertFails(dispoCtx.firestore().collection("fcm_token_owners").doc("tok-1").get());
    await assertFails(caCtx.firestore().collection("fcm_token_owners").doc("tok-1").get());
    await assertFails(unauthCtx.firestore().collection("fcm_token_owners").doc("tok-1").get());
    await assertFails(unauthCtx.firestore().collection("fcm_token_owners").doc("tok-1").delete());
  });
});

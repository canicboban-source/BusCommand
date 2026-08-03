const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

/**
 * Real Admin Auth traffic against the Auth emulator. Two things are proven here
 * that a mock cannot prove:
 *
 * 1. the account lifecycle the provisioning code depends on still works on the
 *    current dependency tree (create, claims, custom token, disable, delete);
 * 2. `verifyIdToken(token, true)` really refuses a token after
 *    `revokeRefreshTokens`, which is the mechanism the staff and SuperAdmin API
 *    gates rely on for immediate deactivation.
 */
const EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT_ID = "buscommand-preview";

let app;
let auth;

async function signInWithCustomToken(customToken) {
  const response = await fetch(
    `http://${EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    }
  );
  const body = await response.json();
  assert.ok(body.idToken, `custom token exchange failed: ${JSON.stringify(body)}`);
  return body.idToken;
}

test.before(() => {
  if (!EMULATOR) return;
  app = admin.initializeApp({ projectId: PROJECT_ID }, "admin-auth-runtime");
  auth = app.auth();
});

test.after(async () => {
  if (app) await app.delete();
});

test("dispatcher account lifecycle works end to end on the Admin SDK", { skip: !EMULATOR }, async () => {
  const email = `dispatcher-${Date.now()}@example.test`;
  const created = await auth.createUser({ email, password: "unit-test-password", displayName: "Runtime Dispatcher" });
  try {
    await auth.setCustomUserClaims(created.uid, {
      role: "dispatcher",
      companyId: "alpha",
      groups: ["31099"],
      mustChangeLoginCode: false
    });

    const fetched = await auth.getUser(created.uid);
    assert.equal(fetched.customClaims.role, "dispatcher");
    assert.equal(fetched.customClaims.companyId, "alpha");
    assert.deepEqual(fetched.customClaims.groups, ["31099"]);
    assert.equal(fetched.disabled, false);

    await auth.updateUser(created.uid, { disabled: true });
    assert.equal((await auth.getUser(created.uid)).disabled, true);
    await auth.updateUser(created.uid, { disabled: false });

    const byEmail = await auth.getUserByEmail(email);
    assert.equal(byEmail.uid, created.uid);
  } finally {
    await auth.deleteUser(created.uid);
  }
  await assert.rejects(
    () => auth.getUser(created.uid),
    (error) => {
      assert.equal(error.code, "auth/user-not-found");
      return true;
    }
  );
});

test("custom token carries tenant claims into a verifiable ID token", { skip: !EMULATOR }, async () => {
  const created = await auth.createUser({ email: `driver-${Date.now()}@example.test`, password: "unit-test-password" });
  try {
    const customToken = await auth.createCustomToken(created.uid, {
      role: "driver",
      companyId: "alpha",
      driverId: created.uid,
      mustChangeLoginCode: false
    });
    const idToken = await signInWithCustomToken(customToken);

    const decoded = await auth.verifyIdToken(idToken, true);
    assert.equal(decoded.uid, created.uid);
    assert.equal(decoded.role, "driver");
    assert.equal(decoded.companyId, "alpha");
    assert.equal(decoded.mustChangeLoginCode, false);
    assert.ok(decoded.auth_time > 0, "auth_time is required by the Firestore rules");
  } finally {
    await auth.deleteUser(created.uid);
  }
});

test("revoking refresh tokens immediately invalidates an issued ID token", { skip: !EMULATOR }, async () => {
  const created = await auth.createUser({ email: `revoked-${Date.now()}@example.test`, password: "unit-test-password" });
  try {
    await auth.setCustomUserClaims(created.uid, { role: "company_admin", companyId: "alpha", mustChangeLoginCode: false });
    const idToken = await signInWithCustomToken(await auth.createCustomToken(created.uid, {
      role: "company_admin",
      companyId: "alpha",
      mustChangeLoginCode: false
    }));

    await auth.verifyIdToken(idToken, true);

    // The Auth emulator stores validSince with second precision, so a token
    // minted in the same second can still look valid after revocation.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await auth.revokeRefreshTokens(created.uid);

    await assert.rejects(
      () => auth.verifyIdToken(idToken, true),
      (error) => {
        assert.match(String(error.code || error.message), /id-token-revoked/);
        return true;
      },
      "checkRevoked must refuse a token issued before revokeRefreshTokens"
    );

    // Note: the Auth emulator refuses a revoked token even when checkRevoked is
    // omitted, so this environment cannot isolate the flag's effect. Against
    // real Firebase an already-issued token stays parseable until it expires,
    // which is why every gate passes `true` explicitly.
  } finally {
    await auth.deleteUser(created.uid);
  }
});

test("a disabled account cannot pass verification with an existing token", { skip: !EMULATOR }, async () => {
  const created = await auth.createUser({ email: `disabled-${Date.now()}@example.test`, password: "unit-test-password" });
  try {
    const idToken = await signInWithCustomToken(await auth.createCustomToken(created.uid, {
      role: "dispatcher",
      companyId: "alpha",
      mustChangeLoginCode: false
    }));
    await auth.updateUser(created.uid, { disabled: true });

    await assert.rejects(
      () => auth.verifyIdToken(idToken, true),
      (error) => {
        assert.match(String(error.code || error.message), /user-disabled|id-token-revoked/);
        return true;
      }
    );
  } finally {
    await auth.deleteUser(created.uid);
  }
});

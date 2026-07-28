import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { URL } from "node:url";
import { createProductionAuthGate, confirmedTenantId } from "../../js/core/production-auth-gate.js";

test("slow auth callback makes no tenant calls from cached UID or Firebase project ID", async () => {
  const events = [];
  const cachedUser = { uid: "dispatcher-1", companyId: "buscommand-preview" };
  assert.equal(cachedUser.companyId, "buscommand-preview");
  const handleAuth = createProductionAuthGate({
    firebaseProjectId: "buscommand-preview",
    onPending: () => events.push("pending"),
    onSignedOut: () => events.push("signed-out"),
    onInvalidTenant: () => events.push("invalid"),
    onAuthenticated: async (_user, companyId) => {
      events.push(`license:${companyId}`);
      events.push(`firestore:companies/${companyId}`);
    }
  });
  assert.deepEqual(events, ["pending"]);
  await Promise.resolve();
  assert.deepEqual(events, ["pending"]);
  await handleAuth({ uid: "dispatcher-1", role: "dispatcher", companyId: "buscommand-preview-test" });
  assert.deepEqual(events, [
    "pending",
    "license:buscommand-preview-test",
    "firestore:companies/buscommand-preview-test"
  ]);
  assert.equal(events.some(event => event.includes("license:buscommand-preview") && !event.endsWith("-test")), false);
});

test("Firebase project ID can never become a tenant ID", () => {
  assert.equal(confirmedTenantId({ firebaseProjectId: "buscommand-preview", tokenCompanyId: "buscommand-preview" }), null);
  assert.equal(confirmedTenantId({ firebaseProjectId: "buscommand-preview", tokenCompanyId: "buscommand-preview-test" }), "buscommand-preview-test");
});

test("pending driver claim routes only to activation and never tenant initialization", async () => {
  const events = [];
  const handleAuth = createProductionAuthGate({
    firebaseProjectId: "buscommand-preview",
    onPending: () => events.push("loading"),
    onSignedOut: () => events.push("signed-out"),
    onInvalidTenant: () => events.push("invalid"),
    onActivationRequired: (_user, companyId) => events.push(`activate:${companyId}`),
    onAuthenticated: () => events.push("operational")
  });
  await handleAuth({
    uid: "pending-driver", role: "driver", companyId: "buscommand-preview-test",
    mustChangeLoginCode: true
  });
  assert.deepEqual(events, ["loading", "activate:buscommand-preview-test"]);
});

test("production bootstrap contains no project/company fallback and dispatcher onboarding is absent", () => {
  const bootstrap = fs.readFileSync(new URL("../../js/bootstrap/init.js", import.meta.url), "utf8");
  const login = fs.readFileSync(new URL("../../js/auth/login-dispatcher.js", import.meta.url), "utf8");
  const shell = fs.readFileSync(new URL("../../js/layout/shell.js", import.meta.url), "utf8");
  assert.doesNotMatch(bootstrap, /checkCompanyLicense\(COMPANY_ID\)|initFirebase\(COMPANY_ID\)|companyId:\s*authUser\.companyId\s*\|\|/);
  assert.doesNotMatch(login, /companyId:\s*claims\.companyId\s*\|\||initFirebase\([^)]*\|\|\s*COMPANY_ID/);
  assert.doesNotMatch(shell, /showOnboardingWizard/);
});

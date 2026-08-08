import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");

test("dispatcher lifecycle endpoints are Company Admin-only, tenant-bound and rate limited", () => {
  const api = read("../../api-server.js");
  for (const route of [
    "/api/company-admin/dispatchers",
    "/api/company-admin/dispatchers/:uid/groups",
    "/api/company-admin/dispatchers/:uid/status",
    "/api/company-admin/dispatchers/:uid/revoke-sessions"
  ]) {
    const index = api.indexOf(route);
    assert.notEqual(index, -1, `missing ${route}`);
    const block = api.slice(index, index + 700);
    assert.match(block, /requireCompanyAdmin/);
    assert.match(block, /requireOwnCompany/);
  }
  // Token verification lives in the shared staff gate; tests/unit/staff-auth-http.test.js
  // proves the runtime 401/403 behaviour over HTTP.
  assert.match(read("../../server/staff-auth.js"), /verifyIdToken\(token, true\)/);
  assert.match(read("../../server/superadmin-overview.js"), /verifyIdToken\(token, true\)/);
  assert.match(api, /app\.delete\([\s\S]*?"\/api\/company-admin\/dispatchers\/:uid"[\s\S]*?requireCompanyAdmin[\s\S]*?requireOwnCompany/);
  assert.match(api, /validateBody\(companyDispatcherDeleteBody\)/);
  assert.match(api, /\/api\/admin\/create-user[\s\S]*?req\.adminUser\.role === "company_admin"[\s\S]*?namenski Company Admin endpoint/);
});

test("dispatcher profiles are server-write-only and global sync skips them", () => {
  const rules = read("../../firestore.rules");
  const firebase = read("../../js/core/firebase-service.js");
  assert.match(rules, /users\/\{userId\}[\s\S]*?allow create, delete: if false/);
  assert.match(rules, /allow update: if isCompanyMember\(companyId\)[\s\S]*?onlyUpdatingOwnProfile/);
  assert.match(rules, /sessionsValidAfterEpoch[\s\S]*?request\.auth\.token\.auth_time/);
  assert.match(firebase, /item\.key === "groups" \|\| item\.key === "dispatchers"/);
});

test("team and onboarding share the same validated provisioning path without production plaintext state", () => {
  const team = read("../../js/admin/company-admin-team.js");
  const onboarding = read("../../js/admin/company-admin-onboarding.js");
  assert.match(team, /ApiClient\.createCompanyDispatcher/);
  assert.match(team, /ApiClient\.deleteCompanyDispatcher/);
  assert.match(team, /dispatcher\.active !== false/);
  assert.match(team, /if \(USE_LOCAL_STATE\) \{[\s\S]*?dispatcher\.password/);
  assert.doesNotMatch(team, /TEMP_RESET_PASSWORD|ChangeMe123/);
  assert.match(onboarding, /persistCompanyDispatcherDraft/);
  assert.doesNotMatch(onboarding, /window\.state\.dispatchers\.push/);
  const login = read("../../js/auth/login-dispatcher.js");
  assert.match(login, /disp\.active === false[\s\S]*?error_account_disabled/);
});

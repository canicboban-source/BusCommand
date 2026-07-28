import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");

test("group CRUD endpoints are Company Admin-only, validated, tenant-bound and audited", () => {
  const api = read("../../api-server.js");
  assert.match(api, /\/api\/company-admin\/groups[\s\S]*?requireCompanyAdmin[\s\S]*?validateBody\(companyGroupBody\)/);
  assert.match(api, /\/api\/company-admin\/groups\/:groupId[\s\S]*?requireCompanyAdmin[\s\S]*?validateBody\(companyGroupUpdateBody\)/);
  assert.match(api, /app\.delete\([\s\S]*?\/api\/company-admin\/groups\/:groupId[\s\S]*?findCompanyGroupReferences/);
  assert.match(api, /company_group_created/);
  assert.match(api, /company_group_updated/);
  assert.match(api, /company_group_deleted/);
});

test("group writes are server-only and global state sync skips the group collection", () => {
  const rules = read("../../firestore.rules");
  const firebase = read("../../js/core/firebase-service.js");
  assert.match(rules, /groups\/\{groupId\}[\s\S]*?allow write: if false/);
  assert.match(firebase, /item\.key === "groups"/);
  assert.match(firebase, /item\.key === "dispatchers"/);
  assert.match(firebase, /item\.key === "reports"/);
  assert.match(firebase, /continue;/);
});

test("onboarding uses the same validated group persistence path", () => {
  const onboarding = read("../../js/admin/company-admin-onboarding.js");
  assert.match(onboarding, /persistCompanyGroupDraft\(\{ id: lineId, name, color, description: "" \}\)/);
  assert.doesNotMatch(onboarding, /window\.state\.groups\.push/);
});

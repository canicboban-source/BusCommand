import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");

test("branding endpoint is Company Admin-only, tenant-bound, validated and audited", () => {
  const api = read("../../api-server.js");
  assert.match(api, /\/api\/company-admin\/branding[\s\S]*?requireCompanyAdmin[\s\S]*?validateBody\(companyBrandingBody\)/);
  assert.match(api, /\/api\/company-admin\/branding[\s\S]*?requireOwnCompany\(req, res\)/);
  assert.match(api, /branding_updated/);
  assert.match(api, /hasLogo: Boolean\(logoUrl\)/);
});

test("Firestore keeps branding and audit writes server-only", () => {
  const rules = read("../../firestore.rules");
  assert.match(rules, /branding\/\{doc\}[\s\S]*?allow write: if false/);
  assert.match(rules, /audit_log\/\{logId\}[\s\S]*?allow create: if false/);
});

test("company onboarding reuses the validated branding save path without mutating the active brand preview", () => {
  const onboarding = read("../../js/admin/company-admin-onboarding.js");
  assert.match(onboarding, /saveCompanyBrandingDraft\(\{ name, primaryColor: color, logoUrl \}\)/);
  assert.doesNotMatch(onboarding, /window\.state\.branding\.primaryColor = hex/);
  assert.doesNotMatch(onboarding, /document\.documentElement\.style\.setProperty\("--primary-color"/);
});

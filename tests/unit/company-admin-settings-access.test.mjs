import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");

test("profile settings endpoint is Company Admin-only, tenant-bound, validated and transactionally audited", () => {
  const api = read("../../api-server.js");
  assert.match(api, /\/api\/company-admin\/profile-settings[\s\S]*?requireCompanyAdmin[\s\S]*?validateBody\(companyProfileSettingsBody\)/);
  assert.match(api, /\/api\/company-admin\/profile-settings[\s\S]*?requireOwnCompany\(req, res\)/);
  assert.match(api, /company_profile_settings_updated/);
  assert.match(api, /transaction\.set\(profileRef[\s\S]*?transaction\.set\(auditRef/);
});

test("company exports are server-owned, bounded, tenant-bound, non-cacheable and audited", () => {
  const api = read("../../api-server.js");
  const client = read("../../js/core/api-client.js");
  assert.match(api, /\/api\/company-admin\/exports\/:dataset[\s\S]*?requireCompanyAdmin[\s\S]*?requireOwnCompany\(req, res\)/);
  assert.match(api, /company_data_exported/);
  assert.match(api, /Cache-Control", "no-store"/);
  assert.match(client, /downloadCompanyExport[\s\S]*?Authorization/);
});

test("profile, branding, license settings and SOS cannot be changed through global client state sync", () => {
  const rules = read("../../firestore.rules");
  const firebase = read("../../js/core/firebase-service.js");
  for (const collection of ["profile", "branding", "settings"]) {
    assert.match(rules, new RegExp(`${collection}\\/\\{doc\\}[\\s\\S]*?allow write: if false`));
  }
  assert.doesNotMatch(firebase, /writeOps\.push\(\{[\s\S]{0,180}collection\("(?:profile|branding|settings)"\)/);
  assert.match(firebase, /Company profile, branding, license\/settings, SOS and reports are server-owned/);
});

test("settings page contains no production SOS, print or destructive company controls", () => {
  const html = read("../../staff.html");
  const start = html.indexOf('id="company-admin-settings"');
  const section = html.slice(start, html.indexOf("<!-- MOBILNA BOTTOM", start));
  assert.doesNotMatch(section, /clear-sos-modal|print-schedule-modal|delete company/i);
  assert.match(section, /id="ca-settings-demo-tools"[^>]*hidden/);
  assert.match(section, /data-submit-action="saveCompanyProfileSettings"/);
});

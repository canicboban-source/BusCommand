import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = relative => fs.readFileSync(new globalThis.URL(relative, import.meta.url), "utf8");

test("company audit API is admin-only and tenant scoped", () => {
  const api = read("../../api-server.js");
  assert.match(api, /\/api\/company-admin\/audit[\s\S]*?requireCompanyAdmin/);
  assert.match(api, /listAuditEvents\(\{[\s\S]*?companyId/);
  assert.match(api, /\/api\/company-admin\/audit[\s\S]*?requireOwnCompany\(req, res\)/);
  assert.match(read("../../server/staff-auth.js"), /parsed\.id !== req\.staffUser\.companyId/);
});

test("audit writes are server-only and client sync uses a narrow endpoint", () => {
  const rules = read("../../firestore.rules");
  const firebase = read("../../js/core/firebase-service.js");
  assert.match(rules, /audit_log\/\{logId\}[\s\S]*?allow create: if false/);
  assert.doesNotMatch(firebase, /collection\("audit_log"\)\.add/);
  assert.match(firebase, /ApiClient\.reportStateSync/);
});

test("company admin activity page exposes filters and server source status", () => {
  const html = read("../../staff.html");
  const module = read("../../js/admin/company-admin-audit.js");
  assert.match(html, /id="company-admin-audit"/);
  assert.match(html, /id="ca-audit-category"/);
  assert.match(html, /id="ca-audit-actor"[^>]*autocomplete="off"/);
  assert.match(html, /name="bc-audit-actor-filter"/);
  assert.match(module, /ApiClient\.getCompanyAudit/);
  assert.match(module, /ca_audit_source_server/);
  assert.match(module, /scrubAuditCredentialAutofill/);
});

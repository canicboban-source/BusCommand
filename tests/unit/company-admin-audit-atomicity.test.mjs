import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs
  .readFileSync(new globalThis.URL("../../api-server.js", import.meta.url), "utf8")
  .replace(/\r\n/g, "\n");

function routeSection(start, end) {
  const from = api.indexOf(start);
  assert.notEqual(from, -1, `Route marker not found: ${start}`);
  const to = api.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `Next route marker not found: ${end}`);
  return api.slice(from, to);
}

test("branding and group master-data changes persist with tenant audits", () => {
  const branding = routeSection(
    'app.put(\n  "/api/company-admin/branding"',
    'app.post(\n  "/api/company-admin/groups"'
  );
  assert.match(branding, /db\.runTransaction/);
  assert.match(branding, /transaction\.set\(companyRef\.collection\("branding"\)/);
  assert.match(branding, /transaction\.set\([\s\S]*?audit_log/);
  assert.doesNotMatch(branding, /_logAuditEvent/);

  const groups = routeSection('"/api/company-admin/groups"', '"/api/company-admin/drivers/:driverId/personal-code"');
  assert.match(groups, /transaction\.set\(groupRef[\s\S]*?transaction\.set\(auditRef/);
  assert.match(groups, /transaction\.set\(auditRef, \{[\s\S]*?action: "company_group_updated"/);
  assert.match(groups, /batch\.delete\(groupRef\)[\s\S]*?batch\.set\([\s\S]*?audit_log[\s\S]*?await batch\.commit\(\)/);
  assert.doesNotMatch(groups, /_logAuditEvent/);
});

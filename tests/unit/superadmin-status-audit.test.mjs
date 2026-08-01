import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const api = (await readFile(new URL("../../api-server.js", import.meta.url), "utf8"))
  .replace(/\r\n/g, "\n");

test("Super Admin company status and tenant audit commit atomically", () => {
  const start = api.indexOf('"/api/admin/company/:companyId/status"');
  const end = api.indexOf('app.post(\n  "/api/admin/hash-pin"', start);
  assert.ok(start >= 0 && end > start, "company status route was not found");
  const route = api.slice(start, end);

  assert.match(route, /db\.runTransaction/);
  assert.match(route, /transaction\.update\(companyRef\.collection\("settings"\)\.doc\("main"\)/);
  assert.match(route, /transaction\.set\(companyRef\.collection\("audit_log"\)\.doc\(\)/);
  assert.match(route, /actorRole:\s*"superadmin"/);
  assert.doesNotMatch(route, /_logAuditEvent\("superadmin"/);
});
